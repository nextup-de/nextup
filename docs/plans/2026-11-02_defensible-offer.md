# Analysis: fix the truth, then build the proof

> **Plan · 2026-11-02 · open: Kevin and the team decide which claims to withdraw and whether the phases below follow PILOT.**
> Repo copy of the report "NextUp defensible offer plan" (2 Nov 2026), with links into this repo. The evidence was read
> on `main` at `be913f4`; every code contradiction below was re-checked on `1cfe2b5` (#317), and the table
> [Status on main](#status-on-main-1cfe2b5) marks what has been fixed since. The tasks that follow from it, written to
> run with OpenAI Codex: [2026-11-02_defensible-offer-codex.md](2026-11-02_defensible-offer-codex.md). The pages it
> adds or changes, for Sam: [2026-11-02_pilot-pages/11-defensible-offer-pages.md](2026-11-02_pilot-pages/11-defensible-offer-pages.md).

Sources that are not in this repo are named, not linked: the research notes `claims_vs_code.md` (code evidence, file
and line at `be913f4`), `competitor_counterchecks.md`, `investability_moats.md` and `codex_plan_format.md` sit in Kevin's
`Startup_speed/research_notes/NextUp defensible offer plan/`; the landing page is the separate repo `nextup-landing`
(`origin/main` `6ea338d`, 11 Oct 2026); the orch plans are the private repo `selluxhenner/plans`, of which
[build-plans/](2026-11-02_pilot-pages/build-plans/README.md) holds a copy.

## Summary

NextUp's Harvey-ball feature analysis is **mostly an illusion today and only half real after PILOT**. Checked against
the code, the "today" column overstates NextUp on all ten rows. The three headline mechanisms did not run for a real
company at `be913f4`: the 5-day clock was frozen at day 0, so the deputy never took over and the +30/+90 measurement
checks never opened; the "never model output" score takes +20 points from an LLM routing pick and offers model-written
text only when it raises the score; the "works-council-ready" read path sends every browser the full event log,
private cases and the real names of the anonymous members. Since then CLK has given real companies working-day numbers
(#313, #314, #316), but the scheduler that writes the due facts (CLK-D1) and the acceptance (CLK-Z1) are not merged, so
no real case escalates yet; the other two contradictions are unchanged on `1cfe2b5`.

Rated on code evidence, NextUp's unweighted total falls from **24 to 13 today** and from **34 to 23 after the whole
PILOT plan**. That puts it level with Qmarkets and below HYPE (about 30), rready (about 29) and target (about 24) once
their own ratings are corrected, and those corrections mostly go up: deadlines and escalation exist at Ideanote, target
and HYPE, and the classic German BVW already pays premiums on realised first-year savings. After PILOT, NextUp still
lacks the expected BVW plumbing: a Gutachter and committee step, premium calculation with payroll export, ZI KPIs,
translation of idea content, ISO 27001 and a written SLA. It also has no customer, no signed works agreement and no
measured outcome.

What can still set NextUp apart is narrow and real. It can show the submitter an answer date and hand the case to the
deputy automatically. It can keep model output out of the score entirely, with every point citing a fact. It can make
"no person ranking" a design rule, sell the works-council and AI-Act pack as a product, and build a cross-customer
outcome dataset. None of these is worth anything until it is true in code, signed at one named customer and measured
there. Investors will price NextUp as a system of record for improvement decisions only after a paid PoC, an LOI and
one reference with measured results. Idea management alone is a PE-consolidated niche of roughly €30M at its leader.

## Status on main (1cfe2b5)

What changed between the evidence (`be913f4`) and this copy (`1cfe2b5`), per contradiction. "Open" means the code
still does what the report says.

| # | Contradiction | Status on `1cfe2b5` | Where it gets fixed |
|---|---|---|---|
| 1 | Person ranking `contributors()` and "Most relied-on contributors" | **Open** ([metrics/index.ts](../../apps/app/src/features/metrics/index.ts) `contributors`, [ProgressView.tsx](../../apps/app/src/components/dashboard/shared/ProgressView.tsx)) | TRUTH-A1 |
| 1b | Per-person page `/people/[name]` | **Open** ([people/[name]/page.tsx](<../../apps/app/src/app/[company]/(app)/people/[name]/page.tsx>)) | TRUTH-B1 (MET later rebuilds a role-centric `/people/[userId]`) |
| 2 | `hiddenPeople` sends the real names of every handle-holder | **Open** ([layout.tsx](<../../apps/app/src/app/[company]/(app)/layout.tsx>), the line under the comment that promises the opposite) | TRUTH-B1 |
| 3 | LLM route adds +20 to the case score | **Open** ([scoring/index.ts](../../apps/app/src/features/scoring/index.ts) "Fits a decision type on the map"). AIP-C1 (running) moves the proposal to the server, which does not remove the points. | TRUTH-D1 after AIP-C1 |
| 4 | Suggested answers offered only when they raise the score | **Open** ([replies.ts](../../apps/app/src/features/ideas/replies.ts), [brain-coach.ts](../../apps/app/src/features/ideas/brain-coach.ts) `gain <= 0`) | TRUTH-E1 |
| 5 | Demo-only clock | **Partly fixed**: working-day calendar (#313), stored due facts and `dueNow` (#314), real companies' events on working-day numbers with backfill (#316). Scheduler CLK-D1 built, not merged; CLK-Z1 open. The chosen design still flags the deputy while the owner keeps the case. | CLK-D1, CLK-Z1; hand-over delta CORE-H1 |
| 6 | Full event log with `actorUserId` and private cases in every browser | **Open** ([lib/db/events.ts](../../apps/app/src/lib/db/events.ts) `loadLog` selects `actorUserId`; [visibility.ts](../../apps/app/src/features/cases/visibility.ts) "Browser only for now") | TRUTH-C1 stopgap, then VIS-C1 |
| 7 | Admin actions on the console only; shared admin code | **Open** (`console.info` in [admin.ts](../../apps/app/src/server/actions/admin.ts), [jira-admin.ts](../../apps/app/src/server/actions/jira-admin.ts), [m365.ts](../../apps/app/src/server/actions/m365.ts)); personal admins with a second factor are ADM-E1 (ready) | TRUTH-F1, TRUTH-F2, ADM-E1 |
| 8 | No export, no deletion or pseudonymisation | **Open** (no `features/privacy/`) | CORE-X1, CORE-P1 (GDP pulled forward) |
| 8b | Turn route comment "runs inside the stack, so no DPA gate" | **Fixed** in #320 (AIP-B1): the brain is asked only through the gate | - |
| 9 | Reward due on any verdict | **Open** ([projects/reduce.ts](../../apps/app/src/features/projects/reduce.ts) `rewardDue`) | TRUTH-G1 |
| 10 | English-only score patterns; "never model output" in code and docs | **Open** ([benchmarks.ts](../../apps/app/src/features/ideas/benchmarks.ts), [IDEAS.md](../IDEAS.md)). The routing eval is now a third German (#321), the score patterns are not. | TRUTH-H1 |
| - | AI provider per company, adapters, gate | **New since**: #315, #318, #320, #321. Bedrock still has no AWS account (G-236). | AIP |
| - | Identity by id | **Done**: IDN-S1 #310, IDN-Z1 #312 | - |
| - | Settings frame | **Done**: ADM-G1 #317 | - |

## The feature table rated plans as products and vendor pages as running code

The earlier image compared NextUp with six rivals on ten features, using 0 (none) to 4 (full). NextUp's balls were
filled for "built today" and transparent for "being built in PILOT". The image has two structural flaws. First,
NextUp's "solid" balls counted merged code, even where that code runs only on demo companies or behind flags that are
off for real ones. Second, competitor balls rested on vendor marketing pages, read pessimistically wherever a page was
silent. The research behind the corrections used opposite standards: the code check treated NextUp claims as true only
if they hold "for a real, non-demo company" (`claims_vs_code.md`, method), and the competitor check deliberately looked
for evidence that each rival **does** have each capability (`competitor_counterchecks.md`). Applying one standard to
everyone narrows the gap from both sides.

### Corrected NextUp ratings (0-4)

Line references are at `be913f4`; the files are linked as they are on `main`.

| Feature | Old (today / after PILOT) | Corrected (today / after PILOT) | Code evidence behind the correction |
|---|---|---|---|
| Guided idea capture | 4 / 4 | **3 / 3** | The one-question coach is real and enforced by a single `question` field ([brain-coach.ts](../../apps/app/src/features/ideas/brain-coach.ts)). "Routing done for you" is a browser-side keyword or LLM pick, and the server accepts the client's `routeId` ([evaluate/index.ts](../../apps/app/src/features/evaluate/index.ts) `evaluate`; [stamp.ts](../../apps/app/src/features/cases/stamp.ts)). The routing table is read-only seed data (G-012). A 4 needs server-side routing (AIP-C1), an editable routing table (ADM-B1) and German patterns. |
| Shop-floor & mobile reach | 1 / 3 | **1 / 2** | Today email and web are the only channels. PILOT adds Teams, QR and a PWA, but no native app and no translation of idea content, which multi-plant groups (CZ/HU/PL) need. rready and Ideanote stay ahead. |
| Decision owner & deadline | 3 / 4 | **1 / 3** | The owner seat is stamped for real. At `be913f4` every event carried `day = Company.demoDay`, so a real case stayed at day 0. CLK has since merged A1, B1, C1 and G1; the scheduler (D1) and the acceptance (Z1) are still open ([clock/](../../apps/app/src/features/clock/)). Even after CLK, the chosen design flags the deputy while "the owner keeps the case" ([CLK plan](2026-11-02_pilot-pages/build-plans/CLK/PLAN.md), Risks), which is weaker than the landing page's "moves to the deputy by itself". |
| Explainable scoring | 4 / 4 | **2 / 3** | The four bars are regex arithmetic, and each point names its fact ([benchmarks.ts](../../apps/app/src/features/ideas/benchmarks.ts)). Three things contradict "never model output". The LLM's route adds +20 to the case score ([scoring/index.ts](../../apps/app/src/features/scoring/index.ts)). Suggested answers, including the brain's, are offered only if they raise the score ([replies.ts](../../apps/app/src/features/ideas/replies.ts); [brain-coach.ts](../../apps/app/src/features/ideas/brain-coach.ts)). Demo dials are scripted numbers ([demo-script.ts](../../apps/app/src/features/ideas/demo-script.ts)). The regexes are English-only and can be gamed with "pilot", "every shift" and "20%". |
| AI assistance breadth | 2 / 3 | **1 / 2** | Bedrock is off on every stack because there is no AWS account (G-236); #318 added Azure OpenAI and OpenAI-compatible adapters, unused so far. The brain is one shared CPU server sized for about ten users ([brain-server README](../../stack/brain-server/README.md)). The M365 "21 of 21" result came from synthetic fixtures ([graph fixtures README](../../apps/app/tests/fixtures/graph/README.md)). Similarity uses shared words, and PILOT plans no content translation. |
| Impact measured after go-live | 3 / 4 | **1 / 2** | The verdict arithmetic is real ([verdict.ts](../../apps/app/src/features/projects/verdict.ts)). But `projects` is on for demo companies only ([flags.ts](../../apps/app/src/config/flags.ts)), and checks open on the day counter ([projects/permissions.ts](../../apps/app/src/features/projects/permissions.ts)). Even after CLK, the project lead, the person who benefits from a good verdict, types in both baseline and result, and nobody confirms them ([ProjectMeasure.tsx](../../apps/app/src/components/projects/ProjectMeasure.tsx)). |
| Reward & premium handling | 1 / 2 | **1 / 1** | A reward falls due on "measured" whether the verdict was better, the same or worse ([projects/reduce.ts](../../apps/app/src/features/projects/reduce.ts) `rewardDue`). The reward scheme is outside PILOT scope, with no premium formula and no payroll export, so the transparent half-ball after PILOT has no plan behind it. |
| Works-council readiness | 2 / 4 | **1 / 3** | The write side is real: server-checked permissions, owner-scoped drafts and handles. The read side contradicts the claim. Every browser loads the whole log including `actorUserId` and private cases ([layout.tsx](<../../apps/app/src/app/[company]/(app)/layout.tsx>); [lib/db/events.ts](../../apps/app/src/lib/db/events.ts)). `hiddenPeople` sends the real names of all handle-holders (layout.tsx). A person ranking is live ([metrics/index.ts](../../apps/app/src/features/metrics/index.ts)). There is no export or deletion, and admin actions go to the console only. GDP is still at stage "idea" ([PILOT](2026-11-02_pilot-pages/build-plans/PILOT.md)), so a 4 after PILOT assumed a phase that is not planned in detail. A 4 needs a signed annex. |
| Hosting & security proof | 2 / 3 | **1 / 2** | The stack scripts are real and hardened, but rehearsed only on a clean container host ([install-clean.sh](../../stack/tests/install-clean.sh)). Off-box backup is optional. The admin code is shared and has no 2FA (ADM-E1 is ready, not built). There is no pentest and no load figure. After PILOT the only "proof" is a VDA ISA self-assessment, with no ISO 27001 or TISAX. |
| Integrations | 2 / 3 | **1 / 2** | M365 and Jira are off by default and have only been tested against synthetic Graph data and a fake Jira ([integrations.prisma](../../apps/app/prisma/schema/integrations.prisma)). PILOT adds SCIM, SFX read-only and API v1, but no SAP payroll, and it plans no test against a real tenant. Rating it 3 needs one recorded real-tenant run. |
| **Unweighted total** | **24 / 34** | **13 / 23** | |

### Competitor ratings the image got wrong

Only the cells the counterchecks moved. All other competitor cells stand as drawn. Every rival cell rests on vendor
pages, so "not found" still means "not public", not "missing".

| Feature | Rival: old → corrected | Evidence |
|---|---|---|
| Decision owner & deadline | HYPE 2 → **3**; Ideanote 2 → **3**; target stays 4 | Ideanote sets phase deadlines ("seven days for initial review") and reminds overdue reviewers ([Ideanote](https://ideanote.io/feature/automatic-progression)). HYPE tracks deadlines and delayed ideas and lets decisions be escalated ([HYPE BVW](https://www.hypeinnovation.com/solutions/employee-suggestion-bvw)). target automates deadline checks and reminders and ships a deputy app ([TIMETOACT](https://www.timetoact-group.com/en/details/target-idea-management-on-premise)), with escalation management ([softguide](https://www.softguide.de/programm/target-idea-management-fuer-den-einsatz-mit-sap)). |
| Explainable scoring | HYPE 1 → **2**; rready 1 → **2**; target 2 → **3** | Human criteria scoring without AI is standard. target's Gutachter use configurable forms and benefit analyses, with no AI. HYPE says AI keeps "people in control of evaluation". rready claims "over 15 factors" ([rready BVW](https://rready.com/bvw)). The row as worded ("AI advises, people decide") was scored as if only automatic scoring counted. |
| Impact measured after go-live | target 2 → **3** (probable); Ideanote 1 → **2** | The classic BVW premium is a share of the realised first-year net saving: 20% at Vinnolit ([CHEManager](https://chemanager-online.com/de/news/vinnolit-ideenmanagement-erhoeht-unternehmenserfolg)) and 10% in the first year at a clinic ([klilu PDF](https://www.klilu.de/static/ifp/Dokumente_Programm/BVW.pdf)). Ideanote advertises numeric ROI impact tracking ([Ideanote](https://ideanote.io/feature)). |
| Reward & premium handling | HYPE 3 confirmed; claim "only NextUp rewards on measured impact" withdrawn | HYPE compensates KVP contributors "for the savings they deliver" and tracks expected and realized impact ([HYPE CI](https://www.hypeinnovation.com/solutions/cost-reduction-continuous-improvement)). |
| Works-council readiness | HYPE 2 → **3** | HYPE's approval paths, criteria, rewards and reporting can follow the works council agreement ([HYPE BVW](https://www.hypeinnovation.com/solutions/employee-suggestion-bvw)). rready already runs a works-agreement assistant at BMW ([rready BMW](https://rready.com/case-studies/bmw-ideamanagement)). |
| Hosting & security proof | Ideanote 2 → **2-3** (unverified) | On-prem and self-hosting exist at Qmarkets, HYPE, rready, target and Ideanote, and ITONICS offers on-prem in Enterprise only ([Qmarkets security](https://qmarkets.net/products/security/); [Ideanote pricing](https://www.ideanote.io/pricing)). "None offers on-prem" is false. |

With these corrections, the rough unweighted totals are **HYPE 30, rready 29, target 24, Qmarkets 23,
NextUp-after-PILOT 23, Ideanote 21, ITONICS 19**. Treat these sums as directional only, since equal weights are
arbitrary. The sharper finding is row by row: **after PILOT, NextUp leads on no row by more than one ball**. Its
claimed leads in deadline, scoring, impact and works council each rest on commitments that either fire only in demos
today or that rivals already offer as configuration.

## Claims to withdraw and contradictions to fix this week

Each published sentence that the code contradicts will surface in the first IT, DPO or works-council review and taint
every other claim. The landing page (`nextup-landing`, a separate repo; TRUTH-L in the Codex plan is its checklist)
and the deck should stop saying the following now:

- "Miss the 5-day promise and it moves to the deputy by itself" (landing `src/app/(marketing)/page.tsx:37`). Say
  instead: "planned for the pilot: a visible answer date, with the deputy flagged on breach".
- "It measures cases. Never people." and "keine personenbezogenen Leistungskennzahlen", while the ranking exists
  (landing `page.tsx:81-84`, `privacy/page.tsx:134-136`).
- "Export of everything at any time" and "jederzeit exportiert und auf Wunsch gelöscht" (landing
  `pricing/page.tsx:47`, `privacy/page.tsx:137-138`).
- "Routing table editor" on the pricing page (`pricing/page.tsx:46`), and "the routing is done for you".
- "Chatting cannot talk the score up" and "never model output", which also appear in
  [benchmarks.ts](../../apps/app/src/features/ideas/benchmarks.ts) and [IDEAS.md](../IDEAS.md). Replace with
  "deterministic and traceable".
- "Safe to raise things anonymously" (`page.tsx:43`). Handles are persistent pseudonyms.
- A written works-council description and a DPA signed before each pilot, while no DPA, TOMs, DPIA or works-agreement
  template exists (G-227 to G-231).

In the deck, drop four competitive claims: "rivals have no deadlines", "none ties reward to measured impact", "none
is works-council-ready" and "none offers on-prem". Each is refuted on public pages, and a German BVW lead will know it
(`competitor_counterchecks.md`, summary table).

The code contradictions to fix immediately are small, and the trust they buy is large (estimates in hours to days;
task ids from the [Codex plan](2026-11-02_defensible-offer-codex.md)):

1. **Delete the person ranking**: `contributors()` and the "Most relied-on contributors" view, plus the
   `/people/[name]` route ([metrics/index.ts](../../apps/app/src/features/metrics/index.ts)). This is G-045, rated
   high. *Estimate: under a day.* TRUTH-A1, TRUTH-B1.
2. **Stop the `hiddenPeople` leak** in [layout.tsx](<../../apps/app/src/app/[company]/(app)/layout.tsx>). Two lines
   above it, a comment promises the opposite. *Estimate: hours.* TRUTH-B1.
3. **Remove the LLM route's influence on the case score**. Either compute the route on the server and let a human
   confirm it, or show "route proposed by AI" as a separate fact that adds no points
   ([scoring/index.ts](../../apps/app/src/features/scoring/index.ts)). *Estimate: 1-2 days.* TRUTH-D1 after AIP-C1.
4. **Stop suggested answers from raising the score silently**. Record whether a suggestion was accepted verbatim and
   show on the case "3 of 5 facts came from suggestions", or stop ranking suggestions by score gain
   ([replies.ts](../../apps/app/src/features/ideas/replies.ts)). *Estimate: 1-2 days.* TRUTH-E1.
5. **Replace the demo-only clock** with working-day stamping and stored escalation, which is CLK. *Partly done
   (#313, #314, #316); the scheduler CLK-D1 and CLK-Z1 remain.*
6. **Stop sending the full event log to the browser**. A stopgap is to strip `actorUserId` and drop private cases from
   the payload before full VIS projections ([lib/db/events.ts](../../apps/app/src/lib/db/events.ts)). *Estimate: the
   stopgap takes days, full VIS one phase.* TRUTH-C1, then VIS-C1.
7. **Audit admin actions** in a table instead of `console.info`, and replace the shared `ADMIN_ACCESS_CODE` with
   personal admin accounts plus 2FA ([admin.ts](../../apps/app/src/server/actions/admin.ts);
   [jira-admin.ts](../../apps/app/src/server/actions/jira-admin.ts); [m365.ts](../../apps/app/src/server/actions/m365.ts)).
   *Estimate: 2-3 days for the audit table.* TRUTH-F1, TRUTH-F2; personal admins with 2FA are ADM-E1.
8. **Ship company export and person deletion/pseudonymisation** (G-042/G-043), or remove the promise. *Estimate: one
   GDP phase.* CORE-X1, CORE-P1. The "no DPA gate" comment in the turn route is already fixed (#320).

Two smaller fixes belong in the same batch. A reward should fall due only on a "better" verdict, or the copy should
say "after measurement" (TRUTH-G1). German alternations should go into the benchmark regexes now that the UI is
bilingual (TRUTH-H1).

## After PILOT, the expected offer still fails a German BVW tender

Kotler's levels explain the order in which a buyer judges. The expected layer is checked first, and NextUp's
differentiators count only after it passes. The finished PILOT plan still leaves six expected-offer gaps. Tenders ask
for a committee decision on the **Gutachter's** assessment and for calculation of the premium via the software
([softguide tender ~800](https://www.softguide.de/ausschreibungen/industrieunternehmen-sucht-software-fuer-das-ideenmanagement-ca-800)).
A consumer-goods tender adds reminder mails, DE/EN/FR and premium handling
([softguide 18/1239](https://www.softguide.de/ausschreibungen/renommiertes-produktions-und-handelsunternehmen-sucht-ideenmanagement)).
target sets the SAP benchmark: rewards go straight to payroll, with more than 50 preconfigured KPIs
([TIMETOACT](https://www.timetoact-group.com/en/details/target-idea-management-on-premise)). NextUp after PILOT has no
reviewer role, assessment form or committee step. It has no premium formula, premium letter or payroll export. Its
KPIs are answer times only, with no participation rate, ideas per 100 employees, implementation rate, savings or
premiums. It translates the interface but not idea content. It has a VDA ISA self-assessment but no **ISO 27001**,
which ITONICS has held since 2017 ([ITONICS Trust](https://www.itonics-innovation.com/trust)). And it has a support
runbook but no **written SLA**. None of these is large in code. Together they decide whether NextUp gets past the
first round.

The trust gaps run deeper, because they cannot be closed by building. After PILOT, NextUp still has no legal entity,
no signed DPA, no pentest, no load test or users-per-stack figure, no real-tenant M365 or Jira run, and no customer
installation. Its brain is sized for ten users (`claims_vs_code.md`, claim 6). Measured impact remains a number typed
by the person who benefits from it. The score remains a keyword formula that the product itself teaches people to
game. GDP, which carries export, deletion, retention and the admin audit, is still at stage "idea" in
[PILOT](2026-11-02_pilot-pages/build-plans/PILOT.md). Kevin writes about 84% of the commits, so the bus factor is
about one. The legal context makes these gaps decisive rather than cosmetic. Works councils co-determine the
principles of the BVW ([WEKA](https://www.weka.de/betriebsrat-personalrat/ideenmanagement-so-bestimmt-der-betriebsrat-mit/)),
and any software merely *able* to monitor performance triggers § 87(1) Nr. 6 BetrVG
([Luther](https://www.luther-lawfirm.com/en/newsroom/blog/detail/dauerbrenner-software-vs-mitbestimmung-87-abs-1-nr-6-betrvg)).
A browser holding every actor id is exactly that capability.

## Five differentiators survive scrutiny, and none is a moat yet

Strip out what rivals already have, and five claims remain that no competitor publishes.

1. **An answer date shown to the submitter, with automatic hand-over to a deputy on breach.** The machinery exists
   everywhere, but no vendor states the promise or transfers ownership.
2. **A score that contains no model output at all, where every point cites the sentence it came from.** Human
   scorecards are standard, but a deterministic automatic pre-score with cited facts is not. The sharpest contrast is
   rready's "AI automates evaluation, routing, and reward allocation" ([rready BVW](https://rready.com/bvw)) and
   HYPE's AI savings estimates that feed reward calculations
   ([HYPE BVW](https://www.hypeinnovation.com/solutions/employee-suggestion-bvw)). Both put AI into money decisions
   that the works council co-determines.
3. **No person ranking, by design.** Ideanote ranks top ideators and teams, and nobody publishes a no-ranking rule.
4. **A works-council and AI-Act pack sold as a product**: model works-agreement annex, DPIA, Art. 26(7) information
   templates, per-decision explanation export and a read-only works-council/DPO role. No vendor publishes a model
   agreement, and the deployer must inform worker representatives before using a high-risk system at work
   ([AI Act Art. 26](https://artificialintelligenceact.eu/article/26/)).
5. **An outcome dataset across customers**: answer times per decision type, share answered on time, and verified
   before/after results, which become benchmarks at about three to five customers.

None of these is hard to imitate on its own. Incumbents can configure the first three in one or two releases, and
the counterchecks rate the answer promise "a positioning lead, not a technical moat". What makes them defensible is
what accumulates behind them:

- **Routing accuracy**: log the proposed and final route for every case (AIP-C1's override rate), so each company's
  routing map improves.
- **Score calibration**: fit the weights to decisions taken and to +90-day verdicts, so the moat is the calibration,
  not the regex (PROOF-E1).
- **The answer-time ledger**: competitors can copy a timer but cannot copy a year of a customer's measured answer
  times.
- **A signed works-agreement annex** at a named account, which a rival would have to renegotiate.

HYPE has a strategic brake here: its relaunch promises AI that will "project the business outcomes of innovations"
([HYPE relaunch](https://www.hypeinnovation.com/news/hype-innovation-announces-strategic-relaunch)), so copying "AI
never scores" would contradict its own pitch. The real long-term threat is not a startup (none was found in the
AI-native BVW space). It is DIY: a Copilot or Power Apps intake, or a Joule Studio agent next to target inside SAP
([Microsoft Idea Coach](https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/agent-builder-template-idea-coach)).
NextUp's answer to DIY is the accountability contract and works-council defaults, which internal builds lack.

## Investors need a category bigger than idea management

Idea management alone does not support a venture outcome. HYPE and Planbox merged under the buy-and-build investor
Main Capital with a targeted combined turnover of **almost €30M**, as one of the world's largest players
([Main Capital](https://main.nl/?p=9896)). That is a PE roll-up market. Investors in 2025-2026 also discount thin
wrappers and want a wedge into a system of record or a "system of action" that competes for labor budgets
([Bessemer](https://www.bvp.com/atlas/roadmap-ai-systems-of-action)). Bessemer also warns that AI cuts integration
cost by up to 90%, so integrations are necessary for adoption but weak as a moat.

NextUp should therefore present itself to investors as **the system of record for improvement decisions in
operations**: who decided, by when, on what evidence, with what measured result, in a form the works council has
signed. It replaces CI-team and committee hours, not just HYPE licences. Idea capture stays the wedge and the
buyer-facing name. Two exit analogues fit this framing: Peakon was sold to Workday for about **$700M** for its
continuous employee-voice data
([VentureBeat](https://venturebeat.com/business/workday-acquires-peakon-for-700-million-to-capture-real-time-employee-sentiment-data/)),
and Tulip's **$120M Series D at $1.3B** was led by the strategic Mitsubishi Electric
([BuiltIn Boston](https://www.builtinboston.com/articles/tulip-raises-120m-series-d-1b-valuation-20260116)). The
strategic exit buyers would be SAP, Siemens, PTC or QMS vendors. Main/HYPE is the floor, not the target (inference).

The round benchmarks set a realistic bar. The European pre-seed median pre-money was **€2.4M** in Q1 2025
([PitchBook](https://files.pitchbook.com/website/files/pdf/Q1_2025_European_VC_Valuations_Report_19303.pdf)) and
**$3.48M** in Q1 2026 ([Equidam](https://www.equidam.com/startup-valuation-delta-q1-2026/)). The seed median was about
**€5.6M** ([waveup/PitchBook](https://waveup.com/blog/seed-round-benchmarks/)). Competitive European AI seeds run
**€2-4M** ([unicorn-nest](https://unicorn-nest.com/media/analytics/ai-genai-seed-metrics-2026/)). Some investors now
ask for **£500k+ ARR** at seed ([Kings eLab](https://www.kingselab.org/blog/philip-clements)), and the AI-era Series A
bar is **$2-3M ARR** ([waveup](https://waveup.com/blog/series-a-benchmarks/)). A pre-revenue student team should
therefore target a pre-seed of about €0.5-1.5M at €3-6M pre-money (estimate), and raise it only after three
milestones:

1. a **paid PoC** (€20-60k, estimate) with a named Tier-1 supplier or OEM plant; a mid-size supplier is more realistic
   than BMW, which already runs rready;
2. an **LOI** with a written path to a frame contract;
3. **one reference with measured outcomes**: a baseline before go-live, at least 70% of cases answered within 5 days,
   a works-council sign-off and a written case study.

One such signal outweighs many free pilots.

Non-dilutive money can carry the team to those milestones. The **EXIST Gründungsstipendium** pays €1,000 a month to
students and €2,500 to graduates, for up to 3 people over 12 months, plus up to €30k in material costs and €5k in
coaching; its 2026 rates and CODE's eligibility still need checking
([Förderdatenbank](https://www.foerderdatenbank.de/FDB/Content/DE/Foerderprogramm/Bund/BMWi/exist-gruendungsstipendium.html)).
The **Berliner Startup Stipendium** pays €2,000 per person per month for up to 18 months, and a new round opened in
March 2026 ([berlin.de](https://www.berlin.de/sen/wirtschaft/gruenden-und-foerdern/gruendungs-und-startup-foerderung/finanzielle-foerderung/zuschuesse/)).
Whether EXIST and BSS can be combined is unverified. **IBB Pro FIT Frühphase** funds up to €500k, of which up to
€200k in phase 1, once a GmbH exists
([Förderdatenbank Pro FIT](https://www.foerderdatenbank.de/FDB/Content/DE/Foerderprogramm/Land/Berlin/pro-fit-fruehphasenfinanzierung.html)).
**Innosuisse** coaching (CHF 10k Initial, up to CHF 50k Core) applies only with a Swiss entity
([Innosuisse](https://www.innosuisse.admin.ch/en/initial-coaching-for-start-up)) and is mainly a credibility play.

## The proposition: offer by level and the build-and-business phases

If the plan below is executed, NextUp's offer reads as follows.

- **Expected offer**, closed in minimal, export-based form rather than by rebuilding an SAP suite: web, Teams and QR
  capture with SSO and SCIM; a coach, similar ideas and a decision brief; a Gutachter-and-committee step on the clock;
  a works-agreement-configurable premium formula with a premium letter and a CSV export for SAP HCM, SuccessFactors or
  DATEV; ZI KPIs by org unit with a minimum group size of 5; translation of idea content with the original kept;
  export, deletion and an audited admin; ISO 27001 in progress; and a written support SLA.
- **Augmented offer**, commitments that are true in code and visible to each veto holder: the submitter sees an answer
  date, and the deputy takes over automatically; the score contains no model output and shows which facts came from
  suggestions; measured results come from a system or a second person's confirmation, not from the beneficiary; no
  person ranking exists anywhere; one stack per company runs with AI "off" as a supported setting.
- **Potential offer**, built on the decision-and-outcome record: the works-council/AI-Act pack as a separately priced
  product, cross-customer answer-time and outcome benchmarks, agents that draft the 8D, A3 or Jira epic after a yes,
  an ArbnErfG invention-disclosure branch, and supplier guest access for OEM cost-down programs.

The phases are ordered so that truth comes before features and proof before fundraising. Build phases follow the orch
format: one task per PR, exact `owns`, proofs fixed before the build. Business tracks run alongside. All durations
are **estimates**. Each build phase is detailed, task by task, in the
[Codex plan](2026-11-02_defensible-offer-codex.md).

| # | Phase | Goal | Order and estimate |
|---|---|---|---|
| 0 | **TRUTH** (claims and contradictions) | Withdraw the claims listed above. Fix the ranking, `hiddenPeople`, the LLM route in the score, suggestion provenance, and the stopgap log-stripping. Add an admin audit table. | Immediately; about 1 week |
| 1 | **CORE** (finish PILOT's spine) | CLK and NTF with a real **hand-over** to the deputy, not just a flag. VIS server-side projections. AIP server-side routing. ADM routing editor. GDP export, deletion and retention. SEC templates. | After TRUTH; 3-6 weeks at orch pace |
| 2 | **BVW** (expected-offer closure) | Gutachter role, assessment form and committee step. Premium formula, letter and payroll CSV. ZI KPIs in MET. Content translation. German score patterns (moved to TRUTH-H1). | After CORE; about 3-5 weeks |
| 3 | **PROOF** (outcome integrity) | Results from Jira or KPI imports with source stored. Second-person confirmation. Reward only on a "better" verdict (moved to TRUTH-G1). A routing-override log (AIP-C1). A score-calibration log against decisions and +90-day verdicts. | Parallel to BVW; about 2-4 weeks |
| 4 | **PACK** (works council and AI Act as product) | Lawyer-checked model annex, DPIA and Art. 26 templates. Per-decision explanation export. Read-only works-council/DPO role. | Starts with CORE; legal review 1-3 months |
| 5 | **FOUND** (company and IP) | GmbH. Written IP assignment among the four founders. Trademark clearance and filing. Trade-secret file. Pilot contract with no-reverse-engineering, case-study and anonymised-data rights. EXIST or BSS application. | Now, in parallel; 1-3 months |
| 6 | **PILOT-PAID** (first customer) | Paid PoC with a named Tier-1 supplier. Baseline before go-live. Works-council sign-off. One real-tenant M365/Jira run. A measured users-per-stack figure. Written SLA. | After CORE plus FOUND; 4-12 months |
| 7 | **TRUST** (certification) | ISO 27001 once the entity and LOI exist (about €10-25k, 3-6 months), then TISAX AL2 if a customer asks. Pentest before go-live. | Starts at LOI |
| 8 | **BENCH** (data moat) | Consent-based cross-customer benchmarks of answer time, on-time share and verified outcomes. | From customer 3-5; 12-24 months |
| 9 | **RAISE** (pre-seed) | €0.5-1.5M on the system-of-record story. Pro FIT phase 1 alongside. | After the PoC result and LOI |

The Codex plan has one prerequisite that is easy to miss. The root [AGENTS.md](../../AGENTS.md) holds only a
generated Turborepo block, so a Codex session would not see the real rules, which live in
[CLAUDE.md](../../CLAUDE.md). Codex reads only one instruction file per directory, so adding `CLAUDE.md` as a fallback
filename does not help; the rules have to go into `AGENTS.md` itself. In `workspace-write` mode `.git` is read-only,
so the runner has to commit after `codex exec` returns. Both must be settled before any lane runs (task P0 in the
Codex plan).

## Conclusion

The Harvey-ball chart measured NextUp's intentions against its rivals' brochures, and both sides were misread. The
more useful finding is where the remaining advantage lies. It is not in features, which NextUp's own orch speed shows
anyone can build in weeks. It is in **commitments that a works council can sign and a controller can verify**. Those
become an asset only once they are true in code, written into one customer's agreement and backed by measured
numbers. The short-term priority is therefore unusual for a startup: make the product say less, make the code match
what it says, and spend the PILOT window closing the boring BVW plumbing that gets NextUp through a tender.

NextUp's investable story and its buyer story are different and should stay different. The buyer, a BVW or KVP lead,
gets a faster, fairer idea process that plugs into SAP payroll. The investor gets the only decision-and-outcome
record in operations that a German works council has approved, with a benchmark dataset growing behind it. Both
stories depend on the same first proof point: one paid pilot whose measured answer times and outcomes NextUp is
contractually allowed to publish.
