# Lightweight and SAP-embedded rivals of NextUp: Ideanote, rready / sovara, target Idea Management (TIMETOACT), AI-native newcomers

Research date: 2 Nov 2026. About 15 search and fetch calls. Almost every feature fact comes from vendor pages, so read it as a **vendor claim** unless a source says otherwise. Builds on `research_notes/NextUp psychographic segmentation/buyer_side_competitors.md` and the vault note "Startup Speed – Wettbewerber rready" (19 Oct 2026). Those two are not re-cited where they already cover a point; internal-note facts are marked "(vault note)".

## Q1. Feature profile per vendor (7 dimensions, compressible into table cells)

### Takeaway
- **rready** is the only one of the three that combines an automotive BVW customer at scale (BMW SPARK, 130k+ employees), a broad AI agent set, and an explicit works-agreement and EU/on-prem story. That makes it NextUp's closest functional rival.
- **target Idea Management** is the SAP system of record for the classic BVW and Prämie process. Vendor lists name VW, Porsche, Audi, ZF and BorgWarner, but it shows no AI.
- **Ideanote** is an inexpensive, AI-heavy self-serve SaaS. Its reviewers are mostly small businesses, and I found no automotive proof.

### Cited Findings

#### A. Ideanote (Copenhagen, DK) - lightweight SaaS
1. **Capture.** All vendor claims:
   - Microsoft Teams app with full idea management. Email idea inbox. "Submit without signup". [Ideanote features](https://ideanote.io/feature)
   - 20+ / 23+ languages with AI auto-translation of ideas and comments, including right-to-left scripts. [features](https://ideanote.io/feature); [pricing](https://www.ideanote.io/pricing)
   - No QR capture, native mobile app or SAP is listed on the feature page. [features](https://ideanote.io/feature)
2. **AI.** All vendor claims:
   - AI idea scoring "by your criteria", duplicate detection and merging across languages, 140-character AI summaries, suggested tags, AI-written "how might we" prompts. [features](https://ideanote.io/feature)
   - AI is metered as monthly AI credits per plan (100 / 500 / more). [pricing](https://www.ideanote.io/pricing)
   - The Gartner Peer Insights profile calls it "AI-native" with agentic workflow automation. A 2026 milestone is "AI Thinking" (web search plus a reasoning mode for autonomous idea evaluation). [Gartner](https://www.gartner.com/reviews/product/ideanote-1987339225); [everydev.ai](https://www.everydev.ai/developers/ideanote)
   - No explainability or human-in-the-loop framing found.
3. **Decision workflow.** Custom phases, automatic progression by time or rules, submission deadlines, time-based triggers, custom notifications. No named reviewer (Gutachter) role, response SLA or escalation found. [features](https://ideanote.io/feature)
4. **Impact and recognition.**
   - "ROI Impact Tracking" with numeric values and impact reports, plus a Trophy Room. [features](https://ideanote.io/feature)
   - Leaderboards that rank top ideators, commenters, raters, teams and ideas. [features](https://ideanote.io/feature)
   - No premium (Prämie) calculation or payroll link found.
5. **Trust and privacy.**
   - Anonymity option ("hide their identity"). [features](https://ideanote.io/feature)
   - Data residency (EU, US, CA, AU, SA, UAE) is a paid add-on. On-prem or self-hosting available. SOC2-compliant Google Cloud datacenter. [pricing](https://www.ideanote.io/pricing)
   - No ISO 27001 or TISAX on the pricing page. [pricing](https://www.ideanote.io/pricing)
   - The person leaderboards are a works-council (BetrVG §87(1) Nr. 6) risk. *(inference)*
6. **Integrations.**
   - Public REST API, webhooks, Zapier, Power Automate, Power BI, "sync with project management", Teams. [features](https://ideanote.io/feature)
   - SAML SSO, Azure AD, OIDC and SCIM, on the Ultimate plan only. [pricing](https://www.ideanote.io/pricing)
   - No native SAP or Jira connector named. [features](https://ideanote.io/feature)
7. **Pricing, customers, segment.**
   - Plans: Free (≤10 users), Scale $6–7/user/month (≤50 users), Ultimate $5/user/month "starting at $899/month for 100 users". [pricing](https://www.ideanote.io/pricing)
   - G2 reviewers are 88.3% small business (from the background note).
   - Third-party listings name IKEA, Toyota, Maersk and Decathlon. I could not verify these on Ideanote's own page, and found no automotive case study. The casestudies.com index lists 6 stories, none automotive. [everydev.ai](https://www.everydev.ai/developers/ideanote); [saasrat](https://saasrat.com/products/ideanote); [casestudies.com](https://www.casestudies.com/company/ideanote)

#### B. rready / sovara (Zurich, CH)
1. **Capture.**
   - BVW module: ideas from smartphone or tablet "for production staff without a fixed PC workstation". [rready BVW](https://rready.com/bvw)
   - BMW SPARK: submission in the native language with Text AI, which refines and translates into German. Image AI. Admin-curated prompts and starting points. Free text is kept. [BMW case study](https://rready.com/case-studies/bmw-ideamanagement)
   - No Teams or Slack app and no QR found (vault note 19 Oct 2026).
2. **AI** (strongest of the three; vendor case study):
   - **Creation coaches:** Idea Coach, Creativity Coach, Solution Finder.
   - **Before review:** "Ideas Partner" flags weaknesses, a Plausibility Check tests claims, and an expert-review assistant structures assessments.
   - **Routing:** a Department Suggestion Agent matches the idea against descriptions of BMW's ~7,000 org units. Routing used to take up to 45 minutes in individual cases.
   - **Novelty:** similarity detection that separates duplicates from related ideas, and a patent-relevance indicator.
   - **Governance:** a "rules and works-agreement assistant" answers process questions from works agreements.
   - **Language:** language-agnostic search and translation.

   Source for all of the above: [BMW case study](https://rready.com/case-studies/bmw-ideamanagement)

   - **Adoption (vendor-reported):** 47.9% of ideas had AI interactions in the first 4 measured months, but only 25.5% of contributors used at least one AI function. Adoption was "slower than expected, particularly in production environments". [BMW case study](https://rready.com/case-studies/bmw-ideamanagement)
   - **Roadmap:** BMW's next stage is "proactive" assistants. Stage 4 (linking ideas to projects and experts via APIs) is not built yet. [BMW case study](https://rready.com/case-studies/bmw-ideamanagement)
   - **Models:** Azure OpenAI by default, bring-your-own endpoint, AI switchable per feature (vault note). sovara also allows self-hosted LLMs. [sovara](https://rready.com/sovara)
3. **Decision workflow.**
   - "Defined roles, documented approvals, traceable workflows". AI supports "evaluation, routing, and reward allocation". [BVW](https://rready.com/bvw)
   - Assignee is often a role or department, not a person. Assigned Coach, Sponsor and Jury at gates (vault note).
   - No explicit deadline or escalation feature found on the public pages.
4. **Impact and recognition.**
   - Reward logic built on "over 15 factors". Dashboard shows participation, cycle time and savings. [BVW](https://rready.com/bvw)
   - ROI and success-rate tracking. [idea management](https://www.rready.com/idea-management)
   - BMW premium payout runs through SAP SuccessFactors via a custom integration. Top-20 leaderboard and per-person participation reports exist (vault note). The SuccessFactors link is not on the public case-study page.
5. **Trust and privacy.**
   - "GDPR-aligned … anonymization options, audit-proof documentation … support works agreements and co-determined organizations". [BVW](https://rready.com/bvw)
   - ISO/IEC 27001:2022, Swiss jurisdiction, "CLOUD Act-free" claim. Hosting in CH/EU or on-prem (Docker/Kubernetes) on StackIt, IONOS, GCP or AWS. [sovara](https://rready.com/sovara); [pricing](https://www.rready.com/pricing)
   - Hosted SaaS was observed on AWS Frankfurt, and the BSI C5 claim appears only in a blog post. No TISAX found (vault note).
6. **Integrations.**
   - REST API, Kafka, MCP, SSO/SAML, AD-Sync, PowerBI, Kibana, GitLab and Bitbucket. "SAP" and "Microsoft" are named generically. [sovara](https://rready.com/sovara)
   - No public API docs, no SCIM, no Teams app. Jira import is available, and sovara itself is positioned as a Jira/Confluence replacement (vault note).
7. **Pricing, customers, segment.**
   - No per-user price is published. A pricing calculator offers Premium and Enterprise tiers from 10 to 50,000 users. The only figure is a sovara estimate of "$200k–240k/yr" against Atlassian, marked "Not a quote". [pricing](https://www.rready.com/pricing)
   - **BMW:** SPARK covers 130k+ employees. A testimonial comes from BMW's Head of Idea Management, Dr. Ulrich Stephany. [BMW case study](https://rready.com/case-studies/bmw-ideamanagement); [sovara](https://rready.com/sovara)
   - **Other named customers:** "40+ enterprise and public-sector customers" incl. Swisscom, Tetra Pak, Implenia. [sovara](https://rready.com/sovara)
   - **ZF:** not named on the public idea-management or sovara pages. The vault note says ZF uses rready for intrapreneurship (KICKBOX style), not BVW.
   - **KICKBOX:** discontinued as a standalone product and folded into sovara (vault note).
   - **Company:** ~25 staff, $4M Series A in Nov 2023. Since 2026 its releases are mostly generic work-management features (vault note).

#### C. target Idea Management (Walldorf Consulting / TIMETOACT GROUP, DE) - SAP-embedded BVW
1. **Capture.**
   - SAP Fiori submission app with similarity search to avoid duplicates. Smartphone submission. [TIMETOACT on-prem](https://www.timetoact-group.com/en/details/target-idea-management-on-premise)
   - Form designer, draft saving, upload. Interface languages DE, EN, FR plus "Mehrsprachigkeit". [softguide](https://www.softguide.de/programm/target-idea-management-fuer-den-einsatz-mit-sap)
   - No Teams or QR found.
2. **AI.** None mentioned on the vendor page or softguide (softguide lists only "semantische Suche"). A search for 2025 AI announcements found nothing. [TIMETOACT](https://www.timetoact-group.com/en/details/target-idea-management-on-premise); [softguide](https://www.softguide.de/programm/target-idea-management-fuer-den-einsatz-mit-sap)
3. **Decision workflow** (the strongest classic BVW workflow of the three):
   - Worklists showing "who does what and when". Reviewers and experts (Gutachter) use customizable forms and benefit analyses. Automatic deadline checks and reminders. Idea groups for several processes in one install. [TIMETOACT](https://www.timetoact-group.com/en/details/target-idea-management-on-premise)
   - Escalation management, timed workflows, stage-gate. [softguide](https://www.softguide.de/programm/target-idea-management-fuer-den-einsatz-mit-sap)
4. **Impact and recognition.**
   - "All types of evaluation systems". Rewards transfer directly to SAP payroll. Points account and optional Rewards Shop. HR and org data come from SAP ERP HCM/OM. [TIMETOACT](https://www.timetoact-group.com/en/details/target-idea-management-on-premise)
   - KPIs and process reporting. [softguide](https://www.softguide.de/programm/target-idea-management-fuer-den-einsatz-mit-sap)
5. **Trust and privacy.**
   - On-prem inside the customer's own SAP (NetWeaver/ABAP/SAPUI5). A hybrid cloud add-on is available. [TIMETOACT](https://www.timetoact-group.com/en/details/target-idea-management-on-premise)
   - SAP-certified and also offered as SaaS on SAP cloud (from the background note, SAP partner page). The SAP partner page returned 403 this time, so I could not re-verify it.
   - No ISO 27001, TISAX or anonymity statement found.
6. **Integrations.** Native SAP (HCM, OM, payroll). No Jira, Teams, SCIM or public API mentioned. [TIMETOACT](https://www.timetoact-group.com/en/details/target-idea-management-on-premise)
7. **Pricing, customers, segment.**
   - Price "auf Anfrage" (on request). [softguide](https://www.softguide.de/programm/target-idea-management-fuer-den-einsatz-mit-sap)
   - **Automotive references on softguide:** Audi, Porsche, Volkswagen, ZF, BorgWarner. Others: BASF, Bayer, B. Braun, Fraport, SCHOTT. ">100 organizations, >700,000 employees". This is a vendor reference list with no date per customer. [softguide](https://www.softguide.de/programm/target-idea-management-fuer-den-einsatz-mit-sap)
   - Latest named release is SVP 11 (May 2024). [TIMETOACT](https://www.timetoact-group.com/en/details/target-idea-management-on-premise)

### Inferences
- Short cell versions:
  - **Ideanote:** "cheap, AI-credit SaaS, Teams + 20 languages, leaderboards, EU residency as add-on, SMB-skewed, no automotive proof"
  - **rready:** "AI-agent BVW suite at BMW (130k), works-agreement assistant, CH/EU/on-prem, ISO 27001, SuccessFactors payout, slow shop-floor AI adoption, pivoting to Jira replacement"
  - **target:** "SAP-native BVW system of record, Gutachter worklists + reminders + payroll transfer, VW/Porsche/Audi/ZF/BorgWarner (vendor list), no AI, on-prem SAP"
- None of the three makes explainable AI scoring with the human Gutachter as decider a headline. rready comes closest with its "works-agreement assistant" and per-feature AI switches.
- Ideanote and rready both have person leaderboards or per-person reporting. That leaves room for NextUp's "no person ranking" stance.
- target owns deadlines and reminders plus payroll at VW-group companies. NextUp's accountability features overlap target's workflow, not just rready's. Integrate (push accepted decisions and Prämie into target/SAP), don't replace.

### Gaps
- Not found: Ideanote ISO 27001, mobile app or QR capture, and any automotive customer confirmed by Ideanote itself.
- rready's public pages give no deadline or escalation details. No list price for the idea-management/BVW module. ZF's use of rready is not confirmed publicly.
- For target, there is no 2025–26 release information after SVP 11 and no AI roadmap. I could not check whether VW, Porsche or ZF are still active customers in 2026. There is no case study with figures.
- TISAX: no label found for any of the three.

## Q2. Is there an AI-native newcomer (2025–2026) targeting idea management for manufacturing?

### Takeaway
I found no funded 2025–26 startup focused specifically on AI-native idea or suggestion management for manufacturing. The AI-first manufacturing startups target engineering, quality or downtime instead. The closest AI-first idea-management players are incumbents that rebranded as AI-native: rready, Ideanote and Ideawake.

### Cited Findings
- Ideawake (US) launched "advanced AI-enabled platform features" in a press release dated 21 Jan 2025. It markets continuous improvement and frontline teams, and its AI assistant is called "Aurora". [Owler](https://www.owler.com/company/ideawake); [Ideawake CI page](https://ideawake.com/the-modern-platform-for-continuous-improvement-ideas-from-suggestions-to-roi/)
- These funded manufacturing AI startups are not idea management:
  - IndustrialMind.ai ($1.2M pre-seed, Oct/Nov 2025, "AI engineer" for factories). [BusinessWire](https://www.businesswire.com/news/home/20251106135477/en/IndustrialMind.ai-Raises-1.2-M-Pre-Seed-to-Bring-the-AI-Engineer-to-Manufacturing)
  - Manex AI (€8M seed, quality). [Sifted](https://sifted.eu/articles/8m-seed-manex-ai)
  - Maneva ($27M Series A, factory-floor AI). [Dealroom](https://dealroom.co/news/134340-maneva-raises-27m-series-a-for-factory-floor-ai/)
  - LineWise ($1.1M pre-seed, downtime and defects). [Crowdfund Insider](https://www.crowdfundinsider.com/tag/linewise/)
- Demand signal: a German industrial tender (~5,000 employees) asks for reminder mails on stalled suggestions, reward administration, and mainly smartphone, tablet or monitor input. [softguide tender](https://www.softguide.de/ausschreibungen/industrieunternehmen-sucht-software-fuer-das-ideenmanagement)

### Inferences
- The "AI-native, manufacturing BVW" slot is open apart from rready. A future entrant would more likely be a shop-floor/MES AI startup adding a suggestion feature than a pure idea tool. That is a risk to watch, not a current competitor.

### Gaps
- The search was in English and German but not exhaustive. Stealth or very early DACH startups, for example from EXIST or UnternehmerTUM, could be missed.

## Q3. Which is the most relevant third competitor for an automotive table alongside HYPE and ITONICS/Qmarkets?

### Takeaway
**rready** is the best fit. It has the only publicly documented, current, large-scale automotive BVW deployment with AI (BMW SPARK, 130k+ employees, case study published Oct 2026). It also competes on the same claims as NextUp: AI routing, pre-review, works-agreement fit, and EU sovereignty. target Idea Management should appear as the incumbent SAP baseline (a footnote or "status quo" column) rather than as the third rival. Ideanote is not relevant for automotive.

### Cited Findings
- rready: BMW SPARK covers 130k+ employees with 15–20+ AI functions, including routing over ~7,000 units. Its weak spot is self-reported: AI adoption is slow in production (25.5% of contributors). [BMW case study](https://rready.com/case-studies/bmw-ideamanagement)
- target: automotive logos (VW, Porsche, Audi, ZF, BorgWarner) appear only as a vendor reference list. No AI is shown, and the latest named release is from 2024. [softguide](https://www.softguide.de/programm/target-idea-management-fuer-den-einsatz-mit-sap); [TIMETOACT](https://www.timetoact-group.com/en/details/target-idea-management-on-premise)
- Ideanote: no automotive case study, and its reviewers are SMB-skewed. [casestudies.com](https://www.casestudies.com/company/ideanote)

### Inferences
- **Why rready over target:** rready is chosen per deal (BMW reported it "beat established competitors"), while target is usually already in place inside SAP. A comparison table is about choosing between alternatives, so rready is the head-to-head rival and target is the status quo NextUp must plug into.
- **Lines that set NextUp apart from rready in the table:**
  - accountability per named person, with deadline and deputy, versus routing to a department
  - no person leaderboards (BetrVG)
  - focus on deciding, not a Jira replacement
  - "proactive" guided capture, which rready lists as its own next stage at BMW
- **If the table needs a German SAP angle:** add a "status quo: SAP BVW (target)" row or column instead of dropping rready.

### Gaps
- No independent (non-vendor) evidence on rready's or target's actual automotive outcomes. Current contract status at VW, Porsche or ZF is unverified.
