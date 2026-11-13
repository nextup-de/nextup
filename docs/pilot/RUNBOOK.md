# Pilot runbook: from an empty VM to stage pilot

> **Updated 2026-11-11.** For NextUp's operator (Kevin or whoever Kevin names). One customer, one stack, one VM. Every
> command here exists on `main`; where something is not built yet it says *planned for the pilot*. Commands are
> explained once in the stack, ops and customer docs; this runbook gives the order and links there.

**A green checklist does not authorise a pilot.** The Go-live page checks what the app can see. It cannot see a signed
agreement (only that someone recorded it on the Agreements card), a restore test, an open security finding or an access
key someone forgot. Those are checked by hand in the joint setup session ([below](#joint-setup-session)) and nobody opens the company or moves it to
pilot before they are. The app can show ready while a contract is missing.

**A new company is closed.** Until someone presses "Open NextUp" (`/<company>/setup/open`), only active managers and
stack admins get a session. Everyone else sees on the login page that NextUp is not open yet. Companies that were
running before this rule came in stay open.

## The order

| # | Step | Who | Where it is described |
|---|---|---|---|
| 1 | Hardened VM, DNS, deploy user | NextUp (hosted) or the customer's IT (own server) | section 1 |
| 2 | Install the stack | NextUp or the customer's IT | section 2 |
| 3 | Write the config file and get the four CSV files | NextUp and the pilot lead | section 3 |
| 4 | `bootstrap` in sandbox | NextUp | section 4 |
| 5 | Read the checks, fix what is open | NextUp and the customer's IT | section 5 |
| 6 | Joint setup session | NextUp, customer IT, pilot lead | [Joint setup session](#joint-setup-session) |
| 7 | One real test mail | in the session | section 7 |
| 7a | Open NextUp | the customer's admin | [Open NextUp](#open-nextup) |
| 8 | The switch: sandbox to pilot | the customer's admin | section 8 |
| 9 | Rollback to sandbox, if needed | the customer's admin | section 9 |
| 10 | First-week checks | NextUp | section 10 |
| 11 | Weekly numbers | NextUp and the pilot lead | section 11 |
| 12 | Moving to live | NextUp, after the contract | section 12 |

## 1. Hardened VM and DNS

- **Size.** 4 vCPU, 16 GB RAM, 160 GB SSD, one plain Linux VM per stack, up to 2,000 people. This is what the stack is
  sized for; the load run on the test VM is not recorded yet. See `docs/ops/SIZING.md`.
- **Hardening.** NextUp's `harden.sh` lives in the `nextup-infra` repository, not in this one. It is applied by hand to
  every pilot VM before anything is installed; see "Before the run", step 1, in `docs/test-phase/RUNBOOK.md`. If the
  customer hosts the VM, their IT keeps it patched and encrypted (`docs/customer/INSTALL.md`, section 1).
- **DNS and TLS.** A name for the stack, an `A` record, ports 80 and 443 open, port 22 only from admin addresses. The
  record exists before the install: Caddy asks for the certificate when the stack starts
  (`docs/customer/INSTALL.md`, section 3).
- **Deploy user and release key.** Laid out in `stack/remote/README.md`, sections 1 to 5. The release key can only
  run `release` and `status`.
- **Off-box backup.** An S3-compatible bucket and its keys. A backup on the VM's own disk is not a backup against losing
  the VM (`docs/ops/RPO_RTO.md`).

## 2. Install

As the `deploy` user, with the image tag NextUp names (a 7-character commit id):

```bash
export BACKUP_S3_ACCESS_KEY_ID=... BACKUP_S3_SECRET_ACCESS_KEY=...
~/nextup/stack/tests/install-clean.sh --slug acme-pilot --origin https://nextup.acme.example \
  --images <tag> --backup-repo s3:https://<endpoint>/<bucket>
```

This runs the real-stage install, then checks health, a backup and a restore. The plain call is
`stack/install.sh --slug <slug> --origin <url> --stage real --images <tag>`.

- **AI off (the default for a pilot).** Install as above, with no brain option. Nothing calls an AI provider.
- **AI on: add `--brain-cloud`.** The brain then calls the AI provider with the AWS keys in the stack's `.env`
  (`--brain-cloud` and `--brain` exclude each other). Only after the data-processing agreement with the provider is
  signed, and only after the provider was chosen with the steps in `docs/ops/AI_PROVIDER.md`. If neither provider
  qualifies, the AI stays off. The AI choice in the bootstrap config can only be `off`; switching it on is done in the
  admin console afterwards, with the agreement date recorded, and the Go-live AI check refuses a model without that date.
- **Secrets.** `RESTIC_PASSWORD` and `CONNECTOR_VAULT_KEY` go into the password manager now
  (`docs/customer/INSTALL.md`, section 4).
- **Cron.** Nightly backup, weekly restore test, health checks every five minutes: `stack/remote/README.md`, section 5,
  and `docs/ops/monitoring.md`. Set `BACKUP_OFFBOX=required`.
- A real-stage start creates the company row with the stack's slug, empty, in stage `sandbox`. The bootstrap takes that
  company over in section 4 (it works on a sandbox company, never on another stage).

## 3. Config file and CSV files

The config is a JSON file; `apps/app/prisma/generators/pilot/README.md` lists every key. Example:

```json
{
  "slug": "acme-pilot",
  "name": "Acme GmbH",
  "admin": { "name": "Erika Muster", "email": "erika.muster@acme.example", "stackAdmin": true },
  "calendar": "de-by",
  "promiseDays": 5,
  "ai": { "choice": "off" },
  "structureDir": "./pilot-files",
  "directory": "entra"
}
```

- `"stackAdmin": true` on the admin makes that person the **stack admin** of the new stack: the one person who signs in to
  its console (`/admin/login`, with the login code and an authenticator code). Leave it out and the admin is only the
  company admin. There is exactly one: a company that already has another active stack admin is refused (section 4).
- No secret goes in this file. A key that is not listed is refused, and so is anything that looks like a key, token or
  password. Mail, directory and sign-in settings are set in the console or in the stack's environment.
- The four CSV files are `units.csv`, `roles.csv`, `members.csv` and `routes.csv` in `structureDir`. The customer's pilot
  lead and HR produce them (`ONBOARDING.md`). To see the format or to rehearse, `sample` writes a set:

```bash
cd apps/app
npx tsx prisma/generators/pilot/run.ts sample --people 150 --seed 1 --out ./pilot-files
```

## 4. Bootstrap

Run from `apps/app`, with `DATABASE_URL` in the environment. A customer stack does not publish its database. NextUp
reaches it the way the test phase does: the database port is opened on `127.0.0.1` of the VM only, an SSH tunnel carries
it to the operator's machine, and both are closed afterwards (`docs/test-phase/RUNBOOK.md`, "The run"). Use a checkout of
the same commit as the installed images.

**Always start with a dry run.** It runs the same checks as a real run, prints what a real run would do (`would …`) and
writes nothing: no company, no row, no codes file. It sends no mail either; the bootstrap never calls the function that
mails an admin.

```bash
cd apps/app
npx tsx prisma/generators/pilot/run.ts bootstrap --config pilot.json --dry-run
```

It checks the config, the codes file name and every CSV file before the first write, and lists all errors together. Fix
them all, then run it for real:

```bash
npx tsx prisma/generators/pilot/run.ts bootstrap --config pilot.json --codes codes.tsv
```

- **`--codes <file>`** is optional. Without it login codes are made and stored only as hashes and nobody can read them.
  With it the file is created exclusively with mode `0600` and holds `<email><TAB><code>` for the people who got a code in
  this run. An existing file is refused before anything is written, so pick a new name every time. Codes never reach the
  screen, `--json` or a log. Hand the file over through a channel the customer's IT trusts, then delete it. A customer
  that signs in with Microsoft needs no codes for its people.
- **The stack admin and the break-glass session.** With `"stackAdmin": true` the bootstrap writes `isStackAdmin` for the
  config's admin only, with an audit row (`audit.access.stack_admin`); a rerun makes an existing admin the stack admin and
  never anyone else, and a company that already has a different active stack admin is refused before the first write
  (exit 2). That person is the one console session of the stack. The only other way into the console is the break-glass
  window (`stack/break-glass.sh <slug> open`): a time-limited code from the customer's operator with no person behind
  it, closed again with `close`, and the Go-live check "Emergency access" needs it closed. More stack admins are
  granted later in the console (Access), never by the bootstrap.
- **A rerun is safe.** It keeps users, code hashes, preferences, AI settings and everything the config does not name,
  never rotates a code, and resumes an interrupted run without duplicates. The CSV files still win for what they name.
  An import never deletes. A code made by an interrupted run that never reached the file is lost: issue a new one in the
  console.
- **Stage.** A company not in sandbox is refused (exit 1). The bootstrap never moves the stage.
- **`--json`** gives the same result as data.

Exit codes:

| Code | Meaning | What to do |
|---|---|---|
| 0 | Done. Open checks are listed and named; they are not an error. | Section 5. |
| 1 | Refused (not a sandbox company) or the command failed. | Read the message; do not work around it. |
| 2 | The config, an option or a CSV file has errors. Nothing was written. | Fix every listed error, dry-run again. |
| 3 | The directory run failed. Everything before it is done. | Fix the connection (section 5, Directory sync), run again. |

## 5. What each check needs, and which page fixes it

The bootstrap ends with one line per check, `[state] level key: text`. The same checks are on
`/<company>/setup/open` and `/<company>/settings/go-live`, where each row links to the page that fixes it. *Needed*
checks block Open and the switch; a check that cannot run (`unknown`) blocks too. *Recommended* checks do not, except
*Reminders and digest*: recommended for Open, needed for the switch to pilot, because the promise and the deputy
hand-over depend on reminders (Q9.7). On Go-live it is listed with the needed checks.

| Check | Needed? | Done when | Fixed on |
|---|---|---|---|
| Units and roles | needed | at least one unit and every role has a seat | Settings, Org (or the CSV files) |
| Routes | needed | at least one route and every route's owner role has an active person in a seat | Settings, Routing |
| Calendar | needed | the company saved its calendar | Settings, Calendar (the config's `calendar` does it) |
| People can sign in | needed | Microsoft sign-in is on for the company, or every active person has a login code | Settings, Sign-in; Members |
| Managers' second factor | needed | every active manager who uses a login code has a confirmed second factor | Members |
| Mail can leave | needed | `SMTP_URL` is set and the relay answers | Notifications; the stack's `.env` |
| AI | needed | off, or on with a recorded date for the AI provider's agreement; a test model never passes | the console's AI settings (`/admin/assistant`) |
| Backups | needed | the last successful backup is off the server and less than 26 hours old | the operator (`stack/backup.sh`), not an app page |
| Support access | needed | no support grant is open | Settings, Support access |
| Restore test | needed | `stack/backup.sh <slug> restore-test` passed within the last 30 days; it writes `restore-test.json` (time and seconds) next to the backup status file, and the line shows both | the operator (`stack/backup.sh`), not an app page |
| Security findings | recommended | nothing records the open findings of the test phase on a stack yet, so the line says "Not recorded on this stack" and never blocks; a recorded count above zero would block | the operator, see the list below |
| Emergency access | needed | the break-glass window (`stack/break-glass.sh`) is closed | the operator (`stack/break-glass.sh <slug> close`) |
| Agreements | needed | the data-processing agreement with NextUp is recorded as signed; the works agreement too, unless "no works council" is recorded; with the AI on, the information to employees about the AI | Settings, Go-live, Agreements card |
| Reminders and digest | recommended for Open, needed for the switch | `notifications` is on | Settings, Notifications |
| Directory sync | recommended | the last run is less than 24 hours old and without an error | the connector settings |
| Report recipients | recommended | at least one person gets the weekly email | Settings, Pilot report |
| Baseline | recommended | a baseline is set | the Dashboard |

What the checks do **not** do:

- **Mail can leave** proves the relay is set and answers. It does not prove a mail arrives (section 7).
- **Backups** shows only the **last successful** backup, read from the status file the backup script writes after a
  success. A failed attempt leaves the old file, so the check can stay green for up to 26 hours after the first failure.
  A failed attempt and the restore test are therefore separate steps by hand (the list below).
- **People can sign in** counts Microsoft being on as enough. People created at first Microsoft sign-in do not exist
  before it, so there is nobody to count.
- **Agreements** checks that a company admin recorded each needed agreement with its date and the signer's role (or
  "no works council" with a reason). It does not see the paper. The IT security approval and the DPIA are recorded on
  the same card and are not part of the check.
- There is no evidence file and no check for the restore test, open security findings or residual access. They are on
  the hand list below.

## Joint setup session

The first pilots are set up together, not by the customer alone. Before the session NextUp installs the stack and runs
`bootstrap` in sandbox from the customer's CSV files, and the customer's IT connects sign-in, directory and mail with the
handouts `docs/customer/ENTRA_SETUP.md` or `docs/customer/SUCCESSFACTORS_SETUP.md`. In one session of about half a day
NextUp, the customer's IT and the pilot lead (who knows the units, roles and routes) check the structure and the routes,
go through the checklist on the Open page and open the company, then raise a test case. The customer's admin then moves
sandbox to pilot. Setup at `/<company>/setup` covers the steps below that happen in the app: it shows what is still
missing, an imported company simply shows its steps as done, and it serves a company without an import too.

**What NextUp prepares before the session**

1. The stack is installed and `/api/health` answers 200 with a valid certificate.
2. A dry run and a real `bootstrap` ran from the customer's files with no CSV error; the output of the checks is saved.
3. The company is in sandbox. NextUp has read the open checks and knows which need the customer's IT.
4. The restore test ran (`stack/backup.sh <slug> restore-test`) and its seconds are written down.
5. The hand list below is printed or open, with Kevin's record of the TST findings in front of him (`README.md`).
6. A test person for the test mail exists at the customer (an address the IT can read).
7. A support grant is **not** open and the break-glass window is closed.

**The order within the session**

1. Introductions; who may decide what; who holds the stop button for the pilot (`SUPPORT.md`).
2. The hand list: agreements and works council first. If one is missing, the session ends as a rehearsal and nobody
   switches.
3. Structure: the pilot lead reads the units and roles on the Org page against the real organisation.
4. Routes: for each route, who owns it and who is the deputy; Routing shows nobody in an owner role as a gap.
5. People and sign-in: one admin and one manager sign in and land in setup; a member is refused with the "not open yet"
   line (the company is still closed).
6. Directory and calendar: the last directory run is green or the CSV files are the source; holidays are right.
7. The checklist on the Open page, line by line. Every *needed* line is done or the cause is named.
8. One real test mail (section 7).
9. [Open NextUp](#open-nextup), if and only if the hand list is clear. The member from step 5 can now sign in.
10. Raise a test case in sandbox as a member, watch it reach the owner's inbox, answer it, read the decision log. Nothing
    leaves in sandbox; that is the point.
11. The switch (section 8), if and only if the hand list is clear.

**What the session checks by hand**

| Item | How | Who confirms |
|---|---|---|
| Signed agreements | The data-processing agreement is signed by both sides; with the AI on, the AI provider's agreement too. Dates are on the paper and match the Agreements card on Go-live. The documents in `docs/compliance/` are drafts for legal review, not signed. | Customer's legal signatory and NextUp |
| Works council | Where the customer has one, the works agreement is signed before any real person is in the pilot, and recorded on the Agreements card; without one, "no works council" is recorded there. Directory sync and the pilot report need it. | Customer |
| Restore test | `stack/backup.sh <slug> snapshots`, then `stack/backup.sh <slug> restore-test <id>`. The seconds are under 3,600 (`docs/ops/RPO_RTO.md`) and the Restore test check shows them. Read the last backup log for a failed attempt: the Backups check would not show it. | NextUp's operator |
| Open TST findings | Every finding in `docs/test-phase/findings/` is, in Kevin's written record, fixed, deferred with an owner and a date, or a blocker. A merged task or a passed gate does not replace this. A deferred finding is not an accepted risk for the customer: the customer is told. | Kevin |
| Residual access | No support grant open and the break-glass window closed (both are checks now); the deploy key is the forced-command key only; test accounts, tokens and tunnels are removed; the `--codes` file is deleted; the database port is closed. | NextUp's operator and the customer's IT |

If anything on this list is unclear, say so out loud and stop. A green checklist does not authorise a pilot.

## 7. One real test mail

In sandbox the app sends no case mail, reminder or report. The Mail check proves the relay answers, not that a mail
arrives. The test mail is therefore one that does go out in sandbox: **invite the test person as a manager** on Settings,
Members. The invitation mail carries the person's login code and the login address and is sent through the relay at once.
While the company is closed only a manager's invitation goes out at once: a member's or a leader's waits for Open.

- It arrives at the address the IT can read, not in spam, with the right sender, in the person's language.
- The link opens the company's login page over HTTPS with a valid certificate.
- Afterwards deactivate the test person (Members) so the people counts stay true, and because a manager without a second
  factor keeps the Managers' second factor check open.

The first case mails are checked again in the first week (section 10), because they only leave in pilot.

## Open NextUp

Only a company admin of the customer opens the company, on `/<company>/setup/open`, which the setup finish page leads to.
NextUp sits next to them; it does not do it for them. The page runs every check again on the server and refuses if a
needed one is open or unknown. There is no override. A dialog repeats the hand list above, which the app cannot check.

What changes: everyone with an active account can sign in. Invitations held back so far go out, each with a new login
code; a person whose code was handed out by hand keeps it and gets no mail. A mail that fails stays in the queue and the
page offers to send it again. Nobody is signed out and the stage does not move. The time is stored on the company and
written to the audit log. There is no way to close a company again; to stop a pilot, use section 9 and deactivate people.

Before Open the shop-floor pages say the area is paused, and the Teams bot answers as if Teams were off. API tokens and
SCIM work, because they belong to the setup people and the customer's IT.

## 8. The switch

Only a company admin of the customer moves the stage, on `/<company>/settings/go-live`, and only after Open. The page runs
every check again on the server and refuses if a needed one is open or unknown. NextUp sits next to them; it does not do
it for them.

What changes: mails about a case go to the people it concerns; reminders and the daily digest go out only if
*notifications* is on; the pilot report starts counting (the dialog names the week it counts from); every manager who is active at that
moment gets the weekly email unless someone chose recipients before. Everyone stays signed in. The move is written to
the audit log and the Go-live history.

## 9. Rollback to sandbox

A company admin can switch back at any time ("Switch back to sandbox"). Messages stop at once and waiting ones are
skipped; the pilot report pauses (its weeks stay); everyone is signed out once and signs in again. Data is not
touched. Use it for a broken mail setup, a wrong structure or a stop decision. The customer's pilot lead can ask for it
through the stop route in `SUPPORT.md`. After a rollback the reason is written down and the checklist is run again
before the next switch.

## 10. First-week checks

Day 1, day 2, then twice that week, NextUp looks (with a support grant only if the customer gives one):

- A real case mail arrived at the owner, links work, sender is right. Ask the pilot lead; do not look into cases.
- `stack/health.sh` has no alert, last night's backup is on the Backups line, the restore test of Sunday passed.
- Go-live still says *Still ready?* with every needed line done.
- The Pilot report page loads; the Monday mail went to the chosen managers (07:00 Berlin time, for the week before; on
  the first working day if Monday is a holiday).
- Sign-in: nobody stuck; refused people are the people without a role, as intended.
- Directory sync ran in the last 24 hours, if used.
- The customer's questions went through the support channel, and each has an answer or a date.

## 11. Weekly numbers

Every Monday NextUp and the pilot lead read the Pilot report (`SUCCESS_METRICS.md`): cases per 10 people, first answer,
answered on time and use, against the baseline. Units under 5 people are hidden. The `report` command writes one run of
the weekly mail for a company if the cron missed it:

```bash
cd apps/app
npx tsx prisma/generators/pilot/run.ts report --slug acme-pilot --now 2026-11-09T09:00:00+01:00
```

## 12. Moving to live

Live means a paying customer. A company admin cannot do it. NextUp moves the stage in the admin console after the
contract is signed and after the review in `SUCCESS_METRICS.md`. Sessions stay when moving between real stages. A
"Ready for live?" list on Go-live is *planned for the pilot*; until then the same hand list applies, plus: the pilot ran
as agreed, the external penetration test is done and its findings are handled (Kevin's), and the agreements are signed.
