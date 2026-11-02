# Buyer-side psychographics and competitive landscape: idea & innovation management software for large (DACH) automotive

Research date: 2 Nov 2026. Budget-limited pass (about 17 search/fetch calls). Most vendor facts come from vendor pages or review aggregators (G2, Capterra), so treat them as vendor claims. Gaps are listed explicitly; nothing in the Gaps sections should be read as evidence.

## Q1. How do automotive managers evaluate improvement ideas, and what evidence do they need before approving? (Evidence Based Decision Making)

### Takeaway
German idea management is measured with hard, finance-style metrics: first-year net benefit per idea, ROI, and value per FTE. Lean/Toyota practice wants a one-page, data-backed A3 that has been pre-agreed (nemawashi) before formal approval. Approvers expect a quantified business case plus consensus from affected parties, not raw ideas.

### Cited Findings
- Deutscher Ideenmanagement Report 2026, based on 2025 data from 122 organisations with institutionalised idea management (over 1 million employees): the median long-term ROI is 240% (2019–2025), or 330% excluding the Corona years. The median value per full-time idea-management position is €581,512/year, and the average first-year net benefit of an implemented idea is €7,262. The authors stress that the figures are "konservativ berechnet" because only first-year benefit counts — [produktion.de](https://www.produktion.de/wirtschaft/ideenmanagement-potenzial-von-216-milliarden-euro/2699640)
- Same report: 81% of organisations rate the future importance of generative AI as high or very high, and 66% are investing in modernising their idea management. Extrapolated national potential is €21.57bn/year — [produktion.de](https://www.produktion.de/wirtschaft/ideenmanagement-potenzial-von-216-milliarden-euro/2699640)
- Classic dib-style idea-management KPIs include "Bearbeitungsdauer I / II" (processing-time stages) and a motivation metric for supervisors, Gutachter and BVW officers. Processing time is a tracked accountability KPI, not just an ROI one (source is a 2009 thesis, so the KPI names are dated) — [diplomarbeiten24](https://www.diplomarbeiten24.de/document/140188)
- The Gutachter (expert reviewer) checks an idea for goal fulfilment, feasibility and novelty — [fuer-gruender.de](https://www.fuer-gruender.de/blog/ideenmanagement-richtig-umsetzen/)
- Toyota A3 thinking: the proposal A3 has background, analysis and proposal, and implementation schedule sections, plus a separate step of obtaining approval after discussion with affected parties. A3 is framed as part of PDCA management — [Sobek & Smalley, Understanding A3 Thinking (Routledge)](https://www.routledge.com/Understanding-A3-Thinking-A-Critical-Component-of-Toyotas-PDCA-Management/Sobek-II-Smalley/p/book/9781563273605)
- Toyota describes nemawashi as the first step in decision making: share information and seek employee opinion before formal change — [Toyota UK magazine](https://mag.toyota.co.uk/nemawashi)
- Pre-proposal consensus is the "soft power" route, and the proposal can still be modified before formal presentation — [allaboutlean.com](https://www.allaboutlean.com/yokoten-nemawashi-et-al/)
- Executives used to fast decisions can misread nemawashi's pace as inaction — [Globis](https://globis.eu/nemawashi-in-japanese-culture/)
- One unverified blog claims Toyota limits approvals to three stamps — [rightattitudes.com](https://www.rightattitudes.com/2022/11/10/ringi-seido/amp/) (single blog, low confidence)
- Bosch has run idea management since 1924 (suggestion books) and won the Deutscher Ideenpreis 2014 for best idea management as an automotive supplier. Besides formal suggestions, Bosch uses workshops and knowledge platforms — [industrial-production.de](https://www.industrial-production.de/steuerungstechnik/mehr-als-vorschlaege-einreichen-90-jahre-ideenmanagement-bei-bosch.htm)

### Inferences
- The manager's mental model is "show me the € and who agreed". An idea tool that auto-drafts an A3-style business case (problem, analysis, quantified benefit, implementation plan, affected parties consulted) addresses Evidence Based Decision Making directly.
- The €7,262 net benefit per implemented idea and the 240% ROI are what an idea-management lead uses to defend the budget. A vendor that reports these KPIs in dib/ZI format speaks the buyer's language.
- Nemawashi means "Desire to be heard" and "Control & Accountability" are linked: managers want affected stakeholders consulted before the decision lands on their desk.

### Gaps
- No found source with automotive-specific approval thresholds (e.g., € limits per approval level) or Hoshin Kanri linkage of idea programmes to annual targets. This needs interviews or OEM KVP handbooks.
- The dib report's current Durchlaufzeit (processing time) benchmarks were not found. Only the 2026 Deutscher Ideenmanagement Report headline figures are available.

## Q2. Risk awareness & reliability: how IATF 16949 / PPAP / change management shape idea adoption and software procurement (TISAX, pilots, sales cycles)

### Takeaway
On the shop floor, any process idea is a formally controlled change (IATF 16949 clause 8.5.6.1). It can trigger trials, cross-functional sign-off, customer notification and PPAP resubmission, so "good idea" is not the same as "approvable idea". In software procurement, TISAX is a hard commercial gate for any vendor handling OEM-sensitive data, and enterprise evaluation and rollout run from months to over a year.

### Cited Findings
- IATF 16949 clause 8.5.6.1 (Control of Changes), per a practitioner summary, requires validation through trials, cross-functional approval, customer notification where applicable, and post-implementation monitoring. Material changes include switching supplier or raw material. Method changes include changes to work instructions, processes or QC methods — [LinkedIn practitioner post](https://cl.linkedin.com/in/liliansaez) (secondary)
- The customer may require PPAP resubmission for a change or formally waive it — [16949store](https://16949store.com/iatf-16949-standards/iatf-16949-core-tools/what-is-ppap-training/)
- Expected supplier evidence for a change includes formal change control, customer approvals where required, and updated PFMEA, control plan and PPAP — [Rockwell/Plex checklist](https://plex.rockwellautomation.com/content/dam/plex/documents/pdf/industries/auto-and-tire/checklist-automotive-quality-req.pdf)
- TISAX: anyone processing OEM-sensitive information is in scope, including Tier-2/3 suppliers. The OEM sets the required assessment level (most ask for Level 2 or 3). Results are shared via the ENX platform and are valid for 3 years. TISAX builds on ISO 27001 but does not require it — [Docusnap](https://www.docusnap.com/en/it-documentation/tisax-overview); [TÜV SÜD](https://www.tuvsud.com/en-gb/services/auditing-and-system-certification/tisax)
- TISAX has become a contract requirement. OEM procurement checks TISAX status before awarding contracts, and suppliers without a label may be excluded from quotation requests — [Omnex blog, Jan 2026](https://blog.omnex.com/2026/01/02/why-tisax-has-become-a-contract-requirement-for-automotive-suppliers/) (consultancy source)
- SaaS precedent: Tableau Cloud obtained TISAX for automotive manufacturing customers — [Tableau blog, 2022](https://www.tableau.com/blog/enhancing-tableau-cloud-tisax-security-compliance-automotive-manufacturing)
- Sales cycle and rollout examples: BMW took about 18 months to select and roll out a CAM system across plants — [develop3d](https://develop3d.com/?p=28266). One automotive software startup cites engagements of up to 24 months (PoV → PoC → SOP) and paid PoCs of €50k–200k — [vendor data room](https://oxidos-data-room.notion.site/Clients-Pricing-model-1165b230005180fd9014d6a0b8df230f) (self-reported, single company). A Volvo/supplier software pilot slipped about 2 months because of OEM-side resource limits — [Vinnova](https://www.vinnova.se/en/p/pilot-for-software-based-service-structure-in-the-automotive-industry/)
- McKinsey argues OEM procurement must move to a total-cost-of-ownership view of software — [McKinsey](https://www.mckinsey.com/industries/automotive-and-assembly/our-insights/automotive-software-and-electrical-electronic-architecture-implications-for-oems)
- Works council (Betriebsrat): the employer must inform the works council early when planning AI systems (§90 BetrVG). Co-determination applies to AI-supported selection procedures (§95 BetrVG). A disagreement goes to the Einigungsstelle — [CMS law](https://cms.law/de/deu/legal-updates/einfuehrung-von-ki-im-unternehmen-einbindung-des-betriebsrats). Many HR-adjacent AI uses need a DPIA under Art. 35 GDPR — [der-betrieb.de](https://der-betrieb.de/meldungen/ki-im-betrieb-datenschutz-und-mitbestimmung)

### Inferences
- Risk awareness cuts both ways. Line managers resist ideas that touch a PPAP'd process because approval creates change-control work. A tool that flags early whether an idea touches a controlled characteristic (PFMEA, control plan, customer notification) reduces perceived risk and lets the cheap ideas move fast.
- For a startup, TISAX (or at least ISO 27001 plus a credible EU/on-prem hosting story) is likely a precondition for being shortlisted at an OEM. Idea data can include process and prototype details, which are TISAX-relevant. Plan for 6–18+ months from first contact to rollout.
- Idea management is tied to employee bonuses (Prämien) and evaluates employee behaviour. Any AI scoring of ideas will likely need works-council agreement, and the "AI assists, the human Gutachter decides" framing is close to mandatory.

### Gaps
- The exact IATF 16949 normative text and OEM customer-specific requirements on which changes need prior approval were not retrieved.
- No source on typical pilot length specifically for idea-management software at OEMs. No source confirming whether any idea-management vendor holds a TISAX label.

## Q3. Accountability: who owns an idea after submission, typical response SLAs, role of the idea manager / Gutachter (Need of Control & Accountability; view of transparency)

### Takeaway
German BVW/Ideenmanagement has a defined chain: submitter → direct supervisor (Vorgesetztenmodell) or central idea manager → Gutachter (expert assessor) → decision and bonus. Processing time (Bearbeitungsdauer) is tracked as a KPI for supervisors and Gutachter. Concrete SLA numbers were not found in this pass.

### Cited Findings
- dib-style KPIs track Bearbeitungsdauer in stages and a motivation metric for Vorgesetzte, Gutachter and BVW-Beauftragte. Accountability is measured per role — [diplomarbeiten24 (2009)](https://www.diplomarbeiten24.de/document/140188)
- The Gutachter assesses goal fulfilment, feasibility and innovation — [fuer-gruender.de](https://www.fuer-gruender.de/blog/ideenmanagement-richtig-umsetzen/)
- The journal *Ideen- und Innovationsmanagement* (ESV) keeps a dedicated "Gutachter" index topic in 2025, so the role is still an active practitioner issue — [ESV 2025 index](https://esv.info/.view/zeitschriften/bvw/jahresinhaltsverzeichnis_2025.pdf)
- HYPE markets AI Triage that flags duplicate and incomplete submissions, and an "AI Evaluator Summary" that summarises reviewer assessments. This is aimed at the evaluation bottleneck — [HYPE AI page](https://www.hypeinnovation.com/ai-value-acceleration)

### Inferences
- The accountability pain is the slow Gutachter step: ideas wait for an expert who has a day job. Buyers (idea-management leads) want visibility over who is sitting on which idea and for how long. Line managers want that transparency to stay within the hierarchy rather than become public shaming. Transparency is welcome upward and as status for submitters, and resisted when it exposes individual managers' backlogs.
- A product that gives every idea a named owner, a due date and an escalation path covers Control & Accountability, while also covering Desire to be heard for submitters.

### Gaps
- No found source for typical response SLAs (e.g., "first response within X weeks") in German automotive Betriebsvereinbarungen. Recommend primary research: ask idea-management leads, or look for published Betriebsvereinbarungen on Ideenmanagement (IG Metall / Hans-Böckler archives).
- The current-day split between the Vorgesetztenmodell and the central model at OEMs was not found.

## Q4. Competitor landscape and how vendors address the ten traits

### Takeaway
The field splits into (a) enterprise innovation suites (HYPE, ITONICS, Qmarkets, Brightidea, Planview IdeaPlace/ex-Spigit, innosabi) that sell to innovation/strategy departments with portfolio, trend and AI-assist features; (b) lightweight SaaS (Ideanote, IdeaScale, HYPE Boards/ex-Viima) with transparent pricing; and (c) SAP-centric German BVW tools (target Idea Management) that own the classic Ideenmanagement/Prämien process. HYPE has the strongest named German-automotive logo list. None of the vendors found clearly position on works-council-ready AI, frontline low-effort capture, or TISAX.

### Cited Findings

**HYPE Innovation (Bonn, DE)**
- Client page lists Daimler, Volvo Group, VW, Toyota, Continental and Mahle (static list, current status unknown) — [HYPE clients](https://www.hypeinnovation.com/en/clients)
- AI features named on its 2026 page: Innovation Graph, AI Coach, AI Idea Generator, AI Evaluator Summary, Similarity Search, Campaign Assistant, AI Trend Generator, Web Clipper, Startup Scouting, MCP support. It positions AI as not replacing human decision-making and lists "AI Use-Case Governance". The page makes no explicit EU/on-prem hosting claim — [HYPE AI](https://www.hypeinnovation.com/ai-value-acceleration)
- AI Triage flags duplicate and incomplete submissions — [HYPE enterprise AI](https://hypeinnovation.com/enterprise-ai-for-innovation-management)
- G2: 4.8/5, idea management score 8.7/10 (29 reviews). Reviewers praise support and name a learning curve and complex setup as drawbacks — [G2 HYPE vs Qmarkets](https://www.g2.com/compare/hype-innovation-vs-qmarkets-impact-driven-innovation-software)
- Viima now sold as "HYPE Boards (formerly Viima)", Basic plan $79/month on G2. 53.3% of its G2 reviewers are enterprise — [G2](https://www.g2.com/compare/hype-boards-formerly-viima-vs-ideanote)

**ITONICS (Nuremberg, DE)**
- Automotive page names Toyota Motor Europe (200+ projects worth €20M+ on ITONICS Innovation OS), Lear (AI for signal sensing) and Škoda — [ITONICS automotive](https://www.itonics-innovation.com/automotive-industry)
- Launched AI-driven capabilities in Innovation OS (Nov 2023). ISO 27001:2022 recertified in March 2024 — [ITONICS news](https://itonics-innovation.com/news/page/4)
- Per a third-party comparison, AI Agents, Roadmap, Horizon Scan and similar are separate modules, and AI credit usage affects total cost — [rfp.wiki Qmarkets vs ITONICS](https://www.rfp.wiki/project-management/innovation-management-platforms/qmarkets/itonics)

**Qmarkets (IL)**
- Mainly multi-region cloud SaaS, with optional on-premise perpetual licensing — [rfp.wiki](https://www.rfp.wiki/project-management/innovation-management-platforms/qmarkets/itonics); TrustRadius lists On-Premise and SaaS — [TrustRadius](https://www.trustradius.com/vendors/qmarkets)
- Automotive among its client industries. Ford was named in 2020 — [Capterra](https://www.capterra.com/p/83531/Qmarkets/pricing/); [Qmarkets 2020 PR](https://qmarkets.net/de/?p=141560)
- Markets "next-gen AI innovation management capabilities" — [Qmarkets](https://www.qmarkets.net/?p=549). Published a 2026 report "Die Wirkungslücke" (impact gap) on corporate innovation, which shows impact/ROI messaging — [Qmarkets DE resources](https://qmarkets.net/de/resources/page/14/?tag=204)

**Brightidea (US)**
- Winter 2025 release: submission-form overhaul and an upgraded AI image generator — [Brightidea blog](https://brightidea.com/blog/winter-release-2025/)
- Third-party listing describes ChatGPT-based writing help, theme identification, duplicate detection and vendor scouting — [toolsforhumans.ai](https://www.toolsforhumans.ai/ai-tools/brightidea) (secondary). 72% of its G2 reviewers are enterprise, and no public price — [G2](https://www.g2.com/compare/brightidea-vs-ideanote)

**Planview IdeaPlace (ex-Spigit)**
- Spigit is now sold as Planview IdeaPlace. G2 shows no public pricing — [G2 pricing](https://www.g2.com/products/planview-ideaplace/pricing); [G2 compare](https://www.g2.com/compare/ideanote-vs-planview-ideaplace)

**Ideanote (DK)**
- Free (≤10 users), Scale $6–7/user/month (≤50 users), Ultimate from $899/month for 100 users. Ultimate adds SSO (SAML, Azure AD), SCIM, audit log, 99.9% SLA, data residency add-on (EU and others), and on-premise/self-hosting. Hosted on a SOC2-compliant Google Cloud datacenter. No ISO 27001 or TISAX on the pricing page — [Ideanote pricing](https://www.ideanote.io/pricing)
- G2 4.7/5 (286 reviews), 88.3% small-business reviewers — [G2](https://www.g2.com/compare/ideascale-vs-ideanote)

**IdeaScale (US)**
- No pricing on G2, with a substantial mid-market reviewer share. 2025–26 AI features not found in this pass — [G2](https://www.g2.com/compare/ideascale-vs-planview-ideaplace)

**innosabi (Munich, DE)**
- Describes itself as open-collaboration and data-driven decision-making software for corporate innovation management. Part of the Questel group, linking innovation to IP/patent filing — [munich-startup](https://insights.munich-startup.de/companies/innosabi); Questel-group claim from search snippet, [innov8rs](https://innov8rs.co/?p=132740) (not verified on page). No named automotive customers or AI/hosting details found.

**SAP-centric BVW tools: target Idea Management (Walldorf Consulting / TIMETOACT)**
- Runs inside SAP without interfaces and is SAP-certified. Available on-prem or as SaaS on SAP cloud — [SAP partner page](https://www.sap.com/swiss/products/hcm/partners/wca-walldorf-consulting-gmbh-target-idea-management-cloud.html); [TIMETOACT on-prem](https://www.timetoact-group.com/en/details/target-idea-management-on-premise)
- Softguide listing names BorgWarner, Porsche, Volkswagen and ZF among its customers (vendor list) — [softguide](https://www.softguide.de/programm/target-idea-management-fuer-den-einsatz-mit-sap). New release SVP 11 — [TIMETOACT](https://timetoact-group.com/en/details/the-new-target-idea-management-release-svp-11-is-now-available)
- Other German BVW tools in listings: Trevios (itdesign), trideo (Brainstorm), Crowdworx — [softguide Ideenmanagement](https://www.softguide.de/software/ideenmanagement)

### Trait coverage matrix (inferred from cited features; ● strong / ◐ partial / ○ not evident)

| Trait | HYPE | ITONICS | Qmarkets | Brightidea | Planview IdeaPlace | Ideanote | IdeaScale | innosabi | target (SAP BVW) |
|---|---|---|---|---|---|---|---|---|---|
| Improvement Oriented Mindset | ● campaigns, idea mgmt | ◐ strategic/portfolio focus, less KVP | ● | ● | ● | ● | ● | ◐ | ● classic BVW |
| Desire to be heard | ◐ | ○ top-down, foresight | ◐ | ◐ | ◐ | ● simple submit, feedback | ● crowd voting | ◐ | ◐ form-heavy |
| Need of transparency | ◐ | ◐ portfolio dashboards | ◐ | ◐ metrics release | ◐ | ◐ | ◐ | ◐ | ◐ status in SAP |
| Recognition & Meaningful Impact | ◐ | ○ | ◐ | ◐ | ◐ | ◐ | ◐ | ○ | ● Prämie in SAP payroll |
| Evidence Based Decision Making | ● AI Evaluator Summary, graph | ● portfolio, signals | ● impact/ROI messaging | ◐ | ◐ | ○ | ◐ | ◐ "data-driven" | ◐ savings calc |
| Risk Awareness & Reliability | ◐ German HQ, enterprise | ◐ ISO 27001 | ● on-prem option | ○ | ◐ | ● on-prem/self-host, residency add-on | ○ | ◐ DE HQ | ● on-prem in SAP |
| Need of Control & Accountability | ● workflows, triage | ● | ● | ◐ | ◐ | ◐ audit log | ◐ | ◐ | ● SAP workflow |
| Openness to AI & Changes | ● broad AI suite + MCP | ● AI modules/agents | ● | ◐ GPT writing, images | ○ not found | ◐ AI credits | ○ not found | ○ not found | ○ not found |
| Trust/Fairness & Data Privacy | ◐ "governed", no hosting claim | ◐ | ◐ | ○ | ○ | ◐ | ○ | ○ | ◐ |
| Low Tolerance for extra work | ◐ learning curve, complex setup (G2) | ○ heavy suite | ◐ | ◐ form overhaul | ○ | ● simple | ● | ◐ | ○ |

### Inferences (positioning gaps)
- **Works-council-ready, explainable AI is unclaimed.** Vendors advertise AI generation, summarisation and similarity, but none found frames AI as BetrVG/GDPR-compliant evaluation support with the human Gutachter as decider, auditable scoring and no individual performance profiling. That is a gap at the Trust/Fairness × Openness to AI intersection.
- **Frontline low-effort capture plus manager-grade evidence is split across categories.** Light tools (Ideanote, IdeaScale) win on low extra work and being heard, while suites (HYPE, ITONICS) win on evidence and control but carry setup and learning-curve complaints. Nobody clearly bridges a 30-second shop-floor capture to an auto-built A3/business case.
- **Automotive change-control awareness is absent.** No vendor found maps ideas to IATF 16949 change control, PFMEA or control-plan impact, or PPAP triggers. That directly addresses manager risk aversion.
- **Accountability SLAs/escalation for Gutachter** is only partly addressed (HYPE triage and evaluator summary). Owner-plus-due-date-plus-escalation as a headline feature looks open.
- **TISAX:** no idea-management vendor surfaced with a TISAX label. A label (or clear on-prem/EU-sovereign deployment, as Ideanote and Qmarkets partly offer) could be a differentiator for OEM procurement.
- **Incumbent threat in DACH:** SAP-embedded BVW tools (target) own the Prämie/payroll process at VW, Porsche and ZF per vendor lists. A new entrant likely has to integrate with them or sit in front of them (capture plus AI layer) rather than replace them at first.
- HYPE is the most dangerous direct competitor for German OEMs: German HQ, named Daimler/VW/Continental/Mahle logos, broad AI, and now Viima's lightweight product (HYPE Boards) for the low-effort end.

### Gaps
- No Gartner/Forrester 2024–2026 evaluations retrieved (paywalled or not surfaced).
- No current pricing for HYPE, ITONICS, Qmarkets, Brightidea, Planview, IdeaScale or innosabi. Enterprise deals are quote-only.
- Not found: IdeaScale and Planview IdeaPlace AI features for 2025–26; innosabi customers, AI and hosting; hosting/data residency for HYPE and ITONICS.
- The SAP Ideenmanagement module or partner landscape beyond target (e.g., SAP SuccessFactors, other partners) and other DACH BVW tools (Zentrum Ideenmanagement-affiliated vendors, Hoffmann) were not verified.
- No current confirmation that listed automotive logos (HYPE, target) are active customers in 2026.
