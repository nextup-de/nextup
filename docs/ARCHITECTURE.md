# Architecture

An npm-workspaces monorepo driven by Turborepo (`turbo.json`). The Next.js app lives in
`apps/app/`; shared code will go to `packages/` as it appears, and the developer admin moves to
`apps/ops/` (docs/PLATFORM_PLAN.md). Every `src/`, `prisma/` and `tests/` path in this document
is relative to `apps/app/`. Root scripts (`npm run dev`, `npm test`, ...) run the app's own.

## Layers

```
src/app/           routes. Layouts + pages + route handlers. Thin: read params, call features, render components.
src/components/    React. Props in, JSX out. No fetching, no business rules.
src/features/      the domain, one folder per entity. Pure TypeScript: no React, no DOM, no Next imports.
src/server/actions server actions: validate (zod) -> session + role -> features/*/actions.
src/lib/           infrastructure: db client, utils.
src/config/        roles, nav, site constants. Data, not code - most product rules live here as tables.
src/styles/        design tokens (CSS variables).
```

Dependency direction, strictly one way:

```
app  ->  components  ->  (nothing)
app  ->  features    ->  lib
app  ->  server/actions -> features
everything -> config, types, styles
```

`components/` never imports `features/` (except pure helpers with no I/O). `features/` never
imports `components/` or anything from `next/*`. That is what keeps the domain testable with
plain vitest and portable if the framework ever changes.

## Routes = the user journey

```
(marketing)/           public: landing, pricing, contact
(auth)/                global: find your company, signup, forgot-password, invite
[company]/             tenant scope - layout resolves the slug, 404s otherwise
  login/               company-branded login
  (app)/               authenticated shell (rail, top bar)
    page.tsx           role router -> ROLE_HOME[role]
    manager/ leader/ team/           the three role homes
    problems/ ideas/ collaboration/ progress/ cases/[caseId]/   shared views
    settings/          company admin (manager only)
api/                   route handlers (health; auth in Phase 2)
```

`src/proxy.ts` (Next 16 middleware) will add: subdomain -> path rewrite, session redirect,
`ROLE_ACCESS` enforcement. Until then pages render with the demo tenant.

## Conventions

- **Naming:** folders kebab-case, React components PascalCase files, everything else camelCase.
  One component per file; a component's styles sit next to it as `Name.module.css`.
- **Styling:** tokens in `src/styles/tokens.css`; shared primitives as global `nh-*` classes in
  `globals.css` (buttons, fields, eyebrow); everything else CSS Modules. No inline style objects
  beyond a one-off. No CSS framework. Every screen at 100% zoom: the rules are in `docs/RESPONSIVE.md`.
- **Server first:** pages and layouts are server components. Add `"use client"` only to the
  leaf that needs state or events, never to a page.
- **Params are async:** `const { company } = await params;` (Next 15+).
- **Tests:** `tests/unit/` mirrors `src/features/`. `tests/e2e/` (Playwright, Phase 3) drives
  the login flow and the inbox loop.
- **Nothing named `data/`** - the repo `.gitignore` ignores that folder name everywhere.

## Where the demo went

The old static dashboard (`legacy/demo/`) was ported and then deleted on 23 Sep 2026. Its
`js/data.js` became `prisma/seed`, `js/store.js` became `features/cases/reducer.ts` and
`js/dashboard.js` became the role views. Comments that say "port of legacy/demo/..." point into
git history (last present at `d8ebf99`). Its two planning notes now live in `docs/`.
