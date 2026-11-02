# Competitor counterchecks: are NextUp's claimed rival gaps real, or just thin public information?

Research date: 2 Nov 2026. About 17 search and fetch calls, done in an adversarial way: the goal was to find evidence that each rival DOES have each capability. Background claims come from `reports/NextUp competitive position analysis.md` and the three notes in `research_notes/NextUp competitive position analysis/`. Almost all evidence below is **vendor marketing pages**. No help-centre articles, release notes or demo videos could be reached in this pass, so "not found" still means "not public". It does not mean "missing".

Verdict scale: **Gap confirmed** = searched specifically and found nothing, and the vendor's own wording points the other way. **Probably exists** = the machinery is there, and only NextUp's exact framing is missing. **Exists** = the capability is public and documented.

## 1. Answer deadline / SLA timers with deputy escalation

### Takeaway
The narrow claim holds: no rival publishes a **promise to the submitter** ("answer within N days"). But the machinery under that promise is standard. Phase deadlines, automatic reminders to overdue reviewers, escalation and deputy (Vertretung) applications all exist at Ideanote, target and HYPE. The product gap is small. What NextUp actually owns is the stated commitment plus the automatic deputy takeover. **Verdict: machinery Exists; submitter-facing promise Gap confirmed (narrow); automatic hand-over to a deputy on breach Probably exists at target and is unverified elsewhere.**

