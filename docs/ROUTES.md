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
| `/[company]/dashboard` | `.../(app)/dashboard/page.tsx` | yes | any | Every problem and idea: open since, on whose desk, stage, score |
| `/[company]/team` | `.../(app)/team/page.tsx` | yes | any | What happened to what I sent (one card per case) |
| `/[company]/problems` | `.../(app)/problems/page.tsx` | yes | any | Problems |
| `/[company]/ideas` | `.../(app)/ideas/page.tsx` | yes | any | Ideas |
| `/[company]/collaboration` | `.../(app)/collaboration/page.tsx` | yes | any | Initiatives |
| `/[company]/progress` | `.../(app)/progress/page.tsx` | yes | any | Movement since baseline |
| `/[company]/cases/[caseId]` | `.../(app)/cases/[caseId]/page.tsx` | yes | any | Case detail |
| `/[company]/settings/*` | `.../(app)/settings/{company,members,routing}/page.tsx` | yes | manager | Company admin |
| `/demo/*` | `demo/{raise,dashboard,cases/[caseId],people/[name]}/page.tsx` | - | - | Static demo: made-up data, no company, no login, nothing leaves the browser; `/demo` opens `/demo/raise`. On a stack whose company is `demo` (demo.sellux.ch) it is the whole host, at the root (docs/IDEAS.md, "The demo page") |
| `/api/health` | `api/health/route.ts` | - | - | Uptime check |

Role rules are data in `src/config/roles.ts` (`ROLE_HOME`, `ROLE_ACCESS`, `canAccess()`, `SHELL`) and nav
per role in `src/config/nav.ts`. `SHELL[role]` picks the chrome: members get the simple bar
(logo, Ideas | Dashboard, profile - `SimpleShell`), leaders and managers the rail + top bar. Enforcement (`src/proxy.ts` + the `(app)` layout) arrives with
sessions in Phase 2; until then every app page renders with the demo tenant as manager.

Layouts nest: `app/layout.tsx` (html, fonts) ->
`[company]/layout.tsx` (resolve tenant, 404) -> `(app)/layout.tsx` (AppShell: rail + top bar)
-> `settings/layout.tsx` (sub-nav). Auth pages compose `AuthShell` themselves.
