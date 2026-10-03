# NextHub - build plan

> **Plan · started 2026-09-15 · status checked 2026-09-23.** The product build plan: screens, logins, settings. The unticked boxes are still open; hosting moved to `2026-09-27_platform.md`.

> **Decision 15 Sep 2026: Next.js.** The repo is the Next.js app; the old static demo
> was removed on 23 Sep 2026. Folder rules: `docs/ARCHITECTURE.md`.

The product: employees raise a case in one field, it lands in the right leader's inbox with a
clock, the leader answers, the manager sees the wait ledger. Three roles, three home screens
(the whiteboard concept, section 8). The old static demo proved the inbox loop for one
company; this app adds everything around it: landing, login, company, roles, real data.

## The user journey

```
/                                  LANDING (public)
  -> /login                        step 1: work email or company slug -> finds the company
      -> /acme/login               step 2: company-branded login
          -> /acme                 role router: reads the session, redirects by role
              manager  -> /acme/manager   Overview   decisions waiting, wait ledger, stall reasons
              leader   -> /acme/leader    Inbox      open items by age; yes / no+why / hand over / ask
              member   -> /acme/team      My cases   raise one field; see what happened to mine
              shared      /acme/{problems,ideas,collaboration,progress,cases/[id]}
              admin       /acme/settings/{company,members,routing}      (manager only)
/signup                            creates a company + its first manager -> /[slug]/login
/invite/[token]                    joins an existing company with the role on the invite
```

Two logins are deliberate: the first only finds the tenant, the second authenticates inside it.
That is what gives each company its own branding now and its own SSO later.

## Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 16, App Router, TypeScript, `src/` | route groups map 1:1 onto the journey above |
| Styling | tokens + CSS Modules, global `nh-*` primitives | ports the demo palette with least friction; no framework to learn |
| Auth (Phase 2) | Auth.js v5: credentials + invite tokens; SSO providers later | per-tenant sessions, works in `proxy.ts` |
| DB (Phase 2) | Postgres + Prisma | every table has `companyId`; `lib/db` enforces it |
| Validation | zod (when forms go live) | shared between forms and server actions |
| Tests | vitest (unit), Playwright (e2e, Phase 3) | reducer/metrics stay pure; the inbox loop e2e is ported from the demo |
| Tenancy | path (`/acme/...`) first, subdomain via `proxy.ts` later | zero DNS work locally |

## Phases

Each phase ends with something a teammate can open in a browser. One branch per task, PR to
`main`, Kevin merges (`CONTRIBUTING.md`).

> **Status checked against the code on 23 Sep 2026** (main at #48). Where the build went a
> different way than planned, the line says so.

### Phase 0 - Repo + scaffold (done 15 Sep)
- [x] Next.js 16 app at the repo root; static demo moved to `legacy/demo/` (deleted 23 Sep)
- [x] Every route exists (`docs/ROUTES.md`); `src/config/roles.ts`: ROLE_HOME, ROLE_ACCESS, NAV
- [x] Landing, login step 1, login step 2 ported to React (visual only); AppShell rail + top bar
- [x] `features/`: tenant (demo table), routing matcher, metrics, case event types; unit tests
- [x] CI: lint, typecheck, test, build; CLAUDE.md / CONTRIBUTING.md / CODEOWNERS updated
- [x] Rename the GitHub repo `agility-dashborad` -> `nexthub` -> `nextup`
- [ ] Hosting: compose stack on the Hetzner box (`docs/DEPLOY.md`) - not yet run end to end

### Phase 1 - Finish the public side
- [x] Pricing and contact pages with real copy; contact form stores a pilot request, answered from `/admin/requests`
- [ ] Signup / invite / forgot-password as real forms that validate (zod) and redirect (all three are still stubs)
- [x] Login step 1 looks up the company by name or email domain (`findCompany`); unknown -> inline error
- [ ] Mobile pass on every public page

### Phase 2 - Sessions, tenant guard, role homes with seed data
- [x] Prisma schema + seed; company content (departments, routing, cases) in `Company.seedJson`
- [x] Sessions: signed cookie `features/auth/cookie.ts` instead of Auth.js; `proxy.ts` enforces login + `ROLE_ACCESS`
- [x] Personal login codes + Microsoft Entra sign-in (#47); demo vs real-people stages via `policyFor()` (#46)
- [x] Role router reads the session; AppShell shows the real user; log out
- [x] `features/cases/reducer.ts`: port of `legacy/demo/js/store.js` + its tests
- [x] **Member** `/raise` + `/team` (what happened to what I sent) + `/dashboard`
- [x] **Leader** `/leader`: Inbox by age; actions through one input sheet -> server actions
- [x] **Manager** `/manager`: Overview - `features/metrics` computes the ledger from cases + events
- [x] Dev panel (demo stage only): switch person, demo data off, reset
- [ ] Real companies: the views still go through `DemoProvider` and match the signed-in person to the seed by name - move to the `User` row

### Phase 3 - Shared views, settings, e2e
- [x] Problems, Ideas, Collaboration, Progress, Case detail timeline
- [ ] Settings -> Members: list people, change role, issue a login code, deactivate (today only in `/admin`)
- [ ] Settings -> Company: name, departments (page is a stub)
- [ ] Settings -> Routing: editor (page is read-only from the seed)
- [ ] Playwright e2e: login flow; the whole inbox loop (only `tests/e2e/admin-flow.cjs` exists)

### Phase 4 - Pilot-ready
- [ ] A second company in the seed to prove isolation (`tests/db/isolation.test.ts` covers the DB side); per-company logo and accent
- [ ] Email: invites, password reset, "an item is older than N days" (SMTP sends case notices to route owners and pilot replies)
- [x] SSO: Microsoft Entra (#47)
- [x] Subdomain tenancy via `proxy.ts` (`TENANT_MODE=subdomain`)
- [x] Delete `legacy/demo/` and its two CI jobs (23 Sep)
- [ ] The "before the first real customer" list in `docs/SECURITY.md`

## Decisions to make before Phase 2
1. Does a Leader also get "My cases"? (default: yes - everyone can raise; NAV already says so)
2. Can a Manager act in the Inbox? (default: view yes; act = an `override` event, as in the demo)
3. Anonymous handles per company or always on? (default: per company, `anonymousHandles`)
4. Tailwind or not? (decided: not - tokens + CSS Modules, fewer concepts for the team)

## What stays where
- The static demo is gone; sales calls use the demo stage at `/acme`.
- Strategy, outreach, competitor docs - outside the repo (Startup_speed root). Untouched.
