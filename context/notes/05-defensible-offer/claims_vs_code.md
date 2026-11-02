# NextUp claimed differentiators vs. the code on origin/main (2 Nov 2026)

Method: read-only. Nextup code read from `origin/main` = `be913f4` (PR #309, Mon 2 Nov 2026 12:52 +0100) via `git archive origin/main` (the local working tree is on `feat/m365-search-wired` and was NOT used). No fetch was run. Line numbers refer to `origin/main be913f4`. Short names:
- **N** = `B:/06_CODE/06_Projects/Startup_speed/repos/Nextup` (paths below are relative to `apps/app/src` unless they start with `apps/`, `stack/`, `docs/`, `services/`)
- **L** = `B:/06_CODE/06_Projects/Startup_speed/repos/nextup-landing` (origin/main `6ea338d`, 11 Oct 2026)
- **P** = `B:/06_CODE/06_Projects/Startup_speed/repos/plans/projects/nextup`
- Gap IDs (G-0xx / G-2xx) are from N `docs/audit/gaps/product.md` and `platform.md` (written ~1 Nov, before the OPS/STR/LNG/IDN merges); each one cited below was re-checked against `be913f4` unless marked otherwise.

Verdict scale: **Real** (true in code for a real, non-demo company) · **Partly real** · **Claim only** (only in docs/demo/flags off) · **Contradicted** (code does the opposite).

| # | Claim | Verdict |
|---|---|---|
| 1 | Guided capture, one question at a time; routing done for you | Partly real |
| 2 | Scores are arithmetic over the author's own words, never model output; each point names its fact | Partly real (core true), two contradictions |
| 3 | 5-day answer promise; deputy takes over | Claim only on real companies (demo-only) |
| 4 | Impact measured at +30/+90 before recognition; no ranking of people | Claim only on real companies; "no ranking" Contradicted |
| 5 | Roles not people / works-council-ready | Partly real in write path; Contradicted in read path |
| 6 | One stack per company, hosted or on-prem | Partly real (scripts real, never run at a customer) |
| 7 | Analysis grounded in company data, sources shown | Partly real for internal tables; Claim only for M365/Jira |
| 8 | PILOT IDN / CLK / NTF status | IDN 7 of 9 merged; CLK 1 of 6 merged; NTF 0 of 6 |

---

## Claim 1 — "Guided idea capture: chat coach asks one question at a time; routing done for you"

### Takeaway
The one-question coach is real and structurally enforced (the brain returns a single `question` field; the offline coach asks from the weakest bar). "Routing done for you" is only half true: the route is a keyword/regex or LLM proposal computed **in the browser** and the server accepts whatever `routeId` the client sends; the server only stamps the seat of that route.

### Cited Findings
- The turn endpoint benchmarks the idea on the server, then "the coach answers with one question aimed at the weakest bar" — [N app/api/[company]/ideas/turn/route.ts:1-16](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/app/api/[company]/ideas/turn/route.ts)
- The brain's answer type has exactly one `question` plus `why` and `recommended`; `coachText` joins note + question + why — [N features/ideas/brain-coach.ts:13-17, 38-41](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/ideas/brain-coach.ts)
- Offline coach (`coachMock`) is the default; the brain is used only if `BRAIN_URL` is set, the idea is below the publish threshold, and either the stage has demo data or the company switched the assistant on — [N turn/route.ts:121-122, 132-144](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/app/api/[company]/ideas/turn/route.ts)
- When the Bedrock assistant path is used instead (`useModel`), the reply is free text from `assist()` — no structural one-question guarantee there — [N turn/route.ts:145-166](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/app/api/[company]/ideas/turn/route.ts). Bedrock is off on every stack (no AWS account) — [N docs/audit/gaps/platform.md G-236](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/audit/gaps/platform.md)
- Publishing runs `evaluate(...)` **in the browser component** with the brain proposal `r.brain` — [N components/ideas/Raise.tsx:437](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/components/ideas/Raise.tsx)
- Without the brain the route is `propose(full, ctx.routes)` = keyword match; with it, `brain.proposal.routeId` replaces it — [N features/evaluate/index.ts:61-72](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/evaluate/index.ts)
- Server side, `stampEvent` drops the client's seat but keeps the client's `routeId`: "assigneeRoleHolderId is the owner seat of the route the payload names" — [N features/cases/stamp.ts:5-13](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/cases/stamp.ts). Gap G-035 ("the server stores whatever proposal it is given", phase AIP, planned) is therefore still open — [N gaps/product.md G-035](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/audit/gaps/product.md)
- The routing table is read-only from the seed; no company admin can change owner, deputy or keywords (G-012, phase ADM, planned) — [N gaps/product.md G-012](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/audit/gaps/product.md); yet the pricing page sells a "Routing table editor" — [L pricing/page.tsx:46](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-landing/src/app/(marketing)/pricing/page.tsx)
- Landing: "no form, no category tree, no ticket - the routing is done for you" — [L page.tsx:35](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-landing/src/app/(marketing)/page.tsx)
- Receivers, collaborators, meeting and visibility choices on the raise menu live only in page memory (G-006, phase LOOP, idea) — [N gaps/product.md G-006](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/audit/gaps/product.md)

### Inferences
- The coach is a genuine UX asset but trivially copyable (a prompt + a schema). The defensible part would be the routing map + who-owns-what data, which today is a seed blob with a read-only page and a client-trusted route id.
- To make it real and hard to copy: compute the route on the server (AIP), let a company admin edit the routing table (ADM), and log every override (proposed vs. final route) so the routing accuracy per company becomes an accumulating data asset.

### Gaps
- I did not verify the brain prompt's quality or how often the offline coach repeats itself; no usage data exists.

---

## Claim 2 — "Scores are arithmetic over the author's own words, never model output; each point names its fact"

### Takeaway
Mostly true for the four idea-studio bars: they are pure regex/keyword arithmetic and each point carries a `found`/`missing` sentence. But (a) the LLM's routing pick feeds the dashboard case score (+20), (b) the system actively generates text (templated and LLM-written) that is pre-scored and only offered if it raises the score — so "chatting cannot talk the score up" is false, and (c) in the demo script the dials are hand-written numbers, not arithmetic.

### Cited Findings
- Header claim: "Arithmetic over the text and the company context, never model output - so every point names the fact behind it, and chatting cannot talk the score up" — [N features/ideas/benchmarks.ts:1-4](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/ideas/benchmarks.ts)
- The bars are regexes: `QUANTITY`, `MEASURE`, `REACH`, `FIRST_STEP` (/pilot|trial|first step/), `WHY` (/because|so that|saves/), `WHO` (/we|team|shift/) — [N benchmarks.ts:40-47](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/ideas/benchmarks.ts). Points per hit: e.g. first step 40, quantity 40, goal 60, "no spend" 25 — [N benchmarks.ts:86-112](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/ideas/benchmarks.ts)
- Each part pushes a `found` text per hit and a `missing` text per miss (fact naming is real) — [N benchmarks.ts:61-72](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/ideas/benchmarks.ts)
- Only user turns count: `ideaFromTurns` filters `role === "user"` — [N features/ideas/coach.ts:43-51](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/ideas/coach.ts); `scoreDraft` scores that text — [N features/ideas/drafts.ts:17-19](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/ideas/drafts.ts); scores computed server-side in the turn route — [N turn/route.ts:106-107](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/app/api/[company]/ideas/turn/route.ts)
- **Score-boosting suggestions**: "each one is re-scored before it is offered - a suggestion that would not move the score is never shown" — [N features/ideas/replies.ts:1-4](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/ideas/replies.ts)
- **LLM text is selected for score gain**: the brain's `recommended` answer is re-benchmarked and offered first only if `gain > 0` — [N features/ideas/brain-coach.ts:43-53](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/ideas/brain-coach.ts); wired in [N turn/route.ts:142-144](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/app/api/[company]/ideas/turn/route.ts). One click turns model text into "the author's own words".
- **LLM output feeds a score**: on publish, `evaluate(..., r.brain)` takes the route from `brain.proposal.routeId` — [N evaluate/index.ts:70-72](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/evaluate/index.ts); `scoreCase` gives +20 "Fits a decision type on the map" whenever `routeId` is set — [N features/scoring/index.ts:23](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/scoring/index.ts); the dashboard row score uses the stored case — [N features/cases/rows.ts:349](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/cases/rows.ts). The brain also supplies `sameAs`/`similar` and a `reason` string shown in the "org" step — [N evaluate/index.ts:77-78, 91](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/evaluate/index.ts)
- The case score also rises with waiting time ("Waiting N d", up to +15, "Past the promise" +5) — i.e. it is a priority score, not an idea-quality score — [N scoring/index.ts:26-27](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/scoring/index.ts). Its labels are hard-coded English strings (not translated) — [N scoring/index.ts:23-30](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/scoring/index.ts)
- The five analysis dials are derived from the four bars; Cost is a fixed lookup (85/70/40/35) and Risk is 60 ± fixed deltas; the Risk basis says safety/quality checks "are not part of it yet" — [N features/ideas/raise.ts:160-207](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/ideas/raise.ts)
- **Demo dials are scripted**: `scriptDials` overwrites each dial's value and note with prepared `SCRIPT_READS` — [N features/ideas/demo-script.ts:73-78, 109-119](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/ideas/demo-script.ts); used when `story = script && role === "member"` — [N components/ideas/Raise.tsx:95, 546-549](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/components/ideas/Raise.tsx)
- Docs repeat the claim: "Arithmetic over the author's own words … never model output" — [N docs/IDEAS.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/IDEAS.md) (as quoted in the background status note)

### Inferences
- The bars are gameable by anyone who learns the keywords ("pilot", "every shift", "20%", "because"); the product itself teaches this through suggested answers. A decider who learns that will discount the score. The honest claim is "transparent and deterministic", not "can't be talked up".
- Being regex-based also makes it easy to copy and weak in German: the regexes are English-only (`because`, `pilot`, `shift`) while the UI is now bilingual (LNG). I did not find German alternations in `benchmarks.ts:40-47`.
- To make it real and hard to copy: (1) record whether a suggested answer was accepted verbatim and show it on the case ("3 of 5 facts came from suggestions"); (2) never let a model route feed `scoreCase` — or show "route proposed by AI" as its own fact; (3) calibrate weights against outcomes (decisions taken, +90-day verdicts) per company — that calibration data is the moat, the regex is not; (4) add German patterns and test them.

### Gaps
- Whether the demo-script override can also appear on a real company depends on how `script` is set; I saw only `story = script && role === "member"` and did not trace `script` to its source.

---

## Claim 3 — "5-day answer promise; deputy takes over"

### Takeaway
On a real company the clock does not move: every event is stamped with `Company.demoDay`, which only `day.advanced` changes, and the server refuses `day.advanced` outside stages that may rewrite history. Escalation is computed at render time, never written, never notified. CLK merged only its type/schema task (#309) — no date arithmetic, no scheduler yet.

### Cited Findings
- `demoDay Int @default(0)` on Company; every CaseEvent stores `day` = demoDay — [N apps/app/prisma/schema/core.prisma:53, 115](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/prisma/schema/core.prisma)
- Server refuses `day.advanced` unless `mayRewriteHistory` (stage policy) — [N server/actions/events.ts:54-58, 90](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/server/actions/events.ts); events are appended with `day: company.demoDay` — [N server/actions/events.ts:134-146](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/server/actions/events.ts)
- Only a manager may move the clock, 1-30 days at a time — [N features/cases/permissions.ts:102-106](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/cases/permissions.ts)
- Escalation is derived inside the reducer ("Derived per case: age, clock, overdue, escalation"), `c.escalated = c.overdue && to ? {...}` — [N features/cases/reducer.ts:304-335](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/cases/reducer.ts). G-002 (never written as an event, no scheduler) still holds.
- No scheduler exists: the only `setInterval` jobs are error flush, Jira sync and ticket sync — [N server/errors.ts:83](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/server/errors.ts), [N server/jira-sync.ts:175](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/server/jira-sync.ts), [N server/tickets-sync.ts:149](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/server/tickets-sync.ts)
- CLK on main is types only: "Pure: no date arithmetic yet (CLK-A1), no database"; `ClockSpec = {mode:"demo"} | {mode:"workdays"}` — [N features/clock/index.ts:1-17](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/clock/index.ts); `clock.due` appears only as an event type in `features/cases/events.ts` (grep).
- No notice on escalation: case mail is `deliverRaisedNotice` only — [N server/case-notice.ts:31](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/server/case-notice.ts); loop mails are per loop event — [N server/loop-notice.ts:22-27](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/server/loop-notice.ts). No reminders/digests (G-026, NTF planned).
- Landing: "Miss the 5-day promise and it moves to the deputy by itself"; the ledger "files every waiting day under one of four reasons" — [L page.tsx:37, 46-47](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-landing/src/app/(marketing)/page.tsx)
- CLK escalation design: `clock.due` events set the escalation while "the owner keeps the case" (not a hand-over) — [P CLK/log.md D5-D16](file:///B:/06_CODE/06_Projects/Startup_speed/repos/plans/projects/nextup/CLK/log.md)

### Inferences
- On a real company today every case is "day 0" forever: age 0, never overdue, no deputy, and the wait ledger and the two headline KPIs (median time to first answer, share answered within 5 days) cannot be computed from days. The single most marketed mechanism is demo-only.
- Note also that CLK's chosen design is softer than the landing copy: the case is flagged to the deputy but stays with the owner. Marketing should say "flags it to the deputy", or the design should hand over.
- To make it real and hard to copy: finish CLK (A1-D1, Z1) and NTF reminders; then the defensible asset is the **answer-time ledger per decision type and per company**, with a baseline — published to management. Competitors can copy a timer; they cannot copy a year of a customer's measured answer times.

### Gaps
- Whether the CLK scheduler will run per stack or centrally is in P CLK tasks (D17 lease fencing) but not on main yet.

---

## Claim 4 — "Impact measured at +30/+90 days before recognition; no ranking of people"

### Takeaway
The verdict arithmetic is real, but the inputs are numbers the project lead types in, the whole module is off for real companies, and a measure check can only be recorded once the (frozen) day counter reaches +30 — so on a real company it can never happen. A person ranking ("Most relied-on contributors") is still on main.

### Cited Findings
- Verdict is computed: "computed from the baseline and the measured number, never typed in" — [N features/projects/verdict.ts:1-21](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/projects/verdict.ts)
- Baseline metric, value, unit, direction and a free-text source are typed by hand in the UI — [N components/projects/ProjectMeasure.tsx:81-110](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/components/projects/ProjectMeasure.tsx); only the project lead may set a baseline or record a measure, and "no number possible" + a reason is accepted — [N features/projects/permissions.ts:49-54, 107-114](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/projects/permissions.ts)
- A check is refused while `state.day < check.opensDay` — [N projects/permissions.ts:112](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/projects/permissions.ts); opensDay is day-counter based — [N features/projects/reduce.ts:229](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/projects/reduce.ts). With demoDay frozen (claim 3), +30/+90 never opens on a real company.
- Reward becomes due when status is "measured" and the company rule is not "none" — regardless of whether the verdict was better, same or worse — [N projects/reduce.ts:242](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/projects/reduce.ts); only a manager records it — [N projects/permissions.ts:116-118](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/projects/permissions.ts)
- `discussion` and `projects` flags default `{ demo: true, sandbox: false, pilot: false, live: false }` — [N config/flags.ts:37-52](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/config/flags.ts); only admin.sellux.ch can switch them (G-007)
- **Person ranking still present**: `contributors()` tallies signals, ideas, shipped, building per person name, commented "Progress -> 'Most relied-on contributors'" — [N features/metrics/index.ts:79-100](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/metrics/index.ts); rendered at [N components/dashboard/shared/ProgressView.tsx:23, 105](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/components/dashboard/shared/ProgressView.tsx); label in [N i18n/messages/dashboard.ts:422](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/i18n/messages/dashboard.ts). Per-person page still routed: `app/[company]/(app)/people/[name]/page.tsx`. G-045 (high) assigned to GDP, stage "idea" — [P hauptplaene/PILOT.md:22](file:///B:/06_CODE/06_Projects/Startup_speed/repos/plans/projects/nextup/hauptplaene/PILOT.md)
- Landing: "It measures cases. Never people." — [L page.tsx:81-84](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-landing/src/app/(marketing)/page.tsx); pricing FAQ "it records no per-person metrics" — [L pricing/page.tsx:76](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-landing/src/app/(marketing)/pricing/page.tsx); privacy page "keine personenbezogenen Leistungskennzahlen" — [L privacy/page.tsx:134-136](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-landing/src/app/(marketing)/privacy/page.tsx)
- Manager dashboard, feed and overview widgets still import preview data (`dashboardPreview`, `feedPreview`, `overviewPreview`) — "the rest is the handoff's demo data in dashboardPreview.ts until the log can count it" — [N components/dashboard/shared/DashboardBoard.tsx:6-8, 20](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/components/dashboard/shared/DashboardBoard.tsx) (also DashboardView, FeedView, OverviewChats, OverviewIdea import them)

### Inferences
- "Measured impact" today = self-reported before/after numbers by the person who benefits from a good verdict. A works council or controller will ask who checks the number. "Recognition only after improvement" is not what the code does: recognition follows measurement, not a "better" verdict.
- To make it real and hard to copy: ship CLK so checks open; pull the measured number from a system (Jira throughput, a KPI table, an uploaded export) with the source stored; require a second person (controller/deputy) to confirm the number; delete `contributors()` and `/people/[name]` before any pilot (cheap, high trust value).

### Gaps
- I did not open `/people/[name]/page.tsx` contents line by line; existence and G-045 description were confirmed.

---

## Claim 5 — "Roles, not people / works-council-ready" (handles, private drafts, server-side visibility, audit)

### Takeaway
Write-side controls are real (server-checked permissions, drafts scoped to the owner, handles for members since #301). Read-side contradicts the claim: every signed-in browser receives the company's entire event log including `actorUserId` next to the anonymous handle, plus the real names of every member who has a handle. Admin actions are console-only; the company admin is a shared code.

### Cited Findings
- Layout loads the whole log for every viewer: `loadLogForSlug(tenant.slug)` → `initialLog` → `DemoProvider` — [N app/[company]/(app)/layout.tsx:46, 77](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/app/[company]/(app)/layout.tsx); `loadLog` selects every event of the company with `actor` AND `actorUserId` — [N lib/db/events.ts:6-25](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/lib/db/events.ts)
- Visibility is browser-only: "Browser only for now: the events endpoint still sends every event to every viewer" — [N features/cases/visibility.ts:4](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/cases/visibility.ts). "Private" cases are therefore present in every browser's memory. VIS is "planned" — [P PILOT.md:20](file:///B:/06_CODE/06_Projects/Startup_speed/repos/plans/projects/nextup/hauptplaene/PILOT.md)
- **Real names of anonymous members sent to all browsers**: `hiddenPeople: tenant.users.filter((u) => Boolean(u.handle)).map((u) => u.name)` — [N layout.tsx:72](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/app/[company]/(app)/layout.tsx) — two lines below the comment "A real company's staff list … stay on the server: the browser gets the viewer only" (layout.tsx:60-63).
- Handles: "Anonymous #" + 4 digits, members only, persistent per user — [N features/auth/handle.ts:4-26](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/auth/handle.ts); now given to added/converted members — [N server/actions/members.ts:109-111, 143](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/server/actions/members.ts) and in `lib/db/accounts.ts:50`; IDN-C1 merged as #301. G-046 looks fixed for new users (I did not verify the backfill of existing users).
- A persistent handle is a pseudonym, not anonymity: all of a member's cases link together, and the case payload carries `fromDept` and the raiser's line — [N features/evaluate/index.ts:90, 103](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/evaluate/index.ts)
- Drafts are scoped by owner: `getDraft(viewer.companyId, viewer.userId, draftId)` — [N turn/route.ts:90](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/app/api/[company]/ideas/turn/route.ts)
- Admin actions logged to console only: `console.info("[admin] signed in with the shared admin code …")` — [N server/actions/admin.ts:117, 123](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/server/actions/admin.ts); Jira settings/sync/webhook secret/removal — [N server/actions/jira-admin.ts:78, 90, 120, 141](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/server/actions/jira-admin.ts); M365 on/off and "disconnected everyone" — [N server/actions/m365.ts:38, 46](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/server/actions/m365.ts)
- Shared `ADMIN_ACCESS_CODE`, no 2FA (G-047, G-222; ADM/SEC planned) — [N gaps/product.md G-047](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/audit/gaps/product.md)
- No export, no person deletion/pseudonymisation, no event retention (G-042/G-043/G-044 → GDP, stage "idea") — [N gaps/product.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/audit/gaps/product.md); landing privacy page: "Sämtliche Daten eines Unternehmens können jederzeit exportiert und auf Wunsch gelöscht werden" — [L privacy/page.tsx:137-138](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-landing/src/app/(marketing)/privacy/page.tsx); pricing: "export of everything at any time" — [L pricing/page.tsx:47](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-landing/src/app/(marketing)/pricing/page.tsx)
- No DPA template, TOMs, RoPA, DPIA or works-agreement template (G-227 to G-231, phase SEC) — [N gaps/platform.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/audit/gaps/platform.md); landing promises a written works-council description — [L page.tsx:84](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-landing/src/app/(marketing)/page.tsx)

### Inferences
- An IT reviewer with browser dev tools can see private cases, all actor user ids and the list of anonymous members' real names. That breaks "anonymous raising" in a team of 8 even without a direct id→name map.
- To make it real and hard to copy: VIS (server-side projections per role) is the precondition; then GDP (audit log of admin actions, export, pseudonymisation on leave, retention); then a read-only "works council / DPO" role that sees exactly the aggregate the agreement allows. A pre-written, lawyer-checked BetrVG §87 works agreement + DPIA that matches the code would be the real moat — few US tools offer it.

### Gaps
- I did not check whether `seed.seats` sent to the browser contains userId→name pairs for leaders (likely, since leaders are named by design).

---

## Claim 6 — "One stack per company, hosted or on-prem"

### Takeaway
The stack tooling is real and recently hardened (OPS archived 2 Nov): one compose stack per company, pinned digests, off-box restic option, pre-migrate backups, remote deploy over an SSH forced command, a clean-host install rehearsal. But it has only been rehearsed on a container/test host, never at a customer; the brain for demo stacks is a single shared server; the gap register's dedicated-VM/IaC/hardening items are outside this repo.

### Cited Findings
- On-prem path: `stack/install.sh --slug … --origin … --stage real --images <sha>`; own Caddy with Let's Encrypt; own certificate = edit Caddyfile by hand — [N stack/README.md:130-142](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/stack/README.md)
- Install rehearsal script runs "on a CLEAN machine … a clean VM, or the container host of stack/tests" — [N stack/tests/install-clean.sh:1-20](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/stack/tests/install-clean.sh); OPS acceptance "on a clean host" (#298) and clean container host (#259) — [N git log origin/main](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup)
- All images pinned by digest (postgres, caddy, mailpit, n8n, ollama), app/migrate/brain by env var — [N stack/compose.yml:34-219](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/stack/compose.yml) → G-210 closed.
- Off-box backups: `RESTIC_REPOSITORY` sftp:/s3:/rest:, `BACKUP_OFFBOX=required` refuses local repos, `RTO_SECONDS` default 3600 for restore-test — [N stack/backup.sh:14-26, 59-61](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/stack/backup.sh) → G-212/G-213 closed **as an option**; off-box is not the default.
- Shared brain: "One brain, several stacks … All stacks that use it share one key, so this is for demo stacks. A real company gets a brain of its own" — [N stack/brain-server/README.md:12-15](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/stack/brain-server/README.md); 8 vCPU / 16 GB CPU, ~10 users (G-235). Turn route comment "It runs inside the stack, so no DPA gate" — [N turn/route.ts:13-15](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/app/api/[company]/ideas/turn/route.ts) — is false for any stack pointed at the shared server via `stack/nginx/set-brain.sh`.
- Still open per register (not re-verifiable in this repo): no dedicated-VM IaC (G-202), hardening script not applied (G-221), standing team access to customer secrets via admin vault (G-223), no disk encryption/key rotation (G-224), no load test / users-per-stack figure (G-238/G-239), no pentest (G-226) — [N gaps/platform.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/audit/gaps/platform.md)

### Inferences
- "On-prem ready" is credible as "scripted and rehearsed in a lab"; it is not proven at a customer, not load-tested, and an on-prem brain on CPU will not serve 1,000-2,000 people.
- To make it real and hard to copy: one real dedicated-VM install with a named customer IT contact, a measured users-per-stack figure, an offline image bundle (G-205) and signed images/SBOM (G-204). The real moat is "AI that runs fully inside the customer's network with no US provider", which needs a sized GPU/CPU recipe per company size.

### Gaps
- I did not open `stack/deploy-remote.sh` or `stack/remote/README.md` in detail; the OPS acceptance evidence files in P OPS/belege were not read.

---

## Claim 7 — "Analysis grounded in company data, sources shown"

### Takeaway
The analysis is grounded in NextUp's own tables (goals, routing map, open cases, org, problems, initiatives, outcomes), and the "sources" list is a set of counts of those tables, not citations of documents. M365 and Jira connectors exist but are off by default, and the "21 of 21 ground truth" was achieved on 21 synthetic Graph responses written to match the questions, plus a fake Jira.

### Cited Findings
- "Sources" = `{goals: n}`, `{routing: n}`, `{open cases: n}`, org/problem/initiative/outcome counts, own uploaded files — [N components/ideas/Raise.tsx:647-660](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/components/ideas/Raise.tsx)
- `company-read.ts`: lines "built here from that data … where a company has no such data yet, the line is left out rather than made up" — [N features/ideas/company-read.ts:1-6](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/ideas/company-read.ts) (honest, deterministic)
- Defaults off: `aiRouting false`, `notifications false` (both "stored but never read", G-011), `m365Search false` — [N apps/app/prisma/schema/integrations.prisma:9, 11, 44](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/prisma/schema/integrations.prisma); Jira row is "Switched on by an admin" — [N integrations.prisma:85-88](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/prisma/schema/integrations.prisma)
- Graph fixtures: "Made-up data"; D9 "21 of 21" checks the KnowledgeSource against the fixture responses; "The answer text and Microsoft's own permission trimming are checked live in TST" — [N apps/app/tests/fixtures/graph/README.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/tests/fixtures/graph/README.md). All 21 response files on main carry `"source": "synthetic"` (counted q01-q21), none `"recorded"`.
- Jira Cloud + Data Center sync accepted against `tests/fake-jira` (#272) — [N git log origin/main](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup)
- The Bedrock assistant (the only path that cites external documents) is off everywhere; no AWS account (G-236) — [N gaps/platform.md G-236](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/audit/gaps/platform.md)
- Landing FAQ: "Do you need access to our systems? No … There is no mailbox connection and no monitoring" — [L pricing/page.tsx:75](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-landing/src/app/(marketing)/pricing/page.tsx) — consistent with connectors off, but in tension with selling M365 grounding.

### Inferences
- "Grounded in company data" is true only for data a company typed into NextUp's structure tables; on a fresh real company these are empty (STR: "an empty company has no acme content", #296), so the analysis shows few or no lines.
- To make it real and hard to copy: run the 21 questions against a real M365 test tenant (recorded fixtures), and make one connector (Jira or M365) feed measured outcomes (claim 4) — connecting the routing/answer data to real work systems is harder to copy than a chat UI.

### Gaps
- No evidence of any test against a real Entra/M365 tenant or a real Jira site on main.

---

## Claim 8 — PILOT phase status on origin/main (read 2 Nov 2026, 12:52 commit, no fetch)

### Takeaway
IDN is 7 of 9 tasks merged (hand-over/shell/search on ids = S1 and the acceptance Z1 are missing). CLK has only its type/schema task merged. NTF and VIS have not started on main.

### Cited Findings
- PILOT stages: IDN active, CLK active, VIS planned, NTF planned, GDP idea — [P hauptplaene/PILOT.md:15-22](file:///B:/06_CODE/06_Projects/Startup_speed/repos/plans/projects/nextup/hauptplaene/PILOT.md)
- IDN merged on main: G1 #300, C1 #301, D1 #302, M1 #303, B1 #304, A1 #305, P1 #307; not on main: S1 ("Hand-over by seat, shell, profile and search on ids") and Z1 (acceptance `tests/e2e/db/identity.spec.ts` absent from `git ls-tree origin/main`) — [N git log origin/main --oneline -60](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup); task titles [P IDN/tasks](file:///B:/06_CODE/06_Projects/Startup_speed/repos/plans/projects/nextup/IDN/tasks)
- CLK merged: only G1 #309 ("Calendar table, clock types, Seed.clock and the clock.due event type"); A1 (working-day calendar), B1, C1 (escalation from stored due facts), D1 (scheduler with lease), Z1 not merged. `features/clock/index.ts` says "no date arithmetic yet (CLK-A1)" — [N features/clock/index.ts:1-2](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/clock/index.ts); [P CLK/tasks](file:///B:/06_CODE/06_Projects/Startup_speed/repos/plans/projects/nextup/CLK/tasks)
- NTF: plan approved 2 Nov (L0-L2 "freigegeben"), first wave waits on CLK-Z1 and AIP-Z1; no outbox code on main (only `docs/adr/0004-webhook-and-outbox.md`) — [P NTF/log.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/plans/projects/nextup/NTF/log.md)

### Inferences
- With AIP still "planned" and NTF depending on it, reminders/escalation mails are at least two phases away; the 5-day promise on real data is at least CLK (5 tasks) away.

### Gaps
- Merges after `be913f4` (if any happened later on 2 Nov) are not visible without a fetch, which was not allowed.

---

## Embarrassing for a works council, DPO or IT reviewer (contradicting the landing page)

### Takeaway
Seven items would surface in a first technical review and each contradicts a published sentence.

### Cited Findings
1. **Person ranking** "Most relied-on contributors" + `/people/[name]` vs. "It measures cases. Never people." / "keine personenbezogenen Leistungskennzahlen" — [N features/metrics/index.ts:79-100](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/features/metrics/index.ts); [L page.tsx:82](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-landing/src/app/(marketing)/page.tsx); [L privacy/page.tsx:134-136](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-landing/src/app/(marketing)/privacy/page.tsx)
2. **Whole case log incl. `actorUserId` and private cases in every browser**, plus real names of all handle-holders (`hiddenPeople`) vs. "safe to raise things anonymously" — [N layout.tsx:46, 72](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/app/[company]/(app)/layout.tsx); [N lib/db/events.ts:6-25](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/lib/db/events.ts); [L page.tsx:43](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-landing/src/app/(marketing)/page.tsx)
3. **No export, no deletion of a person** vs. "Sämtliche Daten … jederzeit exportiert und auf Wunsch gelöscht" / "export of everything at any time" — G-042/G-043; [L privacy/page.tsx:137-138](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-landing/src/app/(marketing)/privacy/page.tsx); [L pricing/page.tsx:47](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-landing/src/app/(marketing)/pricing/page.tsx)
4. **Admin actions only in console logs; shared admin code without 2FA** — [N server/actions/admin.ts:123](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/server/actions/admin.ts); [N server/actions/jira-admin.ts:78-141](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/server/actions/jira-admin.ts)
5. **5-day promise and deputy hand-over never fire on a real company** vs. "moves to the deputy by itself" — [N server/actions/events.ts:90, 146](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/server/actions/events.ts); [L page.tsx:37](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-landing/src/app/(marketing)/page.tsx)
6. **Routing table editor sold but read-only**; manager dashboard widgets on preview data — G-012; [L pricing/page.tsx:46](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-landing/src/app/(marketing)/pricing/page.tsx); [N DashboardBoard.tsx:6-8](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/components/dashboard/shared/DashboardBoard.tsx)
7. **"No DPA gate" for the brain because it "runs inside the stack"**, while demo stacks share one brain server and key (G-036) — [N turn/route.ts:13-15](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/src/app/api/[company]/ideas/turn/route.ts); [N stack/brain-server/README.md:12-15](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/stack/brain-server/README.md). Also: no DPA/TOMs/DPIA/works-agreement templates although the privacy page says a DPA is signed before each pilot (G-227 to G-231).

### Inferences
- Items 1, 2 (`hiddenPeople`), 4 and the brain-gate comment are small code changes (hours to days) with a large trust payoff; items 2 (full VIS), 3 and 5 are the planned VIS/GDP/CLK phases. Until then, the landing copy should be softened (e.g. "planned for the pilot" next to export/deletion and the deputy rule), or a reviewer will treat every other claim as suspect.

### Gaps
- Landing repo origin/main is from 11 Oct 2026; if a newer landing exists on another branch it was not checked.
- I did not check the nextup-admin repo (platform admin audit page G-242) beyond the register.
