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

**Technical run passed** means every applicable Must step passes. A Must step that is Not testable blocks the verdict.
**Pilot-ready** additionally requires the G4 gates and launch evidence below; a single walkthrough cannot prove them.

"Known" in the tables means a review found the problem. Unless a step says otherwise it comes from reading code, not from
running it, so the run has to confirm it.

## Order

1. **Triage the fix list** against the frozen commit. Reproduce suspected failures in isolation; record fixed, confirmed or unverified with evidence. Fix confirmed blockers before the full run. A code-review suspicion is not a reproduced failure.
2. **Setup.**
3. **Stages A to J in order**, on one frozen commit. Later stages reuse what earlier ones created.
4. **Automated suites** (listed after the stages), on the same commit.
5. **Report**, then TST-Z1. TST-Z1 does not pass while a Must step here fails.

## Fix list before the run

| # | Fix | Phases | Evidence |
|---|---|---|---|
| FX1 | One guard for every console write that refuses support and closed break-glass sessions, and a test that enumerates all actions. Covers `issueLoginCodeAction`, `setStackAdminAction`, `setEntraTenantAction` (`server/actions/admin.ts`), `adminResetTotpAction`, `server/actions/m365.ts`, `server/jira-admin.ts`. "End now" must stop access at once | SEC, ITC | Checked on 618c992 and again on 4bc326e |
| FX2 | Graph delta sync must request `manager` through `$select`, not `$expand` (`server/directory/graph.ts:17`) and read `manager@delta`. Handle a 410 with a full resync. Surface skipped users; do not advance silently past them | DIR | Microsoft's docs against the code; no live call yet |
| FX3 | Unit membership without a seat. Directory members hold no seat (`features/auth/entra.ts:274`), and leader visibility, unit audiences and metric cohorts all read seats (`features/cases/visibility.ts:29,58`, `lib/db/metrics.ts:38`). Also check `due.ts:29`, which can hand a case to a vacant seat | VIS, MET, DIR, CLK | Checked in code |
| FX4 | Close private-data paths: API `isPrivate` tests only `private` (`features/api/map.ts:34`); webhooks have no visibility filter (`features/notify/plan.ts`); token GET on `app/api/[company]/events/route.ts:70`; anyone can comment on a case they cannot open (`features/cases/permissions.ts:24,92`); a picked custom audience stays locked out (`features/evaluate/index.ts:105`) | VIS, API | First and last two checked in code |
| FX5 | Pseudonymised people stay gone: the case page and project team still show the raw name; SCIM can restore name and active state because `ExternalIdentity` survives (`lib/db/pseudonymise.ts`, `features/directory/apply.ts`); retention skips `OutboxMessage` and Teams links | GDP, EID, TMS | `ExternalIdentity` checked; rest from review |
| FX6 | Floor limits keyed by IP, not by a client cookie (`server/floor/raise.ts:136`, `server/actions/floor.ts:69`) | FLR | Checked in code |
| FX7 | German where people decide: `features/ideas/brief.ts:38` labels, admin console, and real dates in mails instead of "Tag {day}" (`i18n/messages/mail.ts:80`). Remove the name comparison at `brief.ts:343` | LNG, CLK, IDN | Checked in code |
| FX8 | Refuse a forged `why: "deadline"` hand-over from a desk holder (`features/cases/stamp.ts:9`, `permissions.ts:51`) | LOOP, MET | From review |
| FX9 | Teams works on a real stack: `stack/compose.yml` passes no `TEAMS_*`. Removing the bot falls back to mail. People who signed in by SCIM, SAML or OIDC can be linked | TMS, OPS, EID | Compose checked; rest from review |
| FX10 | Make `e2e`, `e2e-db` and `db-tests` required on `main`. The ruleset requires only `guard` and `app`, which is how red merges reached `main` | AUD, all | Ruleset read 2026-11-04 |

