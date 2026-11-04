# Pilot check: one test across all phases

> **Written 2026-11-04 against `main` at 4bc326e.** EID-Z1, SEC-U1, SEC-Z1 and most of TST were still open.
> Re-check every "known" finding before relying on it. Lanes keep merging.

## What this is

One run that walks a company through its whole life in NextUp: install, sign-in, org data, the case loop, projects,
channels, connectors, privacy and support access. It answers one question: **can a company of 1,000-2,000 people start
on this?**

It adds what TST does not cover. TST's suites replay fakes on Musterwerk; nothing owns the live checks today, because the
TMS and CNX plans defer them to TST and `ops/tst/vm-run.sh` has no Teams, M365 or Jira step.

**Available:** test tenant `nextuptest` (Entra, M365, Teams) and Jira.
**Not available:** customer VM, SMTP relay, AI provider. Steps that need them stay "Not testable".

## How results are scored

Every step gets one result, with evidence (screenshot, log or test name):

| Result | Meaning |
|---|---|
| Pass | Checked on the real path, expectation met |
| Weak | Works, but the pilot suffers |
| Fail | Expectation not met |
| Not testable | Access is missing. Counts as open, never as passed |

**Pilot-ready** means every Must step passes. A Must step that is Not testable blocks the verdict.

"Known" in the tables means a review found the problem. Unless a step says otherwise it comes from reading code, not from
running it, so the run has to confirm it.

## Order

1. **Fix list** below, because a run against known failures only repeats the review.
2. **Setup.**
3. **Stages A to J in order**, on one frozen commit. Later stages reuse what earlier ones created.
4. **Automated suites** (listed after the stages), on the same commit.
5. **Report**, then TST-Z1. TST-Z1 does not pass while a Must step here fails.

## Fix list before the run

| # | Fix | Phases | Evidence |
|---|---|---|---|
| F1 | One guard for every console write that refuses support and closed break-glass sessions, and a test that enumerates all actions. Covers `issueLoginCodeAction`, `setStackAdminAction`, `setEntraTenantAction` (`server/actions/admin.ts`), `adminResetTotpAction`, `server/actions/m365.ts`, `server/jira-admin.ts`. "End now" must stop access at once | SEC, ITC | Checked on 618c992 and again on 4bc326e |
| F2 | Graph delta sync must request `manager` through `$select`, not `$expand` (`server/directory/graph.ts:17`) and read `manager@delta`. Handle a 410 with a full resync. Surface skipped users; do not advance silently past them | DIR | Microsoft's docs against the code; no live call yet |
| F3 | Unit membership without a seat. Directory members hold no seat (`features/auth/entra.ts:274`), and leader visibility, unit audiences and metric cohorts all read seats (`features/cases/visibility.ts:29,58`, `lib/db/metrics.ts:38`). Also check `due.ts:29`, which can hand a case to a vacant seat | VIS, MET, DIR, CLK | Checked in code |
| F4 | Close private-data paths: API `isPrivate` tests only `private` (`features/api/map.ts:34`); webhooks have no visibility filter (`features/notify/plan.ts`); token GET on `app/api/[company]/events/route.ts:70`; anyone can comment on a case they cannot open (`features/cases/permissions.ts:24,92`); a picked custom audience stays locked out (`features/evaluate/index.ts:105`) | VIS, API | First and last two checked in code |
| F5 | Pseudonymised people stay gone: the case page and project team still show the raw name; SCIM can restore name and active state because `ExternalIdentity` survives (`lib/db/pseudonymise.ts`, `features/directory/apply.ts`); retention skips `OutboxMessage` and Teams links | GDP, EID, TMS | `ExternalIdentity` checked; rest from review |
| F6 | Floor limits keyed by IP, not by a client cookie (`server/floor/raise.ts:136`, `server/actions/floor.ts:69`) | FLR | Checked in code |
| F7 | German where people decide: `features/ideas/brief.ts:38` labels, admin console, and real dates in mails instead of "Tag {day}" (`i18n/messages/mail.ts:80`). Remove the name comparison at `brief.ts:343` | LNG, CLK, IDN | Checked in code |
| F8 | Refuse a forged `why: "deadline"` hand-over from a desk holder (`features/cases/stamp.ts:9`, `permissions.ts:51`) | LOOP, MET | From review |
| F9 | Teams works on a real stack: `stack/compose.yml` passes no `TEAMS_*`. Removing the bot falls back to mail. People who signed in by SCIM, SAML or OIDC can be linked | TMS, OPS, EID | Compose checked; rest from review |
| F10 | Make `e2e`, `e2e-db` and `db-tests` required on `main`. The ruleset requires only `guard` and `app`, which is how red merges reached `main` | AUD, all | Ruleset read 2026-11-04 |

