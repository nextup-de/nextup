# NextUp: current product status (2 Nov 2026) mapped to 10 psychographic user traits

Sources are local and read-only. Repos were read at `origin/main` (Nextup at `51a8e43`, PR #297, 2 Nov 2026). Short names used in links:
- **N** = `B:/06_CODE/06_Projects/Startup_speed/repos/Nextup` (main app)
- **A** = `.../repos/nextup-admin`, **L** = `.../repos/nextup-landing`, **P** = `.../repos/plans/projects/nextup` (orch phase plans)
- **V** = `C:/Users/k_sch/Documents/obsidian_vault/03 Projekte`

Status words used below: **shipped-live** = merged and switched on; **shipped-off** = merged but behind a flag or off by default; **demo-only** = works only on demo-stage companies or in the static demo; **in progress** = an approved phase plan is running (2 Nov 2026); **planned** = only in a plan or roadmap.

Important framing: **NextUp has no real customer yet.** Every running company holds made-up data. The shared Hetzner box is demo-only by rule, and the product is being rebuilt for a first pilot with a company of 1,000 to 2,000 employees. — [N docs/SECURITY.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/SECURITY.md); [N docs/plans/2026-11-01_pilot-readiness.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/plans/2026-11-01_pilot-readiness.md); [V nextup – Security & Datenschutz](file:///C:/Users/k_sch/Documents/obsidian_vault/03%20Projekte/nextup/nextup%20–%20Security%20&%20Datenschutz.md)

## Q1: What are the main user flows today?

### Takeaway
The core loop is: **raise** (an idea in an AI-coached chat, or a problem) → **route** to the role that owns it → an **inbox with a 5-day clock** and a deputy fallback → **answer/decide**. After the decision come **discuss → project (Kanban) → measure at +30/+90 days → recognise**, which is built but off for real companies. The raise, coach, routing, inbox and login flows work. The clock only runs on demo companies, and several dashboards still show placeholder data.

### Cited Findings
**Product idea and core loop**
- The product's one-line pitch: "Who owns what, and what is waiting on whom." An employee develops an idea with an AI coach until it scores high enough to publish. It lands in the right leader's inbox with a clock, and management sees the "wait ledger". — [N README.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/README.md)
- The tagline is "Who owns this decision?" The promise is `promiseDays: 5`: an answer within 5 days, otherwise the case goes to the deputy. The original core loop was raise → inbox → answer, with the leader answering Yes / No + reason / Hand over / Ask. — [V nextup – Produkt & Vision](file:///C:/Users/k_sch/Documents/obsidian_vault/03%20Projekte/nextup/nextup%20–%20Produkt%20&%20Vision.md)

**Idea studio (`/[company]/raise`)**
- Layout: drafts on the left, the coach chat in the middle, score and actions on the right. Actions are Publish, Save as draft, Rename, Affected, Attach evidence, Already raised and Discard. — [N docs/IDEAS.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/IDEAS.md)
- The score has four benchmark bars, 0-100 each: Strategic fit, Impact & reach, Feasibility, Novelty & clarity. They are "Arithmetic over the author's own words and the company context, **never model output**". Every point names the fact behind it, and "chatting cannot talk the score up". — [N docs/IDEAS.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/IDEAS.md)
- The coach replies with what the benchmarks see, what they don't, and then **one** challenging question aimed at the weakest bar, saying why the decider will ask it. Suggested answers are re-scored before they are shown. — [N docs/IDEAS.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/IDEAS.md); memory note "raise one question" (16 Oct 2026)
- Where the stack runs the "brain" service, it does the grilling. It works through problem, context, evidence, impact, solution, risks and success, one question per turn, and surfaces earlier cases about the same problem. It never changes a number. — [N docs/IDEAS.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/IDEAS.md)

**Analysis dials and rail**
- The full analysis sits above the first reply: five dials (Value, Feasibility, Cost, Fit, Risk), what the AI found, advice (Approve / Pilot / Needs info), pattern, categories and similar ideas. Later replies show the dials as bars and one word (Strong/Medium/Weak) without numbers. — [N docs/IDEAS.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/IDEAS.md)
- A right-hand rail lists the five facts a decider needs: a number on the saving, who can decide it, a rough cost, the company goal, and a small first step. — [N docs/IDEAS.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/IDEAS.md)

**Publish and routing**
- Publish is available from the first answer on. The threshold (`publishThreshold`, default 70) only drives the advice. Before publishing, the author picks from 2-3 suggested receivers. Each has a match % built only from listed facts: routing keyword, org position, spend authority, and answering recent cases on time. The router's own proposal is kept in the payload. — [N docs/IDEAS.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/IDEAS.md)
- The brain can propose the routing row and answer "raised before?". It gets owners' roles and departments, never names, and redacted text. If it doesn't answer in time, the keyword row is used. — [N docs/IDEAS.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/IDEAS.md)

**Raise-page assistant (Bedrock)**
- The assistant answers from company knowledge before anything is raised: "who handles this, what already exists, which goal it touches". If that solves it, nothing is raised. Otherwise "Raise it anyway". — [N docs/ASSISTANT.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/ASSISTANT.md)
- Status: the assistant on Bedrock is **off**, because no stack has an AWS account. The brain (route, coach, plan, check-in) is **live on demo** on a shared CPU server rated for about 10 users. — [N pilot-readiness.md, "AI"](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/plans/2026-11-01_pilot-readiness.md)

**After the publish: discussion, decision, project, measure, reward** (built 15 Oct 2026, behind the `discussion` and `projects` flags; on for demo companies only)
- **Discuss first:** the desk holder invites people (buddy, deputy, affected people, department head, authors of similar ideas). The author posts new versions, each re-scored (v1 → v2, ▲ on improved dials). A check-in every 3 days ends a round, with at most 3 rounds.
- **Yes:** opens project P-n with a lead and archives the idea. **No:** archives it with a reason.
- **Project page:** a board (To do / Doing / Blocked / Done), team, links, comments, timeline, and a baseline before the start.
- **Measure:** at done +30 and +90 days. The verdict (better/same/worse) "is computed from the numbers, never typed".
- **Recognise:** by the company's own rule (none, thanks, fixed, share of saving). A manager records it and an anonymous author claims it. "Counts only, no ranking of people".
- **Author tracking:** the author sees every step on `/team` (Sent · Read · In discussion · Approved · Planning · In progress · Done · Measured · Recognised) and gets a mail at each.
- Sources: [N docs/IDEAS.md, "After the publish"](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/IDEAS.md); [A roadmap.ts items discussion/projects/measure/reward = "built"](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-admin/src/app/(app)/handbook/roadmap.ts)
- Kanban board, card sheet and a wide dashboard: PR #224 (16 Oct 2026). — [N git log origin/main](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup)

**Leader and manager views**
- Leader inbox: cases sorted by age with days left and four buttons. "A leader's job here is to answer, not to manage a tool." — [L src/app/(marketing)/page.tsx](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-landing/src/app/(marketing)/page.tsx)
- Manager overview: what is waiting, the wait ledger "files every waiting day under one of four reasons". — [L src/app/(marketing)/page.tsx](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-landing/src/app/(marketing)/page.tsx)
- Other routes: `/dashboard` (every problem/idea: open since, on whose desk, stage, score), `/feed` (cards, filter by site and department, support, comment), `/progress` (movement since baseline), `/projects`, `/cases/[id]`, `/settings/{company,members,routing}`. — [N docs/ROUTES.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/ROUTES.md)

**Jira and Microsoft 365**
- Jira sync engine moved out of n8n into the app (#245-#249, 29 Oct). Jira sits behind a WorkTracker interface chosen per company (#269). A Jira Data Center client was added (#268). Jira Cloud and Data Center sync were accepted against a fake Jira (#272). — [N git log origin/main](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup)
- Microsoft 365 search runs live as the signed-in person (#243, #244). Tokens are sealed per person (#236). M365 sits behind a KnowledgeSource interface with 21 ground-truth questions on Graph fixtures (#266, #272). Both are **off** by default; per the audit, M365 needs the assistant on. — [N git log](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup); [N pilot-readiness.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/plans/2026-11-01_pilot-readiness.md)

**Login**
- Personal login code per person (~59 bits, sha256 stored), or "Continue with Microsoft". Microsoft sign-in is Entra OIDC with PKCE, ID-token signature verification and a tenant check. Entra app roles `NextUp.Manager/Leader/Member` set the role, and a person is created on first sign-in. — [N docs/SECURITY.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/SECURITY.md)
- Signup, invite and forgot-password are stub pages that say "coming". — [N docs/audit/gaps/product.md G-018](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/audit/gaps/product.md)

**Deployment**
- One Docker stack per company. The same artefacts run hosted or on-prem (decision HD6). — [N pilot-readiness.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/plans/2026-11-01_pilot-readiness.md)
- Companies are started from admin.sellux.ch through a box agent. — [A roadmap.ts "companies" live](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-admin/src/app/(app)/handbook/roadmap.ts)
- Remote deploy to a customer host over an SSH forced command (#267). Off-box backups and a restore timed against the RTO (#281). Backup before each migrate (#289). — [N git log](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup)

**Static demo**
- `/demo` and demo.sellux.ch show the whole loop with made-up data, no login, and "nothing leaves the browser". — [N docs/IDEAS.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/IDEAS.md)

### Inferences
- What a pilot employee would experience today: a polished raise and coach flow and a decider inbox. Deadlines would not fire on a real company until CLK lands, and parts of the management views would show preview data.
- The full "idea → measured impact → recognition" loop exists in code and in the demo. That is a differentiator to point to, but no real user has used it yet.

### Gaps
- No usage data from real users exists. The pilot success criteria (≥70 % answered within 5 days, 1 case per 10 employees, override rate <30 %) are proposals only. — [N docs/plans/2026-11-01_segment-analysis.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/plans/2026-11-01_segment-analysis.md)
- I did not open every page component. The exact current look of `/manager` after the 2 Nov STR/LNG merges was not verified visually.

## Q2: Which roles exist and what does each see?

### Takeaway
There are three in-app roles (member, leader, manager) plus a company admin and the NextUp platform admin. Roles are fixed in code and set by Entra app roles. Important caveat: **every signed-in browser receives the whole case log**, and roles only choose which pages show it.

### Cited Findings
**What each role sees**
- **member:** home is `/raise`, with the simple bar (Ideas | Dashboard, profile). Sees "what happened to what I sent" (`/team`).
- **leader:** home is `/leader` (inbox), with the rail and top bar.
- **manager:** home is `/manager` (overview), and also has `/settings/*`.
- Sources: [N docs/ROUTES.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/ROUTES.md); [V nextup – Produkt & Vision](file:///C:/Users/k_sch/Documents/obsidian_vault/03%20Projekte/nextup/nextup%20–%20Produkt%20&%20Vision.md)
- **company admin:** `/admin` in the stack (people, login codes, assistant, knowledge). Opened by the Entra role `NextUp.Admin` or a shared `ADMIN_ACCESS_CODE`. — [N docs/SECURITY.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/SECURITY.md)
- **NextUp platform admin** (admin.sellux.ch): team accounts with roles and optional TOTP 2FA, a vault and an audit log. — [A git log f0ba3f8, a571c81](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-admin); [A roadmap.ts "team-accounts", "totp" built, "vault" live](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-admin/src/app/(app)/handbook/roadmap.ts)

**Write permissions** (enforced on the server by `mayAppend`)
- Only the holder (or a manager) decides, hands over or asks. Only the raiser answers. Only managers re-route or move the clock. — [N docs/SECURITY.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/SECURITY.md)
- In projects, only a manager records a reward and only the author claims it. — [N docs/SECURITY.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/SECURITY.md)

**Read visibility and drafts**
- Read visibility is a known gap: "The whole case log goes to every signed-in browser; roles only choose which pages show it." — [N docs/SECURITY.md item 6](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/SECURITY.md); [N gaps/product.md G-039 (high, phase VIS)](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/audit/gaps/product.md)
- Drafts are private: "No lead, manager or admin reads drafts". Admin sees counts only (BetrVG §87). — [N docs/IDEAS.md "Privacy"](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/IDEAS.md)

**Configurability**
- Roles and Entra claim names are fixed in code, not set per company. — [N gaps/product.md G-053](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/audit/gaps/product.md)
- Inbox and actor matching use display names, not user ids. A person created by Entra just-in-time does not match a route owner from the seed (G-003/G-004, high). This is being fixed in phase IDN (in progress 2 Nov). — [N gaps/product.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/audit/gaps/product.md); [P IDN/log.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/plans/projects/nextup/IDN/log.md)

### Inferences
- For "control" and "privacy" types, the server-side visibility gap (VIS, still planned) is the single biggest product risk. It is invisible in the UI but would come up in any IT review.

### Gaps
- No per-company custom roles, and no "works council" or "auditor" read-only role. None is planned explicitly; the only mention is the SIEM/log export in phase EID.

## Q3: What does NextUp do about privacy, anonymity, data residency, AI transparency and audit trails?

### Takeaway
The privacy-by-design principles are strong and well documented: roles not people, no person rankings, private drafts, redaction before any model call, an AI that proposes and never decides, arithmetic scores, and a stage gate that fails closed. The **data-subject and audit functions are incomplete**: no export, no person deletion, admin actions only logged to the console, and visibility filtered in the browser. Marketing copy claims some of these already.

### Cited Findings
**Principles**
- "AI proposes, never decides"; "Events, not edits"; "Roles, not people" (BetrVG §87(1) Nr. 6); "Score the case, never the person"; fail closed. — [V nextup – Produkt & Vision](file:///C:/Users/k_sch/Documents/obsidian_vault/03%20Projekte/nextup/nextup%20–%20Produkt%20&%20Vision.md)

**Anonymity**
- `Company.anonymousHandles Boolean @default(true)` gives members anonymous handles (e.g. "Anonymous #4471"). — [N prisma/schema/core.prisma:34](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/apps/app/prisma/schema/core.prisma); [V Security & Datenschutz](file:///C:/Users/k_sch/Documents/obsidian_vault/03%20Projekte/nextup/nextup%20–%20Security%20&%20Datenschutz.md)
- Gap: people created by Entra just-in-time and members a manager adds get **no handle**, so their events carry the display name (G-046, high). — [N gaps/product.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/audit/gaps/product.md)
- The reward is claimed by an "anonymous author". — [N docs/IDEAS.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/IDEAS.md)

**Person metrics**
- The stated rule is no person metrics. Contradiction in the code: a "Most relied-on contributors" ranking on the progress view and per-person counts on `/people/[name]` still exist (G-045, high, to be removed in phase GDP). — [N gaps/product.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/audit/gaps/product.md)

**AI controls** (raise assistant and coach)
- Information classification with a ceiling enforced in SQL and again in the tool.
- Redaction: names become roles; email, phone, IBAN, VIN and keys are masked. This is called "Risk reduction, not a guarantee".
- Bedrock runs in eu-central-1, and the browser never talks to a third party.
- A DPA-date gate: on a real stage without a recorded DPA date, only the mock answers.
- Audit row `AssistTurn`: redacted text, cited sources, mask counts, model, prompt version, tokens, latency.
- Retention 90 days by default, and a kill switch.
- Answers are checked: only tool-provided citations are kept, and anything else is flagged "unsourced".
- Sources: [N docs/ASSISTANT.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/ASSISTANT.md)
- Gaps in the AI controls: the idea coach skips the DPA gate when the brain answers (G-036). The routing proposal is made in the browser and the server stores whatever it is sent (G-035). — [N gaps/product.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/audit/gaps/product.md)
- Prompt versions are stored per turn (`idea-coach-v1`, `brain-coach-v1`, `brain-route-v1`). — [N docs/IDEAS.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/IDEAS.md)

**Audit trail**
- Domain events are append-only, with actors. Admin actions (admin sign-in, Jira settings, webhook secrets) go "only to console, not to an audit log" (G-041, high). — [N gaps/product.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/audit/gaps/product.md); [N pilot-readiness.md "Data protection"](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/plans/2026-11-01_pilot-readiness.md)

**GDPR functions**
- No data export per company or per person (G-042, high). No person deletion or pseudonymisation (G-043, high). No retention for case events (G-044). There is no delete-user action at all (G-017). — [N gaps/product.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/audit/gaps/product.md)
- Conflict: the landing pricing page lists "export of everything at any time" and a "Routing table editor" for the Company plan. The code has no export (G-042), and routing is read-only (G-012). — [L pricing/page.tsx](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-landing/src/app/(marketing)/pricing/page.tsx); contradicted by [N gaps/product.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/audit/gaps/product.md)

**Data residency**
- Landing claims: "On servers in the EU … never visible to another tenant". The privacy policy says no transfer outside the EU/EEA and no automated decision-making under Art. 22. — [L pricing/page.tsx, privacy/page.tsx](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-landing/src/app/(marketing)/privacy/page.tsx)
- In the app: one stack per company. The planned pilot runs on a dedicated Hetzner VM in Germany or the customer's Azure tenant. The AI provider is chosen per company, and "off" is a supported choice (HD8, planned in AIP). — [N pilot-readiness.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/plans/2026-11-01_pilot-readiness.md)
- SAP decision HD14: SAP is read-only and limited to the org chart. Absences, payroll and performance are never read. The personnel number is never shown in the UI or sent to the AI. — [P hauptplaene/PILOT.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/plans/projects/nextup/hauptplaene/PILOT.md)

**Works council**
- The landing promises "A works council gets a written description of what is and is not measured before the pilot starts." — [L page.tsx](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-landing/src/app/(marketing)/page.tsx)
- The works agreement template and DPIA are missing (phase SEC, still at stage "idea"). — [N pilot-readiness.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/plans/2026-11-01_pilot-readiness.md)

**Other security**
- Login throttles, session revocation against the DB, strict CSP/HSTS, gitleaks/Trivy/CodeQL in CI. A pentest is planned before `live`. — [N docs/SECURITY.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/SECURITY.md)

### Inferences
- The trust story (EU, no person metrics, AI never decides) is credible in design. Today it rests partly on promises (export, works-council paper, server-side visibility) that phases VIS, GDP and SEC still have to deliver.

### Gaps
- No TISAX or VDA ISA self-assessment exists yet; it is a planned task. — [N segment-analysis.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/plans/2026-11-01_segment-analysis.md)

## Q4: What is shipped vs in progress vs planned (as of 2 Nov 2026)?

### Takeaway
Since 1 Nov an autonomous build pipeline (orch, plan "PILOT", 22 phases) has been rebuilding the core for a real pilot.
- **Done and archived on 2 Nov:** AUD, ARC, OPS, STR, LNG, CNX. That means German/English UI, structure out of the demo seed, connector interfaces, Jira DC, and off-box backups.
- **In progress:** IDN (identity by id) and CLK (real working-day clock).
- **Not started:** everything that makes it fit for employees and IT: VIS, GDP, ADM, DIR, NTF, Teams, shop-floor, API, SEC, test phase.

### Cited Findings
**Shipped-live**
- Idea studio, coach, drafts; cases with the desk thread; login codes and Microsoft sign-in; company knowledge and the decisions export; case notice mails; brain routing and coach; one stack per company; nightly backups with a weekly restore test; CI scans. — [A roadmap.ts (status "live")](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-admin/src/app/(app)/handbook/roadmap.ts)
- German and English UI: message catalog, locale per user and company, mails in the recipient's language (#273, #277-#297, 1-2 Nov 2026). This closes G-024 ("No German UI"). — [N git log](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup); [P LNG/log.md "archiviert" 2 Nov](file:///B:/06_CODE/06_Projects/Startup_speed/repos/plans/projects/nextup/LNG/log.md)
- Company goals and spend rule read from tables, and empty companies carry no acme content (#270, #274, #290, #291, #294, #296). Closes G-009/G-010. — [N git log](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup)
- Ops (#261, #265, #267, #281, #289): alerts to a list plus an external heartbeat, off-box backups, remote deploy, pinned image digests. — [N git log](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup)

**Shipped-off (flag) or demo-only**
- Discussion, projects/Kanban, measure, reward: on for demo companies only, and only admin.sellux.ch can switch them on (G-007). — [N gaps/product.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/audit/gaps/product.md)
- 5-day clock, deputy hand-over, check-ins and measures: these run on `Company.demoDay`, which only moves on the demo stage. "On a real company the 5-day promise, deputy hand-over, check-ins and the 30/90-day measures never fall due" (G-001, high). — [N gaps/product.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/audit/gaps/product.md)
- Bedrock assistant, M365 search and Jira sync: built, off by default. — [N pilot-readiness.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/plans/2026-11-01_pilot-readiness.md)
- Manager dashboard, feed and overview run on preview data (G-048 to G-050). STR touched `dashboardPreview.ts` on 2 Nov; I did not verify whether that fixed it. — [N gaps/product.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/audit/gaps/product.md); [P STR/log.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/plans/projects/nextup/STR/log.md)

**In progress (plans approved 2 Nov)**
- IDN (identity by id) and CLK (working-day clock and a scheduler that writes deadline, deputy and measure events). — [P hauptplaene/PILOT.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/plans/projects/nextup/hauptplaene/PILOT.md); [P IDN/log.md, CLK/log.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/plans/projects/nextup/CLK/log.md)

**Planned (PILOT stages "planned" or "idea")**

| Phase | What it delivers |
| --- | --- |
| DIR | Graph sync, leavers, delete-user |
| ADM | Routing, org and company editors in the app; named admins with 2FA |
| VIS | Server-side read visibility, paging |
| AIP | Provider per company; server-side routing proposal; eval with 80+ cases, ⅓ German, in CI; override rate tracked |
| NTF | Outbox, digests and reminders, opt-in, signed webhooks |
| GDP | Audit log incl. admin actions, export, person deletion, retention, person rankings removed |
| LOOP | Discussion/projects switchable per company |
| MET | Dashboards on real data, baseline before the pilot, no person metrics |
| TMS | Microsoft Teams: notify, raise, answer from an adaptive card |
| FLR | PWA, QR codes per area, kiosk mode for people without a PC or mail |
| API | Public API v1 with OpenAPI |
| EID | Generic OIDC/SAML, SCIM, SIEM log export |
| SEC | DPA, TOMs, DPIA, works agreement, VDA ISA, pentest |
| TST | 1,500-person demo company test phase |

Source: [N pilot-readiness.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/plans/2026-11-01_pilot-readiness.md); [P PILOT.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/plans/projects/nextup/hauptplaene/PILOT.md)

**Explicitly out of pilot scope**
- SAP/ServiceNow/PLM adapters, TISAX assessment, own mobile apps, **idea voting, reward scheme**, 24/7 operations. — [N pilot-readiness.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/plans/2026-11-01_pilot-readiness.md)
- Also "later" on the admin roadmap: ideas voting and reminder/digest mails. — [A roadmap.ts](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-admin/src/app/(app)/handbook/roadmap.ts)

**Strategy**
- Open decision: mid-size pilot (1,000-2,000 employees, ideally an automotive supplier) first, with a paid OEM PoC in parallel. Not yet decided by Kevin and Marc. — [N segment-analysis.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/plans/2026-11-01_segment-analysis.md)
- The 6 Oct 2026 target-segment note says big automotive. — memory note "nextup-target-segment"

### Inferences
- Phase status comes from orch log entries ("archiviert" = done) plus merge commits. The PILOT.md stage column still shows older values, so it lags.

### Gaps
- No dated delivery forecast per phase. The plan says about 65 person-weeks at classic speed, and "the real pace is known after blocks A and B".

## Q5: Mapping to the 10 psychographic segments (features that address each, how well, what's missing)

### Takeaway
NextUp is strongest for **Desire to be heard** (guaranteed answer with a clock and deputy), **Evidence-based decision making** (arithmetic, fact-cited scores; measured before/after) and **Low tolerance for extra work** (one field, coach asks one question, four buttons). It is weakest **today** for **Trust/Privacy** and **Control/Accountability**, because export, deletion, admin audit and server-side visibility are not built. **Recognition** is designed but off in real companies. **Transparency** is good for authors but the management dashboards are partly placeholders.

### Cited Findings and assessment per segment
Scale: **Strong** = shipped and core; **Partial** = shipped-off, demo-only or with known gaps; **Weak** = mostly planned.

**(1) Improvement-oriented mindset: Strong (raise), Partial (follow-through)**
- Addressed by: the idea studio with coach and four benchmark bars, "Still unclear" one question at a time, versions re-scored during discussion, and the project board with measure checks. — [N docs/IDEAS.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/IDEAS.md)
- Missing:
  - Idea voting and support beyond the feed's "support" (voting is "later"). — [A roadmap.ts](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-admin/src/app/(app)/handbook/roadmap.ts)
  - The brain does not follow a project after its start, and late steps don't escalate. — [N docs/IDEAS.md "Not in this step"](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/IDEAS.md)
  - Similarity by embeddings is not built. — [N docs/IDEAS.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/IDEAS.md)

**(2) Desire to be heard: Strong in design, Partial in reality**
- Addressed by: a 5-day answer promise with deputy fallback, leader inbox sorted by age, a mail at each step, and the author's `/team` status track. — [N docs/IDEAS.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/IDEAS.md)
- Evidence that this matters: Böckler survey, 44 % don't take part because "it won't be implemented anyway", and a reasoned rejection raises the chance of resubmitting. — [V Startup Speed – Motivation & Belohnung](file:///C:/Users/k_sch/Documents/obsidian_vault/03%20Projekte/Code-Projekte/Startup%20Speed%20–%20Motivation%20&%20Belohnung%20für%20Ideen.md)
- Missing:
  - The clock does not fire for real companies (G-001/G-002; CLK in progress).
  - No reminders or digests (G-026); no Teams channel (G-020).
  - People without a PC or mail (shop floor) cannot raise: no QR, kiosk or PWA (G-022/G-023). — [N gaps/product.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/audit/gaps/product.md)

**(3) Need of transparency: Partial**
- Addressed by:
  - `/dashboard` "every problem and idea: open since, on whose desk, stage, score"; the wait ledger with four reasons; the author's step track; a timeline per project; the decision log (append-only events). — [N docs/ROUTES.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/ROUTES.md); [L page.tsx](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-landing/src/app/(marketing)/page.tsx)
  - Score explanations on hover; receiver match % with listed "why". — [N docs/IDEAS.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/IDEAS.md)
- Missing:
  - Manager dashboard, feed and overview on placeholder data (G-048 to G-050, phase MET).
  - The wait ledger is only "partly" built. — [N segment-analysis.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/plans/2026-11-01_segment-analysis.md)
  - The routing proposal and its override are not yet visible as planned (LOOP: "override visible").

**(4) Recognition & meaningful impact: Partial (built, off for real companies)**
- Addressed by:
  - The measure at +30/+90 days with a computed verdict, and recognition by the company's rule (thanks / fixed / share of saving), claimable anonymously, with no ranking.
  - The demo ends with "the plant manager's thanks".
  - Sources: [N docs/IDEAS.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/IDEAS.md)
- Research recommends: reward only on acceptance or measured impact, team credit, a wall of implemented ideas, a claim menu, and payroll export. — [V Motivation & Belohnung](file:///C:/Users/k_sch/Documents/obsidian_vault/03%20Projekte/Code-Projekte/Startup%20Speed%20–%20Motivation%20&%20Belohnung%20für%20Ideen.md)
- Missing:
  - The flags are off for real companies (G-007).
  - The "reward scheme" is explicitly out of pilot scope. — [N pilot-readiness.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/plans/2026-11-01_pilot-readiness.md)
  - No wall of implemented ideas, no team credit, no claim menu, no payroll export, no ArbnErfG invention flag. These are research recommendations only, with no plan found.

**(5) Evidence-based decision making: Strong**
- Addressed by:
  - Deterministic scores where "every point names the fact behind it", and the rail of five decision facts.
  - Advice (Approve / Pilot / Needs info), similar ideas and "raised before?".
  - A baseline before the start; a before → after verdict "computed from the numbers, never typed".
  - `/progress` before → after per project.
  - Sources: [N docs/IDEAS.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/IDEAS.md); [N docs/ROUTES.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/ROUTES.md)
- Missing:
  - Benchmarks are keyword-based; the eval set has only 32 ideas, 3 German (G-037). — [N gaps/product.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/audit/gaps/product.md)
  - The M365 knowledge source is off. Customer and market data are not an input. — [N docs/IDEAS.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/IDEAS.md)

**(6) Risk awareness & reliability: Partial**
- Addressed by:
  - Product: a Risk dial and a Cost dial in the analysis; a "risks" step in the coach's grilling; a fast lane only within team spend authority; the deputy fallback. — [N docs/IDEAS.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/IDEAS.md)
  - Platform: per-company stack, off-box backups, restore timed against the RTO, staging/smoke/approval release gate, Trivy, pinned digests. — [N git log](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup); [A roadmap.ts](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-admin/src/app/(app)/handbook/roadmap.ts)
- Missing:
  - No load test (2,000 accounts), no SLA, and no 24/7 operations (out of scope).
  - The brain runs on a shared CPU server rated for about 10 users.
  - No pentest yet. — [N pilot-readiness.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/plans/2026-11-01_pilot-readiness.md)
  - Every page reduces the full event log, with no read model (G-040).

**(7) Need of control & accountability: Partial to Weak**
- Addressed by:
  - Clear ownership: a routing table to roles and an assignee per case.
  - Only the holder decides; only managers re-route or move the clock.
  - Append-only event log; project lead; measure checks.
  - A late start or measure moves to the deputy.
  - Sources: [N docs/SECURITY.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/SECURITY.md); [N docs/IDEAS.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/IDEAS.md)
- Missing:
  - The routing table is read-only, with no org or company editor (G-012 to G-014).
  - Flags cannot be switched by the company itself (G-007).
  - Admin actions are not audited (G-041).
  - A shared admin code with no 2FA on company stacks (G-047). — [N gaps/product.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/audit/gaps/product.md)
  - Late steps deliberately do not escalate ("no per-person overdue counts, for the works council"). — [N docs/IDEAS.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/IDEAS.md)

**(8) Openness to AI & change: Strong for the curious, with brakes built in**
- Addressed by:
  - The AI coach in the chat; an AI routing proposal; AI-drafted project steps and check-ins (`/v1/plan`, `/v1/checkin`); AI cover images (blueprint). — [N docs/IDEAS.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/IDEAS.md); [N docs/AI_COVERS.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/AI_COVERS.md)
  - For skeptics: "The core loop … works with the AI and every integration switched off" (HD7), and AI "off" is a supported provider choice (HD8). — [N pilot-readiness.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/plans/2026-11-01_pilot-readiness.md)
- Missing:
  - No in-UI explanation of model and provider for end users was found (gap in my reading).
  - Provider choice per company is planned (AIP), not built.

**(9) Trust, fairness & data privacy: Partial (strong design, gaps in functions)**
- Addressed by:
  - Roles not people; no person metrics as a rule; private drafts; anonymous handles on by default.
  - Redaction and classification ceiling; EU Bedrock; DPA gate; fail-closed stage policy; per-company stack; GDPR privacy page with no tracking.
  - Sources: [N docs/SECURITY.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/SECURITY.md); [N docs/ASSISTANT.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/ASSISTANT.md); [L privacy/page.tsx](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-landing/src/app/(marketing)/privacy/page.tsx)
- Missing:
  - The whole case log reaches every browser (G-039).
  - The person ranking "Most relied-on contributors" still exists (G-045).
  - Handles are missing for Entra and manager-added users (G-046).
  - No export, deletion or retention (G-042 to G-044).
  - The coach skips the DPA gate when the brain answers (G-036).
  - No works agreement template, DPIA, TOMs or VDA ISA (SEC).
  - Sources: [N gaps/product.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/audit/gaps/product.md)

**(10) Low tolerance for extra work: Strong for office staff, Weak for the shop floor**
- Addressed by:
  - "No form, no category tree, no ticket - the routing is done for you".
  - The coach asks one question at a time, and suggested answers can be clicked.
  - Four buttons for leaders; "Under the line most department heads can sign alone".
  - Microsoft SSO; leaving the page keeps the chat; German UI now shipped.
  - Sources: [L page.tsx, pricing/page.tsx](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-landing/src/app/(marketing)/page.tsx); [N docs/IDEAS.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/IDEAS.md)
- Missing:
  - No Teams app and email is the only channel (G-020).
  - No QR, kiosk or PWA (G-022/G-023).
  - No directory sync, so the org is set up by hand (G-016).
  - Signup, invite and reset are stubs (G-018).
  - No digest mails, so every event is its own mail (G-026).
  - Sources: [N gaps/product.md](file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/audit/gaps/product.md)

### Inferences
- The product's design philosophy matches segments 2, 5, 9 and 10 closely. That alignment looks intentional: "Tempo und Antwort schlagen Geld" is the guiding research finding.
- For a DACH automotive buyer, segments 7 and 9 are where IT, the works council and data protection officers will judge. Most of their must-haves sit in phases VIS, GDP, ADM and SEC, which have not started yet.
- Recognition (segment 4) is the clearest "built but hidden" asset. Switching the loop flags on for a pilot (LOOP) is cheap compared with building it.
- Marketing copy runs ahead of the code on export, the routing editor and the works-council description. Any segment messaging should not repeat these until GDP, ADM and SEC ship.

### Gaps
- No user research or interview data was mapped to these 10 traits in the local sources I read. The Startup Speed outreach notes and interview write-ups in admin were not read.
- Whether discussion/projects would be on in the first pilot is undecided (G-007 → LOOP).
- No source states which German model or provider the pilot will use (HQ4 default: Bedrock eu-central-1, or off).
