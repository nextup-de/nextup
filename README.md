# NextUp

Who owns what, and what is waiting on whom. An employee develops an idea with an AI coach until it
scores high enough to publish (docs/IDEAS.md); it lands in the right leader's inbox with a clock, the
leader answers, management sees the wait ledger.

Next.js 16 (App Router, TypeScript), no CSS framework - tokens + CSS Modules.
`docs/PLAN.md` is the roadmap; `docs/ARCHITECTURE.md` explains the folders; `docs/ROUTES.md`
and `docs/DATA_MODEL.md` are the map. Process rules: `CONTRIBUTING.md`. AI sessions: `CLAUDE.md`.

## Run

No database and no Docker needed - it falls back to the built-in `acme` demo. That also holds when
`DATABASE_URL` is set but nothing answers there (a copied `.env` on a laptop without Postgres):
the server says so once at startup and runs the demo; only `/admin` and login need the database.

```bash
npm install
npm run dev          # http://localhost:3000/acme
```

The whole stack - Postgres, n8n, a mail catcher and TLS - is one command, and gives every
company its own subdomain. See **[docs/DEPLOY.md](docs/DEPLOY.md)**:

```bash
cp .env.example .env
docker compose up --build     # http://acme.localhost, http://admin.localhost
```

| Script | What |
|---|---|
| `npm run dev` | dev server with hot reload |
| `npm run build` / `npm start` | production build / serve it |
| `npm run lint` · `npm run typecheck` · `npm test` | what CI runs (all database-free) |
| `npm run db:migrate` · `npm run db:seed` | set up a local database and its demo company (reads `.env.local`) |
| `ops/test-db.sh` | the database-backed suite, kept out of `npm test` |

Demo company: `/acme`, log in at `/acme/login` with a personal login code (`npm run db:seed`
prints one per person; `/admin` issues new ones), with Microsoft if the company is on Entra, or -
on a box with `LOGIN_DEMO_FILL=true` - from the "View the demo as…" list. New companies are added in
`/admin` and are live immediately - no deploy.

## Layout

npm workspaces + Turborepo. The app is `apps/app/`; the paths below are inside it. `docs/`,
`ops/`, `compose.yml` and `.github/` stay at the repo root. Plan: `docs/PLATFORM_PLAN.md`.

```
src/app/            routes - (marketing) · (auth) · [company]/login · [company]/(app)/{manager,leader,team,...} · api
src/components/     React: ui · marketing · auth · shell · dashboard/{manager,leader,team,shared}
src/features/       domain logic per entity (tenant, routing, metrics, cases, ...) - no React in here
src/config/         roles.ts (ROLE_HOME, ROLE_ACCESS) · nav.ts · site.ts
src/lib/            db client, utils          src/server/actions/   server actions (validate -> auth -> features)
src/styles/         design tokens             src/types/            domain types
prisma/  public/  tests/{unit,e2e}  docs/
```

Rule of thumb: **pages fetch, components render, features decide.**
