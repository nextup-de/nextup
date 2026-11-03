# NextUp asset inventory at the end of PILOT, with effort estimates (as of 2 Nov 2026)

Scope note: all sources are local (repos read at `origin/main` with `git -c safe.directory=*`, plus the Obsidian vault and Claude memory). Facts carry a source link. Anything labelled **Estimate** is my own extrapolation, not a fact. Abbreviations for sources:
- [P] = `repos/plans/projects/nextup/hauptplaene/PILOT.md` (orch Hauptplan) — file:///B:/06_CODE/06_Projects/Startup_speed/repos/plans/projects/nextup/hauptplaene/PILOT.md
- [OV] = `Nextup/docs/plans/2026-11-01_pilot-readiness.md` (overview plan) — file:///B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/docs/plans/2026-11-01_pilot-readiness.md
- [G] = git history of the named repo, read on 2 Nov 2026 — file:///B:/06_CODE/06_Projects/Startup_speed/repos/
- [V] = Obsidian vault, `03 Projekte/` — file:///C:/Users/k_sch/Documents/obsidian_vault/03%20Projekte/
- [M] = Claude memory — file:///C:/Users/k_sch/.claude/projects/B--06-CODE-06-Projects-Startup-speed/memory/
- [S] = background status note — file:///B:/06_CODE/06_Projects/Startup_speed/research_notes/NextUp%20psychographic%20segmentation/nextup_current_status.md

## Q1: What exact phases are in PILOT and what does each deliver?