Bigger items that can wait for the run's result: per-site calendars, SFX leavers and unit creation, `/Groups` in SCIM,
SAML RelayState binding, AI eval against a real model, incremental notification dispatch.

## Setup

- Own checkout and own database on the laptop, on one frozen commit. Write the SHA in the report.
- **A public HTTPS URL** (test host or tunnel). Microsoft sign-in callbacks, Teams and Jira cannot reach `localhost`.
- Two companies: **Musterwerk** from `prisma/generators/musterwerk/run.ts` (`--people 150 --weeks 2` for the walk, 1,500
  for load) and **Leerfirma**, created empty.
- Accounts in `nextuptest`: a manager, a leader, a deputy, two members in different units, and a leaver.
- Mail is read from the outbox. AI is off unless a step says otherwise.
- Kevin signs in to Microsoft and Jira himself. An agent enters no passwords there.

## The run

### A. Install and first start

| # | Who | Action | Expected | Level | Phases |
|---|---|---|---|---|---|
| A1 | Operator | Run `stack/tests/deploy-path.test.sh` and restore | Green; backup runs before migrate; note the restore seconds | Must | OPS |
| A2 | Operator | Set Teams and connector env through the install path only | Values reach the running app without a code change. Known fail: F9 | Must | OPS, TMS |
| A3 | Operator | On a non-demo stage, try `ADMIN_ACCESS_CODE`, then open a break-glass window, then close it | Refused; works inside the window; closing ends the session | Must | SEC, OPS |
| A4 | Operator | Rotate keys with `stack/rotate-keys.sh` | Jira, M365 and TOTP secrets still open | Should | SEC, CNX |
| A5 | Operator | Real VM install and restore | Per runbook. **Not testable: no VM** | Must | OPS, INF, TST |

### B. Company setup by its own IT

| # | Who | Action | Expected | Level | Phases |
|---|---|---|---|---|---|
| B1 | IT admin | In Leerfirma, look at every page | No acme goal, route or person | Must | STR |
| B2 | IT admin | Set up org, roles, deputies, routes, calendar, rules, without a developer | Possible from the UI alone, in German. Known weak: console English | Must | ADM, ITC, LNG, STR |
| B3 | IT admin | Import people by CSV | Added, with row errors shown | Must | ADM, API |
| B4 | IT admin | Open every Settings menu entry | No 404 | Must | ADM, EID, SEC, TMS |
| B5 | IT admin | Two sites with different holidays | Result recorded: one calendar per company today. Kevin decides | Should | CLK, ADM |
| B6 | IT admin | Switch off AI and all integrations | Core loop still works in stage D | Must | AIP, TST |

### C. Identity and directory, live

| # | Who | Action | Expected | Level | Phases |
|---|---|---|---|---|---|
| C1 | Kevin | Sign in with a `nextuptest` account | Right company and role, no duplicate user | Must | IDN, EID |
| C2 | IT admin | Switch on directory sync in `/admin/connectors`, run it | All users with unit and manager. Known fail: F2 | Must | DIR, ITC |
| C3 | Kevin | In the tenant, change a name, move a unit, deactivate one; sync again | Delta applied; leaver's session ends; their cases handed to an occupied seat | Must | DIR, CLK, EID |
| C4 | IT admin | Add a user with a department no unit matches | Shown as skipped, not lost | Must | DIR, SFX |
| C5 | Operator | Force an expired delta token | Full resync, no error | Should | DIR |
| C6 | Kevin | Two people with the same name | Each sees only their own cases and desk | Must | IDN |
| C7 | IT admin | Set up OIDC and SAML on `/settings/sign-in` with the tenant | Button on the login page; lands on the same user id | Should | EID |
| C8 | Kevin | SCIM create, change and deactivate from Entra | Applied; unknown department does not refuse the user. Known risk: `server/scim/users.ts:117` | Should | EID |
| C9 | Tester | Sign in from a company-A session to company B | Refused | Must | SEC, VIS |

