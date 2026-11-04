# Route map

> **Updated 2026-10-06** · reference: every URL and its file.

| URL | File (`src/app/`) | Session | Role | Purpose |
|---|---|---|---|---|
| `/` | `page.tsx` | - | - | Redirects to `/login`. The public site (landing, pricing, contact) is the `nextup-landing` repo |
| `/login` | `(auth)/login/page.tsx` | - | - | Find your company -> `/[company]/login` |
| `/signup` | `(auth)/signup/page.tsx` | - | - | Create company + first manager |
| `/forgot-password` | `(auth)/forgot-password/page.tsx` | - | - | Reset request |
| `/invite/[token]` | `(auth)/invite/[token]/page.tsx` | - | - | Accept invite |
| `/[company]/login` | `[company]/login/page.tsx` | - | - | Company-branded login |
| `/[company]` | `[company]/(app)/page.tsx` | yes | any | Redirect to `ROLE_HOME[role]` |
| `/[company]/manager` | `.../(app)/manager/page.tsx` | yes | manager | Overview |
| `/[company]/leader` | `.../(app)/leader/page.tsx` | yes | leader, manager | Inbox |
| `/[company]/raise` | `.../(app)/raise/page.tsx` | yes | any | Idea studio: develop an idea with the coach, publish at the threshold (member home, docs/IDEAS.md) |
| `/api/[company]/ideas/turn` | `app/api/[company]/ideas/turn/route.ts` | yes | any | One message in the idea studio: server score + coach reply (SSE) |
| `/[company]/dashboard` | `.../(app)/dashboard/page.tsx` | yes | manager | The wait ledger (docs/METRICS.md): six tiles with baseline and trend, stages, answers, the unit and role breakdown with groups under 5 people hidden, CSV export. Query: `unit` and `period` (`30d`, `quarter`, `golive`). No person is named or counted |
| `/[company]/dashboard/kpis` | `.../(app)/dashboard/kpis/page.tsx` | yes | manager | The idea-management KPI report per unit and company for fixed periods (year, last year, since go-live); small units hidden |
| `/[company]/people/[userId]` | `.../(app)/people/[userId]/page.tsx` | yes | any | Person card for an opaque user id of an active person in this company: name, role, unit. No statistics, shared work or location. Your own id redirects to `/profile`. Old name URLs (`/people/<name>`) return not found and no name is ever looked up |
| `/[company]/feed` | `.../(app)/feed/page.tsx` | yes | any | Every problem and idea this viewer may see as cards: filter by site and department, support, comment. `?id=` opens one in place |
| `/[company]/team` | `.../(app)/team/page.tsx` | yes | any | What happened to what I sent (one card per case) |
| `/[company]/problems` | `.../(app)/problems/page.tsx` | yes | any | Redirects to `/feed` |
| `/[company]/idea` | `.../(app)/idea/page.tsx` | yes | any | `?id=` is one idea or problem, open: a row of "Ideas" on `/projects` opens here, in place, and ✕ goes back. `/projects?id=` and `/overview?id=` move here; without an id it moves to `/projects` |
| `/[company]/ideas` | `.../(app)/ideas/page.tsx` | yes | any | Redirects to `/feed` |
| `/[company]/projects/collaboration` | `.../(app)/projects/collaboration/page.tsx` | yes | any | Tab of Projects. Initiatives; with the `projects` flag, the projects. `/collaboration` redirects here |
| `/[company]/projects/progress` | `.../(app)/projects/progress/page.tsx` | yes | any | Tab of Projects (`/progress` redirects here). Movement since baseline; with the `projects` flag, each measured project's before → after and the Wait ledger after the yes |
| `/[company]/projects` | `.../(app)/projects/page.tsx` | yes | any | Projects by state (Planning, Running, Measuring, Measured and recognised, Stopped), on one page side by side with "Ideas" (the `/overview` table), about 80% of the screen wide; `/overview` shows the same page. Below 1100px the two stack. Members see their own ideas' and the ones they are on. `projects` flag (docs/plans/2026-10-15_idea-to-project.md) |
| `/[company]/projects/[projectId]` | `.../(app)/projects/[projectId]/page.tsx` | yes | any | One project: board (drag a card to move it), the idea it came from with versions, discussion and archive line, files and sources, team, baseline, measure checks, reward, links, comments, timeline. `projects` flag |
| `/[company]/cases/[caseId]` | `.../(app)/cases/[caseId]/page.tsx` | yes | any | Case detail |
| `/[company]/settings/*` | `.../(app)/settings/{company,members,routing}/page.tsx` | yes | manager | Company admin |
| `/admin/*` | `admin/{page,people,connectors,assistant,company-data,decisions,support,login}` | own cookie | console admin | The company's IT and privacy console, one-company stacks only (`TENANT_MODE=single`; 404 in multi mode). Seven sections in `CONSOLE_SECTIONS`. Who enters: Microsoft sign-in with the `NextUp.Admin` role, a stack admin (personal code + authenticator code), the logged break-glass code, or a read-only support session. No platform pages: `/admin/companies`, `/requests`, `/tickets`, `/connections` are 404 (docs/ADMIN.md) |
| `/demo/*` | `demo/{raise,dashboard,cases/[caseId],projects/[projectId],leader,manager,…}/page.tsx` | - | - | Static demo: made-up data, no company, no login, nothing leaves the browser; `/demo` opens `/demo/raise`, a case opens at `/demo/cases/<id>`. On a stack whose company is `demo` (demo.sellux.ch) it is the whole host, at the root (docs/IDEAS.md, "The demo page") |
| `/api/health` | `api/health/route.ts` | - | - | Uptime check |
| `/api/client-errors` | `api/client-errors/route.ts` | - | - | A browser's script error (`navigator.sendBeacon` from `components/report/error-reporter.ts`), counted by kind with the server's errors (`server/errors.ts`). Same origin only, 8 KB, 204 |

Role rules are data in `src/config/roles.ts` (`ROLE_HOME`, `ROLE_ACCESS`, `canAccess()`, `SHELL`) and nav
per role in `src/config/nav.ts`. `SHELL[role]` picks the chrome: members get the simple bar
(logo, Ideas | Dashboard, profile - `SimpleShell`), leaders and managers the rail + top bar. Enforcement (`src/proxy.ts` + the `(app)` layout) arrives with
sessions in Phase 2; until then every app page renders with the demo tenant as manager.

Layouts nest: `app/layout.tsx` (html, fonts) ->
`[company]/layout.tsx` (resolve tenant, 404) -> `(app)/layout.tsx` (AppShell: rail + top bar)
-> `settings/layout.tsx` (sub-nav). Auth pages compose `AuthShell` themselves.
