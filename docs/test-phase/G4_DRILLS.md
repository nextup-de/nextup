# G4 drills: what to run on the test server, in order

Gate G4 still needs criterion 2 (2,000 accounts, p95 under 1 s) and criterion 6 (restore within the target time;
install from scratch). Three drills show them. This page is the order to run them in once the test server exists
(plan `nextup-context/plans/2026-11-08_test-server-setup.md`, parts 1 and 2), and what result counts as a pass.
The mechanics of `ops/tst/vm-run.sh` are in [RUNBOOK.md](RUNBOOK.md).

| Drill | Where it runs | Command | Pass |
|---|---|---|---|
| Load (criterion 2) | your Mac, against VM 1 | `TST_K6_RUN=apps/app/tests/load/k6/g4-stages.sh ops/tst/vm-run.sh deploy@tst.sellux.ch b9e7c0f` | the load report says **Criterion 2: PASS** |
| Restore (criterion 6) | VM 1, as `deploy` | `~/nextup/restore-drill.sh --slug tst` | **Result PASS**, restore time within the target |
| Install (criterion 6) | VM 2, as `root`, fresh | `./install-drill.sh --slug drill --origin https://drill.sellux.ch --images b9e7c0f --backup-repo s3:…/drill` | **Result PASS**, no manual fix (or each one written up) |

All three print a markdown report. Copy them into `docs/test-phase/results/` with the run's results file and commit
them on a `chore/` branch, as RUNBOOK.md says. Neither report holds a secret; read them once before committing anyway.

## 0. Before the first drill (once, on your Mac)

1. A clean checkout of the commit **under test** for the load run (the plan: `b9e7c0f`), `npm ci`, `npx playwright install
   chromium` in `apps/app`. The drill scripts are newer than `b9e7c0f`, so take them from `main` (or this branch) and put
   them in that checkout: `apps/app/tests/load/k6/g4-stages.sh`, and `ops/tst/vm-run.sh` + `ops/tst/lib.sh` (see the
   next point). They only drive the run; the product under test stays `b9e7c0f`.
2. **`/bin/bash` on the Mac is 3.2.** `vm-run.sh` used `declare -A` (bash 4) until this change and stopped at its first
   line there. Use the `vm-run.sh` of this change or later, or run it with a newer bash (`brew install bash`).
3. The environment of the plan's step 3.2 (`DEPLOY_SSH_KEY_FILE`, `TST_SSH_KEY_FILE`, `TST_REMOTE`, `TST_GEN_IMAGE`,
   `TST_GENERATOR`), Docker running (k6 runs in the pinned `grafana/k6` image), `jq`.

## 1. Rehearsal, small (about 10 minutes)

```bash
TST_K6_RUN=apps/app/tests/load/k6/g4-stages.sh TST_K6_DURATION=1m \
  ops/tst/vm-run.sh deploy@tst.sellux.ch b9e7c0f --people 150 --weeks 2
```

All nine steps should say `ok`. The load report (`apps/app/test-results/load/g4-load-<time>.md`) shows three stages at
150 people (5, 200 and 150 virtual users). Its verdict does not count: it is the dress rehearsal for the release, the
tunnel, the generator, the cookies and k6 from your Mac.

## 2. Load: the run of record (about 45 minutes)

```bash
TST_K6_RUN=apps/app/tests/load/k6/g4-stages.sh ops/tst/vm-run.sh deploy@tst.sellux.ch b9e7c0f
```

2,000 people, 8 weeks, seed 1, then the scenario spec, then k6 in three stages of 5 minutes each, then the throwaway
`restore-test`. The stages (`apps/app/tests/load/k6/g4-stages.sh`, the same budget as `tests/load/musterwerk-load.test.ts`):

