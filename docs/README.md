# Docs

> **Updated 2026-11-08.** Every file starts with an `Updated` or `Plan` line that gives its date.

## Plans (`plans/`, newest first)

File names start with the date the plan was made, so the newest plan sorts last in the folder.
Each one's status line says how much of it is done.

| Date | Plan | Status |
|---|---|---|
| 2026-11-08 | [Project workflows and templates per department](plans/2026-11-08_project-workflows.md) | roadmap after funding; phase TPL of the master plan in detail: five modes (board, external tool, stage gate, fixed procedure, AI-orchestrated), shipped library, department templates; waits for W1–W8 |
| 2026-11-08 | [Master plan: review, approvals, a reasoned no, the raiser's view, recognition and the project agent](plans/2026-11-08_decision-stages.md) | roadmap after funding, not demo or pilot scope; seven phases NOR, SEE, SET, GAT, TPL, REC, AGT; nothing built; waits for Kevin's decisions D1–D12 |
| 2026-11-03 | [Project setup: from "Yes" to "Start"](plans/2026-11-03_project-setup.md) | draft, waits for review; setup checklist, project roles, asking for new people, goal, brief, kickoff; Sam's part in spec 12 |
| 2026-11-03 | [Project area: one project, one question per tab](plans/2026-11-03_project-area.md) | exploration in Paper; structure for Sam to design, agent tab is phase 2 |
| 2026-11-02 | [Pilot pages: what every new and changed screen looks like](plans/2026-11-02_pilot-pages.md) | open; Sam designs and builds these pages: nine spec files and a copy of the build plans in `plans/2026-11-02_pilot-pages/` |
| 2026-11-01 | [Master plan: from today's build to a pilot-ready product](plans/2026-11-01_pilot-readiness.md) | draft, 22 phases; waits for Kevin's go |
| 2026-11-01 | [Analysis: big corporate or mid-size company first?](plans/2026-11-01_segment-analysis.md) | open; Kevin and Marc decide |
| 2026-10-15 | [From accepted idea to measured project](plans/2026-10-15_idea-to-project.md) | built 15 Oct; release, demo promote, Jira site left |
| 2026-10-05 | [Admin tickets: what to take from Swiss Edu Solution](plans/2026-10-05_admin-vs-ses.md) | open |
| 2026-10-03 | [AI server: test first, then rent the GPU](plans/2026-10-03_ai-server-gpu.md) | open |
| 2026-09-27 | [Platform: one stack per company](plans/2026-09-27_platform.md) | stage 1 almost done |
| 2026-09-24 | [Raise-page assistant](plans/2026-09-24_raise-assistant.md) | built; "Open" list left |
| 2026-09-15 | [Build plan: screens, logins, settings](plans/2026-09-15_build-plan.md) | partly open |

## Reference (what is built)

These describe the current code. Their names stay fixed because the code links to them; the date
is on their first line.

| File | About |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | folders and layers |
| [ROUTES.md](ROUTES.md) | every URL and its file |
| [DATA_MODEL.md](DATA_MODEL.md) | tables and events |
| [SECURITY.md](SECURITY.md) | stages, doors, the list before real customers |
| [INTEGRATIONS.md](INTEGRATIONS.md) | events API, tokens, stages, n8n |
| [ASSISTANT.md](ASSISTANT.md) | the raise-page assistant |
| [COMPANY_KNOWLEDGE.md](COMPANY_KNOWLEDGE.md) | company knowledge tables |
| [IDEAS.md](IDEAS.md) | the idea studio |
| [RESPONSIVE.md](RESPONSIVE.md) | layout rules |
| [DEPLOY.md](DEPLOY.md) | running it on a laptop |
| [audit/gap-register.md](audit/gap-register.md) | gaps to the pilot, by phase |
| [customer/INSTALL.md](customer/INSTALL.md) | customer guide: server requirements, install, DNS and TLS, first admin |
| [customer/OPERATIONS.md](customer/OPERATIONS.md) | customer guide: releases, backups, monitoring, key rotation, break-glass, support access |
| [customer/SECURITY_GUIDE.md](customer/SECURITY_GUIDE.md) | customer guide: data flows, encryption, access, SSO, audit, hardening checklist |
| [IDENTITY.md](IDENTITY.md) | identity by id, OIDC, SAML, SCIM, log export, tables, test fakes, claims (updated 2026-11-04) |
| [customer/SSO_SETUP.md](customer/SSO_SETUP.md) | customer guide: Entra, Okta, ADFS, Keycloak, SCIM, syslog and file export (updated 2026-11-04) |
| [pilot/README.md](pilot/README.md) | pilot package: runbook, onboarding, training (DE/EN), support, success measures, one-pager (updated 2026-11-04) |

Design system (tokens, components, brand assets, UI kit): `design-system/README.md`.

Company stacks and servers: `stack/README.md`, `stack/nginx/RUNBOOK.md`,
`stack/brain-server/README.md`. Strategy, outreach and concept docs live outside the repo, in
`Startup_speed/docs/`.