Scope-dependent items: per-site calendars, SFX leavers and unit creation, `/Groups` in SCIM, and incremental notification dispatch.
An enabled identity method must pass callback binding and replay checks before launch (K2); real-model evaluation blocks AI enablement (G13).
Do not defer these security checks until after the pilot begins.

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
| A2 | Operator | Set Teams and connector env through the install path only | Values reach the running app without a code change. Known fail: FX9 | Must | OPS, TMS |
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
| C2 | IT admin | Switch on directory sync in `/admin/connectors`, run it | All users with unit and manager. Known fail: FX2 | Must | DIR, ITC |
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
| D2 | Member | Check "Who sees it" and raise with no choice | The member's leader sees it. Known fail: FX3 | Must | VIS, DIR |
| D3 | Member | Pick one colleague as audience | That colleague opens it at once; a third person cannot. Known fail: FX4 | Must | VIS |
| D4 | Desk | Open the inbox, answer | All German, including the decision buttons. Known fail: FX7 | Must | LNG, LOOP |
| D5 | Clock | Let the answer date pass, skipping a weekend and a holiday | One hand-over to an occupied deputy seat; submitter sees it; no earlier than the working-day count | Must | CLK, LOOP, NTF |
| D6 | Desk | Forge a deadline hand-over | Refused. Known fail: FX8 | Must | LOOP, MET |
| D7 | Desk | Say yes and no on two cases | Both in `/decisions` with the deciding desk's role, not a person. Known risk: shows the current desk after a hand-over | Must | LOOP |
| D8 | Lead | The yes opens a project: baseline, start, board, done | Usable start to finish | Must | LOOP |
| D9 | Lead, manager | Type a result at the check date, try to confirm it yourself, then confirm as manager | Self-confirm refused; not counted until confirmed; reward only when confirmed better | Must | LOOP, MET |
| D10 | Everyone | Read every mail in the outbox for D1-D9 | German, a real date, a working link. Known fail: FX7 | Must | NTF, CLK, LNG |
| D11 | Everyone | Every page in German, at phone width | No English, nothing cut off | Should | LNG |

### E. Who sees what

| # | Who | Action | Expected | Level | Phases |
|---|---|---|---|---|---|
| E1 | Member B | Open A's private case by URL | Not found; the id is in no response | Must | VIS |
| E2 | Member B | Comment on A's private case | Refused. Known fail: FX4 | Must | VIS |
| E3 | Token | Read a private and a custom case over the API | Neither returned; no `actor.userId`. Known fail: FX4 | Must | API, VIS |
| E4 | Webhook | Fire on a private case | No case content leaves. Known fail: FX4 | Must | API, NTF |
| E5 | Browser | Inspect responses as a member | Other people's user ids and seats are not exposed. Known risk: `lib/db/viewer-log.ts:84` | Should | VIS, GDP |

### F. Numbers

| # | Who | Action | Expected | Level | Phases |
|---|---|---|---|---|---|
| F1 | Manager | Compare `/dashboard` tiles with a hand count | Equal; a hand-over is never an answer | Must | MET, LOOP |
| F2 | Manager | Unit with enough Entra members | Numbers shown. Known fail: FX3 | Must | MET, DIR |
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
| G5 | Member | Remove the app; next notice | Arrives by mail. Known fail: FX9 | Should | TMS, NTF |
| G6 | Member | Ask a full German question against M365 | Result with source; nothing the person may not read; label-protected files stay out | Must | CNX |
| G7 | Admin | Connect real Jira. Case creates a ticket; status comes back | Works on real responses; replace the hand-written fixtures with recordings. Test both Cloud and Data Center if both exist | Must | CNX |
| G8 | Admin | Expire an M365 and a Jira token | A visible error, not an empty list | Must | CNX |
| G9 | Floor | Raise by QR code without login, then by reference number | Works on a phone. Known risk: PWA manifest | Should | FLR |
| G10 | Attacker | 100 floor-code guesses with no cookie | Locked. Known fail: FX6 | Must | FLR, SEC |
| G11 | Kevin | Anonymous floor report naming a supervisor | Visibility follows Kevin's decision, today `everyone` | Must | FLR |
| G12 | Operator | Real SMTP, bounce | **Not testable: no relay** | Must | NTF |
| G13 | Operator | Real AI on German cases; `ask.ts --persona all`; read injection question m14 by hand | Recorded baseline; 0 leaks. **Not testable: no provider** | Must, if AI is on for the pilot | AIP, AIB, AIT, AID |

