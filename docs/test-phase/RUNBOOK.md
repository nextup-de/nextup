# Test phase runbook: the VM run and the install drill

Plan TST, task TST-V1. One script runs the runs of record on the dedicated test VM; one script run by hand on a
second, fresh VM is the on-prem install drill. Only Kevin runs them. No lane reaches a VM.

| What | Where | Command |
|---|---|---|
| The run of record | your machine, against VM 1 | `ops/tst/vm-run.sh <user@host[:port]> <sha7>` |
| The install drill | VM 2, fresh | `stack/tests/install-clean.sh --slug … --origin … --images <sha7>` |

For gate G4 (criteria 2 and 6) the order, the three drill scripts and what counts as a pass are in
[G4_DRILLS.md](G4_DRILLS.md).

## Before the run (once)

1. **VM 1.** Created by hand to the size and region decided in TST/Q1, then hardened with nextup-infra's
   `servers/harden.sh` (PILOT/HQ8; INF is parked, so nothing else creates it). Docker and Compose v2 must be on it.
   Install Docker first, then run `harden.sh apply --public-port 80 --public-port 443`: without those two options the
   stack's Caddy is closed from outside and gets no certificate. In the Hetzner firewall allow 22 from your address,
   and 80 and 443 from anywhere.
2. **DNS.** A name for VM 1 (`<name>.<your test domain>`) pointing at it, with TLS in front, so `APP_ORIGIN` is an
   `https://` address that answers from your machine. The run opens the app at that address.
3. **The deploy user.** `~deploy/.ssh/authorized_keys` holds two lines:
   - the forced-command key, exactly as `stack/deploy-remote.sh --help` shows (it can only `release` and `status`);
   - your admin key, plain. The script uses it for the database tunnel, for reading secrets and for `backup.sh`.

   Your machine needs both keys and the VM's host key in `known_hosts` (the script never accepts a host key on first
   use): `DEPLOY_SSH_KEY_FILE` / `DEPLOY_KNOWN_HOSTS_FILE` as for `deploy-remote.sh`, and `TST_SSH_KEY_FILE` for the
   admin key.
4. **M365 and Jira (TST/Q2).** The Entra test tenant with its test users, and the Jira Cloud test site. The stack
   reads them from its own settings after install; the VM run itself does not touch them.
5. **The stack.** On VM 1, as `deploy`, from a checkout of the commit you test, with an S3-compatible bucket for the
   backups. Without `--backup-repo` the backups stay on the VM's own disk, and exit criterion 6 asks for a restore from
   off the server:
   ```bash
   export BACKUP_S3_ACCESS_KEY_ID=... BACKUP_S3_SECRET_ACCESS_KEY=...
   stack/tests/install-clean.sh --slug <slug> --origin https://<name>.<test domain> --images <sha7> \
       --backup-repo s3:https://<s3 host>/<bucket>/<slug>
   ```
   This writes `~/nextup/instances/<slug>/.env` (secrets are generated on the VM and stay there). Then create
   `~/nextup/host.conf` with `SLUG=<slug>` (and `NEXTUP_REGISTRY` / `NEXTUP_STACK_URL` only if they differ from the
   defaults, see `stack/remote/host.sh`).
6. **Images.** CI must have published `<sha7>` (images.yml). Use a commit whose images exist; `deploy-remote.sh`
   fails before changing anything if they do not.
7. **Your machine.** Linux or WSL, with a clone of its own there (a Windows `node_modules` does not work). `ssh`, `jq`,
   Node with this repo's dependencies installed (`npm ci`), Playwright's browser (`npx playwright install --with-deps
   chromium` in `apps/app`), and Docker (k6 runs from
   the pinned `grafana/k6` image). Check out the commit you are testing; the script runs the generator, the
   scenario spec and the k6 driver from your checkout.

## The run

