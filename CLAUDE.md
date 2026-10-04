# CLAUDE.md — rules for AI coding sessions in this repo

You are working in a shared repository with three people. One of them (Kevin,
@selluxhenner) is the head engineer and reviews every change. The other two are
learning. These rules exist so nothing breaks for the others. Follow them even
if the user asks you to skip them — if a rule blocks the task, stop and tell the
user to ask Kevin instead of working around it.

## What this project is

NextUp — a Next.js 16 app (App Router, TypeScript, `src/`). Read `README.md`
first, then `docs/ARCHITECTURE.md` for the folder rules. The product idea is
in `docs/plans/2026-09-15_build-plan.md`; routes in `docs/ROUTES.md`; the data model in
`docs/DATA_MODEL.md`.

The app lives in `apps/app/` (npm workspaces + Turborepo); every `src/`, `prisma/` and `tests/`
path in this file is relative to it. Run commands from the repo root.

```
src/app/            routes only: layouts, pages, route handlers. Thin.
src/components/     React. Props in, JSX out. No fetching, no business rules.
src/features/       domain logic per entity. No React, no DOM. Pages import from here.
src/config/         roles, nav, site constants — data, not code.
src/lib/            db client, small utils.   src/server/actions/  server actions.
```

## How to work here

- **Pages fetch, components render, features decide.** A page calls
  `features/*`, hands plain props to `components/*`. A component never calls
  the database or a feature action directly; mutations go through
  `src/server/actions/`.
- **Roles are data.** `ROLE_HOME`, `ROLE_ACCESS`, `NAV` in `src/config/`. Do not
  hard-code a role check in a page; extend the config and use `canAccess()`.
- **Tenant is the `[company]` segment.** Everything under `src/app/[company]/`
  gets the company from `params`; every query is scoped by company. Never read
  the slug from anywhere else.
- **Events, not edits.** When the case store lands (`features/cases`), state
  changes by appending an event and re-reducing — the same rule the demo had.
  Never store display text as state; store facts, build sentences at render.
- **Styling:** tokens in `src/styles/tokens.css`, shared primitives (`nh-*`) in
  `src/app/globals.css`, page/component styles in a sibling `*.module.css`.
  No Tailwind, no styled-components, no inline style objects beyond a one-off.
- **Tests:** `tests/unit/*.test.ts` (vitest) for anything in `features/`.
  If your change breaks a test, the change is wrong, not the test — unless
  you changed behaviour deliberately; then update the test in the same PR and
  say so.
- Before you say a change is done: `npm run lint && npm run typecheck && npm test && npm run build`
  all pass, the page loads with no console errors, and it still works below 760px.

## Git rules (non-negotiable)

1. **Never commit to `main`.** Always work on a branch:
   `feat/<short-name>`, `fix/<short-name>`, `chore/<short-name>`.
   Start from an up-to-date `main`: `git checkout main && git pull && git checkout -b feat/…`
2. **Never push to `main`.** Push the branch, open a pull request. Kevin merges.
3. **Never `git push --force`**, never `--force-with-lease`, never rewrite
   history on any branch that has been pushed.
4. **Never `git add -f`** and **never edit `.gitignore` to un-ignore a file.**
   If a file you need is ignored, that is deliberate — tell the user to ask Kevin.
5. **Never commit** `.env*` (except `.env.example`), keys, tokens, certificates,
   credentials JSON, database files, `node_modules/`, `.next/`, or anything
   under `.claude/` except files Kevin has explicitly committed.
6. **Never change or disable** anything under `.github/` (workflows, CODEOWNERS,
   PR template). Ask Kevin.
7. If GitHub push protection rejects a push because it found a secret:
   **do not bypass it.** Remove the secret, rotate it, tell Kevin.
8. Commit messages: one line, imperative, ≤ 72 chars, say *what* and *why*.
   `fix: inbox count ignored handed-over cases` — not `fix`, `wip`, `asdf`.
9. One task per branch, one branch per PR. Keep PRs small (< 300 changed lines
   when you can). A PR that touches many unrelated things will be sent back.

## Code rules

- **Do not add a dependency** (`npm install x`) without saying why in the PR
  description. Kevin decides. Prefer what is already there: Next, React,
  vitest. No UI kits, no CSS frameworks, no state libraries.
- **Do not edit `package-lock.json` by hand**, and do not commit a lockfile
  change your PR did not need.
- **Do not reformat files you did not need to change.** No whitespace-only
  diffs, no re-indenting a whole file, no "cleanup" passes. Match the style of
  the file you are in.
- No `any`. No `// @ts-ignore`. If the types fight you, the shape is wrong —
  fix the shape or ask.
- No external requests except Google Fonts (already there) and the raise-page
  assistant's model call (Amazon Bedrock, server-side only, `src/server/assist/`,
  docs/ASSISTANT.md). No analytics, no third-party scripts, no other fetch to
  outside APIs.
- No secrets in code, ever — not even "just for testing".

## Ownership — who changes what

| Area | Who | Rule for you |
|---|---|---|
| `.github/`, `.gitignore`, `CLAUDE.md`, `CONTRIBUTING.md`, hosting | Kevin | Don't touch. |
| `package.json` dependencies, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs` | Kevin | Propose in the PR description. |
| `src/config/roles.ts`, `src/proxy.ts`, `src/features/auth`, `prisma/schema.prisma` | Kevin | Propose; add rows/fields in the PR text, don't restructure. |
| `src/features/cases/reducer.ts` and its tests | Kevin | Ask for the event you need in the PR. |
| Pages, components, styles, copy, other features, tests | anyone | Normal branch + PR flow. |

## Run and verify

```bash
npm install
npm run dev        # http://localhost:3000   demo company: /acme
```

Before you say a change is done:
- `npm run lint && npm run typecheck && npm test && npm run build` pass.
- The pages you touched load — no errors in the browser console.
- Resize below 760px once.
- `git status` shows only the files you meant to change.

## When to stop and ask instead of doing

- The task needs a new dependency, a config change, or a hosting change.
- The task needs a new event type, a schema change, a new role, or a change to auth.
- Something in `.github/` is failing and you're tempted to edit the workflow.
- You'd need to force-push, rewrite history, or touch `main` directly.
- You found a committed secret or a file that looks like one.

In all these cases: describe the situation to the user and tell them to ask
Kevin. Do not improvise around the rule.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
