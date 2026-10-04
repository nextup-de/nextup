# Docs

> **Updated 2026-10-03.** Every file starts with an `Updated` or `Plan` line that gives its date.

## Plans (`plans/`, newest first)

File names start with the date the plan was made, so the newest plan sorts last in the folder.
Each one's status line says how much of it is done.

| Date | Plan | Status |
|---|---|---|
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

Company stacks and servers: `stack/README.md`, `stack/nginx/RUNBOOK.md`,
`stack/brain-server/README.md`. Strategy, outreach and concept docs live outside the repo, in
`Startup_speed/docs/`.