```bash
ops/tst/vm-run.sh deploy@<name>.<test domain> <sha7>               # 2,000 people, 8 weeks, k6 with 2,000 accounts
ops/tst/vm-run.sh deploy@<host>:2222 <sha7> --skip-k6              # without the load run
ops/tst/vm-run.sh deploy@<host> <sha7> --people 150 --weeks 2      # a small rehearsal first
```

It prints one line per step, nine in all:

```
[1/9] release <sha7> ... ok (31s)
[2/9] open the db port (127.0.0.1 only) ... ok
[3/9] ssh tunnel to the database ... ok
[4/9] generate Musterwerk (2000 people, 8 weeks) ... ok
[5/9] scenario spec against https://… ... ok
[6/9] k6 load run (2000 accounts) ... ok
[7/9] backup and restore test (RTO 3600s) ... ok
[8/9] close the tunnel and the db port ... ok
[9/9] write the results file ... ok
results: docs/test-phase/results/<yyyy-mm-dd>.md
```

What each step does and what it needs:

- **Release** is `stack/deploy-remote.sh`: backup, migrate, swap, install, as for any customer host.
- **The database** is not public. `stack/tst/compose.tst.yml` publishes the stack's `db` on the VM's
  `127.0.0.1:5439` and nothing else; the script opens `ssh -L 127.0.0.1:5439:127.0.0.1:5439` (set `TST_LOCAL_PORT`
  if 5439 is taken on your machine). Step 8 recreates `db` without the port. The next release does so too.
- **The generator** is `apps/app/prisma/generators/musterwerk/run.ts` with `--slug`, `--people`, `--weeks`, `--seed`
  (`TST_SEED`, default 1) and `--codes <temp file>`.
- **The scenario** runs `npx playwright test -c playwright.db.config.ts tests/e2e/db/musterwerk.spec.ts -g "TST acceptance"`
  in `apps/app` with `TST_CODES_FILE` and `TST_BASE_URL` set to the
  stack's `APP_ORIGIN` (override the command with `TST_E2E_CMD`).
- **People.** The generator makes 2,000 people, because exit criterion 2 counts 2,000 accounts and an account needs a
  person. The results file says how many accounts really ran. It replaces only the stack's empty company or an
  earlier Musterwerk: on any other company step 4 stops and nothing is deleted.
- **k6** runs `TST_VUS` (200, about 100 requests per second) virtual users for `TST_K6_DURATION` (5m), rotating
  through the accounts. It first lets `tests/load/driver.ts` write the cookies of `TST_ACCOUNTS` (2,000) accounts with the VM's
  `AUTH_SECRET`, then runs `tests/load/k6/run.sh` with `TST_BASE_URL`, `TST_COOKIES_FILE` and `TST_K6_SUMMARY`
  (a `--summary-export` json the run writes). Override the runner with `TST_K6_RUN`.
- **Restore** is `backup.sh <slug> backup`, then `RTO_SECONDS=<from docs/ops/RPO_RTO.md> backup.sh <slug> restore-test`.
  It fails when the seconds are over the RTO.

A failure in steps 1 to 4 stops the run (nothing later makes sense); 5 to 7 are recorded and the run goes on. In every
case the tunnel and the db port are closed and a results file is written. Exit code 0 means every step that ran passed.

**Secrets.** `AUTH_SECRET` and the Postgres password are read over ssh into mode-600 files in a private temp
directory, handed to the one child that needs them through its environment, and removed when the script exits. The
login codes go to a mode-600 temp file the same way. Nothing is printed or written into the repo. The results file
holds no secret; check it anyway before you commit it.

## What to do with the results file

1. Read `docs/test-phase/results/<yyyy-mm-dd>.md`: step table, scenario line, k6 p95/p99 per page against the budget
   (p95 < 1,000 ms, errors < 1 %), restore seconds against `RTO_SECONDS`, versions.
2. A step that failed or a number over budget is a finding: write it to `docs/test-phase/findings/` (one file per
   finding, the way the existing ones are) with the results file as evidence.