### H. Support access

| # | Who | Action | Expected | Level | Phases |
|---|---|---|---|---|---|
| H1 | Company admin | Grant, extend and end support access in Settings | Works; log visible to the company | Must | SEC, ITC |
| H2 | Support | Replay login code, stack admin, Entra tenant, TOTP reset, M365 and Jira writes | All refused and logged. Known fail: FX1 | Must | SEC, ITC |
| H3 | Support | Keep the tab open while the admin clicks End now | Access stops at once. Known fail: FX1 | Must | SEC |
| H4 | Tester | The whole attacker path from a live browser cookie | Cannot end as a manager of the company | Must | SEC, IDN |

### I. Data protection

| # | Who | Action | Expected | Level | Phases |
|---|---|---|---|---|---|
| I1 | Admin | Export one person | Their data only; audit row | Must | GDP |
| I2 | Admin | Deactivate and pseudonymise a former leader, then open their cases and projects | Pseudonym everywhere, also in responses and old mails' links. Known fail: FX5 | Must | GDP, VIS |
| I3 | Kevin | Push that person active by SCIM and sync | Stays pseudonymised and inactive. Known fail: FX5 | Must | GDP, EID, DIR |
| I4 | Admin | Set a retention rule and run it | Removed counts shown; outbox purged. Known risk: FX5 | Should | GDP |
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
| PIL | Planned, not verified | Reconcile implementation | Bootstrap, stage gates and report need acceptance | L1-L5 |
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

Use the [run report template](PILOT_CHECK_REPORT_TEMPLATE.md). Complete the extended gates below as well as stages A-J.

One page: commit, verdict, every step with result and evidence, new findings with severity and file, and what stayed Not
testable. New tests from stages E and H stay in the repo so this can be repeated.


## Review additions, 2026-11-04

Review baseline: merged PR #497, main `ae75e8aa2df3073c4be5c5d9083d1e2fb30e2bb2`.
These additions are acceptance requirements, not executed test results or confirmed product defects.
The phase ratings above remain historical review opinions; they cannot substitute for acceptance evidence.

### Run contract and applicability

Before execution, Kevin names the run owner, operator, security reviewer and customer acceptance contact in the report.
Roles in the tables are proposed responsibility slots until a named person accepts them. Record the planned date and
finding owner for every blocked prerequisite; record access availability again rather than treating the header as current.

Freeze the app SHA, image digests, schema/migration version, configuration fingerprint (no secrets), generator seed,
clock/timezone, deployment size, browser/device versions and test tenant identifiers. Record the plans repo SHA too:
`projects/nextup/PIL/PLAN.md` now exists there; its presence does not prove that PIL is implemented on main.
A run with local patches records the patch and is provisional until repeated on a committed release candidate.

Declare enabled channels, identity methods, directory source, AI provider, Jira variant and floor access before testing.
Add result **Out of scope** only for an optional feature explicitly excluded from the pilot AND disabled server-side;
record the exclusion owner and verify direct URLs, jobs and API calls cannot use it. Hiding a menu is insufficient.
An enabled feature's security and lifecycle checks are Must even where an older row says Should.
Unavailable access remains Not testable. Mandatory VM/recovery and core privacy checks cannot be scoped away.
When AI is off, G13 may be Out of scope only after B6 proves that the app makes no provider calls.

Use synthetic data and allowlisted recipients in isolated test resources. Before B6 or stage-change drills, pause dispatch
and drain/quarantine old queued notices; enable only the tested integration for G. Never guess real users' floor codes.
Capture redacted requests and fixture recordings: no cookies, bearer tokens, credentials, personal mail or document bodies
in git or reports. Keep restricted originals separately with an owner and deletion date. Clean up tunnels, test grants,
tokens, accounts and external tickets after the run; record completion without deleting the evidence needed for review.

### K. Missing security and integrity checks

All rows are Must for the relevant enabled surface. Execute adverse paths on dedicated fixtures so they do not destroy
stage C's accounts or invalidate later stages. Keep each as a regression test when feasible.

