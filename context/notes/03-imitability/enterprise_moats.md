# Enterprise moats when selling software to German automotive OEMs / Tier-1: time and cost to imitate

Scope: DACH automotive, as of Nov 2026. Purpose: give the report writer time and cost figures so each potential NextUp moat can be placed on the ladder cannot be imitated / difficult to imitate / can be imitated at a cost / easy to imitate. Most cost figures come from compliance vendors and consultancies (SECJUR, Orbiq, Sprinto and others), not from ENX, VDA, BSI or auditors' official price lists. Treat them as ranges, not quotes.

## 1. Certifications: TISAX, ISO 27001, SOC 2, BSI C5, VDA ISA self-assessment

### Takeaway
Certifications are imitable at a cost. A small startup can get TISAX AL2 in about 3 to 12 months for roughly EUR 15k to 60k all-in, or ISO 27001 in about 3 to 6 months for EUR 10k to 25k in year one. They are a gate (no label, no RFQ invitation), not a lasting moat, because any funded competitor can buy them within a year. BSI C5 and SOC 2 Type II are slower and dearer, but German automotive buyers do not usually ask an idea-management tool for them.

### Cited Findings
**TISAX**
- Auditor fees: AL2 (remote plausibility check) about EUR 3,500 to 6,000. AL3 (on-site) about EUR 6,500 to 10,500. Small and mid-sized firms with up to 100 staff pay about EUR 3,500 (AL2) and EUR 6,500 (AL3). Each additional objective, such as prototype protection or data protection, adds about EUR 1,000 to 2,000. — [SECJUR, TISAX Kosten](https://www.secjur.com/blog/tisax-kosten)
- ENX registration costs EUR 405 one-time per site and covers the 3-year label validity. A flat-rate model costs EUR 5,000 per year. — [SECJUR, TISAX Kosten](https://www.secjur.com/blog/tisax-kosten)
- Total cost (preparation plus assessment, excluding technical investments): micro firm (up to 20 staff) EUR 8k to 15k with own effort or EUR 15k to 25k with a consultancy. SME (20 to 100 staff) EUR 20k to 40k own effort or EUR 35k to 60k with a consultancy. Ongoing ISMS maintenance costs EUR 5k to 12k a year, and re-assessment after 3 years costs EUR 8k to 15k. — [SECJUR, TISAX Kosten](https://www.secjur.com/blog/tisax-kosten)
- Duration: 6 to 12 months with own effort, 3 to 6 months with a consultancy or platform, and about 3 to 4 months if an ISO 27001 ISMS already exists. About 40% of first assessments end with findings, and ENX allows up to 9 months to fix them. In SECJUR's worked example, 8 months of preparation plus 4 months of corrective action made 12 months, against 6 planned. — [SECJUR, TISAX Kosten](https://www.secjur.com/blog/tisax-kosten)
- An Orbiq vendor estimate puts a small supplier at AL2 with an existing ISO 27001 base at EUR 15k to 40k, and a mid-size supplier at AL2 from scratch at EUR 30k to 80k. — [Orbiq, TISAX compliance](https://www.orbiqhq.com/eu-regulations/tisax-compliance)
- AL2 is usually enough for normal confidential business information. AL3 is mandatory for prototype data or strictly confidential design documents. Labels are valid for 3 years. — [SECJUR, Assessment Levels](https://www.secjur.com/blog/tisax-assessment-levels)
- At Volkswagen Group, the commissioning department classifies the data and sets whether AL2 or AL3 is required. Suppliers without a TISAX label are reportedly excluded from quotation requests for new projects, and software developers and cloud providers are explicitly in scope. These sources are secondary and vendor blogs, not VW documents. — [CSN partner wiki](https://csn-partner.atlassian.net/wiki/spaces/CSNP/pages/9536380/Information+Security+TISAX); [Docusnap](https://www.docusnap.com/en/it-documentation/tisax-overview)
- A formal assessment requires the current official VDA ISA workbook and registration on the ENX portal. — [Docusnap](https://www.docusnap.com/en/it-documentation/tisax-overview)

**ISO 27001**
- First-year cost for a startup is about EUR 10k to 25k. One example (25 staff, AWS, one site) comes to EUR 30k to 40k: about EUR 10k for a platform, about EUR 10k for the audit, plus internal time. Surveillance audits from year 2 cost about EUR 4k to 7k a year. — [SECJUR, ISO 27001 Kosten](https://www.secjur.com/blog/iso-27001-kosten); [Kertos](https://www.kertos.io/en/compliance-hub/iso-27001-cost)
- Time: 3 to 4 months with a compliance platform, 9 to 12 months with a classic consultant. Startups under 50 staff with a clean cloud stack land at the fast end. — [Sprinto, ISO 27001 timeline](https://sprinto.com/de/hub/iso-27001-timeline/); [Secfix startup guide](https://de.secfix.com/secfix-guides/iso-27001-guide-for-startups)

**SOC 2**
- First SOC 2 Type II engagement: estimates range from about USD 30k to 110k for 10 to 200 staff. The auditor invoice is only about 40% of total spend. A Type II needs an observation window of at least 6 months, so 9 to 18 months end to end. A Type I takes about 8 to 22 weeks. — [Beancount SOC 2 guide](https://beancount.io/blog/2026/05/11/soc-2-type-ii-saas-startups-trust-services-criteria-audit-cost-six-month-observation-window-first-examination-guide); [GetAgency](https://blog.getagency.com/articles/soc-2-type-i-vs-type-ii-cost-timeline-comparison); [Decryption Digest](https://www.decryptiondigest.com/blog/soc2-type2-first-time-startup-guide)

**BSI C5**
- C5 is an attestation under ISAE 3000 (Revised), not a certification. Private audit firms set the fees. — [Qovery](https://www.qovery.com/blog/bsi-c5-attestation-for-saas-selling-in-germany); [ingenieur.de](https://www.ingenieur.de/technik/fachbereiche/ittk/was-ist-die-c5-zertifizierung-und-was-kostet-ein-c5-testat/)
- Since 1 July 2025 the BSI requires proof of a C5 Type 2 attestation, which covers the effectiveness of controls over a period. — [Rödl & Partner](https://www.roedl.com/insights/bsi-c5-etablierung-branchenuebergreifender-standard-cloud-security/)
- Cost: a gap analysis costs EUR 5k to 25k ([ingenieur.de](https://www.ingenieur.de/technik/fachbereiche/ittk/was-ist-die-c5-zertifizierung-und-was-kostet-ein-c5-testat/)). One vendor blog claims EUR 200k to 500k per audit and 3 to 9 months, but gives no source ([Legiscope](https://www.legiscope.com/blog/bsi-c5-cloud-computing-kriterien.html)). Critics call C5 a market-entry barrier for smaller providers ([ingenieur.de](https://www.ingenieur.de/technik/fachbereiche/ittk/was-ist-die-c5-zertifizierung-und-was-kostet-ein-c5-testat/)).

### Inferences
- **Ladder:** TISAX AL2 and ISO 27001 belong at "imitable at a cost". They take 3 to 12 months and roughly EUR 15k to 60k for a team of under 20 people. That is a hygiene threshold, not a durable advantage. They also only matter if NextUp handles data the OEM classifies as confidential or above, which idea texts and project data at an OEM almost certainly are.
- The real time cost is the calendar. A competitor who starts after NextUp's pilot is roughly 6 to 12 months behind on the label, which is about one OEM budget cycle. The gate also cuts both ways: until NextUp holds a label, it is blocked from RFQs too.
- **AL3 versus AL2:** AL3 needs an on-site audit and costs more. It would only be needed if NextUp touched prototype data, which is unlikely for idea management.
- C5 and SOC 2 Type II are slower, at 9 to 18 months, and more expensive. In DACH automotive they are rarely demanded of an application vendor; they matter mainly for hyperscalers and public sector. Low priority unless a customer asks.
- **VDA ISA self-assessment:** this is the free first step, a workbook download plus internal effort of weeks, so it is easy to imitate. It signals maturity, but most OEM departments demand a TISAX label, not a self-assessment.

### Gaps
- No official ENX or VDA figure for typical calendar time per assessment level. The durations above come from consultancies.
- No source confirming whether the VDA ISA workbook is free in its current version (6.x). This is believed true but was not verified this session.
- No reliable BSI C5 cost for a small SaaS. The figures conflict and are unsourced.
- No verified current VW, BMW or Mercedes supplier-portal document stating which label each requires from a SaaS vendor.

## 2. Works-council agreement (Betriebsvereinbarung) and DPIA as switching costs

### Takeaway
A signed Betriebsvereinbarung (BV) for a specific IT system is among the slowest assets to recreate. Documented approval times at a large German group run 12+ months for complex systems (Microsoft 365 as the example), 6 to 8 months once routines mature, and about 3 months for simple systems. A rival tool would need its own BV annex, which makes the existing agreement a real switching cost for the customer. Ladder position: "difficult to imitate" for a competitor at an existing account. It is not unique to NextUp across the market, though, because every vendor can go through the same process at a new account.

### Cited Findings
- AI or IT systems that are objectively suitable for monitoring employee behaviour or performance trigger co-determination under § 87 Abs. 1 Nr. 6 BetrVG, even without any intent to monitor. The employer may not introduce the system without works-council consent. If the parties cannot agree, the Einigungsstelle (conciliation board) decides. — [KI-Syndikat](https://www.ki-syndikat.de/fuer-unternehmen/betriebsvereinbarung-ki/); [CMS](https://cms.law/de/deu/legal-updates/ki-transformation-und-betriebsrat-mitbestimmung-richtig-gestalten)
- § 90 Abs. 1 Nr. 3 BetrVG requires the employer to inform the works council and consult it as soon as AI use is planned. The council can demand a works agreement. — [Human Resources Manager, Copilot](https://www.humanresourcesmanager.de/arbeitsrecht/microsoft-365-copilot-was-arbeitsrechtlich-zu-beachten-ist/)
- **Hans-Böckler-Stiftung portrait of Heidelberg Materials (Oct 2023):** under the group IT framework agreement, approval times fell from at least 12 months for complex systems (e.g. Microsoft 365) to 6 to a maximum of 8 months, and to 3 months for simpler IT systems. A complex system can need up to 5 negotiation meetings per month. A separate group agreement on communication systems had been under negotiation for 3 years. — [Hans-Böckler-Stiftung, Betriebs- und Dienstvereinbarungen Nr. 033](https://www.boeckler.de/fpdf/HBS-008714/p_mbf_bvd_portrait_33_2023.pdf)
- A company-wide Microsoft 365 rollout falls to the Gesamtbetriebsrat (group works council), not local councils, because several sites are affected. A company-wide rollout like this is also subject to § 87(1) No. 6 (LAG Köln, 9 TaBV 28/20, May 2021). — [betriebsrat.de](https://www.betriebsrat.de/rechtsprechung/br/urteil/einfuehrung-von-microsoft-365-zustaendigkeit-des-gesamtbetriebsrats); [Advant Beiten](https://www.advant-beiten.com/en/news/lag-koeln-zur-mitbestimmung-von-microsoft-office-365)
- Practice advice is a framework BV with system-specific annexes, so not every new tool is negotiated from scratch. — [Skill Sprinters](https://skill-sprinters.de/blog/compliance/betriebsrat-ki-mitbestimmung/)
- One reported case had an AI project stopped by a works-council objection after six weeks. — [KI-Syndikat blog](https://www.ki-syndikat.de/blog/202602/ki-und-betriebsrat-mitbestimmung-bei-ki-einfuehrung/)

### Inferences
- **For NextUp:** an idea-to-decision platform processes named employee submissions and scores them, and idea management (betriebliches Vorschlagswesen) is itself a co-determination topic under § 87 Abs. 1 Nr. 12 BetrVG. Expect a BV, or an annex to an existing idea-management BV, plus a DPIA before rollout beyond a pilot. The § 87(1) Nr. 12 point is legal background knowledge, not sourced this session.
- **Switching cost:** once NextUp is written into the annex, a challenger must restart the 3 to 12+ month process at that customer, while the customer's HR, works council and data-protection officer must be convinced again. That is the strongest account-level lock-in available to a young vendor. It is socially complex in Barney's sense, because it rests on trust relationships with a specific works council.
- **The flip side:** the same process delays NextUp's own rollout. A pilot can often run under a narrower pilot or test-phase arrangement, but the full BV is a pilot-to-rollout bottleneck.
- Many OEMs already have an idea-management BV for an incumbent system. NextUp may only need an annex or amendment, which is shorter, or it may face resistance to changing a working arrangement.

### Gaps
- No source specifically on automotive OEM BV durations for idea-management or AI tools at VW, BMW or Mercedes.
- No source on typical DPIA (DSFA) duration or cost. The DPIA is normally done by the customer's data-protection officer with vendor input, in weeks to a few months, but this was not verified.
- No quantitative evidence that a BV measurably lowers churn.

## 3. Supplier onboarding, procurement cycles, pilot to rollout

### Takeaway
Getting from first contact to a supplier number and first PO at an OEM is a multi-month process, shortened by venture-client programmes. BMW Startup Garage, for example, issues a supplier number and first PO for a pilot of about 4 months. Pilot to rollout typically adds 6 to 18 months. Having a supplier number and completed onboarding is "imitable at a cost": a competitor needs time (months), not much money.

### Cited Findings
- Through BMW Startup Garage (a venture-client model), a selected startup is guided through purchasing, gets an official supplier number and its first purchase order, and BMW buys a first unit of the product rather than equity. The pilot runs about 4 months. Follow-up orders come after success. The programme has run pilots with 280+ startups from 26 countries. — [BMW Startup Garage](https://www.bmwstartupgarage.com/en/benefits-and-program.html); [BMW Group](https://www.bmwgroup.com/en/innovation/open-innovation/startup-garage.html)
- An older BMW release said about 20 startups had become regular suppliers after their pilot. The figure may be outdated. — [BMW Group press](https://www.press.bmwgroup.com/global/article/detail/T0402335EN/)
- Generic enterprise software takes 6 to 12 months from serious evaluation to signature, and 12 to 18+ months with complex integration, security review or a large buying committee. The adopt/expand phase, from pilot to wider rollout, falls in months 6 to 18+. — [Pedowitz Group](https://www.pedowitzgroup.com/how-long-are-enterprise-software-journeys)
- Enterprise (USD 100k+) deals take 90 to 180+ days in 2026 benchmarks. — [Prospeo](https://prospeo.io/s/saas-sales-cycle)

### Inferences
- An end-to-end path for a startup at a German OEM is plausibly: pilot via an innovation unit (about 4 months) → TISAX plus BV plus DPIA plus procurement framework (6 to 12 months) → department or site rollout → group rollout (12 to 24+ months). These are generic SaaS benchmarks combined with the BMW data, not OEM-measured.
- A paid PoC via a venture-client unit is typically a small first order. Its main value is the supplier number and the internal sponsor, not the revenue.
- The onboarding itself is replicable. The internal champion network built during the pilot is less so, because it is socially complex.

### Gaps
- No public data on typical paid PoC sizes in EUR at VW, BMW or Mercedes, and none on Startup Autobahn PoC economics.
- No verified VW Group supplier platform (One.KBP) onboarding duration for software vendors.
- No OEM-specific pilot-to-rollout conversion rate, beyond BMW's old "about 20 regular suppliers" figure.

## 4. Reference customers, logos and ecosystem network effects

### Takeaway
References and peer validation are among the strongest buying inputs in B2B software, and in a concentrated, interconnected industry like German automotive, one OEM logo opens Tier-1 doors. A first OEM reference is "difficult to imitate" because it takes time: one full pilot-plus-rollout cycle of 12 to 24 months that cannot be bought. Ecosystem memberships (Catena-X, idea-management associations) are "easy to imitate", requiring only a fee.

### Cited Findings
- Demos, free trials, firsthand experience and peer reviews remain the most influential inputs when buyers narrow and commit (TrustRadius 2026, reported secondhand). Analyst-report use fell to 13%. — [MarketScale](https://www.marketscale.com/industries/software-and-technology/94-of-b2b-buyers-fact-check-ai-research-and-peer-reviews-still-close-the-deal)
- 86% of software buyers use peer review sites (G2, 2021). Lack of customer references and reviews ranked among the top four obstacles to good software decisions. — [G2 2021 Buyer Behavior](https://company.g2.com/news/state-of-software-buying-buyer-behavior-report-2021)
- 67% of buyers rated reviews "very important" and 41% case studies (Demand Gen Report 2017, TrustRadius data). — [Demand Gen Report](https://www.demandgenreport.com/industry-news/new-research-86-of-b2b-software-buyers-rely-on-third-party-reviews-when-making-a-purchase-decision/7019/)
- **Catena-X:** associate membership costs EUR 5,000 a year for legal entities (2025 application form). The association has about 195 to 197 members (mid-2026), while 1,069 participants were exchanging data by Sept 2026. A BMWE-backed Data Space Accelerator pays SMEs up to EUR 30k (EUR 15k for the entry use case) to join in 2026. — [Catena-X membership application](https://catena-x.net/wp-content/uploads/2025/06/Catena-X_Antrag-auf-Mitgliedschaft_Application-for-Membership.pdf); [Automotive Logistics](https://www.automotivelogistics.media/supply-chain/more-thannbsp1000-oems-and-suppliers-now-exchanging-data-through-catena-x-network/2746686); [Cofinity-X](https://www.cofinity-x.com/blog/data-space-accelerator-helps-smes-join-catena-x-with-up-to-eu30-000)
- **Idea-management community:** about 40 companies, many of them DAX firms, presented their programmes at Zentrum Ideenmanagement, which runs its own ZI Awards (Siemens won in 2018). The Deutsches Institut für Ideen- und Innovationsmanagement awards the Deutscher Ideenmanagement Preis. Automotive supplier DRÄXLMAIER has won the main category "Best Ideas Management" twice. — [Siemens press](https://assets.new.siemens.com/siemens/assets/api/uuid:d37ee2ee-bee9-4de2-aa80-65c217547c23/PR2018030184COEN.pdf); [DRÄXLMAIER](https://www.draexlmaier.com/en/news/detail/draexlmaier-wins-the-german-idea-management-award)
- Established DACH idea-management vendors already exist. Trevios (enobis, since 2007) is listed for automotive suppliers with entry pricing from EUR 15,000 plus VAT. — [Softguide](https://www.softguide.de/programm/trevios-software-fuer-ideenmanagement-innovationsmanagement)

### Inferences
- The idea-management community (ZI, dib, award juries) is a tight peer network of corporate idea managers. A case study presented there, such as "OEM X cut decision time from N months to N weeks", spreads to exactly the buyer persona. Award entries are submitted by the customer company, so NextUp benefits indirectly when a customer wins with its system.
- A logo is only a moat while it is exclusive or early. Incumbents like Trevios and Planview, and HR/innovation suites, already hold logos. NextUp's edge would be the first *AI idea-to-decision* reference at an OEM, a time-based (first-mover) advantage.
- Catena-X membership is cheap and open, and adds little defensibility for an idea-management tool that does not exchange supply-chain data. Ladder: easy to imitate.

### Gaps
- No automotive-specific survey on how much OEM and Tier-1 IT/procurement rely on references.
- No authoritative Zentrum Ideenmanagement or dib member list, and no data on automotive membership.
- No verified client lists of incumbent idea-management vendors at OEMs (e.g. HYPE Innovation, which was searched without results).

## 5. Integration depth and accumulated data as switching costs

### Takeaway
Enterprise software keeps customers better than SMB software, with about 4 to 6% annual gross churn for enterprise versus 11 to 13% for SMB. Customers with the highest contract values have the highest gross retention. Integrations (SAP, M365/Entra, Jira) and accumulated company data (idea history, routing tables, measured outcomes) drive this, but after one pilot they are thin. They become "difficult to imitate" only after years of use. At the end of a pilot they are "imitable at a cost".

### Cited Findings
- KeyBanc/Sapphire 2025 Private SaaS survey: gross retention near 90%, net retention above 100%. The 2024 edition reported about 90% GRR and about 101% NRR. — [Sapphire Ventures](https://sapphireventures.com/press/keybanc-capital-markets-and-sapphire-ventures-private-saas-company-survey-reveals-a-continued-focus-on-operational-efficiency-and-profitability/); [StockTitan](https://www.stocktitan.net/news/KEY/private-saas-company-survey-reveals-ai-driven-transformation-and-hlzp1ug1t8z8.html)
- SaaS Capital 2025: median NRR of 102% at USD 25k to 50k ACV (top quartile 111%), and "companies with the very highest ACVs have the highest gross retention". — [SaaS Capital](https://www.saas-capital.com/research/saas-retention-benchmarks-for-private-b2b-companies/)
- ChartMogul 2025 data, via an aggregator and not verified against the original: annual gross churn is 11 to 13% for SMB, 6 to 8% for mid-market and 4 to 6% for enterprise (500+ employees). Chargebee gives GRR of 85 to 90% for SMB and 90 to 95% for enterprise. — [Genesys Growth](https://genesysgrowth.com/blog/saas-churn-rates-stats-for-marketing-leaders); [Chargebee](https://chargebee.com/resources/glossaries/what-is-customer-retention/)
- OpenView 2025: median GRR 89%, top quartile 94%. — [Growth Unhinged / Kyle Poyar](https://kylepoyar.substack.com/p/2025-saas-benchmarks-report)

### Inferences
- **Integrations:** SSO via Entra and Jira or M365 connectors are technically commoditised, at weeks of engineering each, and every competitor can build them. SAP integration at an OEM takes longer, because it needs customer IT, interface approval and sometimes its own BV, so it is stickier. The switching cost lies less in the code than in the customer-side approvals and IT tickets needed to wire it in.
- **Accumulated data:** idea history, routing tables (who decides what), evaluation weights and measured outcomes (savings per implemented idea) are specific to the customer and grow with time. This is path dependence and causal ambiguity in Barney's terms. A newcomer cannot buy two years of calibrated routing and outcome data. But after a 3 to 4 month pilot the dataset is small, and the customer may demand export (GDPR and contract), so data lock-in is weak early on.
- AI features themselves (LLM scoring, summarisation) are easy to imitate. Every competitor has access to the same foundation models.

### Gaps
- No primary-source enterprise GRR split. The ChartMogul segment figures are secondhand.
- No evidence specific to idea-management or innovation-software churn.
- No quantified cost to migrate idea history between idea-management systems.

## 6. Team, culture, speed and university or accelerator networks (framework: Barney 1991 / VRIO)

### Takeaway
Under the resource-based view, the hardest things to imitate are path-dependent, causally ambiguous or socially complex. For NextUp these are the trust relationships built during the pilot (champions, works council, data-protection officer), the team's iteration speed and culture, and outcome data over time. Network resources such as CODE University Berlin and NextHub are valuable for access but open to others, so they are "imitable at a cost". Shipping speed alone is easy to imitate for well-funded rivals, though the combination of speed with domain knowledge is harder.

### Cited Findings
- Barney (1991), "Firm Resources and Sustained Competitive Advantage", Journal of Management 17(1): 99–120, names three sources of imperfect imitability. Unique historical conditions (path dependence) make a resource unavailable to rivals who lack that history. Causal ambiguity means imitators cannot tell which factors create the advantage. Social complexity covers relationships, culture and networks that are hard to reproduce. — [VRIO, Wikipedia](https://en.wikipedia.org/wiki/VRIO); [AUA lecture on capabilities](https://oeclass.aua.gr/eclass/modules/document/file.php/5565/Lecture%203%20cababilities%20and%20dynamic%20capabilities.pdf)
- VRIO: a resource gives sustained advantage only if it is Valuable, Rare, Inimitable and the firm is Organised to exploit it. The VRIO label was popularised in 1995 and later Barney & Hesterly texts. — [VRIO, Wikipedia](https://en.wikipedia.org/wiki/VRIO)

### Inferences
- **Suggested ladder for NextUp at the end of the first pilot:**
  - **Cannot be imitated:** none in the strict sense. The closest is unique history, such as being the first AI idea-to-decision tool in a given OEM's works-council annex, with the pilot relationships that come with it. That history is unique to the account but can be repeated at other accounts.
  - **Difficult to imitate:** a signed BV or annex plus DPIA at the customer (3 to 12+ months to redo, socially complex), the first OEM reference with measured outcomes (12 to 24 months, path-dependent), and the internal champion network.
  - **Imitable at a cost:** TISAX AL2 (3 to 12 months, about EUR 15k to 60k), ISO 27001 (3 to 6 months, about EUR 10k to 25k), SOC 2 Type II (9 to 18 months, USD 30k to 110k), supplier number and procurement onboarding (months), the SAP integration, accumulated data after a short pilot, university and accelerator network access.
  - **Easy to imitate:** LLM features, UI, Jira/M365/SSO connectors, VDA ISA self-assessment, Catena-X associate membership (EUR 5k), raw shipping speed.
- **CODE University and NextHub:** provide talent, mentors and possibly warm OEM introductions. They are valuable but not rare, because other startups use the same or similar networks (Berlin has many). Their imitability depends on personal relationships, which are socially complex but transferable.

### Gaps
- No empirical study measuring how long team or culture advantages last for B2B startups.
- Barney 1991 was cited via secondary summaries. The original wording was not checked this session.
- No source quantifying the value of CODE University or NextHub networks in automotive sales.