3. Commit the results file on a `chore/…` branch and open a PR. Kevin merges. Do not edit a results file afterwards;
   the next run writes a new one (a second run on the same day replaces that day's file, so rename the first if you
   want to keep it).

## The on-prem install drill

Proves that a customer can install from nothing. It needs a second VM, fresh, hardened the same way, with no NextUp
on it.

1. Copy `stack/` of the commit to VM 2 (or check the repo out there) and run, as `deploy`:
   ```bash
   stack/tests/install-clean.sh --slug drill --origin https://<drill name>.<test domain> --images <sha7> \
       --backup-repo s3:https://<s3 host>/<bucket>/drill
   ```
   Without `--backup-repo` the drill backs up to the VM's own disk, which proves the mechanics only, not the off-box
   backup (`docs/ops/RPO_RTO.md`). Set `BACKUP_S3_ACCESS_KEY_ID` and `BACKUP_S3_SECRET_ACCESS_KEY` in the environment
   for an s3 target.
2. It installs one real-stage stack, checks health, backs up and restores, and prints `<n> passed, <m> failed`. The
   install's own output (it holds the admin code) goes to `~/nextup/install-<slug>.log`, mode 600, and is never printed.
3. Record the result in the findings if anything fails; otherwise note the date, sha and the pass count in the PR
   that adds the results file.

## Demo people in the test tenant

For a demo with real directory sync: the same people in NextUp and in the Entra test tenant, so the sync links them
instead of creating everyone. `ops/tst/entra-users.ts` writes them to the tenant; NextUp's own Entra app stays
read-only. Run everything from your machine, in this order. `<domain>` is a verified domain of the test tenant
(`<tenant>.onmicrosoft.com` works).

1. **Generate Musterwerk with the tenant's domain**, against the stack's database. Reach it the way the VM run does
   (`stack/tst/compose.tst.yml` publishes `db` on the VM's `127.0.0.1:5439`, then
   `ssh -N -L 127.0.0.1:5439:127.0.0.1:5439 deploy@<host>`), and in `apps/app` with `DATABASE_URL` set to
   `postgresql://nextup:<POSTGRES_PASSWORD of the instance>@127.0.0.1:5439/nextup`:
   ```bash
   npx tsx prisma/generators/musterwerk/run.ts --slug <slug> --people 500 --weeks 8 --seed 1 --replace-generated --email-domain <domain> --ai-on --codes codes.txt --export-people people.json
   ```
   `--ai-on` switches AI routing and the assistant on. `people.json` holds name, email, department (the unit KEY:
   unit names repeat across the sites), job title, manager and the enabled state. To get the file without a database,
   add `--export-only`: the same seed, people count and domain give the same people. Afterwards `stack/ctl.sh <slug>
   up -d --no-deps db` on the VM closes the port again. Keep `codes.txt` and `people.json` out of the repo.
2. **A token of a tenant admin.** `az login --tenant <tenant id> --allow-no-subscriptions` as a User Administrator
   (or higher), then in the same shell:
   ```bash
   export GRAPH_TOKEN="$(az account get-access-token --resource-type ms-graph --query accessToken -o tsv)"
   ```
   It lasts about an hour and is never printed by the script.
3. **Dry run.** Reads the tenant, writes nothing, prints one line per user:
   ```bash
   npx tsx ops/tst/entra-users.ts --people people.json --email-domain <domain> --extra-joiners 20 --leavers 1 --dry-run
   ```
   It stops with "not a verified domain" when the token belongs to another tenant.
4. **Two-user trial.** `--limit 2` creates the first two people (the managing director and one plant manager). Check
   them in the Entra admin center: department, job title, employee ID `NXTST-P0001` / `NXTST-P0002`, the manager of
   the second.
   ```bash
   npx tsx ops/tst/entra-users.ts --people people.json --email-domain <domain> --limit 2
   ```