| # | Who | Action | Expected | Phases |
|---|---|---|---|---|
| K1 | Security tester | Use company A cookies and scoped tokens against company B case, project, export, search, events, settings and mutation endpoints; repeat signed out and after revocation | Denied without B's content or mutation; verify database and outbound queues as well as status codes | SEC, VIS, API, GDP |
| K2 | Identity tester | For each enabled OIDC/SAML path: alter state/RelayState, replay callback/assertion, use wrong issuer/audience/tenant and expired response; deactivate or demote an existing session | Invalid login rejected; no wrong-company account link; session loses removed privileges on its next protected request. Bind callbacks to their initiating login request | EID, IDN, SEC |
| K3 | Desk and clock | Two tabs submit opposing decisions; retry the same request, duplicate a Teams activity/webhook, run two clock workers at one due instant | One valid transition; conflicts explicit; one logical hand-over, reward and outbound notice; replay cannot change the winning decision | LOOP, CLK, TMS, NTF, API |
| K4 | Security tester | Reuse a revoked/expired/wrong-scope API token; send an unsigned, invalid-signature or replayed inbound integration request wherever supported | Refused before side effects; valid scoped request still works; secrets absent from logs and responses | API, TMS, CNX, SEC |
| K5 | Security tester | Change forwarded IP headers and cookies on floor requests through the actual reverse proxy; try several legitimate people behind one shared NAT | Forged headers cannot evade limits; code guessing blocked; normal shared-site traffic remains usable. Record trusted proxy configuration and configured budgets | FLR, SEC, OPS |
| K6 | Tester | With a private/custom case, inspect list/search, SSR/network payloads, caches, exports, notifications and connected AI/M365 results as allowed and denied users | Only the permitted audience gets content; revoked access no longer retrieves cached content. Do not assume all colleague identifiers are forbidden: distinguish necessary authorized roster data from private case data | VIS, GDP, CNX, AIP |
| K7 | Operator | Check demo recording with no code, enabled code, tester=off, and on sandbox/pilot/live with a code | Demo recording follows its gate; no replay or analytics egress from non-demo stages, including after stage changes in an open tab | SEC, GDP, PIL |

FX6's proposed IP key is not an acceptance criterion by itself: K5 must establish that the trusted proxy and shared-factory
network behave correctly. FX2's exact Graph query change remains a hypothesis until checked against Microsoft's current
API documentation and a live delta response; test pagination, manager removal, 410 resync and retry without losing users.

### L. Pilot package and launch lifecycle

| # | Who | Action | Expected | Level | Phases |
|---|---|---|---|---|---|
| L1 | Operator | Bootstrap an empty company with the PIL configuration; rerun; submit invalid CSV/config | Starts sandbox; no duplicate/destructive rerun; invalid input reported with no partial structure import; codes never printed | Must | PIL, ADM, API |
| L2 | Company admin | Try sandbox to pilot with each required check missing or unknown; forge a direct stage request as member and support; fix checks and retry | Server refuses every missing/unknown needed check and unauthorized actor; valid move audited; stale UI cannot bypass recheck | Must | PIL, SEC |
| L3 | Operator | Queue notices in sandbox, move to pilot, then back to sandbox while jobs run; reuse an old session | Correct dispatch gate and session invalidation; no unexpected backlog delivery, duplicates or post-pause sends; reversal audited | Must | PIL, NTF, IDN |
| L4 | Manager | Read first/next weekly report, CSV, print and email with baseline; rerun job; test a holiday-only period and ISO-year boundary | Same hand-computed totals and suppression everywhere; zero denominators/missing baseline are explicit, no fabricated percentage; one mail per active opted-in manager/week; nobody else receives it | Must | PIL, MET, CLK, GDP |
| L5 | Customer contact | Use onboarding, German training, support/incident contact and pilot stop procedure; send a real test message | Named contacts accept responsibility; customer can report and stop a broken pilot; real mail arrives with working authenticated links | Must | PIL, OPS, NTF |

### M. Recovery, sustained load and operational response