| Stage | Virtual users at 2,000 people | What it is |
|---|---|---|
| `workday` | 50 | one person in forty on a page at any moment (the test's working day, TST-L1) |
| `peak` | 200 | vm-run's default, about 100 requests/s: shows where the line is if `all` fails |
| `all` | 2,000 | everybody on a page at once (the test's `TST-FL1-1` stress case: today's "200 at once", ten times) |

Each virtual user loads its account's inbox (leaders and managers) or one of its cases, with 1-3 s of think time.
**Criterion 2 passes when the load report says `Criterion 2: PASS`:** in both `workday` and `all`, inbox p95 and case p95
are under 1,000 ms, failed requests under 1 % and no response over 2 MB. `peak` is information only.

Read with it:

- The report says how many of the 2,000 people have a page to load (at 200 people it was 47: leaders and managers, and
  members with a case they may open). That number of accounts is what really rotated; the virtual users follow the people.
- **Your decision, if only `all` fails:** TST-L1 calls the one-in-forty working day a modelling choice. Whether G4 means
  "everyone at once" or "a working day of 2,000 accounts" is not written down anywhere. Today's figure in the report
  (200 at once, p95 557 / 541 ms) is the `all` stage at 200 people, so `all` at 2,000 is the like-for-like number.
- k6 runs on your Mac, so the figures include the trip to Falkenstein (about 20-30 ms) and your uplink. If `all` fails
  and k6 warns about its own CPU, or the VM's CPU (`docker stats` on VM 1) was not busy, run k6 closer: the first knob on
  the server side is `--app-replicas` (TST-L1).
- To repeat only the load without a new release and generator: open the db tunnel as RUNBOOK.md's demo section does, then
  from `apps/app`, with `AUTH_SECRET` and `DATABASE_URL` of the stack in the environment:
  `tests/load/g4-load.sh --base-url https://tst.sellux.ch --slug tst --single` (add `--generate` to regenerate).

## 3. Restore (about 15 minutes; after the load run, so the database holds 2,000 people)

On your Mac, then on VM 1 as `deploy` (admin key):

```bash
scp stack/tests/restore-drill.sh deploy@tst.sellux.ch:nextup/      # the released stack/ (b9e7c0f) predates it
ssh deploy@tst.sellux.ch
~/nextup/restore-drill.sh --slug tst                                # asks you to type the slug before it wipes
```

It counts every table and fingerprints the case with the most events, takes a backup to the S3 bucket, then **starts the
clock**, stops the stack, deletes its database volume, starts it empty, restores the snapshot from the bucket and stops
the clock when `https://tst.sellux.ch/api/health` answers 200. Then it compares counts and the case. The report
(`~/nextup/restore-drill-tst-<time>.md`) shows:

```
| **Restore time** (wipe -> /api/health 200) | **<n> s** |
| against 1 h (RTO_SECONDS 3600, docs/ops/RPO_RTO.md) | within / OVER |
| against 4 h (14400 s, the budget plan) | within / OVER |
| Data | match: <tables> tables, <rows> rows before |
| Known case | before `<id> <events> <md5>`, after `<the same>` |
```

**Criterion 6, restore, passes when** the result is PASS (data and known case match, healthy, off the server: yes) and
the time is within the target. The target is not decided yet (1 h in `docs/ops/RPO_RTO.md`, 4 h in the budget plan; the
decision draft is session E's), so the report gives both and the script's exit code uses `RTO_SECONDS` (3600).

What the drill does not cover: a lost machine (it keeps the stack's `.env`, Caddy's certificate and the images; on a new
host the `.env` comes back first, `docs/ops/RPO_RTO.md`), and n8n's data (`backup.sh restore` puts back the database only;
the tst stack runs no n8n).

## 4. Install from scratch (about 1 hour, VM 2)

Start the clock when VM 2 exists. From your Mac, then on VM 2 as root:

```bash
scp stack/tests/install-drill.sh root@drill.sellux.ch:
ssh root@drill.sellux.ch
export BACKUP_S3_ACCESS_KEY_ID=... BACKUP_S3_SECRET_ACCESS_KEY=...   # from the password manager, typed in your terminal
./install-drill.sh --slug drill --origin https://drill.sellux.ch --images b9e7c0f \
    --backup-repo s3:https://<location>.your-objectstorage.com/nextup-tst-backups/drill
```

It walks the documented steps (`stack/remote/README.md` sections 1-5 and the plan's part 2): VM, DNS, Docker, user
`deploy`, hardening, registry login and `stack/`, then runs `install-clean.sh` as `deploy`, then passwords, `host.conf`,
cron and the outside check. Do each step **from the document, in a second terminal**, and press Enter when it is done; it
times the step and runs a check. A step done before you started it: `m <minutes>`. After each step it asks for a manual
fix: anything you had to do or change that the document did not say. The record is `./install-drill-drill-<time>.md`.

**Criterion 6, install, passes when** the record says `Result: PASS` (every check ok and `install-clean.sh` reports
`<n> passed, 0 failed`). Each manual fix is a finding (`docs/test-phase/findings/`) and a fix to the document; whether a
fix still lets the drill count is your call, so write it in the PR. Then delete VM 2 and the `drill.sellux.ch` record.

## What was tried before the server existed

On 2026-11-09, on Kevin's Mac (Docker Desktop, other sessions running):

- `g4-stages.sh` against a stub k6: verdicts, a failing stage, a stage not run ("not shown").
- `g4-load.sh --generate --people 150 --duration 30s` with real k6 against a local production build (one `next start`
  process, path mode, Postgres in Docker): 44 of 150 people had a page. `workday` (5 virtual users) PASS, inbox/case
  p95 315 / 30 ms; `peak` (200) inbox/case p95 1,481 / 1,329 ms and `all` (150) inbox p95 1,609 ms, both over budget.
  That is one Node process on a busy laptop (the stack runs several, the vitest load test eight): it shows the mechanics
  and that an over-budget stage fails the run, nothing about the VM.
- `bash stack/tests/restore-drill.test.sh` on the Docker test host of `stack/tests` (fake app images, MinIO as the
  bucket): 18 passed, 0 failed. 250 people and 2 cases came back, known case identical, restore 36 s.
- `bash stack/tests/install-drill.test.sh` on the same host, answers piped in: 8 passed, 0 failed (install-clean 9/0).
- `/bin/bash stack/tests/tst-vm-run.test.sh` under the Mac's bash 3.2: 53 passed, 0 failed.

They prove the scripts, not the figures on real hardware.

Only the server can show: the p95 figures at 2,000 people, the real restore time from Hetzner Object Storage with a
2,000-people database, Let's Encrypt and DNS on a fresh VM, and whether the documents are enough for a person installing
from nothing.