### Cited Findings
- **Ideanote** lets admins "Set deadlines for each phase to prevent ideas from stalling", for example "seven days for initial review or 14 days for evaluation". It can "Send automatic reminders when reviewers need to take action", and overdue reviewers get reminders "until they complete their review". No escalation to another person and no promise to the submitter is described. Submitters only get "updates when their submissions progress or get archived". — [Ideanote automatic progression](https://ideanote.io/feature/automatic-progression)
- **target Idea Management:** "Tasks such as checking deadlines and reminders ... are carried out automatically". It lists a "deputy application" among its Fiori apps, with no detail on how it works. — [TIMETOACT target on-prem](https://www.timetoact-group.com/en/details/target-idea-management-on-premise). softguide also lists "Eskalationsmanagement" and timed workflows — [softguide target](https://www.softguide.de/programm/target-idea-management-fuer-den-einsatz-mit-sap)
- **HYPE** can "track deadlines, monitor delayed ideas, and create visibility into where decisions or implementation steps are stuck". Decisions can be escalated or postponed. No reminders, SLA or submitter-facing response time is mentioned. — [HYPE BVW](https://www.hypeinnovation.com/solutions/employee-suggestion-bvw)
- **rready:** the BVW page names no deadlines, reminders, escalation or SLA. — [rready BVW](https://rready.com/bvw)
- **Qmarkets:** a targeted search found no public SLA, reminder or escalation documentation. The earlier note says deadlines and reminders exist only as configurable notifications. — (search: no result); [itonics_qmarkets.md, earlier note]
- **Market practice:** a German financial-services tender expects a review time of "z.B. 14 Tage, danach Überprüfung". That is a standard requirement, not a differentiator. — [softguide tender, Finanzdienstleister](https://www.softguide.de/ausschreibungen/finanzdienstleister-software-unterstuetzung-innovationsmanagement). An industrial tender (~5,000 staff) asks for reminder mails on stalled suggestions — [softguide tender](https://www.softguide.de/ausschreibungen/industrieunternehmen-sucht-software-fuer-das-ideenmanagement)
- Classic German BVW software (trideo, smartidee) also advertises escalation management and involving supervisors. — [softguide trideo](https://www.softguide.de/programm/trideo-frueher-i-on-idee-online); [softguide smartidee](https://www.softguide.de/programm/smartidee-professionelles-ideenmanagement)

### Inferences
- **target vs NextUp's 5-day promise.** target already has automatic deadline checks, reminders, escalation management and a deputy app, all inside SAP. Any target customer could set a 5-day deadline, and a BVW manager would see NextUp's clock as a configuration of something they already own. What target does not publish: the deadline as a **promise shown to the submitter**, and an **automatic transfer** of ownership to the deputy when the deadline is missed. The deputy app is most likely an absence-substitution rule, which is a different thing (unverified).
- NextUp should pitch the **commitment and its visibility** ("the submitter sees the clock, and the deputy takes over automatically"), not the timer. Expect an OEM BVW lead to answer "we have reminders in SAP". The rebuttal is the number: what share of ideas is actually answered within N days.
- A rival can copy this in a release or two, because the machinery exists. The claim is a positioning lead, not a technical moat.

### Gaps
- No help-centre pages for HYPE, Qmarkets or rready were reached. A live demo or the docs could show escalation-to-deputy rules. Qmarkets' and ITONICS' reminder and escalation configuration is unverified.
- How target's "deputy application" works (absence substitution vs escalation on breach) is not public.

## 2. "Their AI scores; none offers explainable, non-LLM scoring"

### Takeaway
This claim mixes two things. **Human, criteria-based scoring with no AI** (weighted evaluation forms, Gutachter benefit analyses, point systems) is standard in every BVW tool, and target, HYPE and rready all have it. A rival can switch AI off and be "non-LLM". What remains as NextUp's own: a **deterministic, automatic** pre-score computed from the submitter's text, where each point cites the fact behind it. No rival publishes that. **Verdict: "non-LLM scoring" Exists (as human scorecards); "explainable automatic deterministic scoring" Gap confirmed (narrow); "rivals let AI score" Exists (true of HYPE, rready, Qmarkets, Ideanote).**

### Cited Findings
- **HYPE** AI offers "Evaluation support to help teams assess feasibility, effort, value, and expected impact" and "Savings estimation support to assist benefit assessment and reward calculations". It also says AI keeps "people in control of evaluation, prioritization, reward decisions, and final approvals". No explainability mechanism is described. — [HYPE BVW](https://www.hypeinnovation.com/solutions/employee-suggestion-bvw)
- **rready**: "AI automates evaluation, routing, and reward allocation". "Assessment based on over 15 factors – transparent and performance-based". — [rready BVW](https://rready.com/bvw)
- **target**: reviewers and Gutachter use customizable forms and benefit analyses, and the tool "supports all types of evaluation systems". No AI is mentioned on the product page. — [TIMETOACT target](https://www.timetoact-group.com/en/details/target-idea-management-on-premise)
- **Ideanote**: AI idea scoring "by your criteria". — [Ideanote features](https://ideanote.io/feature) (from the earlier note)
- **Qmarkets**: admin-defined AI "Feasibility / Novelty / Risk" assessment fields. "Transparent" is claimed, with no mechanism. — [Qmarkets next-gen AI](https://qmarkets.net/resources/news/introducing-next-gen-ai-innovation-management/) (from the earlier note)
- The classic German Prämie model is itself a transparent formula. One guide computes it as net yearly saving minus investment, divided by a factor, times points. — [g-wie-gastro](https://g-wie-gastro.de/unternehmensfuehrung/verbesserungsvorschlaege/verbesserungsvorschlag-bewerten-und-berechnen/)

### Inferences
- rready's "15 factors – transparent" is the closest rival framing. A buyer could reasonably read it as an explainable rule set. NextUp should not say "only we are transparent". It should say "no model output ever enters the score, and each point shows the sentence it came from".
- For a works council, the sharper contrast is rready's "AI automates ... reward allocation" and HYPE's AI savings estimate feeding reward calculation. Both put AI into money decisions, which is co-determined under BetrVG §87(1) Nr. 12.

### Gaps
- Whether HYPE, rready or Qmarkets can switch AI evaluation off per tenant (rready reportedly can, per feature, per the vault note) and whether they log AI suggestions was not verified in documentation.

## 3. Reward tied to impact measured after implementation

### Takeaway
**This claimed gap is the weakest of the five and should be dropped or reworded.** Paying the Prämie on the **realised net saving of the first year** after implementation is the classic German BVW rule, and the SAP-based tools have run it for decades. HYPE explicitly tracks "expected and realized impact" and says it compensates KVP contributors "for the savings they deliver". What NextUp adds is a fixed measurement schedule (+30 / +90 days before/after) built into the product. **Verdict: Exists (concept and practice); a product-enforced measurement schedule is Probably absent from public pages.**

### Cited Findings
- **HYPE** can "Track expected and realized impact like cost savings, operational efficiency gains, and implementation performance". It supports German KVP programs by "tracking and compensating every contributor for the savings they deliver". No measurement schedule or validation owner is given. — [HYPE cost reduction & CI](https://www.hypeinnovation.com/solutions/cost-reduction-continuous-improvement)
- **HYPE BVW** supports rewards "based on implemented ideas, savings, or defined program rules". — [HYPE BVW](https://www.hypeinnovation.com/solutions/employee-suggestion-bvw)
- **HYPE customer cases** report realised savings, for example Klauke "€120,000 annual cost savings" and Witzenmann "six-figure savings". — [Klauke one-pager](https://www.hypeinnovation.com/hubfs/Case%20Studies/one-pager/klauke_hype_case-study_one-pager_en.pdf); [Witzenmann one-pager](https://www.hypeinnovation.com/hubfs/Case%20Studies/one-pager/witzenmann_hype_case-study_one-pager_en.pdf)
- **German BVW practice ties the Prämie to realised first-year savings**:
  - Vinnolit pays 20% of the net first-year saving up to €10,000 and 15% above that. — [CHEManager](https://chemanager-online.com/de/news/vinnolit-ideenmanagement-erhoeht-unternehmenserfolg)
  - A clinic pays 10% of the saving "im ersten Umsetzungsjahr erzielt". — [klilu BVW PDF](https://www.klilu.de/static/ifp/Dokumente_Programm/BVW.pdf)
  - IBM Germany (1980) paid 25% of the first-year net saving plus 10% of the second year. — [Computerwoche](https://www.computerwoche.de/article/2878624/ibm-gab-drei-millionen-fuer-ideen-aus.html)
- **target** transfers rewards directly to SAP payroll and supports "all types of evaluation systems". A Nachkalkulation step is not named on the public page. — [TIMETOACT target](https://www.timetoact-group.com/en/details/target-idea-management-on-premise)
- **rready**: reward logic with "over 15 factors". Customers report "60–70 M CHF annual savings", with no post-implementation tracking method described. — [rready BVW](https://rready.com/bvw)
- **Qmarkets**: third-party reviews mention implementation tracking and ROI dashboards. A customer (Hochschild) cites a "realized Annual Operating Income Contribution to Date of $262 million" for Q-optimize. No reward link was found. — [TrustRadius Qmarkets](https://www.trustradius.com/products/qmarkets/reviews); [rfp.wiki Qmarkets](https://www.rfp.wiki/project-management/innovation-management-platforms/qmarkets)
- **Ideanote**: "ROI Impact Tracking" with numeric values. — [Ideanote features](https://ideanote.io/feature) (from the earlier note)

### Inferences
- The competitive report's line "none ties a reward to impact measured after implementation" is **not defensible** in front of a German BVW lead. Their works agreement very likely already says "Prämie = X% der Nettoersparnis des ersten Jahres", often with an interim or provisional premium and a later Nachkalkulation. Saying otherwise would cost credibility.
- A defensible version: "NextUp **schedules and records** the before/after measurement (+30/+90 days) in the tool, so the realised figure is evidence, not a controller's later estimate". Even this is likely a workflow step in target installations, so treat it as a convenience, not a differentiator.
- The real contrast is with the **AI-estimated** savings that feed rewards at HYPE and rready. Point at that instead.

### Gaps
- The exact Nachkalkulation support in target or SAP BVW (provisional vs final premium, re-evaluation after 12 months) could not be read. It is probably in customer documentation, not public pages.
- Whether HYPE's "realized impact" is entered by hand or measured, and whether it automatically changes the reward, is unknown.

## 4. Works-council-ready / no person ranking

### Takeaway
"None is positioned as works-council-ready" is **false**. HYPE, rready and target all position for co-determined organisations, and rready even has a works-agreement AI assistant at BMW. "No person ranking" as an explicit stance is still unclaimed: Ideanote and rready (at BMW) have person leaderboards, and nobody publishes a "no ranking" principle. **Verdict: works-council positioning Exists; explicit no-person-ranking stance Gap confirmed.**

### Cited Findings
- **HYPE**: configurable for "works council agreements". Approval paths, permissions, evaluation criteria, reward processes and reporting can follow the organisation's "works council agreement and internal policies". — [HYPE BVW](https://www.hypeinnovation.com/solutions/employee-suggestion-bvw)
- **rready**: "Flexible role and permission settings support works agreements and make the solution ideal for co-determined organizations". It offers "GDPR-compliant data handling – including anonymization options". — [rready BVW](https://rready.com/bvw). At BMW it runs a "rules and works-agreement assistant" — [rready BMW case](https://rready.com/case-studies/bmw-ideamanagement)
- **Qmarkets**: offers "anonymization, pseudonymization, and defined handling of leavers", but the security page says nothing about works councils. — [Qmarkets security](https://qmarkets.net/products/security/)
- **Ideanote**: leaderboards rank top ideators, commenters, raters and teams. — [Ideanote features](https://ideanote.io/feature) (from the earlier note)
- **Legal context**: works councils co-determine the principles of the BVW. — [Rödl](https://www.roedl.com/insights/praemien-ideenmanagement-steuer-rechtliche-fallgrube/); [WEKA Betriebsrat](https://www.weka.de/betriebsrat-personalrat/ideenmanagement-so-bestimmt-der-betriebsrat-mit/)
- A German search for HYPE plus "Betriebsrat" / "Betriebsvereinbarung" found no HYPE-specific model works agreement or BR whitepaper. — (search, no hit)

### Inferences
- For a German BVW buyer, works-council fit is **table stakes**, not a differentiator. rready's BMW works-agreement assistant is more advanced than NextUp's planned (not yet written) works-agreement template.
- NextUp's distinct angle is narrower and real: **by design** no person ranking, plus deterministic scoring. It has to be backed by a ready-made works-agreement annex, which the earlier report notes is still planned. Note that NextUp's own code still has a "Most relied-on contributors" ranking until phase GDP.

### Gaps
- Whether HYPE, target or Qmarkets can disable person leaderboards or reports per tenant (very likely configurable) was not verified.
- No public model works agreement from any vendor was found.

## 5. One isolated stack per customer / on-prem

### Takeaway
On-prem is **widely available**: Qmarkets, HYPE, rready, target (on-prem only in customer SAP), Ideanote and ITONICS (Enterprise only). "Isolated stack per customer" as the hosted default is not published by the cloud vendors, but on-prem by definition gives isolation. **Verdict: on-prem Exists; single-tenant hosted default Probably absent at ITONICS (multi-tenant) and unverified elsewhere. Not a differentiator against Qmarkets, rready or target.**

### Cited Findings
- **Qmarkets on-prem**: "The platform is deployed on your servers, inside your network", "on your hardware or virtual servers", "Built to your IT department's own guidelines". Hosting regions include Germany and Switzerland, with storage and processing staying in the chosen region. The page does not say whether hosted customers get dedicated infrastructure. — [Qmarkets security](https://qmarkets.net/products/security/)
- **rready**: CH/EU or on-prem (Docker/Kubernetes) on StackIt, IONOS, GCP or AWS. — [sovara](https://rready.com/sovara) (from the earlier note)
- **HYPE**: "On-premises deployment options for organizations with specific infrastructure or data residency requirements". No region published. — [HYPE integrations](https://www.hypeinnovation.com/integrations) (from the earlier note)
- **target**: runs on-prem inside the customer's own SAP, with a hybrid-cloud add-on. — [TIMETOACT target](https://www.timetoact-group.com/en/details/target-idea-management-on-premise)
- **Ideanote**: on-prem or self-hosting is available, and data residency is a paid add-on. — [Ideanote pricing](https://www.ideanote.io/pricing) (from the earlier note)
- **ITONICS**: cloud is multi-tenant, and on-prem is Enterprise only. — [ITONICS plans](https://itonics-innovation.com/knowledge/subscription-plans) (from the earlier note)

### Inferences
- Drop "none offers on-prem". Keep only "a dedicated stack per company is our **default**, not an enterprise exception", and lead with it only against ITONICS or Ideanote.

### Gaps
- Single-tenant hosted options (dedicated instance) at HYPE, Qmarkets and rready are not stated publicly. Ask in a procurement questionnaire or a demo.

## 6. AI-native German newcomers 2025–2026, and Microsoft / SAP agents

### Takeaway
No funded, AI-native German startup focused on BVW/KVP idea management turned up in English or German searches. Microsoft and SAP offer **no idea-management agent** that replaces a BVW tool: Microsoft's Idea Coach is a brainstorming agent with no intake, routing, deadline or reward, and SAP's Joule agents for SuccessFactors cover goals, performance and succession, not suggestions. The risk is **DIY**: Copilot in Power Apps can generate an idea tracker from a prompt, and target sits inside SAP, where Joule could later reach it. **Verdict: no direct newcomer found (Gap confirmed, low confidence); platform agents replacing a standalone tool: not yet (Gap confirmed), but there is a medium-term DIY risk.**

### Cited Findings
- **Microsoft 365 Copilot "Idea Coach"** agent template: helps users "develop and refine their ideas" in brainstorming. It is a thinking partner, not an intake or decision system. — [Microsoft Learn Idea Coach](https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/agent-builder-template-idea-coach). A partner blog says it can push ideas into Planner or Whiteboard, and that selecting the best ideas remains a human task. — [team400 blog, May 2026](https://team400.ai/blog/2026-05-microsoft-copilot-idea-coach-agent-template)
- **Power Apps**: the old "Employee Ideas" template appears only in 2022 community threads. Copilot can now generate apps from a description. — (search results: [Microsoft Learn Copilot in Power Platform](https://learn.microsoft.com/en-us/training/modules/introduction-copilot-power-platform/accelerate-solution-building))
- **SAP Joule** agents for SuccessFactors:
  - The Performance & Goals agent has been live since Nov 2025, and new SuccessFactors agents were due or GA around May 2026. — [MuchSkills blog](https://www.muchskills.com/blog/sap-skills-management-participation-layer); [Savic Tech](https://www.savictech.com/insights/sap-joule-studio-successfactors-agents-may-2026/)
  - No idea or suggestion agent was found. — [SAP news DE, Oct 2025](https://news.sap.com/germany/2025/10/noch-nie-dagewesene-moeglichkeiten-innovationen-in-sap-successfactors-verbinden-mitarbeitende-und-unternehmen/)
  - Joule Studio is GA on BTP, so customers or partners could build one. *(inference)*
- **target** was still updated on softguide in Jan 2026 (version 10.0 listed there; SVP 11 on TIMETOACT, May 2024), and no AI is listed. — [softguide target](https://www.softguide.de/programm/target-idea-management-fuer-den-einsatz-mit-sap)
- **Small or adjacent players seen**:
  - Brainstorm (trideo) with a Fraunhofer Austria KVP app aimed at smaller firms. — [deutscherpresseindex](https://www.deutscherpresseindex.de/?p=533261) (undated)
  - xlscout IdeaCue (AI idea generation, patent-oriented). — [xlscout](https://xlscout.ai/de/ideacue/)
  - Anyidea (AI trend and innovation, JKU Linz). — [JKU](https://www.jku.at/forschung/forschung-an-der-jku/forschungsnews/detail/news/kuenstliche-intelligenz-trifft-strategisches-management-anyidea-inspiriert-unsere-studierenden/)
  - None of these is an AI-native BVW decision tool.
- Earlier note: manufacturing AI startups (IndustrialMind, Manex, Maneva, LineWise) target engineering and quality, not suggestions. — see `light_and_sap_rivals.md`

### Inferences
- The threat is not a new startup but (a) incumbents adding the same features (rready is closest), and (b) an OEM IT team building a Copilot or Power Apps intake plus a Joule/BTP agent around target/SAP. NextUp's answer to (b) is the accountability contract (clock, deputy, measured outcome) and works-council-ready defaults that DIY builds lack.

### Gaps
- No access to the Zentrum Ideenmanagement vendor list, EXIST or UnternehmerTUM cohorts, or LinkedIn. Stealth DACH startups could be missed.
- The SAP and Microsoft roadmaps for 2027 are unknown. Whether TIMETOACT plans a Joule integration for target was not found.

## Summary verdict table

| # | Claimed gap | Verdict | What NextUp can still truthfully say |
|---|---|---|---|
| 1 | No answer deadline / SLA / deputy escalation | Machinery **Exists** (Ideanote phase deadlines + reminders; target deadline checks, reminders, escalation, deputy app; HYPE deadline tracking + escalation). Submitter-facing promise: **Gap confirmed** | "We promise the submitter a date and hand over to the deputy automatically", not "rivals have no deadlines" |
| 2 | Only NextUp has explainable non-LLM scoring | Human criteria scoring **Exists** everywhere. Automatic deterministic fact-cited score: **Gap confirmed** | "No model output ever enters the score; every point cites its sentence" |
| 3 | No reward on measured post-implementation impact | **Exists** (first-year realised-saving Prämie is classic BVW; HYPE tracks realised impact and compensates on it) | Drop the claim. At most: "the measurement schedule is built in". Attack AI-estimated rewards instead |
| 4 | Not works-council-ready / no person ranking | Works-council positioning **Exists** (HYPE, rready + BMW agreement assistant). Explicit no-ranking stance: **Gap confirmed** | "No person ranking by design", only once the ranking in code is removed |
| 5 | No isolated stack / on-prem | On-prem **Exists** (Qmarkets, HYPE, rready, target, Ideanote, ITONICS Enterprise) | "Dedicated stack is the default", usable against ITONICS and Ideanote only |
| 6 | AI-native newcomers / MS / SAP agents | None found (**Gap confirmed**, low confidence). DIY risk via Copilot / Power Apps / Joule Studio | Position against DIY: accountability and works-council defaults |