| # | Who | Action | Expected | Level | Phases |
|---|---|---|---|---|---|
| M1 | Operator | Restore an off-box snapshot on an isolated replacement host with separately stored recovery credentials; compare checkpoint data, sign-in and one new case | RPO <= 24 h and RTO <= 3,600 s per docs/ops/RPO_RTO.md; record snapshot timestamp, lost interval and full recovery duration. A throwaway DB restore or health 200 alone does not prove functional recovery | Must | OPS, TST |
| M2 | Operator | Exercise failed migration/deploy and recovery on the test stack | Backup precedes migration; documented compatible rollback or restore returns functional service; record actual lost writes and elapsed time | Must | OPS, TST |
| M3 | Operator | During traffic, interrupt DB/network, produce integration 429/5xx, fail a worker between write and acknowledgement, then recover | No silent data loss or unauthorized output; retries bounded, backlog drains without duplicate logical effects; alerts reach named responders | Must | OPS, NTF, CNX, TST |
| M4 | Operator | Run the existing load scripts on the declared VM with 2,000 registered accounts and explicit active VUs/request mix; add queue/clock work | Per-page p95 < 1,000 ms, errors < 1%, no full-log response (> 2 MB). Record p50/p95/p99, VUs, throughput, CPU/RAM/DB pool and queue age; do not equate accounts with concurrent users | Must | TST, VIS, NTF |
| M5 | Operator | Repeat the production-shaped workload: proposed 5 min warm-up, 30 min steady load, 5 min recovery; burst and retry traffic | M4 budgets hold for steady load; backlog drains within a pre-agreed time and memory/connections do not grow without bound. Set exact burst, arrival rate and drain budget before running; no invented result | Must | TST, OPS |

### N. Exit gates and actual pilot outcomes

G4 stays with Kevin. The walkthrough supports it but cannot replace these requirements from
`docs/plans/2026-11-01_pilot-readiness.md` and TST D12:

| Gate | Evidence required | Proposed owner |
|---|---|---|
| Automated regression | Required CI suites including DB, browser and brain eval on candidate SHA; list failures, skipped tests and expected-failure tests separately. Green `it.fails` is still an open finding | Run owner |
| M365 correctness | Score every one of the 21 ground-truth questions with expected source/access per persona; 21/21 and zero unauthorized documents under existing G4, or a separately recorded approved criterion change before execution | Connector tester |
| Security review | Pentest or ZAP cycle scope/version/date, findings and retests; no high finding open. Record untested surfaces explicitly | Security reviewer |
| Internal use | 14 consecutive real calendar days on the release candidate/configuration, incident diary, no data-loss or access bug. A simulated clock run cannot satisfy this; a material change requires documented retest and soak decision | Kevin/team |
| Operational recovery | A5, J3 and M1-M5 on the recorded infrastructure, plus clean on-prem install evidence | Operator |
| Launch readiness | All applicable Must steps passed, no high finding open, exclusions demonstrably disabled, customer onboarding/support and required agreements reviewed by their responsible people | Kevin/customer contact |

Before the six-week pilot, the customer contact and Kevin/Marc agree its start/end dates, eligible population and baseline
window, case types, success targets and stop rules. Use MET/PIL definitions for participation, first reasoned answer,
within-promise percentage and verified outcomes. Record numerator, denominator, exclusions, minimum group size and source
for each metric; missing baseline is unknown rather than improvement. Set targets before seeing pilot results, and report
uncertainty/low case volume. Routing D1 needs a desk-approved answer set, frozen sample and pre-agreed top-3 accuracy
threshold; recording accuracy alone cannot make a Must step pass. G13 likewise needs an approved quality threshold,
model/prompt versions, timeout/cost budgets and zero unauthorized disclosure before AI is enabled.

Review aggregate outcomes weekly without person rankings. Stop/pause on access leakage, data loss, unavailable critical
case loop or failed recovery; name the person who triggers the pause and the customer communication contact. At six weeks,
Kevin and Marc record G5: continue, revise or stop, with evidence against the agreed baseline and targets. Passing G4 is
permission to start this evaluation, not proof of customer value.