### D. The case loop, in German

Use real people from stage C wherever possible. This stage is the heart of the run; do it in one go with no database edits.

| # | Who | Action | Expected | Level | Phases |
|---|---|---|---|---|---|
| D1 | Member | Raise an idea at `/raise` | Up to 3 desks, role and date shown. Record how often the proposal is right on 20 German cases (recorded 26.5 % with English keywords) | Must | LOOP, AIP, LNG |
| D2 | Member | Check "Who sees it" and raise with no choice | The member's leader sees it. Known fail: F3 | Must | VIS, DIR |
| D3 | Member | Pick one colleague as audience | That colleague opens it at once; a third person cannot. Known fail: F4 | Must | VIS |
| D4 | Desk | Open the inbox, answer | All German, including the decision buttons. Known fail: F7 | Must | LNG, LOOP |
| D5 | Clock | Let the answer date pass, skipping a weekend and a holiday | One hand-over to an occupied deputy seat; submitter sees it; no earlier than the working-day count | Must | CLK, LOOP, NTF |
| D6 | Desk | Forge a deadline hand-over | Refused. Known fail: F8 | Should | LOOP, MET |
| D7 | Desk | Say yes and no on two cases | Both in `/decisions` with the deciding desk's role, not a person. Known risk: shows the current desk after a hand-over | Must | LOOP |
| D8 | Lead | The yes opens a project: baseline, start, board, done | Usable start to finish | Must | LOOP |
| D9 | Lead, manager | Type a result at the check date, try to confirm it yourself, then confirm as manager | Self-confirm refused; not counted until confirmed; reward only when confirmed better | Must | LOOP, MET |
| D10 | Everyone | Read every mail in the outbox for D1-D9 | German, a real date, a working link. Known fail: F7 | Must | NTF, CLK, LNG |
| D11 | Everyone | Every page in German, at phone width | No English, nothing cut off | Should | LNG |

### E. Who sees what

| # | Who | Action | Expected | Level | Phases |
|---|---|---|---|---|---|
| E1 | Member B | Open A's private case by URL | Not found; the id is in no response | Must | VIS |
| E2 | Member B | Comment on A's private case | Refused. Known fail: F4 | Must | VIS |
| E3 | Token | Read a private and a custom case over the API | Neither returned; no `actor.userId`. Known fail: F4 | Must | API, VIS |
| E4 | Webhook | Fire on a private case | No case content leaves. Known fail: F4 | Must | API, NTF |
| E5 | Browser | Inspect responses as a member | Other people's user ids and seats are not exposed. Known risk: `lib/db/viewer-log.ts:84` | Should | VIS, GDP |

### F. Numbers

| # | Who | Action | Expected | Level | Phases |
|---|---|---|---|---|---|
| F1 | Manager | Compare `/dashboard` tiles with a hand count | Equal; a hand-over is never an answer | Must | MET, LOOP |
| F2 | Manager | Unit with enough Entra members | Numbers shown. Known fail: F3 | Must | MET, DIR |
| F3 | Manager | Unit under 5, and `?unit=` of its hidden sibling | Hidden, also by subtraction. Known fail | Must | MET |
| F4 | Member, leader | Open `/dashboard` | Refused; no ranking of people anywhere | Must | MET, IDN |
| F5 | Manager | Compare `/progress`, `/feed`, `/overview` with `/dashboard` | Numbers agree, or the difference is explained | Should | MET, VIS |

### G. Channels and connectors, live