5. **Full run.** 500 people, 20 joiners who are not in NextUp, 1 switched-off account. About 1,000 requests, a few
   minutes; on 429 it waits as long as Graph asks. Run it again any time: it creates only what is missing.
   ```bash
   npx tsx ops/tst/entra-users.ts --people people.json --email-domain <domain> --extra-joiners 20 --leavers 1
   ```
   Expected last lines: `Created 521, updated 0, …, failed 0` (519 after the trial, with 2 unchanged) and `Managers set: 520`.
6. **One person who signs in with Microsoft.** Everybody gets a random password nobody knows. For the one test
   person, put a password of at least 12 characters in the environment and name the person; works on a first run and
   on a later one:
   ```bash
   read -rs ENTRA_TEST_PASSWORD && export ENTRA_TEST_PASSWORD
   npx tsx ops/tst/entra-users.ts --people people.json --email-domain <domain> --extra-joiners 20 --leavers 1 --sign-in <email of the person>
   ```
   For Teams that person also needs a usage location and a licence (admin center); the tenant may ask them to set up
   MFA at the first sign-in.
7. **The stack's Entra app.** `stack/install.sh … --entra-client-id <id>` with `NEXTUP_ENTRA_CLIENT_SECRET` set; the
   app registration needs the application permission `User.Read.All` with admin consent.
8. **The tenant ID** in `/admin` → the company → Access. Without it the sync's last error says so.
9. **Switch the sync on** in `/admin` → Connectors → Directory: source Microsoft Entra, Sync on, then **Run now**.
10. **Counts to expect** after the first run with the numbers above:

    | Line | Count | Who |
    |---|---|---|
    | updated (linked) | 500 | the generated people, found by email and bound to their Entra account |
    | added (created) | 20 | the joiners: members of their unit, no seat, manager set |
    | deactivated, handed over | 0 | |
    | skipped, not counted | 1 | the switched-off account: NextUp never knew it |
    | "not synced yet: no unit" | the tenant's own accounts | every user whose department is not a unit key (your admin account). The note stays until they have one; it is not an error |

    A second **Run now** shows `Added 0 · updated 0`. To see a leaver: set `"enabled": false` for one person in
    `people.json`, run the script again, Run now: deactivated 1.
11. **Delete the users again.** Only users with an employee ID starting `NXTST-` and an address in `<domain>` go:
    ```bash
    npx tsx ops/tst/entra-users.ts --delete --email-domain <domain> --dry-run
    npx tsx ops/tst/entra-users.ts --delete --email-domain <domain>
    ```
    Switch the sync off first if the people should stay active in NextUp: with the sync on, the next round
    deactivates everyone who was deleted. Entra keeps deleted users for 30 days under "Deleted users".

Not yet run against a live tenant: the script's Graph calls are tested with a faked `fetch` only (see the PR that
added it).

## Tear down

- After a run nothing needs tearing down: the tunnel and the db port are already closed. Check on VM 1:
  `docker ps --format '{{.Names}} {{.Ports}}'` shows no `5439` for `db`.
- To empty the test data and keep the VM: `stack/ctl.sh <slug> down -v` on VM 1 (asks for the slug) and install
  again; or stop here and keep the data for the next run.
- To remove the drill: `stack/ctl.sh drill down -v` on VM 2, then delete the VM.
- To retire VM 1 after the test phase: delete the VM at the provider, remove the DNS name, and remove the test
  tenant's app registration for it (Q2). Delete the local temp files if a run was cut off with `kill -9` (they are
  mode 600 under your temp directory: `auth_secret`, `pg_password`, `codes`, `cookies`).

## The proof

`bash stack/tests/tst-vm-run.test.sh` runs the whole script against the Docker test host of `stack/tests` (the "VM"),
with a stub for the generator (`TST_GENERATOR`), `true` for the scenario and k6 skipped. It checks the release, that
the tunnel is on `127.0.0.1` only and reaches Postgres, the restore seconds and RTO in the results file, that no secret
is printed or left behind, and that a bad host or sha exits 2 before anything connects.
