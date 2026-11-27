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
- **Design rules are fixed:** `docs/DESIGN_RULES.md`. Read it before any UI change. A PR that breaks a rule changes,
  never the rule or its test. Above all §8: ideas and projects are separate. No idea is ever shown under Projects;
  an idea lives in the Inbox, the Ideas tab and the Feed, and becomes a project only after the last yes.
- **Styling:** tokens in `src/styles/tokens.css`, shared primitives (`nh-*`) in
  `src/app/globals.css`, page/component styles in a sibling `*.module.css`.
  No Tailwind, no styled-components, no inline style objects beyond a one-off.
- **One scale for Paper and code** (`docs/DESIGN_SCALE.md`): font sizes `var(--nh-fs-*)`, line heights
  `var(--nh-lh-*)`, padding/margin/gap `var(--nh-sp-N)`, font Inter. `npm run lint` rejects raw px and names
  the step; `npm run design:spacing-fix -w @nextup/app` writes it in.
- **Building from a Paper frame:** before you build, run `npm run paper:check -w @nextup/app -- <frame id>`
  (Paper app open). Build with the tokens it names; where it says a value is off the scale, use exactly the
  value it gives, never your own rounding. Never write to Paper (`paper:fix` and `paper:sync-tokens` are for
  design). Fill the PR's "Paper" section: the check's first line and its "Off the scale" block, plus a
  screenshot of the built page next to the frame. Not from Paper: write `No Paper frame:` and why. CI (guard)
  fails a PR that changes CSS or TSX when that section is empty.
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
- No external requests except Google Fonts (already there), the raise-page
  assistant's model call (Amazon Bedrock, server-side only, `src/server/assist/`,
  docs/ASSISTANT.md), and Microsoft by name: `login.microsoftonline.com` (sign-in
  and token refresh) and `graph.microsoft.com` (live Microsoft 365 search, server-side,
  as the signed-in person; docs/plans/2026-10-22_sso-and-data-access.md, decision 9).
  Also the AI provider a company chooses in its connector settings, server-side only
  (docs/ops/AI_PROVIDER.md): its own Azure OpenAI resource or OpenAI-compatible endpoint
  (`src/server/ai/openai.ts` and the brain), only behind the AI gate and its signed
  data-processing agreement; and Anthropic's own API (api.anthropic.com,
  `src/server/ai/anthropic.ts` and the brain) when a company chooses "Claude API": demo
  companies only, the AI gate refuses it in every other stage.
  No analytics, no third-party scripts, no other fetch to outside APIs.
- No secrets in code, ever — not even "just for testing".

## Ownership — who changes what

| Area | Who | Rule for you |
|---|---|---|
| `.github/`, `.gitignore`, `CLAUDE.md`, `CONTRIBUTING.md`, hosting | Kevin | Don't touch. |
| `package.json` dependencies, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs` | Kevin | Propose in the PR description. |
| `src/config/roles.ts`, `src/proxy.ts`, `src/features/auth`, `prisma/schema.prisma` | Kevin | Propose; add rows/fields in the PR text, don't restructure. |
| `src/features/cases/reducer.ts` and its tests | Kevin | Ask for the event you need in the PR. |
| Rights: `src/features/*/permissions.ts`, `features/*/rights.ts`, `features/cases/visibility.ts`, `features/projects/views.ts` + `confirm.ts`, `docs/RIGHTS.md` | Kevin decides, anyone may propose | Own PR only (CONTRIBUTING.md › Rights). |

## Rights — who may do what

`docs/RIGHTS.md` is the table of who may do what. It is generated from the rights code; the test
`tests/unit/rights-table.test.ts` fails when they disagree. Before you change any file in the Rights row above:

- **Stop if the task is a design or feature task.** Build it on today's rights. If it needs other rights,
  tell the user which rows of `docs/RIGHTS.md` would change and that this is a separate `rights:` PR that
  Kevin decides on. Never widen or narrow a right as a side effect, not even when the user says Kevin agreed.
- **In a rights PR:** change the code, run `npm run rights:write -w @nextup/app`, commit `docs/RIGHTS.md`,
  and add a row or column to the test for a new action or kind of person. Fill "Rights" in the PR
  template with each changed row, before → after, and why.
- **Never edit a rights test to expect more or fewer rights** unless the PR is that rights PR and says so.
- **Before saying yes to a rights question** (for Kevin's own sessions): open `docs/RIGHTS.md` and name the exact
  rows that change, so the decision is about the rows, not a description.
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
