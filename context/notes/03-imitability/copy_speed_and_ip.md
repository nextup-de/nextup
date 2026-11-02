# Copy speed of B2B SaaS in 2025-2026 (AI coding agents) and legal protection for a small DE/CH startup

Context: judging how fast a competitor could replicate NextUp (idea-capture chat coach, deterministic scoring, routing with deadlines, Kanban, before/after measurement, Jira/M365/Entra integrations, per-customer Docker deployment). Researched 2 Nov 2026. About 17 tool calls; mostly search snippets plus one fetched page. Items marked "(not fetched)" come from well-known primary legal texts whose URLs are given but which I did not open in this session, so check them before quoting.

## Q1. How fast does AI-assisted development make building, or cloning, an app like this (2025-2026 evidence)?

### Takeaway
Agents can now produce a working functional clone of a CRUD/workflow SaaS in days to a few weeks. The controlled evidence on real productivity gains is much weaker and mixed: one RCT measured a 19% slowdown, the follow-up is inconclusive, and DORA calls AI an "amplifier". Security, integration and compliance hardening do not speed up nearly as much as feature code does.

### Cited Findings
- METR RCT (published 10 Jul 2025): 16 experienced open-source developers did 246 real tasks in their own large repos (22k+ stars, 1M+ LOC). With AI they took about **19% longer**, although they had expected a 24% speedup and afterwards believed they had been 20% faster. METR warns against generalizing from it. — [METR](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/); [InfoQ](https://www.infoq.com/news/2025/07/ai-productivity)
- METR follow-up (Feb/Mar 2026 update, experiment started Aug 2025). METR itself calls the signal unreliable because many developers refused to work without AI. Secondary coverage reports about **+18% speedup** for 10 returning developers, with a CI wide enough to include a slowdown, and about +4% for new recruits. — [urandom.io summary](https://urandom.io/blog/2026-03-01-ai-made-developers-slower-then-december-happened); [codercops summary](https://blog.codercops.com/blog/ai-coding-productivity-2x-not-10x-metr-2026). Secondary only, and sign conventions differ between sources.
- DORA 2025 "State of AI-assisted Software Development" (23 Sep 2025, about 5,000 respondents): about 90% use AI at work, a median of about 2 h/day. AI adoption is now linked to **higher delivery throughput**, which reverses 2024. Only a small share report high trust in AI output. AI "amplifies" existing strengths and weaknesses: loosely coupled architectures with fast feedback gain, tightly coupled systems with slow processes see little benefit. — [Google blog](https://blog.google/technology/developers/dora-report-2025/); [dora.dev](https://www.dora.dev/research/ai); [InfoQ](https://www.infoq.com/news/2025/09/dora-state-of-ai-in-dev-2025)
- Anthropic internal study (2 Dec 2025, data from Aug 2025; survey of 132 engineers, 53 interviews, usage data): Claude is used in 59% of work, up from 28% a year earlier. Self-reported productivity is about **+50%**, up from +20%. **+67% merged PRs per engineer per day** after Claude Code was adopted across engineering. Anthropic notes that PRs are an imperfect proxy and that the gains are self-reported. — [Anthropic](https://www.anthropic.com/research/how-ai-is-transforming-work-at-anthropic)
- Claim that more than 80% of code merged at Anthropic was written by Claude as of May 2026. Seen only in secondary write-ups. — [cryptobriefing](https://cryptobriefing.com/anthropic-claude-generates-80-percent-code/) (unverified)
- Explicit cloning: Geoff Huntley used his "Ralph" loop around Claude Code to clone commercial and open-source products. He estimates agentic coding costs about **US$10 per compute hour** and warns that startups can cheaply copy SaaS features (reported 27 Jan 2026). — [LetsDataScience](https://letsdatascience.com/news/developer-automates-coding-assistants-to-clone-software-ba267e3e)
- Anecdotal "weekend SaaS" builds: auth, Stripe billing and dashboard in about 8 h for about $12 in API cost (self-reported, promotional). The same source puts the cost of building those standard SaaS features by hand at $35k-80k. — [buildthisnow](https://www.buildthisnow.com/blog/build-this-now/build-a-saas-with-claude-code)
- Market reaction ("SaaSpocalypse"): a software-stock sell-off in early Feb 2026, linked to Anthropic's agent launches. Estimates range from about $285bn in one day to about $1tn over the period. The thesis is that agents remove the production bottleneck that made buying better than building. Counter-voices: compliance, security and integrations "often take years", and enterprise software spend still grew about 15% in 2026. — [TechCrunch](https://techcrunch.com/2026/03/01/saas-in-saas-out-heres-whats-driving-the-saaspocalypse/); [philippdubach](https://philippdubach.com/posts/the-saaspocalypse-paradox/); [longangle](https://www.longangle.com/alts-education/software-ai)
- Limit, security: Veracode GenAI Code Security Report (30 Jul 2025; 80 tasks, 100+ LLMs). AI code introduced vulnerabilities in **about 45%** of tasks, Java above 70%, XSS defence failed in 86% of samples. Security did not improve as models got better at syntax. This is a vendor study. — [Veracode press release](https://www.veracode.com/press-release/ai-generated-code-poses-major-security-risks-in-nearly-half-of-all-development-tasks-veracode-research-reveals/); [Help Net Security](https://www.helpnetsecurity.com/2025/08/07/create-ai-code-security-risks/)
- Build-vs-buy caution: aggressive in-house building can create "AI debt" and rising AI costs, and many builders will end up with "remorse". — [CIO](https://www.cio.com/article/4189693/how-ai-agents-are-shaping-the-future-of-work.html)

### Inferences
- **New startup with AI agents (attacker 2):** a functional look-alike of the UI and workflow (chat coach, Kanban, scoring, deadlines) is plausibly **1-4 weeks** for 1-2 competent people. Huntley-style loops and the weekend-build anecdotes support days for the CRUD core. Entra SSO, Graph/M365, Jira sync, per-tenant Docker ops, a security review that passes, and tuned prompts and scoring that work on real company ideas plausibly add **2-6 months**. That is an estimate from the evidence above; no source measures this exact case.
- **Customer's own IT (attacker 3):** can now prototype a narrow internal version quickly. DORA's "amplifier" finding and the build-remorse commentary suggest big automotive IT with tightly coupled processes will be slow to turn a prototype into a maintained tool, and the cheap prototype is the threat that weakens NextUp's pricing power.
- The METR result shows perceived speed overstates real speed by about 40 points. Competitors' "we can build that in a week" claims should be discounted.

### Gaps
- No peer-reviewed measurement of end-to-end "clone an enterprise SaaS" time. All clone timelines are anecdotal.
- METR's May 2026 self-reported-impact report is cited by one source, but I could not verify its contents.
- The GitHub Copilot RCT (2023, about 55% faster on a toy HTTP-server task) is widely cited but was not re-checked in this session.

## Q2. How fast do incumbents copy a rival feature, and what is known about HYPE, Qmarkets and rready?

### Takeaway
Historically a well-resourced incumbent matched a category-defining product in about 2-3 years and won through bundling (Teams vs Slack). For AI features in 2024-2025, fast-follow happens within weeks to months (Copilot vs Cursor). The innovation-management incumbents already market embedded AI. Their exact release cadence is not public.

### Cited Findings
- Teams launched March 2017 as Microsoft's answer to Slack. In July 2019 it reported 13M DAU, above Slack's last figure of "more than 10M", then 20M (Nov 2019) and 75M (Apr 2020). It was free inside Office 365, and Gartner said "Office 365 bundling helps Teams enormously". — [Computerworld](https://www.computerworld.com/article/1670558/microsoft-teams-now-has-13m-daily-active-users-outpacing-rival-slack.html); [GeekWire](https://www.geekwire.com/2019/heres-many-people-use-microsoft-teams-every-day-compares-rival-slack/); [The Register](https://www.theregister.com/2019/10/11/slack_microsoft_teams)
- AI fast-follow: by Feb 2025 a reviewer saw "almost no difference in functionality" between Copilot and Cursor, as Copilot's agent mode arrived. Both shipped agent mode, MCP support and the same frontier models "within weeks of each other". — [Kinto Technologies blog](https://blog.kinto-technologies.com/posts/2025-02-25-cursor-vs-copilot); [DataCamp](https://www.datacamp.com/zh/blog/cursor-vs-github-copilot)
- Platform absorption: one secondary source claims OpenAI absorbed four "wrapper" categories in 18 months. — [hatchworks](https://hatchworks.com/blog/gen-ai/ai-wrapper-product-strategy/) (secondary, unverified)
- Qmarkets: "Next-Gen AI" innovation-management capabilities, AI features rolled out gradually with beta testing in 2024. It has had a "similar idea" engine and automated clustering for longer. — [Qmarkets news](https://qmarkets.net/resources/news/introducing-next-gen-ai-innovation-management/); [Qmarkets AI features 2024 video](https://www.qmarkets.net/he/resources/video/ai-features-2024-video/)
- HYPE Innovation: 2025 messaging says AI should be "more than a bolt-on" and is embedded across the platform in a "secure, model-agnostic architecture". — [HYPE news](https://www.hypeinnovation.com/news/innovation-management-in-2025-ai-is-taking-over-but-thats-not-enough); [HYPE Enterprise AI](https://hypeinnovation.com/enterprise-ai-for-innovation-management)
- G2 already lists an "Agentic AI - Idea Management" comparison dimension for HYPE vs Qmarkets. — [G2](https://www.g2.com/compare/hype-innovation-vs-qmarkets-innovation-management)

### Inferences
- **Incumbent (attacker 1):** HYPE and Qmarkets already have idea capture, evaluation, routing, Kanban-like pipelines and enterprise SSO. Adding a chat-coach front-end and a deterministic score is a **one-to-two-release** job, plausibly **1-2 quarters** once they see demand. Their gating factor is prioritisation, not engineering capacity. Their AI marketing shows the feature category is already on their roadmaps.
- The incumbents' real weapon is the Teams lesson: an existing contract and installed base (bundling) beats a better point product, and that is aimed at NextUp's pilot customers.
- NextUp's differentiated pieces, before/after measurement tied to outcomes and on-prem per-company Docker, are less likely to appear quickly in multi-tenant incumbents. That is an inference; I did not check their deployment options.

### Gaps
- No public changelog or release cadence found for HYPE, Qmarkets or rready. rready had no hits at all.
- No primary dated data on Notion AI or Loom clone timelines. I did not research them further.

## Q3. What legal protection does a small DE/CH startup realistically have?

### Takeaway
Almost none against functional copying. Copyright covers only the code's expression, not the functionality, UI workflow or ideas (SAS v WPL). Software patents need a "further technical effect", which a business workflow app rarely has, and they cost years and five figures. Trade-secret protection exists only with documented "reasonable" secrecy measures and does not stop reverse engineering of a product made available. Trademarks are cheap and fast but protect only the name.

### Cited Findings
**Copyright**
- CJEU C-406/10 SAS Institute v WPL (2 May 2012): a program's **functionality, programming language and data-file formats are not protected** expression under the Software Directive. The AG warned that protecting functionality would "monopolise ideas". On remand ([2013] EWCA Civ 1482), WPL, which deliberately emulated SAS's functionality, did not infringe. — [Wikipedia summary](https://en.wikipedia.org/wiki/SAS_Institute_Inc_v_World_Programming_Ltd); [Fieldfisher](https://www.fieldfisher.com/en/insights/sas-institute-inc-v-world-programming-limited); [8 New Square](https://8newsquare.co.uk/sas-institute-inc-v-world-programming-ltd-2013-ewca-civ-1482/)
- Software Directive 2009/24/EC Art. 1(2): ideas and principles underlying any element of a program, including its interfaces, are not protected. — [EUR-Lex](https://eur-lex.europa.eu/eli/dir/2009/24/oj) (not fetched)

**Patents**
- EPO Guidelines G-II 3.6: programs are excluded "as such" unless they produce a **"further technical effect"** beyond normal electrical effects, such as control of a technical process or of the computer's internal functioning. Speed from a better algorithm alone is insufficient. Business methods are excluded under G-II 3.5.3 (Art. 52(2)(c) EPC). AI/ML is treated like maths methods (G-II 3.3.1). — [EPO G-II 3.6](https://epo.org/en/legal/guidelines-epc/2024/g_ii_3_6.html); [Solve Intelligence on 2025 Guidelines](https://www.solveintelligence.com/blog/post/epo-guidelines-2025)
- Guidelines are reportedly updated from April 2026 with the first formal AI guidance and G 1/23 and G 1/24 incorporated. The Guidelines do not bind the Boards of Appeal. — [Solve Intelligence](https://www.solveintelligence.com/blog-posts/epo-guidelines-2025) (secondary)
- Time: the EPO grant procedure takes "about two to four years from filing". — [EPO Guide for applicants](https://www.epo.org/en/legal/guide-epc/2024/ga_c2_4_3.html)
- Cost: about €5-10k filing to grant excluding attorney fees and validation ([iamip](https://iamip.com/understanding-patent-lifetimes-and-costs-in-2025/)), about £19k including drafting and service fees ([ttconsultants](https://ttconsultants.com/?p=37824)). EPO fees rose about 5% on 1 Apr 2026, for example the search fee from €1,520 to €1,595 ([Mondaq](https://www.mondaq.com/uk/patent/1765740/increases-in-official-fees-at-the-epo-effective-1-april-2026)). Micro-entities get a **30% reduction** on main fees if they filed fewer than 5 applications in 5 years ([EU IP Helpdesk](https://intellectual-property-helpdesk.ec.europa.eu/news-events/news/reduced-fees-european-patent-applications-small-and-medium-sized-entities-2024-04-11_en)).
- Switzerland can be covered through a European patent; the IGE explains the EP route. — [IGE](https://www.ige.ch/en/protecting-your-ip/patents/before-you-apply/three-routes-to-patent-protection/european-patent-application)

**Trade secrets**
- EU Trade Secrets Directive 2016/943, implemented in Germany by the GeschGehG (2019): information is a trade secret only if it is subject to "reasonable steps" or "angemessene Geheimhaltungsmaßnahmen". — [EUR-Lex 2016/943](https://eur-lex.europa.eu/eli/dir/2016/943/oj) (not fetched); [GeschGehG §2](https://www.gesetze-im-internet.de/geschgehg/__2.html) (not fetched)
- GeschGehG §3(1) no. 2 permits obtaining a secret by observing, studying, disassembling or testing a product made publicly available or lawfully in the tester's possession (reverse engineering), unless contractually restricted. So whatever is visible in a demo or pilot instance is not protected. — [GeschGehG §3](https://www.gesetze-im-internet.de/geschgehg/__3.html) (not fetched; worth confirming)
- BAG 17 Oct 2024 (8 AZR 172/23): **no injunction**, because the claimant did not show "angemessene Geheimhaltungsmaßnahmen". The party claiming protection must **prove** its measures, and broad catch-all confidentiality clauses in employment contracts were held invalid. — [Haufe](https://www.haufe.de/id/entscheidung/bag-urteil-vom-17102024-8-azr-17223-HI16740137.html); [CMS "Catch-all = Lose-all"](https://cms.law/en/deu/legal-updates/catch-all-lose-all-eine-neue-gefahr-fuer-geschaeftsgeheimnisse)
- Measures need to be "angemessen", not optimal, judged case by case, and they must actually be lived in practice. OLG Stuttgart (2 U 575/19) stresses need-to-know. LAG Baden-Württemberg (Dec 2025) found technical safeguards insufficient relative to the information's claimed value. — [Noerr](https://www.noerr.com/de/insights/das-richtige-mass-ist-entscheidend); [Taylor Wessing](https://www.taylorwessing.com/de/insights-and-events/insights/2025/12/beschluss-landesgericht-baden-wuerttemberg-zu-geheimhaltungsmassnahmen)

**Trademarks**
- EUIPO: €850 for one class online, €50 for the 2nd class, €150 for each further class. The EUIPO SME Fund may reimburse part of it, reportedly up to 75%. — [harlander-partner](https://harlander-partner.eu/en/shop/official-fees-for-the-eu-trademark/); [Mondaq SME Fund 2026](https://www.mondaq.com/trademark/1772570/euipo-sme-fund-2026-reduce-trademark-costs-for-smes)
- Switzerland (IGE): filing fee CHF 450. Normal examination takes about 3-4 months, or about 6 months according to an IGE official. Expedited examination can register in about 6 working days. Protection lasts 10 years and is renewable. — [Swiss fee amendment](https://www.newsd.admin.ch/newsd/message/attachments/74520.pdf); [IPI explainer](https://www.ipi.ch/fileadmin/user_upload/schuetzen/marken/d/Erlaeuterung-VMP-d-2023.pdf); [law.ch](https://law.ch/lawnews/2020/03/vorgezogene-markenpruefung/); [Art. 10 MSchG](https://www.droit-bilingue.ch/de-en/2/23/232.11-10-13.html)
- DPMA: see the fee page. I did not confirm the commonly quoted €290 for up to 3 classes online in this session. — [DPMA fees](https://dpma.de/english/services/fees/trademarks/index.html)

**Database right**
- Database Directive 96/9/EC sui generis right: it protects substantial investment in obtaining, verifying or presenting a database's contents, and only against extraction or re-use of substantial parts. It would cover a curated idea or benchmark dataset, not app features. — [EUR-Lex 96/9/EC](https://eur-lex.europa.eu/eli/dir/1996/9/oj) (not fetched)

### Inferences
- For a pre-revenue startup the realistic package is:
  1. Trademark the name now: CH plus EU, about CHF 450 plus €850-900, fast and cheap, with possible SME Fund refunds.
  2. A trade-secret hygiene file: NDAs with pilot customers and team, need-to-know repo access, documented access controls, and no catch-all clauses. This protects prompts, scoring weights, tuned rubrics and customer data, but not anything visible in the running product.
  3. Contractual protection in pilot and licence agreements: no reverse engineering, no benchmarking or competing development, confidentiality of demo material, and IP ownership of feedback. The contract, not IP law, is the main lever against attacker 3, the customer's IT.
  4. Copyright arises automatically and only stops literal code copying. That matters because on-prem Docker images ship the code to the customer, so licence terms and obfuscation matter.
  5. A patent is low-value: a workflow, scoring and routing app is near the business-method exclusion, and it takes 2-4 years and €10-20k+ per family. It is only worth it if a genuinely technical mechanism exists, for example in deployment or data handling.
- None of these stop attacker 1 or 2 from re-implementing the same functionality independently.

### Gaps
- Swiss trade-secret law (Art. 6 UWG, Art. 162 StGB) and the Swiss reverse-engineering position were not researched.
- No case data on enforcement cost or duration of GeschGehG litigation for small firms.
- The text of the April 2026 EPO Guidelines on AI was not retrieved.
- The DPMA fee and DPMA, EUIPO and IGE pendency statistics were not verified.

## Q4. Which parts of enterprise software are empirically hard to copy?

### Takeaway
The code is easy to copy. What resists copying is everything around it: security reviews and certifications, procurement cycles, integrations proven in a customer's tenant, reference customers, accumulated data and workflow embedding. VC frameworks in 2025-2026 agree that "AI wrapper" status is only fatal without workflow ownership, data or distribution.

### Cited Findings
- Enterprise buying cycles run 6-12 months, and 12-18+ months for complex, regulated or integrated purchases ([Pedowitz Group](https://www.pedowitzgroup.com/how-long-are-enterprise-software-journeys)). The Forrester average enterprise cycle rose from 6.4 months (2015) to 9.3 months (2023), as cited by [andrewjturner](https://andrewjturner.substack.com/p/the-9-month-reality-of-enterprise) (secondary).
- About 83% of buyers require a security or privacy assessment before buying software (G2 survey via [Help Net Security](https://www.helpnetsecurity.com/?p=199542)). A claim that enterprise clients spend an average of 3.2 months on security and compliance reviews could not be verified ([cyberbase.ai](https://cyberbase.ai/blog/enterprise-saas-deal-acceleration)).
- ISO 27001 takes about 3-6 months for prepared startups under 50 staff and 9-12 months from scratch ([Secureframe](https://secureframe.com/en-us/hub/iso-27001/certification-timeline); [ISMS.online](https://www.isms.online/iso-27001/certification/how-long-does-certification-take/)). SOC 2 Type II takes 6-12 months and is "table stakes" for enterprise sales ([Gupta](https://guptadeepak.com/ebooks/cybersecurity-entrepreneur/enterprise-sales-security/)). These are vendor sources.
- a16z: "There don't appear, today, to be any systemic moats in generative AI." Later a16z discussion says traditional moats still matter and separates differentiation from defensibility. — [a16z podcast, Casado and Wang](https://a16z.com/podcast/where-value-will-accrue-in-ai-martin-casado-sarah-wang); [podcast summary](https://podscripts.co/podcasts/a16z-podcast/why-ai-moats-still-matter-and-how-theyve-changed)
- Andrew Chen, "Revenge of the GPT wrappers": defensibility comes from classic sources such as network effects, workflow and distribution, not from the model. — [Andrew Chen](https://andrewchen.substack.com/p/revenge-of-the-gpt-wrappers-defensibility)
- NFX's position is that most startups start without moats and earn them over time. It is summarized secondarily. — [echai.ventures](https://echai.ventures/how-founders-use-ai/ai-in-product/what-is-my-moat-if-i-m-building-on-someone-else-s-model)
- SignalFire argues for "permanence" (being embedded and relied on) over moats in AI startups. — [SignalFire](https://signalfire.com/blog/why-ai-startups-should-optimize-for-permanence-not-moats)
- SaaSpocalypse counterpoint: compliance, security and integrations "often take years". Firms will build narrow tools around proprietary data but keep buying systems for compliance and reliability. — [TechCrunch](https://techcrunch.com/2026/03/01/saas-in-saas-out-heres-whats-driving-the-saaspocalypse/); [ZS](https://zaidyn.zs.com/blogs/future-enterprise-software-ai)

### Inferences
- Rough time-to-parity by layer (author's estimate, built from the findings above):

  | Layer | Time to copy |
  |---|---|
  | UI and workflow | days to weeks |
  | Integrations working in a real customer's Entra, M365 and Jira tenant | months |
  | ISO 27001 / SOC 2 and passing an OEM security review | 6-12 months |
  | Procurement and vendor onboarding at an automotive OEM | 6-18 months |
  | Reference customers with measured before/after outcomes | 1+ year, and cannot be shortcut |
  | Accumulated per-customer idea data and tuned scoring rubrics | grows with use |

- By attacker:
  - **Incumbents** already own the slow layers (certifications, procurement status, references), so they are the most dangerous copier even if they are slower to code.
  - **A new AI-native startup** copies the fast layers instantly but faces the same 6-18-month enterprise gate NextUp faces. NextUp's head start in pilots and procurement is its real lead.
  - **Customer IT** skips procurement but faces its own internal security and ops burden and the maintenance burden, which DORA and the "build remorse" commentary point to.

### Gaps
- No primary access to the NFX moats essay or to a16z's 2025 vertical-AI piece in this session.
- No empirical study measuring switching costs for innovation-management software specifically.
- No data on how often OEMs replace a piloted tool with an in-house build.