| # | Who | Action | Expected | Level | Phases |
|---|---|---|---|---|---|
| G1 | Kevin | Install the Teams app; send the test card | Card arrives in the tenant | Must | TMS |
| G2 | Member | Greet the bot; let a deadline pass | German card, no duplicate mail | Must | TMS, CLK, LNG |
| G3 | Desk | Answer "No" with a reason on the card | Decision in the app, source Teams | Must | TMS, LOOP |
| G4 | Member | Raise from a Teams message | Right unit, private stays private, counted in metrics. Known risk: `fromDept` empty | Must | TMS, VIS, MET |
| G5 | Member | Remove the app; next notice | Arrives by mail. Known fail: F9 | Should | TMS, NTF |
| G6 | Member | Ask a full German question against M365 | Result with source; nothing the person may not read; label-protected files stay out | Must | CNX |
| G7 | Admin | Connect real Jira. Case creates a ticket; status comes back | Works on real responses; replace the hand-written fixtures with recordings. Test both Cloud and Data Center if both exist | Must | CNX |
| G8 | Admin | Expire an M365 and a Jira token | A visible error, not an empty list | Must | CNX |
| G9 | Floor | Raise by QR code without login, then by reference number | Works on a phone. Known risk: PWA manifest | Should | FLR |
| G10 | Attacker | 100 floor-code guesses with no cookie | Locked. Known fail: F6 | Must | FLR, SEC |
| G11 | Kevin | Anonymous floor report naming a supervisor | Visibility follows Kevin's decision, today `everyone` | Must | FLR |
| G12 | Operator | Real SMTP, bounce | **Not testable: no relay** | Must | NTF |
| G13 | Operator | Real AI on German cases; `ask.ts --persona all`; read injection question m14 by hand | Recorded baseline; 0 leaks. **Not testable: no provider** | Must, if AI is on for the pilot | AIP, AIB, AIT, AID |

### H. Support access

| # | Who | Action | Expected | Level | Phases |
|---|---|---|---|---|---|
| H1 | Company admin | Grant, extend and end support access in Settings | Works; log visible to the company | Must | SEC, ITC |
| H2 | Support | Replay login code, stack admin, Entra tenant, TOTP reset, M365 and Jira writes | All refused and logged. Known fail: F1 | Must | SEC, ITC |
| H3 | Support | Keep the tab open while the admin clicks End now | Access stops at once. Known fail: F1 | Must | SEC |
| H4 | Tester | The whole attacker path from a live browser cookie | Cannot end as a manager of the company | Must | SEC, IDN |

### I. Data protection

| # | Who | Action | Expected | Level | Phases |
|---|---|---|---|---|---|
| I1 | Admin | Export one person | Their data only; audit row | Must | GDP |
| I2 | Admin | Deactivate and pseudonymise a former leader, then open their cases and projects | Pseudonym everywhere, also in responses and old mails' links. Known fail: F5 | Must | GDP, VIS |
| I3 | Kevin | Push that person active by SCIM and sync | Stays pseudonymised and inactive. Known fail: F5 | Must | GDP, EID, DIR |
| I4 | Admin | Set a retention rule and run it | Removed counts shown; outbox purged. Known risk: F5 | Should | GDP |
| I5 | Admin | Company export | Follows `docs/PRIVACY.md`. Known mismatch: `lib/db/privacy-export.ts:38` | Should | GDP |
| I6 | Admin | Audit log and export of every action from stages B to H | Complete; syslog arrives in order if tested | Must | AUD, GDP, EID |
| I7 | Reader | Compliance pack in `docs/compliance` | Present and honest about what runs. German version still needed | Should | SEC, PIL |
| I8 | Reader | Public claims in docs and landing | Only what runs on `main` (HD18) | Should | AUD |

### J. Load and stability

| # | Who | Action | Expected | Level | Phases |
|---|---|---|---|---|---|
| J1 | Operator | TST-L1 driver, 200 accounts locally, then 2,000 | p95 under 1 s for inbox and case page; local is only indicative | Must | VIS, TST |
| J2 | Operator | Notification run at 1,500 people | No full-log backlog, no double mail. Known risk: loads the whole log every 30 s | Must | NTF |
| J3 | Operator | k6 at 2,000 on the test VM | **Not testable: no VM** | Must | TST |
| J4 | Operator | Repeat C2 and D1-D5 after a restart | State intact; no repeated hand-over or mail | Must | CLK, NTF, OPS |

