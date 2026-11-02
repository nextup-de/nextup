# Make the first pilot worth running

*Decision paper for Kevin, Sam, Victor and Marc · 2 Nov 2026 · status of code and plans read from `Nextup` origin/main (`c03269d`, #325) and `plans` origin/main (`2ea6bbd`). Every duration, price and target below is an **estimate or proposal** unless a source is named.*

## 1. Summary

The PILOT Hauptplan, as written, ends with a product that is technically ready for a 1,000-2,000-person company. The research from 2 Nov shows that this is not enough for the pilot to be worth running. Three of NextUp's headline promises are still contradicted by the code on `main`: there is a person ranking, `hiddenPeople` leaks names, and an AI-proposed route earns score points. The expected BVW layer (Gutachter and committee, premium formula and payroll file, ZI KPIs) is missing, so NextUp would fail a German BVW buyer's first round before its differentiators are even looked at. And PILOT has no definition of what the pilot must measure, so even a smooth pilot would leave nothing an investor or the next customer can check. The fix is not more features. It has three parts. First, make the product say only what is true. Second, finish the spine that proves the narrow differentiators: an answer date with a real hand-over, a score with no model output, no person ranking, and a works-council pack. Third, design the pilot itself as an experiment with a baseline, targets, a paid contract and data rights. Most of the Codex plan's work fits into existing PILOT phases. Several PILOT phases (API, EID, SFX, conditionally TMS) can move behind the first pilot.

**Decisions Kevin must take:**

1. **Insert TRUTH now.** Run TRUTH ahead of every new feature phase, and add a rule that public claims state only what runs on `main` for a non-demo company (new HD16-HD18). Target: Gate T on 13 Nov.
2. **Dissolve CORE into PILOT.** Hand-over tasks go to CLK, export and pseudonymisation to GDP. Make VIS, GDP and PACK pilot-gating. Move API, EID and SFX (and TMS unless the customer runs Teams) after the first pilot.
3. **Bring the BVW expected offer into scope in its minimal, export-based form.** Two new phases, REV (Gutachter and committee) and REW (premium formula and payroll CSV), plus ZI KPIs in MET and translation in AIP. This means amending HD14 and the "reward scheme" exclusion. Build after the pitch.
4. **Redefine "PILOT done".** Add PROOF (outcome integrity including CO₂, energy and scrap) and pilot instrumentation (baseline, metrics, case-study export) to PILOT's definition of done.
5. **Fix the pilot design.** One production area plus its support functions (150-300 people) at a Tier-1 supplier, 16 weeks live after a 4-6-week baseline, paid PoC of €20-40k (estimate), and contractual case-study and anonymised-data rights. No free pilot.
6. **Start FOUND this week.** Legal entity, IP assignment among the four founders, trademark clearance, pilot contract template, a lawyer for the works-agreement annex, and a BSS or EXIST application.
7. **One build runner until the pitch.** Use the Codex task files as orch task briefs and do not stand up a second runtime before 11 Dec. In the same decision, cut Sam's page list to the pilot-critical set.

## 2. Where the plans stand

**PILOT phases on 2 Nov 2026** (from `plans/projects/nextup/*/PLAN.md`; the Hauptplan's own `stage:` fields are stale and should be updated):

| State | Phases | Notes |
|---|---|---|
| Done (archived) | AUD, ARC, OPS, STR, LNG, CNX, IDN | 7 of 24. IDN acceptance #312. |
| Running, Bauplan approved | CLK, AIP, ADM, DIR | CLK A1, B1, C1, D1 and G1 merged (#313, #314, #316, #323, #309); Z1 running. AIP G1, A1, B1, E1 and C1 merged (#315, #318, #320, #321, #325); Z1 ready. ADM G1 merged (#317), A1 is PR #322, B1 is PR #326, E1 (personal admins, 2FA) running. DIR G1 merged (#324), A1 running. |
| Bauplan approved, not started | VIS, NTF | Tasks ready; VIS waits on CLK-Z1. |
| Brief only ("idea") | GDP, LOOP, MET, TMS, FLR, API, EID, SFX, SEC, TST, PIL | 11 phases. GDP holds export, deletion, retention and the admin audit. |

The Codex plan (PR #327, open) adds P0, TRUTH (9 tasks), CORE (4), BVW (8), PROOF (5), PACK (3) and BENCH (2), about 65 agent-hours (its estimate), plus business checklists FOUND, PILOT-PAID, TRUST and RAISE. Two of its fixes are already done or moving: the brain now goes only through the DPA gate (#320), and the routing proposal is now made on the server (#325). Moving the proposal to the server does not remove its +20 points: `scoring/index.ts` still adds "Fits a decision type on the map". The ranking (`contributors()`, "Most relied-on contributors") and `hiddenPeople` (layout.tsx:72) are still on `main`.

**What the current PILOT would prove:** the core loop works for a real company with real identities, a working-day clock, German, server-side visibility, data-protection functions, and AI and integrations switched off (HD7). The stack also installs on a dedicated VM and survives load, restore and on-prem tests.

**What it would not prove:**

- that anyone answers faster. No baseline and no pilot metrics are defined beyond the proposal "≥70% within 5 days, 1 case per 10 employees, override <30% after 6 weeks".
- that measured outcomes are trustworthy. The project lead types both baseline and result.
- that the deputy takes over. CLK's design flags the deputy while the owner keeps the case.
- that a works council signs. SEC produces templates only.
- that NextUp passes a BVW buyer's checklist. There is no Gutachter step, premium or ZI KPI.
- that the pilot is a reference. There is no contract right to publish, and the 6-week duration is too short for +90-day measures.

## 3. What the research changes

| Finding (report) | Consequence for the plan |
|---|---|
| **Illusions in code** (defensible offer plan): person ranking, `hiddenPeople` names, LLM route +20 in score, suggestions offered only if they raise the score, demo-only clock, full log incl. `actorUserId` to every browser, admin actions to console only, no export or deletion, reward due on any verdict, English-only score patterns | TRUTH runs before anything else new. Each item is hours to two days, and any one of them found in an IT, DPO or works-council review taints every other claim. Status per item in §4. |
| **Claims to withdraw** (defensible offer plan; value proposition validation): "moves to the deputy by itself", "never people", "export of everything", "routing table editor", "never model output / chatting cannot talk the score up", "safe to raise anonymously", DPA and works-council description before each pilot; deck: "rivals have no deadlines", "none ties reward to measured impact", "none is works-council-ready", "none offers on-prem"; the unsourced "44% won't be implemented" and "~14 days best-in-class" | Landing and deck checklist TRUTH-L this week (Marc owns the deck, Kevin the landing repo). New HD18: a public claim is only allowed if it runs on `main` for a non-demo company. Re-check it at every phase acceptance. |
| **Wrong competitor gaps** (defensible offer plan; competitive position): reward on realised savings is classic BVW, and HYPE compensates on realised impact; deadlines and escalation exist at HYPE, target and Ideanote; on-prem is common; HYPE and rready market works-council fit | Narrow the differentiators to five: (1) an answer date shown to the submitter with automatic hand-over; (2) a score with no model output, each point citing a fact; (3) no person ranking as a design rule; (4) a works-council and AI-Act pack as a product; (5) a cross-customer outcome dataset. The plan must make (1)-(4) true and measurable in the pilot and prepare (5) contractually. |
| **Expected-offer gaps** (offer levels): Gutachter and committee, premium calculation and payroll export, ZI KPIs, translation of idea content, ISO 27001, written SLA | Close them minimally and export-based: REV, REW, ZI KPIs in MET, translation in AIP, SLA in PIL. ISO 27001 is non-code and starts at the LOI. Do not build an SAP-style premium engine; NextUp feeds the customer's payroll. |
| **Segments** (psychographic segmentation; value proposition validation): the desire to be heard and low effort are the strongest employee fits; trust and privacy plus control and accountability gate the purchase; a missing pain is image risk with the supervisor | The pilot's headline metric is days to the first reasoned answer. Shop-floor channels (FLR) rank above Teams. VIS, GDP and PACK are pilot-gating, not polish. Handles are pseudonyms and must be described that way. |
| **Imitability** (imitability at end of pilot): nothing is uncopyable at the end of PILOT; code is copyable in weeks, trust is not | The pilot must produce trust assets: a registered trademark, a signed works-agreement annex, a reference with measured outcomes, and a contract-protected outcome dataset. Contract clauses (no reverse engineering, case-study right, anonymised-data right) go in before the first install. A second person must be able to run orch. |
| **PESTLE legal** (06-pestle-legal-environmental): BetrVG §87(1) Nr. 6 and 12, §26 BDSG, ArbnErfG, GeschGehG, GDPR (DPIA, DPA, export, deletion), AI Act high-risk duties from Dec 2027 if people are evaluated | Keep "score the case, never the person" provable, so the Art. 6(3) argument stays open. PACK ships the Art. 26(7) information template. REW includes an ArbnErfG invention flag so a premium cannot displace a statutory claim. |
| **PESTLE environmental** (same file; its points are an unsourced synthesis) | CO₂, kWh and scrap become standard measures with fixed units (PROOF-C1), plus an export for the sustainability report. Cheap, and it widens the pilot's outcome story beyond euros. Source before external use. |
| **Investability** (defensible offer plan): idea management alone is a roughly €30M PE niche at its leader; investors want a paid PoC, an LOI and one measured reference | Reposition the pitch as **the system of record for improvement decisions in operations**. Idea capture stays the wedge and the buyer-facing name. Every pilot design choice in §5 serves those three proofs. |

## 4. The adapted PILOT plan

### 4.1 Phase by phase

Owner key: K = Kevin, S = Sam, V = Victor, M = Marc.

| Phase | Verdict | What changes and why | Owner |
|---|---|---|---|
| **TRUTH** (new, from Codex) | **Add now** | Tasks A1 (ranking gone), B1 (`/people/[name]` and `hiddenPeople` gone), D1 (AI route earns no points; AIP-C1 is merged, so it can start), E1 (suggestions not ranked by gain; verbatim turns recorded), F1 (admin audit table; GDP's first task), G1 (reward only on "better"), H1 (German score patterns; "deterministic and traceable"). F2 after ADM-E1. C1 (log-stripping stopgap) only if VIS-C1 has not merged by 20 Nov. No real data exists, so a throw-away stopgap is otherwise double work. Plus TRUTH-L (landing, deck). | K, V (D1, E1, H1), M (deck), S (removed pages) |
| **CLK** | **Change** | Keep Z1. Add CORE-S1 (answer promise as one function) and CORE-H1 (breach hands the case to the deputy seat once, by company rule `deadline_handover`, default on) as a second CLK wave, or as a small phase HND if CLK is already archived. Without H1 the headline promise stays a flag. | K; S (answer-date panel) |
| **AIP** | **Keep + add** | Z1 as planned. TRUTH-D1 belongs here logically. Later add BVW-H1, translation of idea content with the original kept (after the pitch). Victor owns the eval and the override rate, which is a pilot metric. | V, K |
| **ADM** | **Keep** | The routing editor (B1) and personal admins with 2FA (E1) close two withdrawn claims. TRUTH-F2 follows E1. | K, S |
| **DIR** | **Keep** | Needed for leavers and pseudonymisation (CORE-P1 needs DIR-D1). | K |
| **VIS** | **Keep, top priority after CLK-Z1** | It is the real fix for the largest privacy contradiction. Its acceptance becomes part of Gate C. | K |
| **NTF** | **Keep + small add** | Add the day-3 interim message to the submitter and the hand-over notice from CORE-H1 (both are "heard" levers). Digests stop mail floods. | K, S |
| **GDP** | **Change: write Bauplan now, pilot-gating** | Adopt TRUTH-F1, CORE-X1 (export) and CORE-P1 (pseudonymise) instead of re-planning them. Add retention rules and an audit-log view. Make it a hard gate before real data. | K, S |
| **LOOP** | **Change** | Switch discussion, project, measure and recognise on per company. Add co-authors and team credit. Take PROOF-A1/B1 as LOOP's integrity tasks if PROOF is not its own phase (see below). | K, S |
| **MET** | **Change** | Drop the ranking removal (TRUTH-A1 does it). Add ZI KPIs (BVW-G1, minimum group of 5), the baseline import, the pilot metric set from §5, and the CO₂/energy export. This is the pilot's report. | S (dashboards), K |
| **REV** (new, BVW-A1-C1) | **Add, after the pitch** | Gutachter role and assessment on the clock, committee agenda and minutes. Before building, Marc gets one BVW lead to review spec 11's review and committee pages (Codex DQ5). | K, S, M |
| **REW** (new, BVW-D1-F1) | **Add, after the pitch** | Works-agreement-configurable premium formula, premium letter, payroll CSV (SAP HCM, SuccessFactors, DATEV), and an ArbnErfG invention flag. No payment, tax engine or SAP write. Needs an HD14 amendment. | K, S |
| **PROOF** (new, from Codex) | **Add** | A1 (measure carries its source; KPI import), B1 (second-person confirmation), C1 (CO₂, kWh, scrap), D1 (one outcome record per decided case, with consent), E1 (score calibration table). A1/B1 before the pilot; C1-E1 can follow in December. | K, V (E1) |
| **PACK** (new, from Codex) | **Add, alongside SEC** | A1 generates the works-council pack from the running config. B1: per-decision explanation export and AI-Act information sheet. C1: read-only works-council/DPO role (aggregates, audit, pack; never case content). Legal review in parallel (PACK-L). | K, M (WC contact), lawyer |
| **SEC** | **Change: paperwork starts now** | DPA, TOMs, DPIA, record of processing and VDA ISA self-assessment are written now with a lawyer. The code part (no standing access, ZAP) stays after GDP and OPS. | K |
| **FLR** | **Keep, raise priority** | QR per area, kiosk, PWA, plus team-lead proxy raise and multilingual input. The share of shop-floor ideas is a pilot metric, and rready's documented weakness is production adoption. | S, K |
| **TMS** | **Move: conditional** | Build only if the pilot customer runs Teams (size L, needs a tenant bot registration). Decide at PoC signature. | K, S |
| **API** | **Move later** | A supplier pilot needs no public API. It is an OEM item. | – |
| **EID** | **Move later** | Generic OIDC/SAML, SCIM and SIEM export are OEM items. Keep only an audit-log CSV in GDP. | – |
| **SFX** | **Move later** | Only relevant if the pilot customer has SuccessFactors without Entra. | – |
| **TST** | **Change** | New `after`: TRUTH, CLK, VIS, NTF, GDP, LOOP, PROOF(A1, B1), MET, FLR, ADM, AIP, SEC, PACK(A1, C1), REV, REW. Keep the 1,500-person scenario and the 2,000-account load test. Add "every public claim checked against the running stack". | K |
| **PIL** | **Change** | Add the pilot metric instrumentation, baseline period, written support SLA, case-study template, data-rights checklist, and the pilot read-out at weeks 6, 16 and 26 (§5). | K, M |
| **BENCH** | **Outside PILOT** | Starts at customer 3-5. The pilot contract only secures the right to the data. | – |
| P0 (Codex `AGENTS.md`) | **Defer** | Needed only if Codex lanes run. See decision 7. | K |

### 4.2 New order and gates

| Gate | Date (target) | Passed when |
|---|---|---|
| **T — Truth** | Fri 13 Nov | TRUTH A1, B1, D1, E1, F1, G1, H1 merged; TRUTH-L ticked on the landing page and in the deck; CLK-Z1 and AIP-Z1 green. |
| **C — Core** | Fri 27 Nov | On a non-demo test company: a case shows its answer date, a breach hands it to the deputy, a member sees only what their role may see (VIS-Z1), an admin exports the company and pseudonymises a person, and every admin action is in the audit table. Recorded once as the pitch demo. |
| Feature freeze (course) | Mon 30 Nov | Only fixes until the pitch. No high-risk merges in pitch week. |
| **B — BVW** | mid-Jan 2027 | One demo idea runs raise → Gutachter → committee → project → confirmed measurement → premium → payroll CSV row (Codex BVW gate). |
| **G4 — Test phase** | early Feb 2027 | TST exit criteria from the pilot-readiness plan, plus the claims check. |
| **P — Pilot go** | at signature + works-council approval | Signed PoC, signed DPA, works-council annex or pilot agreement, baseline captured, pentest without open high findings. |

### 4.3 Text to paste into the orch Hauptplan

**New decisions:**

- `HD16`: "No model output ever changes a score, a verdict, a premium or a KPI. A model may propose; a person or a rule decides, and the record says which (Kevin, 2026-11-0x)."
- `HD17`: "Every number broken down by unit or role is hidden below 5 people, and every cross-company number below 5 companies."
- `HD18`: "A public claim (landing, deck, docs, code comments) describes only what runs on main for a non-demo company; anything else says 'planned for the pilot'. Every phase acceptance re-checks the claims it touches."
- `HD19`: "On a breached answer date the case is handed to the deputy seat once, by the company rule deadline_handover (default on for new companies), and the submitter always sees the date and who holds the case."
- `HD20`: "A measured result counts for a KPI or a reward only with a stored source (a system import) or a second person's confirmation, and a reward falls due only on a 'better' verdict."
- `HD14` amendment: append "Exception: the payroll CSV of REW is the one place the personnel number appears. It is generated for the payroll role only, audit-logged and never previewed."

**Scope edits:** move "reward scheme" out of "Not in scope" and add "a works-agreement-configurable premium formula, premium letter and payroll CSV (REW); no payment, tax engine or SAP write". Add "API, EID and SFX after the first pilot; TMS only if the pilot customer runs Teams". Add to **Done when**: "the pilot metrics of PIL are instrumented and a baseline import runs on the Musterwerk company".

**"From the research" lines** (under Situation):

- "From the research (2 Nov 2026): rated on code, NextUp's feature total is 13 today and 23 after PILOT, level with Qmarkets and below HYPE (~30) and rready (~29). PILOT alone does not create a lead; TRUTH, REV, REW, PROOF and PACK close the expected layer and make the five differentiators true."
- "From the research: a German BVW buyer checks Gutachter/committee, premium and payroll, ZI KPIs, ISO 27001 and an SLA before any AI feature. These are the minimum for the first round, not extras."
- "From the research: works council, DPO and IT can stop the pilot; VIS, GDP and PACK are pilot-gating."
- "From the research: the pilot must yield a baseline, measured outcomes and a publishable case study under contract; a pilot without them proves nothing to investors."

## 5. Pilot design worth running

**Scope.** One production area of a Tier-1 automotive supplier (1,000-2,000 employees overall) together with its support functions (maintenance, quality, logistics, the area's office staff): 150-300 people. It should have an existing BVW or KVP scheme and an active works council. A purely office department would not test the shop-floor channel or the claim with the most weight. An OEM department PoC stays Marc's second track, priced higher (€40-80k, estimate) and gated by TISAX (Gate A in the segment analysis).

**Duration.** Set up and baseline take 4-6 weeks, then **16 weeks live**, with a contractual read-out of +90-day measures at week 26 at no extra fee. The six weeks proposed earlier are too short: a case decided in week 3 and implemented by week 6 reaches its +90-day check only around week 19. The six-week numbers remain an interim gate, with the option to stop.

**Success metrics** (targets are proposals; the baseline column is filled before go-live):

| Metric | Definition | Target (16 weeks) | Why |
|---|---|---|---|
| Days to first reasoned answer | Median working days from raise to the first decision with a reason | ≤5; ≥70% within 5 days, for 8 consecutive weeks | Headline promise; German decisions took about 2.5 months in a 2019 survey; 60% of analysed works agreements set no deadline |
| Deputy hand-overs | Share of cases handed on breach, and their answer time | Reported; <15% of cases | Shows the mechanism works without overusing it |
| Participation | Share of people in scope who raise ≥1 case | ≥15% (Neckel median 10.4% per **year**) | Tests "heard + low effort" |
| Volume | Cases per 10 people in scope | ≥1 | Earlier proposal; comparable to 0.16-0.32 ideas per employee per year |
| Shop-floor share | Cases raised via QR, kiosk or proxy, or by production staff | ≥40% (adjust to the area's mix) | Where most ideas start and where rready reports slow adoption |
| Implementation rate | Decided cases that become a project and reach "Done" | ≥30% of decided cases | Neckel median implementation share is 43.5% per year |
| Verified outcomes | Projects with a +30 or +90 measure that has a system source or second-person confirmation | ≥10, in €, kWh, CO₂ and scrap | The basis for the investor story |
| Confirmed net benefit | Annualised confirmed saving | ≥2× the PoC fee | ROI the buyer can repeat to the board |
| AI override rate | Routing proposals changed by a person; suggestions sent verbatim | Override <30%; verbatim share reported | Shows that AI proposes and people decide |
| Resubmission after a "No" | Share of people with a reasoned "No" who raise again | ≥30% (exploratory; no German benchmark) | Tests the claim that a reasoned answer keeps people engaged |
| Trust incidents | Access bugs, works-council complaints, data-loss events | 0 | Gate for any reference |

**Baseline (before go-live):** an export of the last 12 months of the area's BVW/KVP cases (counts, decision times, implementation, savings, premiums). A "Decision X-Ray" reconstruction of 20 recent cases with timestamps. A three-question pulse survey ("ideas get answered", "I would submit", "I trust how ideas are judged"), repeated at week 16. MET imports the baseline so the pilot report shows before and after side by side.

**Works-council pack and timeline.** The pack contains:

- the system profile (Steckbrief), data flow and role matrix;
- "what is and is not measured" (no person metrics, HD5 and HD17);
- AI on/off and provider, the Art. 26(7) information, and the per-decision explanation;
- retention and deletion at contract end;
- the read-only works-council/DPO view (PACK-C1);
- the DPIA and TOMs.

The customer's own commitments come on top: no appraisal use and no job cuts justified by ideas. The pack goes to the works council at the first meeting, not after signature. Aim for a **time-limited pilot agreement** that is later converted into an annex of the existing BVW agreement. This is an assumption, so check it with the lawyer. Plan **8-12 weeks** from first meeting to approval (estimate; the only documented figure is 3 months for simple systems with a structured profile, from a non-automotive firm).

**Paid PoC terms (proposal):**

| Term | Proposal |
|---|---|
| Fee | €20-40k for 16 weeks plus read-out (estimate, inside the research's €20-60k range). 50% at signature, 50% at go-live; credited fully against the first-year licence if converted within 3 months |
| Included | Dedicated German VM (or the customer's Azure), onboarding and training, office-hours support with a written SLA (estimate: P1 response within 4 business hours, others next business day), works-council pack, pilot report |
| Customer commits | A named sponsor (plant manager), the BVW/KVP lead as owner, deciders who accept the 5-day rule, IT for the Entra app registration, baseline data, works-council engagement |
| LOI | Signed at go-live: conditions under which the customer rolls out company-wide, with an indicative price |
| No free pilot | A free pilot does not count as a proof point. If the fee is refused, require the LOI with a conversion price instead. |

**Data rights NextUp needs (pilot contract, FOUND):**

- NextUp acts as processor under a DPA.
- Right to use **anonymised and aggregated** outcome data (answer times, on-time share, verified outcomes, routing overrides) for product improvement and benchmarks, and to keep it after the contract ends.
- Score-calibration and routing-accuracy improvements belong to NextUp. Raw case content never leaves the stack.
- A case-study right, with the company named and the text approved by the customer, plus a reference-call commitment.
- Feedback IP to NextUp, no reverse engineering, no benchmarking or competing development, and licence terms for the images.
- Export and deletion at the end.

**Exit criteria: what makes it a reference.**

- The metric targets above are met, or the miss is explained in a way the sponsor signs.
- The works-council agreement or annex is signed.
- At least 10 verified outcomes are documented.
- The case study is approved for publication.
- The sponsor will take reference calls.
- There is an LOI or a rollout decision for a second area.

**Kill or rescope at week 6** if fewer than 1 case per 30 people has been raised or fewer than 50% of cases are answered within 5 days. That is a decider problem, and software will not fix it.

## 6. Business track in parallel (not code)

| Item | Action | Owner | When |
|---|---|---|---|
| Legal entity | UG or GmbH (GmbH is more credible to procurement; Pro FIT needs a company); shareholder agreement; liability and cyber insurance | K (+ notary) | Start now; in place before PoC signature |
| IP and NDAs | Written assignment of all code, plans and designs from the four founders to the company. Check CODE University's IP rules for course projects (unverified). Specific, not catch-all, NDAs (BAG 2024). Trade-secret file and need-to-know repo access | K, all four sign | November |
| Trademark | Clearance search first ("NextUp" is a common word), then IGE (CHF 450, ~6 working days expedited) and EUIPO (€850 + €50); a production domain to replace sellux.ch | K | Search in November, filing after entity |
| Contracts | Pilot contract template with the §5 clauses; DPA, TOMs, DPIA; works-agreement model annex; written SLA | K + lawyer (€2-5k template, estimate) | Draft by the pitch |
| Security path | VDA ISA self-assessment now (SEC), pentest booked for January, ISO 27001 only once there is an entity and an LOI (€10-25k, 3-6 months), TISAX AL2 only if a customer asks | K | Self-assessment in December |
| Funding | Berliner Startup Stipendium (€2,000/person/month, up to 18 months); EXIST (check 2026 rates and CODE's eligibility; combination with BSS unverified); IBB Pro FIT once the company exists | K, M | Apply December-January |
| Pitch | Investor story: "system of record for improvement decisions in operations". Buyer story: faster, fairer idea process that feeds SAP payroll. Only claims that pass HD18. Show the corrected feature table honestly | M, K | Deck by 4 Dec |
| Outreach | Persona ladder: idea manager or KVP coordinator first, then OpEx/Lean. Doors: Zentrum Ideenmanagement, automotive BerlinBrandenburg, Berlin Partner. The log shows 25 contacts and no recorded replies. Gate 3 (27 Nov) needs 3 promising leads. One BVW lead reviews the review/committee pages | M | Weekly from now |
| Bus factor | A second person able to run orch lanes and review merges (Victor for AI PRs, Sam for UI PRs); runbooks for orch | K, V, S | December |

## 7. Timeline and risks

| Week | Code (orch) | Product, design, business |
|---|---|---|
| W45 · 2-6 Nov | CLK-Z1, AIP-Z1, ADM, DIR finish; TRUTH tasks written into orch | Decisions §1; TRUTH-L landing and deck; lawyer and trademark search started; Marc's 10-company list |
| W46 · 9-13 Nov | TRUTH merged; VIS starts; NTF | **Gate T (13 Nov)**; Sam: design-and-elements page plus the pilot-critical page list |
| W47 · 16-20 Nov | VIS, NTF, CLK hand-over (S1, H1); GDP Bauplan with X1/P1 | Course "pilot week": start two weeks of internal real-time use on a non-demo company; BVW lead review |
| W48 · 23-27 Nov | GDP, LOOP switch-on, PROOF-A1/B1, MET pilot metrics | **Gate 3 + Gate C (27 Nov)**; pitch demo recorded |
| W49 · 30 Nov-4 Dec | FLR, PACK-A1 (fixes only after 30 Nov for the demo branch) | Feature freeze; repositioned deck; pilot one-pager and PoC terms; entity filed |
| W50 · 7-11 Dec | No high-risk merges | **University pitch, 11 Dec** |
| W51-W2 · Dec-early Jan | REV, REW, PROOF-C1-E1, PACK-B1/C1, translation, SEC code | BSS/EXIST application; VDA ISA; reduced capacity over the holidays |
| W3-W6 · Jan-early Feb 2027 | TST (1,500-person demo, load, restore), PIL | **Gate B**, then **G4**; pentest; PoC negotiation |
| Feb-Apr 2027 | Fixes only | Baseline and works-council approval; go-live **March-April 2027 at the earliest** (estimate) |
| Apr-Aug 2027 | Fixes and pilot support | 16 weeks live; read-outs at week 6 and week 16 |
| ~Oct 2027 | – | +90-day read-out, case study, LOI; then the pre-seed (€0.5-1.5M at €3-6M pre-money, estimate) |

The segment analysis put the pilot in January-March 2027. That is optimistic. Works-council approval alone takes months once a customer has signed, and no customer has been found yet.

**Risks:**

| Risk | Why it matters | Mitigation |
|---|---|---|
| Bus factor ≈ 1 | Kevin writes ~84% of commits and is the only merger for high-risk tasks; the Codex plan marks no task "low" | Delegate reviews (Victor for AI, Sam for UI); write orch runbooks; Kevin merges only schema, auth and deploy |
| Security of AI-built code | Veracode found vulnerabilities in ~45% of AI coding tasks; the code is fast but unreviewed at depth | ZAP in SEC, an external pentest before go-live, no real data before Gate C plus GDP, risk-guarded merges |
| Scope creep | TRUTH + REV + REW + PROOF + PACK add ~30 tasks and ~16 pages on top of PILOT, five weeks before a graded pitch | Gate T and Gate C are the only pre-pitch targets; REV, REW and PACK-B1/C1 move after 11 Dec; customer wishes go to a list (the readiness plan's rule) |
| Sam's design capacity | PILOT's specs list 23 new and 15 changed pages, 27 surfaces and 8 redesigns; spec 11 adds 9 new and 7 changed pages and 5 surfaces. That is about 90 items for one person | Before the pitch: the design-and-elements page plus about 12 pilot-critical pages (answer date, why this score, inbox, routing editor, members, QR raise, export/delete, audit view, measure with confirmation, pilot dashboard, works-council pack download, removed ranking). The rest use plain routes with existing components (DO5) until January |
| No pilot customer | 25 outreach contacts, no recorded replies; PILOT explicitly leaves finding the pilot to people | Marc's weekly list; paid PoC terms ready by W49; a mid-size supplier rather than BMW (BMW runs rready) |
| Works council slower or stricter | 3-12+ months is documented; "efficiency ideas" are read as job cuts during OEM restructuring | Deliver the pack at the first meeting; read-only works-council view; the customer's own no-job-loss commitment in the agreement |
| AI capacity and provider | The brain is sized for ~10 users; Bedrock has no AWS account (G-236) | The pilot runs with AI off or Azure until the DPA and capacity are settled; HD7 makes this a supported mode |
| Two runtimes | Codex needs P0, a commit-from-outside runner and offline proofs | One runner (orch) until the pitch; trial Codex on pure-function tasks (BVW-D1, BVW-G1) in December if wanted |
| Claims drift back | Marketing copy and deck are edited outside orch | HD18 plus a claims check in TST |

## 8. Sources

Research reports (folder `B:/06_CODE/06_Projects/Startup_speed/reports/`):

- [NextUp defensible offer plan.md](NextUp%20defensible%20offer%20plan.md): corrected ratings, code contradictions, expected-offer gaps, phases TRUTH to RAISE
- [NextUp competitive position analysis.md](NextUp%20competitive%20position%20analysis.md)
- [NextUp imitability at end of pilot.md](NextUp%20imitability%20at%20end%20of%20pilot.md)
- [NextUp offer levels.md](NextUp%20offer%20levels.md)
- [NextUp psychographic segmentation.md](NextUp%20psychographic%20segmentation.md)
- [NextUp value proposition validation.md](NextUp%20value%20proposition%20validation.md): source checks on the canvas figures (44%, 14 days, Neckel 10.4%)
- [Motivation fürs Ideenteilen.md](Motivation%20f%C3%BCrs%20Ideenteilen.md), via the vault note "Startup Speed – Motivation & Belohnung für Ideen"
- Images in the same folder (feature analysis, feature analysis after PILOT, imitability ladder, offer levels, competitive position): not read; the reports carry their content

Vault summaries (`C:/Users/k_sch/Documents/obsidian_vault/03 Projekte/Code-Projekte/`): "Startup Speed – Psychografische Segmente", "– Wettbewerbsposition", "– Angebotsebenen", "– Imitierbarkeit nach PILOT", "– Motivation & Belohnung für Ideen", "– Konzept, Wettbewerb & Gates" (course gates: Gate 3 on 27 Nov, feature freeze on 30 Nov, pitch on 11 Dec), "– Outreach & Zielsegmente".

Plans and code:

- `plans` origin/main: `projects/nextup/hauptplaene/PILOT.md` and the phase folders (state, logs)
- `Nextup` origin/main: `docs/plans/2026-11-01_pilot-readiness.md`, `docs/plans/2026-11-01_segment-analysis.md`, `docs/plans/2026-11-02_pilot-pages.md`; `apps/app/src/features/scoring/index.ts`, `apps/app/src/app/[company]/(app)/layout.tsx`, `apps/app/src/features/metrics/index.ts` (checked 2 Nov)
- `Nextup` origin/docs/defensible-offer-plan (PR #327): `docs/plans/2026-11-02_defensible-offer-codex.md` and its task folder, `docs/plans/2026-11-02_defensible-offer.md` ("Status on main"), `docs/plans/2026-11-02_pilot-pages/11-defensible-offer-pages.md`
- `Nextup` origin/docs/research-context: `context/06-pestle-legal-environmental.md`