### Takeaway
The orch Hauptplan PILOT lists **24 phases** (the "22" figure comes from the overview plan's 22 numbered phases 0–21, re-cut into orch-sized phases, plus SFX added on 1 Nov). By 2 Nov ~12:00, **6 phases are done** (AUD, ARC, OPS, STR, LNG, CNX), 3 are running (IDN, CLK, NTF), 4 more have written Baupläne (DIR, AIP, ADM, VIS), and 11 are still briefs ("idea"). The classic-effort estimate for the whole pilot is **~65 person-weeks**; the orch budget is **2,470 % of a 5-hour window (~25 windows ≈ ~124 lane-hours)**.

### Cited Findings
**Phase list and deliverables (Result sentences, orch stage on 2 Nov)** — all from [P] frontmatter and phase table; status from the PLAN.md `state:` field per phase folder (file:///B:/06_CODE/06_Projects/Startup_speed/repos/plans/projects/nextup/) and acceptance PRs in [G Nextup].

| Phase | Delivers (from [P]) | Size/budget | Status 2 Nov |
|---|---|---|---|
| AUD | Every suite in CI; gap register mapping each gap to a phase | M, 75 % | done (archived) — register has 101 gap rows (46 platform + 55 product) in `docs/audit/gaps/` [G] |
| ARC | Canonical model, 8 connector interfaces, API v1 + webhook zod schemas, Prisma schema split per area; ADRs 0001–0007 | M, 75 % | done; `packages/contracts/src/public/` + `docs/adr/0001…0007` exist [G] |
| OPS | Deploy to a dedicated customer server, off-box restic backups, backup before every migration, RPO 24 h / RTO 1 h, pinned digests, alert lists, on-prem install rehearsal | L, 125 % | done (#267, #281, #289, acceptance #298) |
| STR | Structure tables are the only source of org/roles/routes/goals/rules; empty company has no acme content; `CompanyRule` | L, 100 % | done (acceptance #296) |
| LNG | Typed DE/EN message catalog, locale per user, mail templates both languages, lint rule `nextup/no-inline-strings` | L, 150 % (~1,500 strings in ~250 files) | done (acceptance #299) |
| CNX | M365 search with source permissions (21/21 ground-truth answers on recorded Graph fixtures); Jira Cloud + Data Center behind `WorkTracker`; connector template doc | M, 60 % | done (acceptance #272) |
| IDN | Inbox/assignee/actor/permissions on user ids and role holders | L, 165 % | running (#300–#305) |
| CLK | Working-day clock per company/site, scheduler with lease; deadlines, deputy hand-overs, check-ins, 30/90-day measures | M, 90 % | active |
| DIR | Entra Graph delta sync of users, groups, managers, leavers | M, 85 % | Bauplan written |
| AIP | AI provider per company (Bedrock eu-central-1, Azure OpenAI, OpenAI-compatible, off); server-side routing proposal; eval set 80+ cases (⅓ German) in CI; override rate | M, 85 % | Bauplan written |
| ADM | Company admin manages members, org, routes, calendar, connectors in-app; admin TOTP | L, 145 % | Bauplan written |
| VIS | Projections; each user receives only what their role may see | L, 100 % | Bauplan written |
| NTF | One outbox, mail + signed webhook channels, digests, reminders | M, 90 % | active |
| GDP | Audit of admin actions, company/person export, deletion/pseudonymisation, retention rules | M, 60 % | idea |
| LOOP | Case loop without placeholders, works with AI/integrations off | M, 60 % | idea |
| MET | Wait-ledger dashboards on real data with baseline; all per-person numbers removed | M, 60 % | idea |
| TMS | Teams app manifest, bot, notices as adaptive cards, raise from Teams (against a local Bot Framework fake) | L, 100 % | idea |
| FLR | Shop-floor raise by QR code on a shared device (PWA) | S, 30 % | idea |
| API | Documented, versioned `/api/v1/[company]/…` with OpenAPI + signed webhooks | M, 60 % | idea |
| EID | Generic OIDC (ADFS, Okta), SAML 2.0 SP, SCIM 2.0 inbound, LogSink to JSON file/syslog | L, 100 % | idea |
| SFX | Read-only SAP SuccessFactors org-chart sync (against recorded OData pages) | M, 60 % | idea, go: kevin |
| SEC | No standing team access, break-glass, key rotation, ZAP scan in CI; `docs/compliance/` with DPA template, TOMs, record of processing, DPIA, works agreement template, VDA ISA self-assessment, sub-processor list; customer guides | M, 60 % | idea |
| TST | "Musterwerk" demo company: 1,500 people, 3 sites; scenario suite, load test 2,000 accounts (p95 < 1 s), restore + on-prem drill, against M365 test tenant and a Jira test site | L, 100 % | idea |
| PIL | Bootstrap a pilot company from CSV/Graph, stage switch sandbox → pilot, weekly pilot report, onboarding/training, runbook in `docs/pilot/` | M, 60 % | idea |

- Parked, not in PILOT: INF (customer VM as code), until `nextup-infra` becomes an orch project (HQ8). — [P]
- Explicitly out of scope: SAP adapters beyond SFX, ServiceNow and PLM adapters (interfaces only), TISAX assessment, own mobile apps, idea voting, reward scheme, 24/7 ops, HA. Not orch work (Kevin and Marc): legal entity and insurance, signing a DPA, external pentest, two weeks of internal real-time use, finding and running the pilot. — [P] "Scope"
- "Done when": all phases done and `musterwerk.spec.ts` + `musterwerk-load.test.ts` green on main. — [P]
- 14 cross-phase decisions (HD1–HD14), e.g. HD2 every external system behind a connector interface; HD5 roles not people, no person rankings; HD6 one stack per company, hosted or on-prem; HD8 AI provider per company, "off" supported; HD14 SAP read-only, org chart only. — [P] frontmatter
- Classic effort: "About 65 PW in total. Three part-time developers at roughly 2.5 FTE would need about six months at classic speed." Per phase PW: audit 1, architecture 2, identity 3, structure 3, clock 2, read model 3, directory 3, admin 4, DE/EN 3, data protection 3, case loop 3, dashboards 3, AI 3, notifications 3, Teams 3, shop floor 2, connectors 4, enterprise seams 4, platform 4, security pack 4, test phase 4, pilot package 3 + 6 weeks running. — [OV] lines 176–243
- orch budget: "2,250 % of a 5-hour window … about 23 full windows", later raised to `budget_window_pct: 2470` as Baupläne were written (IDN +65, CLK +30, DIR/AIP +50, ADM/VIS/NTF +75). — [P] "Risks", "Course"

### Inferences
- Of the 2,470 % budget, the 6 finished phases account for 585 % (~24 %), so roughly three quarters of the planned build is still ahead. **Estimate:** at the 1–2 Nov pace (6 phases in ~36 h) the remaining 18 phases need ~1–2 weeks of orch time if Kevin's gates (go: kevin for SFX, SEC, TST, PIL) and the external dependencies (Teams tenant, Jira test site, DPA) do not block; with the gates, end of PILOT code is plausibly reached in mid/late November 2026, before the 11 Dec pitch. The 6-week pilot run itself is outside PILOT's "done".

### Gaps
- No orch-measured "real pace factor" yet (the plan says it is re-estimated after AUD and ARC; I found no recorded value).
- The phases after VIS have no Bauplan, so their task counts are the brief's guesses (~4–10 tasks each).

## Q2: How big is the codebase today, and how big will it be at the end of PILOT?

### Takeaway
On 2 Nov 2026 the four product repos total **~116k lines of text** (Nextup ~95.5k in 1,205 files, admin ~16.8k, landing ~3.4k, infra ~0.3k), built in **7 weeks** (first commit 14 Sep 2026) through **~370 merged PRs**, with Kevin as author of 84 % of Nextup commits. The first 6 PILOT phases added **+21.5k / −3.6k lines in 56 commits** in ~2 days. **Estimate:** at end of PILOT Nextup will be roughly **150–190k lines**, ~550–650 PRs, ~1,800–2,500 test cases.

### Cited Findings
**Repo sizes (`git ls-tree origin/main`, line counts exclude lock files and binaries; include md/json/css)** — [G]
| Repo | Files | Lines | Commits on main | First commit | Last commit | PRs (max #) | Authors (commits) |
|---|---|---|---|---|---|---|---|
| Nextup (monorepo) | 1,205 | 95,523 | 288 (squash merges) | 2026-09-14 "initial commit" | 2026-11-02 #304 | #304 (283 commits reference a PR) | Kevin 242, Samito26 (Sam) 24, dependabot 14, Victor 8 |
| nextup-admin | 218 | 16,837 | 124 | 2026-09-28 | 2026-10-21 #51 | #51 | Kevin 96, "Claude" 23, dependabot 5 |
| nextup-landing | 83 | 3,413 | 18 | 2026-09-28 | 2026-10-11 #16 | #16 | Kevin 15, dependabot 3 |
| nextup-infra | 15 | 305 | 6 | 2026-09-28 | 2026-09-28 | – | Kevin 6 (sops+age encrypted secrets) |
| plans (orch + plans) | – | orch code 6,199 lines in 29 files | 447 | 2026-10-30 "orch V1" | 2026-11-02 | – | Kevin (two identities) |

**Nextup breakdown by area (lines / files)** — [G]: `apps/app/src/components` 21,458/157; `src/features` 13,240/124; `tests/unit` 11,200/126; `src/i18n` 5,986/25; `src/server` 5,083/53; `src/app` (routes) 3,251/95; `src/lib` 3,004/41; `design-system/` ~6,100 (bundle, components, kits); `services/brain` (Python FastAPI) 2,872/33; `docs/plans` 2,428/11; `tests/e2e` 1,847/17; `ops/n8n` 1,711/5; `tests/db` 1,681/20; `tests/fixtures` 1,617/27; `packages/contracts` 1,367/80; `stack/` (tests, nginx, automation, provision, caddy, brain-server) ~4,200; Prisma schema 726 in 5 area files + 20 migrations; ADRs 549/8.
- Tests: 221 test files, 18,751 lines; ~1,285 `it(`/`test(` occurrences under `apps/app/tests` (approximate count); [P] "Situation" says ~950 unit, ~67 DB, ~44 e2e tests on 1 Nov. — [G], [P]
- Commits per ISO week on Nextup: W38 34, W39 38, W40 74, W41 43, W42 23, W43 9, W44 27, W45 (1–2 Nov only) 40. — [G]
- During PILOT so far (`984f3b0` #249 → `origin/main`): 465 files changed, +21,499 / −3,624 lines, 56 commits; of that, tests +6,540 lines in 125 files. — [G]
- History context: working title NextHub (10 Sep), name NextUp decided 21 Sep; repos moved to GitHub org `nextup-de` on 9 Oct. — [V Startup Speed.md](file:///C:/Users/k_sch/Documents/obsidian_vault/03%20Projekte/Code-Projekte/Startup%20Speed.md)

### Inferences
- **Estimate (end of PILOT):** 6 phases (24 % of budget) added ~18k net lines → the remaining ~76 % of budget at a similar density adds ~55–75k net lines → Nextup ≈ 150–170k lines; plus TST's generator/fixtures and SEC's compliance docs could push it to ~190k. PRs: ~52 PR numbers used in ~2 days for 6 phases (+ fixes); 18 more phases × ~6–9 PRs ≈ 110–160 more → final PR number roughly #420–#470 in Nextup; together with admin/landing ~500 PRs in total. Commits on main ≈ 400–450.
- **Estimate (classic effort to re-create):** the existing product before PILOT (7 weeks, ~95k lines incl. ~19k test lines) would be ~25–40 PW for a conventional team; PILOT adds the overview's ~65 PW. Total "replacement cost at classic speed" ≈ **90–105 person-weeks** (~2 FTE-years). With AI coding agents, the team's actual elapsed time is ~10–11 calendar weeks.
- Contributor concentration is a fact (Kevin ≈ 84 % of Nextup commits), which makes the bus factor ≈ 1 and also means the asset is mostly one person's work plus agents.

### Gaps
- Line counts include markdown and JSON; I did not separate hand-written from agent-written code (orch lane sessions commit under Kevin's account; only nextup-admin shows a separate "Claude" author).
- Merged-PR count via GitHub API not checked (no network use); counts are from commit subjects.

## Q3: What is orch and how fast has NextUp shipped?

### Takeaway
orch is Kevin's own autonomous build controller (~6.2k lines, started 30 Oct 2026): plans in markdown with proof commands fixed before the build, lane worktrees on the PC, Claude Sonnet lane sessions, automatic prove → PR → merge. On 1–2 Nov it shipped **6 PILOT phases and ~50 PRs in roughly 36 hours**, with 3 lanes in parallel. This is strong evidence that a small team with AI agents builds fast — and equally that a funded imitator with the same tools could rebuild the *code* quickly.

### Cited Findings
- orch: "Plans have short ids … A proof is a command fixed before the build, red at the base commit, green after, and run by `orch`, never by the session that builds." Controller V2 tick: pulls plans, follows sessions in Workbench, proves finished ones, pushes branch, opens PR, merges `risk: low` PRs with green CI, starts what `orch next` allows. — [plans README](file:///B:/06_CODE/06_Projects/Startup_speed/repos/plans/README.md)
- Project config: 3 permanent lanes (a, b, c) on kev-pc; `lane_model: claude-sonnet-5-5`; squash merges; admin bypass of code-owner review only after green proofs and CI; `risk_guard` forbids auto-merge for Prisma/migrations/auth/deploy/CI paths. — [project.yaml](file:///B:/06_CODE/06_Projects/Startup_speed/repos/plans/projects/nextup/project.yaml)
- Proven tasks per day in the plans log: 4 (30 Oct), 18 (31 Oct), 16 (1 Nov), 12 (2 Nov, by ~12:00); before PILOT, orch had run other plans (EV, RG, RG2, SD, WT, OR1). — [G plans]
- Nextup commits: 16 on 1 Nov, 40 on 2 Nov (by 11:48). Acceptance PRs: CNX #272 (2 Nov 00:18), STR #296 (08:59), OPS #298 (09:50), LNG #299 (10:08); 7 LNG translation PRs merged within 03:01–03:06 on 2 Nov. — [G Nextup]
- Course log: on 1–2 Nov Kevin and the main chat wrote 13 Baupläne (AUD 5 tasks, ARC 5, OPS 7, STR 6, LNG 11, CNX 4, IDN 9, CLK 6, DIR 6, AIP 6, ADM 8, VIS 6, NTF 6 = 85 tasks). — [P] "Course"; task folders in file:///B:/06_CODE/06_Projects/Startup_speed/repos/plans/projects/nextup/
- Overview: "Sizes are rough person-weeks (PW) of classic effort … the team has built similar blocks faster with agents." — [OV]

### Inferences
- **Estimate of speed-up:** AUD+ARC+OPS+STR+LNG+CNX = 1+2+4+3+3+4 = 17 classic PW (overview numbering: audit, architecture, platform, structure, DE/EN, connectors) delivered in ~1.5 calendar days of orch time → ~50–60× calendar compression vs one developer, ~20× vs the 2.5-FTE team. Caveat: much of CNX/OPS was pre-built before PILOT (CNX brief: "A-C and Jira engine already merged").
- For imitability: the orch method itself (plans + fixed proofs + parallel agent lanes) is replicable by any competent team using Claude Code/Codex-style tools; the speed evidence cuts both ways. What is harder to copy is the *specification* (24 briefs, 14 decisions, 101-row gap register) that tells agents what to build.

### Gaps
- No token/cost data for the orch runs found locally (budget is in % of 5-hour windows, not euros).
- Failure/rework rate only anecdotal (e.g. "OPS-A1 failed", "STR-C1 CI rot, startet neu").

## Q4: Full asset inventory at the end of PILOT (by category)

### Takeaway
At the end of PILOT NextUp will own a feature-complete, per-company-deployable enterprise app with eight connector interfaces and ~8 adapters, DE/EN, compliance documents and a tested 1,500-person demo company — but **no customer, no signed pilot, no trademark or patent, and no legal entity in the code plan**. The most defensible assets are the specification/decision layer, compliance artefacts and the works-council-friendly design (roles not people); the code itself is large but, by the team's own evidence, fast to rebuild with agents.

### Cited Findings

**(a) Software / code assets** (status at end of PILOT = planned unless marked done)
| Item | Status end of PILOT | Effort evidence | Visibility |
|---|---|---|---|
| Next.js app (raise, inbox, case loop, idea studio/coach, projects/Kanban, dashboards, feed) | complete without placeholders (LOOP, MET) | ~95k lines today; src ≈ 51k lines [G] | public: landing describes the loop ("One box. One inbox. One list. One ledger.") [landing page.tsx](file:///B:/06_CODE/06_Projects/Startup_speed/repos/nextup-landing/src/app/(marketing)/page.tsx); internals hidden |
| Event log + case reducer, projections/read model, server-side visibility | done after IDN/VIS | IDN 165 %, VIS 100 % budget; 3+3 PW classic [P][OV] | internal |
| Working-day clock + scheduler | done after CLK | 2 PW [OV] | internal |
| Admin in app (members, org/routing editor, calendar, connectors, TOTP) | done after ADM | 4 PW, 145 % [P][OV] | internal |
| DE/EN i18n catalog (~1,500 strings, 25 files, ~6k lines) + lint rule | **done** | #273–#299 [G] | visible to users |
| `packages/contracts` (public zod model, 8 connector interfaces, API v1, webhook envelope, event schemas) | **done**, extended later | 1,367 lines / 80 files [G] | becomes public with API phase |
| Brain AI service (Python: route, coach, plan, check-in, sheet; 6 prompt files) | provider-switchable after AIP | 2,872 lines [G] | internal |
| nextup-admin (team tool admin.sellux.ch: tickets, replies, stack tokens, releases, handbook/roadmap, Brevo mail) | not in PILOT scope (unchanged) | 16.8k lines, 124 commits, 51 PRs [G]; [V Admin-Tool note](file:///C:/Users/k_sch/Documents/obsidian_vault/03%20Projekte/nextup/) | internal |
| nextup-landing (sellux.ch: home, pricing, contact, imprint, privacy, login) | unchanged | 3.4k lines, 16 PRs [G] | public |
| Design system (`design-system/`) | exists | ~6.1k lines [G] | internal |
| Tests: unit/DB/e2e/load/stack | grows to scenario + load suite (TST) | 221 files, 18.8k lines today [G] | internal |
| Docs: 8 ADRs, 11 dated plans, audit, ops docs, customer Entra guide | grows (compliance, pilot, customer guides) | [G] | internal; customer guides go to customers |

**(b) Integrations & connections**
| Item | Status end of PILOT | Source |
|---|---|---|
| Microsoft Entra OIDC login, app roles, JIT users | live today; DIR adds Graph delta directory sync | [P] Situation, DIR; [V Startup Speed note] "Stand 23.10.2026: Phase 1 gebaut (#233–#235)" via grep of vault |
| Microsoft 365 / Graph search as KnowledgeSource (permissions-trimmed, 21/21 ground truth) | **done** (off by default) | CNX #272 [G]; [S] |
| Jira Cloud + Jira Data Center behind WorkTracker, fake Jira for tests | **done** | #268, #269, #272 [G] |
| Microsoft Teams bot/app (cards, raise from Teams) | built against a local Bot Framework fake; real tenant `nextuptest.onmicrosoft.com` set up by Kevin | TMS, HQ6 [P] |
| AWS Bedrock eu-central-1 / Azure OpenAI / OpenAI-compatible / off | provider per company (AIP); Bedrock assistant today "off … no AWS account on any stack" | [P] HD8; [OV] via [S] |
| Mail (notice mails), outbox, signed webhooks | NTF | [P] |
| Public API v1 + OpenAPI + outbound webhooks | API phase | [P] |
| Generic OIDC (ADFS, Okta), SAML 2.0 SP, SCIM 2.0, LogSink (JSON/syslog → SIEM) | EID phase | [P] |
| SAP SuccessFactors org chart (read-only) | SFX, against recorded OData only; live test waits for a tenant | [P] HD14, HQ9 |
| n8n automation (existing, `ops/n8n` 1.7k lines) | being moved into the app (HD2) | [G]; [P] |
| Interfaces only (no adapters): CaseSource (ServiceNow), PLM | out of scope | [P] Scope |

**(c) Data & domain knowledge**
- Routing logic: `RoutingRule` table, server-side proposal at `case.raised`, keyword fallback with AI off; override rate per company. — [P] STR, AIP
- Scoring/evaluation: `features/evaluate` goals + spend rule from `Goal` and `CompanyRule`; idea benchmarks (`features/ideas/benchmarks.ts`). — [P] STR
- Eval sets today: `services/brain/eval/acme.json` (~23 entries), `coach_cases.json` (~8), `coach_dialogs.json` (~8), `test_ideas.json` (~32) (approximate entry counts by key grep); AIP targets 80+ cases, ⅓ German, in CI. — [G], [P] AIP
- Prompts: 6 prompt files (`checkin`, `coach`, `match`, `plan`, `route`, `sheet`). — [G]
- Company structure model: canonical `Person`, `OrgUnit`, `Role`, `RoleHolder`, `CaseRef`, `Decision`, `ProjectRef` (ADR 0001); "roles, not people" (HD5). — [P] ARC, HD5
- Test data: simulated Acme M365 tenant with 503 people, 13 groups, 9 sites, 2,743 files (70 % EN / 30 % DE); "Acme Maschinenbau GmbH" demo seed; Musterwerk generator (1,500 people, 3 sites) in TST. — [V] (vault grep, "Testdaten (23.10.2026)"); [P] TST
- Automotive know-how: IATF-16949 queues (ECR→ECN, deviations, 8D with D3 in 24 h / D5 in 10 days, KVP), persona ladder, works-council framing (BetrVG §87), employee-inventions flag (ArbnErfG). — [V Outreach & Zielsegmente](file:///C:/Users/k_sch/Documents/obsidian_vault/03%20Projekte/Code-Projekte/Startup%20Speed%20%E2%80%93%20Outreach%20%26%20Zielsegmente.md); vault grep
- Strategy research: rready competitor teardown, motivation/reward research, psychographic segmentation, segment analysis (`2026-11-01_segment-analysis.md`), data-access research. — [V Startup Speed.md]
- Gap register: 101 rows (46 platform, 55 product). — [G] `docs/audit/gaps/`

**(d) Compliance / trust artefacts**
- Today: compliance documents (DPA, TOMs, DPIA, works agreement, VDA ISA) "missing", only `docs/customer/ENTRA_SETUP.md`. — [OV] via [S]
- End of PILOT (SEC): `docs/compliance/` with DPA template, TOMs, record of processing, DPIA, works agreement template, VDA ISA self-assessment, sub-processor list; customer guides for install, operations, security; ZAP baseline in CI; break-glass access; key rotation. Not included: external pentest, signing anything, TISAX assessment. — [P] SEC, Scope
- GDP functions: audit view, export, pseudonymisation, retention. — [P] GDP
- RPO 24 h / RTO 1 h documented and tested (`docs/ops/RPO_RTO.md`). — [P] OPS
- Public promise already made: "It measures cases. Never people." and (per [S]) "A works council gets a written description of what is and is not measured before the pilot starts." — [landing page.tsx]; [S]

**(e) Network & relationships**
- Team: Kevin (software, hosting, auth, data — back-end), Sam (design, prototype, UI, landing — front-end), Victor (research & AI, interview synthesis, ads — AI automation), Marc (consulting/sales, company access, timeline). — [V Startup Speed.md]; [M nextup-team-roster](file:///C:/Users/k_sch/.claude/projects/B--06-CODE-06-Projects-Startup-speed/memory/nextup-team-roster.md)
- Context: CODE University Berlin orientation-semester group project; pitch graded on **11 Dec 2026**. — [V Startup Speed.md]
- Customers: "NextUp has no real customer yet. Every running company holds made-up data." — [S]. Pilot company not found; "Marc's list of 10 companies runs from now". — [OV]
- Outreach: `outreach_log.csv` 25 rows (15 Berlin scale-ups, 10 F&B wholesalers), **no replies recorded**; segment moved to big automotive (6 Oct), then PILOT targets 1,000–2,000-employee companies (open decision: mid-size automotive supplier pilot first, paid OEM PoC in parallel). — [V Outreach note]; [S]
- Planned doors (not confirmed contacts): automotive BerlinBrandenburg e.V., Berlin Partner, Wirtschaftsförderung Brandenburg, ReTraNetz-BB, Zentrum Ideenmanagement; OEM programmes (BMW Startup Garage, Startup Autobahn) judged not yet accessible. Board mentions "conversations with contacts in Kassel" and a "Carbyte" request (context unclear). — [V Outreach note]
- Miro: "NextHub - Startup speed and energy" board (1,545 items, Showcase 2 slides) and "NextUp – Datenzugang" board. — [M nexthub-miro-board](file:///C:/Users/k_sch/.claude/projects/B--06-CODE-06-Projects-Startup-speed/memory/nexthub-miro-board-not-accessible.md)
- No advisors, investors or partners found in local sources.

**(f) Brand / IP**
- Name NextUp (since 21 Sep 2026; previously NextHub). — [V Startup Speed.md]
- Domain: `sellux.ch` is the **test** domain (wildcard DNS to the Hetzner box, nameservers at hostserv.eu); move to a real production domain "planned as a config change". GitHub org `nextup-de`. — [V Domains note](file:///C:/Users/k_sch/Documents/obsidian_vault/03%20Projekte/nextup/nextup%20%E2%80%93%20Domains%2C%20Landing%20%26%20Ports.md); [M] org move
- Trademarks / patents: none found. A grep of the vault and workspace docs for Marke/trademark/patent/DPMA/EUIPO found no filing; legal entity and insurance are listed as "not orch work (Kevin and Marc)". — [P] Scope; vault grep (no hits)
- Self-hosted fonts and design system exist (landing: Manrope, IBM Plex Mono; Instrument Serif file still in landing although memory says no serif in NextUp). — [G landing]; [M] MEMORY index

**(g) Operating capabilities**
- orch autonomous build system (see Q3), 6.2k lines, plus 85 written tasks with proofs. — [plans]
- Per-company Docker stack (app, postgres, n8n, backup, agent), same images hosted or on-prem; one Hetzner VM per hosted company; outbound-only agent pulling signed releases. — [M nextup-platform-plan](file:///C:/Users/k_sch/.claude/projects/B--06-CODE-06-Projects-Startup-speed/memory/nextup-platform-plan.md); [P] HD6
- Done in PILOT: remote deploy over SSH forced command, restic off-box backups (Hetzner Object Storage default), pre-migrate snapshots, pinned digests, brain image in CI, alert lists + heartbeat, clean-host install test. — [P] OPS; [G] #265, #267, #281, #289, #298
- Shared demo box 178.104.253.90 with acme/globex/demo/staging/admin/automation stacks; real customer data forbidden there (HD6). — [P]; [V Domains note]
- Secrets via sops + age in `nextup-infra`. — [G]
- Not built: VM-as-code (INF parked), HA, 24/7 operations. — [P]

### Inferences
- **Hidden vs public:** the public surface (landing: one-box/one-ledger loop, "measures cases, never people", free 5-day timing offer) reveals the concept, not the implementation. The specification layer (PILOT briefs, ADRs, gap register, HD decisions), eval sets, automotive queue framing and compliance pack are internal and would have to be re-derived by an imitator.
- **Effort ranking (Estimate, classic PW to re-create):** core app + loop ~30–40; PILOT foundation (STR/IDN/CLK/VIS) ~11; integrations (M365, Jira Cloud/DC, Teams, Entra/DIR, EID SAML/SCIM, API, SFX) ~25; compliance pack + GDP ~7 plus legal review outside code; ops/deploy ~4; test phase ~4; domain/strategy research ~4–6 PW of non-code work. Relationships: effectively zero transferable value today (no customer, no LOI, no recorded replies).
- The weakest assets for defensibility are brand/IP (test domain only, no trademark) and network; the strongest are trust artefacts once signed with a real customer — which PILOT itself does not deliver.

### Gaps
- Whether a production domain or a trademark is planned: not found.
- Pricing page content and any price points: not read in this pass.
- Any pilot conversations after 1 Nov (Marc's list of 10 companies): not in local sources.
- Exact test-case counts per suite at end of PILOT and the number of adapters actually live (vs built against fakes) cannot be known before the phases run; TMS, SFX and EID are proven only against fakes/recordings by plan.