## Automated suites, do not repeat by hand

Run on the frozen commit and link the results: `npm test`, `ops/test-db.sh`, all e2e suites, `stack/tests`, and TST-S1, C1,
I1, L1, P1. They test logic on fakes; this run tests the real paths. A failure in either counts.

## Coverage by phase

Scores are Delivered, Quality and Pilot fit from code reviews on 2026-11-03/04, not results of this run.

| Phase | Scores | Verdict | Main worry | Steps |
|---|---|---|---|---|
| AUD | 4/3/3 | Keep, fix | Register has no status | I6, I8 |
| ARC | 4/4/4 | Keep | Unused contract types | Via C, G |
| OPS | 4/4/3 | Keep, fix | Never on a real VM | A1-A3, A5 |
| STR | 4/3/4 | Keep, fix | Latent acme fallback | B1, B2 |
| LNG | 3/4/4 | Keep, fix | Core screens English | B2, D4, D10, D11 |
| CNX | 3/3/2 | Keep, fix | All fixtures synthetic | G6-G8 |
| IDN | 4/4/5 | Keep, fix | Name matching left | C1, C6 |
| CLK | 3/4/4 | Keep, fix | Day number in mails, vacant seat | C3, D5, D10 |
| DIR | 2/3/3 | Rework adapter | Graph query, seats | C2-C5, D2 |
| SFX | 3/3/3 | Keep, fix | Not needed on day one; leavers | C4 |
| AIP | 3/4/3 | Keep, fix | No real eval | B6, D1, G13 |
| AID | 4/3/2 | Keep, small fix | Runbook never executed | G13 |
| AIB | Not started | Open | Depends on the pilot's provider | G13 |
| AIT | 4/3/2 | Keep, fix | Leak check reads sources only | G13 |
| ADM | 4/3/4 | Keep, fix | Routing proposal unproven | B2-B4 |
| VIS | 3/3/2 | Keep, fix | Seats, audiences, comments | D2, D3, E1-E5 |
| NTF | 4/4/4 | Keep, fix | Scale, double-send | D5, D10, E4, J2 |
| ITC | 3/2/4 | Keep, security first | Support session | B2, C2, H1-H3 |
| GDP | 3/3/3 | Keep, fix | Names survive | I1-I6 |
| LOOP | 4/4/4 | Keep, fix | Forged hand-over | D1-D9 |
| MET | 4/3/2 | Keep, fix | Seat cohorts, subtraction | F1-F5 |
| TMS | 4/3/2 | Keep, fix | Cannot start on a stack | A2, G1-G5 |
| FLR | 3/3/3 | Keep, fix | Limits, visibility | G9-G11 |
| API | 4/4/2 | Keep, fix, freeze | Privacy leaks | B3, E3, E4 |
| EID | 3/4/2 | Keep, fix | Fakes only; P1 just merged, not re-reviewed | C1, C7, C8, I3, I6 |
| SEC | 3/3/2 | Keep, fix (blocker) | Support session | A3, A4, C9, H1-H4, I7 |
| TST | In progress | | Live checks unowned | Automated suites, J |
| PIL | Idea only | | No plan yet | I7; add after this run |
| INF | Parked | | Needs the VM decision | A5 |

## What goes into the next plans

- **TST:** add the live steps or reference this document, because D10's `vm-run.sh` has none. TST-Z1 reads this report.
- **PIL:** bootstrap and the sandbox-to-pilot checklist come from stages B and C; the German compliance pack from I7.
- **AIB:** blocked on Kevin's provider choice; G13 sets its threshold.
- **INF:** needed for A5 and J3.

## Decisions Kevin needs to make

1. "du" or "Sie" in the UI.
2. Anonymous floor reports: visible to everyone, or to the desk only.
3. Hide Webhooks and API tokens from the menu; keep CSV import.
4. Per-site calendars before the pilot, or not.
5. When VM, SMTP relay and AI access arrive, since A5, G12, G13 and J3 block the verdict.

## Report

One page: commit, verdict, every step with result and evidence, new findings with severity and file, and what stayed Not
testable. New tests from stages E and H stay in the repo so this can be repeated.
