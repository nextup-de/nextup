# Writing a multi-phase build plan that OpenAI Codex can execute on the NextUp monorepo

Research date: 2 Nov 2026. Note: OpenAI moved the Codex docs. Most `developers.openai.com/codex/...` URLs now 308-redirect to `learn.chatgpt.com/docs/...`. The links below are the pages actually fetched.

## Q1: Official OpenAI guidance on Codex (AGENTS.md, task size, acceptance, codex exec, sandbox/approval, cloud, long-horizon plans, failure modes)

### Takeaway
OpenAI's guidance fits the orch model well:
- Durable rules go in a short AGENTS.md.
- Each unit of work gets its own thread or worktree.
- Every prompt states its goal, context, constraints and a "done when" condition.
- Long work runs from a self-contained, living plan file (ExecPlan / PLANS.md) with milestones that can each be checked on their own.
- Non-interactive runs use `codex exec`, which is read-only unless you pass `--sandbox workspace-write`. `--full-auto` has been removed.

### Cited Findings

**AGENTS.md discovery and limits**
- Global step: Codex reads `~/.codex/AGENTS.override.md` if it exists, otherwise `~/.codex/AGENTS.md` (or the same files under `CODEX_HOME`). Only the first non-empty file at this level is used. — [AGENTS.md guide](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- Project step: Codex walks from the Git root down to the current directory. In each directory it checks `AGENTS.override.md`, then `AGENTS.md`, then the names in `project_doc_fallback_filenames`, and it takes at most one file per directory. The files are joined root first, so the file nearest the working directory comes last and wins. The chain is built once per run. — [AGENTS.md guide](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- Size limit: `project_doc_max_bytes` defaults to 32 KiB (32768 bytes). Codex stops adding files once the joined text reaches it. You can raise it (the docs' example uses 65536) or split the rules into nested files. — [AGENTS.md guide](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- `project_doc_fallback_filenames` goes in `~/.codex/config.toml`, for example `["TEAM_GUIDE.md", ".agents.md"]`. These names are only checked after `AGENTS.override.md` and `AGENTS.md`. — [AGENTS.md guide](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- What belongs where: global working agreements in `~/.codex`, setup plus lint/PR expectations at the repo root, team or service rules in nested files, and review rules under `## Code Review Rules` in the AGENTS.md nearest the code they govern. — [AGENTS.md guide](https://learn.chatgpt.com/docs/agent-configuration/agents-md)

**Best practices (prompts, AGENTS.md, review, parallel work)**
- A good prompt has four elements: goal, context (files, docs, errors), constraints, and a "done when" condition. — [Codex best practices](https://learn.chatgpt.com/docs/learn/best-practices)
- Reasoning effort: start at the default. Use Low for well-scoped tasks, Medium or High for complex changes and debugging, Extra High for long, reasoning-heavy work. — [Codex best practices](https://learn.chatgpt.com/docs/learn/best-practices)
- For complex or ambiguous work, plan first: Plan mode (`/plan`), let Codex interview you, or use a PLANS.md template for multi-step work. — [Codex best practices](https://learn.chatgpt.com/docs/learn/best-practices)
- AGENTS.md should be short and accurate. It should cover the repo layout, how to run the project, build/test/lint commands, conventions, do-not rules, and what "done" means. Add rules only after you see repeated mistakes. Put long, task-specific guidance (planning, code review) in separate files that AGENTS.md links to. — [Codex best practices](https://learn.chatgpt.com/docs/learn/best-practices)
- Keep one chat per coherent unit of work, and don't use one chat for a whole project. Use Git worktrees so tasks running at the same time don't touch the same files. Use subagents for bounded side work (exploration, tests, triage). — [Codex best practices](https://learn.chatgpt.com/docs/learn/best-practices)
- Have Codex write tests, run the relevant checks and review the diff. `/review` can review against a base branch, uncommitted changes or a commit. — [Codex best practices](https://learn.chatgpt.com/docs/learn/best-practices)
- Common mistakes the docs list:
  - putting durable rules in prompts instead of AGENTS.md or skills
  - not telling the agent how to build and test
  - skipping planning on complex tasks
  - granting full permissions too early
  - running live tasks on the same files without worktrees
  - using one chat for an entire project

  — [Codex best practices](https://learn.chatgpt.com/docs/learn/best-practices)
- Team skills live in `.agents/skills` and personal skills in `$HOME/.agents/skills`. Each skill should do one job. — [Codex best practices](https://learn.chatgpt.com/docs/learn/best-practices)

**ExecPlans / PLANS.md (long-horizon work)**
- An ExecPlan is a living design document the agent follows. A `PLANS.md` file defines what an ExecPlan must contain. AGENTS.md should get an "ExecPlans" section saying to use an ExecPlan "as described in .agent/PLANS.md" for complex features or big refactors. "ExecPlan" is a made-up term Codex was not trained on, so the file has to define it. — [OpenAI Cookbook: Using PLANS.md for multi-hour problem solving](https://developers.openai.com/cookbook/articles/codex_exec_plans)
- Sections of an ExecPlan, in order:
  1. Purpose / Big Picture
  2. Progress
  3. Surprises & Discoveries
  4. Decision Log
  5. Outcomes & Retrospective
  6. Context and Orientation
  7. Plan of Work
  8. Concrete Steps
  9. Validation and Acceptance
  10. Idempotence and Recovery
  11. Artifacts and Notes
  12. Interfaces and Dependencies

  Progress, Surprises, Decision Log and Outcomes are required. — [Cookbook](https://developers.openai.com/cookbook/articles/codex_exec_plans)
- Rules for an ExecPlan:
  - It is self-contained: a novice with only the working tree and the plan can succeed, every term is defined, and it never points at external docs.
  - Each milestone can be verified on its own.
  - Acceptance is described as behavior a person can observe, with inputs and outputs.
  - Steps are idempotent, with a recovery path.
  - The agent moves to the next milestone without asking "next steps?" and commits often.
  - Prototype milestones are allowed to reduce risk.

  — [Cookbook](https://developers.openai.com/cookbook/articles/codex_exec_plans)
- The Cookbook reports that a similar plan let Codex "work for more than seven hours from a single prompt". This is an anecdote, not a benchmark, and the recipe is marked archived (it may name outdated models). — [Cookbook](https://developers.openai.com/cookbook/articles/codex_exec_plans)

**`codex exec` (non-interactive runs)**
- Progress goes to stderr and only the final message goes to stdout. The default sandbox is read-only. `--full-auto` is no longer supported: use `--sandbox workspace-write`, or `--approve-for-me`, which sends approval requests to automatic review on top of workspace-write. — [Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)
- Flags:
  - `--json`: JSONL events such as `thread.started`, `turn.completed`, `item.*`
  - `-o/--output-last-message <file>`
  - `--output-schema <schema.json>`: forces the final answer into JSON matching a schema
  - `--ephemeral`
  - `--skip-git-repo-check`
  - `--ignore-user-config`
  - `--ignore-rules`
  - `codex exec resume --last | <SESSION_ID>`
  - `codex exec -` reads the whole prompt from stdin

  — [Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)
- More exec and global flags: `--cd/-C`, `--model/-m`, `--profile/-p`, `--sandbox/-s read-only|workspace-write|danger-full-access`, `--ask-for-approval/-a on-request|never`, `-c key=value` (repeatable), `--add-dir`. `--approve-for-me` cannot be combined with `--sandbox` or `--yolo`. — [Developer commands (CLI)](https://learn.chatgpt.com/docs/developer-commands?surface=cli)
- `codex review` runs a review non-interactively against `--uncommitted`, `--base BRANCH` or `--commit SHA`, optionally with custom instructions. — [Developer commands (CLI)](https://learn.chatgpt.com/docs/developer-commands?surface=cli)
- CI: for GitHub Actions OpenAI recommends `openai/codex-action`. Its example job runs Codex with only `contents: read`, uploads the diff as a patch, and applies it in a separate job that has write rights. Never set `OPENAI_API_KEY`/`CODEX_API_KEY` as a job-level variable where repository code runs; set `CODEX_API_KEY` only on the one call that needs it. A required MCP server that fails to start makes `codex exec` exit with an error. Codex requires a Git repo unless you pass `--skip-git-repo-check`. — [Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)

**Sandbox and approvals**
- The three sandbox modes:
  - `read-only`
  - `workspace-write` (the default for local CLI and IDE use)
  - `danger-full-access` (no sandbox, "not recommended")

  — [Approvals & security](https://learn.chatgpt.com/docs/agent-approvals-security)
- Approval policies:
  - `on-request`: the basis of the "Auto" preset
  - `never`: works best with a restrictive sandbox such as read-only in CI
  - `granular = {...}`: fine-grained control
  - `untrusted`: retired, and it "can prevent either client from starting"

  — [Approvals & security](https://learn.chatgpt.com/docs/agent-approvals-security)
- Network access is off by default in workspace-write. You enable it with `[sandbox_workspace_write] network_access = true`. — [Approvals & security](https://learn.chatgpt.com/docs/agent-approvals-security)
- Some paths stay read-only even in a writable workspace, recursively: `.git` (including the target of a `gitdir:` pointer file), and `.agents`, `.codex` and `.aws` when they exist as directories. — [Approvals & security](https://learn.chatgpt.com/docs/agent-approvals-security)
- Windows uses the MXC sandbox (`[features] prefer_mxc = true`). `elevated` and `unelevated` under `windows.sandbox` are legacy fallbacks. WSL1 is unsupported from 0.115 on. — [Approvals & security](https://learn.chatgpt.com/docs/agent-approvals-security)
- Trust: Codex may start in read-only until the folder is trusted (onboarding or `/permissions`). `trust_level = "untrusted"` also turns off project-local config. — [Approvals & security](https://learn.chatgpt.com/docs/agent-approvals-security)

**Codex Cloud**
- Current Cloud runs each task in its own VM with an isolated workspace built from the published environment. Tasks keep running while your machine sleeps. Internet access can be full or limited to package managers plus allowed domains. "Network secrets" reach programs as placeholders that the proxy swaps for the real value. — [Cloud environments](https://learn.chatgpt.com/codex/environments/cloud-environments)
- Legacy Cloud details:
  - Setup scripts run in their own Bash session, so `export` does not carry over into the agent phase.
  - Internet is on during setup and off by default during the agent phase.
  - Containers are cached up to 12 hours.
  - Secrets are removed before the agent phase starts.
  - The agent uses AGENTS.md to find lint and test commands.
  - At the end the user gets a diff and can open a PR.

  — [Cloud environments (legacy)](https://learn.chatgpt.com/docs/environments/cloud-environment)
- CLI: `codex cloud exec --env ENV_ID [--attempts 1-4] "<prompt>"` submits a task, and `--attempts` runs best-of-N. `codex cloud list [--env] [--json]` lists tasks. `codex apply TASK_ID` applies the latest cloud diff to the local repo and exits non-zero if `git apply` fails. — [Developer commands (CLI)](https://learn.chatgpt.com/docs/developer-commands?surface=cli)
- Third-party blogs say best-of-N gives each attempt its own container and costs about N times as much. — [codex.danielvaughan.com](https://codex.danielvaughan.com/2026/04/01/codex-cloud-exec-best-of-n-attempts/) (not official)

### Inferences
- **The orch proof model already matches OpenAI's advice.** Its "done when" rules, one-task-one-session-one-PR, disjoint `owns` and worktree lanes line up closely with the guidance. The Cookbook's "independently verifiable milestone with proof" corresponds to an orch task with its `proofs`.
- **Codex probably cannot commit in workspace-write.** `.git` and the target of a worktree's `gitdir:` file are read-only, so a sandboxed lane session would likely fail at `git commit`. The orch task footer "Commit everything; wip(...)" then can't be met inside the sandbox. Options:
  - (a) the runner (orch or a wrapper script) commits after `codex exec` returns, or
  - (b) run the lane with `danger-full-access` inside a throwaway worktree or VM.

  Prefer (a). Test this before building anything on it.
- **Network is off by default.** Proofs that need the test Postgres on `127.0.0.1:5442`, or `npm ci`, must run outside the Codex session. orch already does this: proofs are run by `orch prove`, never by the building session. Setup (`npm ci && npx prisma generate`) belongs in the lane setup or the Cloud setup script, not in the prompt.
- **Use `--output-schema` for the task result.** It can force a structured final answer, for example `{task, status: done|blocked|question, summary, files_changed[], blocked_paths[]}`. That replaces orch's regex on `[<Task>] blocked: …` lines with a stricter, machine-checkable contract.
- **Cloud fits only some tasks.** It suits proofs that need no local DB or proofs run later by orch. Tasks with DB proofs (`ops/test-db.sh`) fit local `codex exec` in an orch lane better. Best-of-N (`--attempts`) is worth its cost only for risky or high-uncertainty tasks.

### Gaps
- I found no official, numeric guidance on ideal task size (minutes, number of files). OpenAI only says "one coherent unit of work" per thread. The ~90-150 min per task rule comes from orch, not OpenAI.
- The current (non-legacy) Cloud docs I fetched don't describe parallel-task limits, attempts or PR creation. Those details come from the CLI reference and third-party blogs.
- I could not verify whether `codex exec` in workspace-write can run `git commit` in a worktree lane. That is an inference from the protected-paths rule and needs a local test.
- The `config.toml` reference pages (profiles, `model_reasoning_effort`) were not fetched. The GitHub `docs/config.md` now only points to the external docs.

## Q2: Local conventions (Nextup repo and orch plans): the schema a Codex plan should mirror

### Takeaway
NextUp already has a strict, machine-checked plan format (orch):
- **Hauptplan:** a master plan made of phases, with HD decisions and HQ questions that have defaults.
- **Unterplan:** one per phase, with waves G / W1..Wn / Z.
- **Tasks:** one task = one session = one PR, with exact `owns`, `risk`, `needs`, `uses` decisions and proofs.

A proof is a filtered test command. It is fixed before the build, red at the base commit and green after, and it is run by orch, never by the session that builds. A Codex plan should reuse this schema unchanged and only swap the executor. The big gap: the Nextup `AGENTS.md` holds only generated Turborepo and Next.js blocks, so a Codex session would not see any of the real rules, which live in `CLAUDE.md`.

### Cited Findings (local files, read 2 Nov 2026)

**AGENTS.md and CLAUDE.md in the Nextup repo**
- `repos/Nextup/AGENTS.md` (10 lines, same on `origin/main`) contains only the auto-generated `turborepo-agent-rules` block, which tells the agent to read the installed turbo docs before changing turbo config. `apps/app/AGENTS.md` on `origin/main` contains only the auto-generated `nextjs-agent-rules` block, which says this Next.js has breaking changes and to read `node_modules/next/dist/docs/`. — local: `B:/06_CODE/06_Projects/Startup_speed/repos/Nextup/AGENTS.md`, `git show origin/main:apps/app/AGENTS.md`
- `Nextup/CLAUDE.md` (135 lines) holds the real working rules:
  - Next.js 16 App Router; the app lives in `apps/app/`; run commands from the repo root.
  - Folder roles: `app/` holds thin routes, `components/` is pure rendering, `features/` holds domain logic with no React, mutations go through `server/actions/`.
  - Roles are data (`canAccess()`); the tenant is the `[company]` URL segment.
  - Events, not edits: state changes append events.
  - Styling: CSS tokens and modules; no Tailwind.
  - Unit tests: vitest in `tests/unit`.
  - Done = `npm run lint && npm run typecheck && npm test && npm run build` green, no console errors, works below 760px.
  - Git: branches `feat/` `fix/` `chore/`, never commit or push to `main`, never force-push, never `git add -f` or edit `.gitignore`.

  — local: `repos/Nextup/CLAUDE.md`
- `CONTRIBUTING.md`: nobody pushes to `main` (enforced by branch protection). One task = one branch = one PR, from a fresh `main`. Use `git add <files>`, never blindly. Never commit unintended `.gitignore`, `.github/`, `package-lock.json` or `.env*` changes. Kevin reviews and merges. — local: `repos/Nextup/CONTRIBUTING.md`
- Root scripts (Turborepo): `build`, `lint`, `typecheck`, `test` (via `turbo run`), `e2e`, `e2e:db`, `db:migrate` and `db:seed` (in workspace `@nextup/app`). — local: `repos/Nextup/package.json`

**Plan documents in the Nextup repo**
- Dated plans live in `docs/plans/YYYY-MM-DD_name.md`. Examples on `origin/main`: `2026-11-01_pilot-readiness.md`, `2026-11-01_segment-analysis.md`, `2026-11-02_pilot-pages.md`, plus a folder `2026-11-02_pilot-pages/`. — local: `git ls-tree origin/main docs/plans/`

**orch: levels, folders and status**
- Three levels:
  - L0 Grundplan (goal, scope, "done when", phases, risks)
  - L1 Feinplan (work packages A, B…, dependencies, ownership)
  - L2 Detailplan (`tasks/<PLAN>-<WP><n>.md`)

  Kevin approves each level. — local: `repos/plans/docs/format.md`
- Folder layout:
  - `projects/<p>/hauptplaene/<HID>.md`
  - `projects/<p>/<PLAN>/PLAN.md`
  - `projects/<p>/<PLAN>/tasks/*.md`
  - `projects/<p>/<PLAN>/belege/<task>-<sha7>.txt` (proof output, written only by `orch prove`)
  - `projects/<p>/<PLAN>/log.md` (append-only)

  — local: `repos/plans/docs/format.md`
- Plan status has two counts: "Arbeit x/y" (tasks merged) and "Beweis x/y" (proofs green). A plan is finished when all proofs are green, not when all tasks are built. — local: `repos/plans/README.md`, `format.md`

**orch: task schema** (frontmatter fields from `format.md` and the template `mods/orch/skills/bauplan/templates/task.md`)

| Field | Meaning |
|---|---|
| `id` | `<PLAN>-<WP><n>`, the same as the file name |
| `title` | What is different after the task |
| `wp` | Work package |
| `needs` | Tasks that must be merged first, also across plans |
| `host` | `any`, `kev-pc` or `kev-mac` |
| `owns` | Exact globs, including new files and the test next to each source file; never shared with a task running at the same time |
| `risk` | `low` = auto-merge, `normal` = Kevin merges (or orch if `autonomy.merge` allows), `high` = Kevin approves the start |
| `profile` | Workbench profile |
| `budget` | `{minutes, window_pct}` |
| `uses` | Decision ids the task must know |
| `proofs` | List of `{id: B1, says, run, expect?}` |
| `status` | `open` / `ready` / `running` / `built` / `proven` / `merged` / `blocked` / `failed` |
| `start_approved` | Needed for `risk: high` |
| `issue` | Optional |
| `pr_title` | Optional |
| `lane`, `branch`, `pr`, `merge`, `why` | Set by the controller while the task runs |

- The task body is the session prompt, with the sections **What** (concrete changes with paths and function names, plus the test with its exact title), **Not** (what belongs to other tasks) and **Done when** (proofs green and lint/typecheck/test/build stay green). It ends with "Commit everything; an unfinished state as `wip(<task>): …`. orch pushes and opens the PR." — local: `templates/task.md`, `projects/nextup/CLK/tasks/CLK-B1.md`

**orch: proof rules**
- The command is fixed in the L2 task before the build.
- `orch prove` runs it in the lane, never the session that builds.
- Green means exit 0 AND the output matches `expect`. The project default is `proof_expect: '[1-9]\d* passed'`, because vitest exits 0 even when a `-t` filter matches nothing.
- A good proof is red at the base commit and green afterwards, so it filters on the new test title.
- A run with uncommitted changes (`dirty`) does not count.

— local: `format.md`, `projects/nextup/project.yaml`

**orch: plan-level fields and waves**
- `PLAN.md` frontmatter fields for an unattended run:
  - `phases` (G / W1..Wn / Z, each with a `gate` of `auto` or `kevin`)
  - `max_parallel`
  - `decisions` (D…, append-only)
  - `questions` (Q…, each needs `answer`, `default` or `blocks`)
  - `autonomy` (`merge: [low|normal]`, `start_high`, `replan`, `budget_window_pct`)
  - `talk` (event → channel)

  `orch ready <PLAN>` is red if any of these are missing. — local: `format.md`
- How work is split (`zerlegen.md`):
  - Make an ownership map of every file first.
  - Files several topics need (schema, index exports, config, routes, nav, `package.json`) belong to the scaffold phase G.
  - Waves hold topic tasks with disjoint ownership.
  - Z is a single acceptance task, required for every sub-plan of a master plan.
  - One WP ≈ one task. Split a WP only above ~150 min, chained with `needs`.
  - Never a proof that only checks "build passes".

  — local: `mods/orch/skills/bauplan/references/zerlegen.md`

**NextUp project settings (`project.yaml`)**
- Repo `nextup-de/nextup`, base `origin/main`. Lanes a, b, c on kev-pc.
- Lane setup: `npm ci && cd apps/app && npx prisma generate`.
- Shared test Postgres on `localhost:5442`.
- `lane_model: claude-sonnet-5-5`.
- Merge by squash, `admin: true`, PR title `type(area): short`.

— local: `repos/plans/projects/nextup/project.yaml`

- **`risk_guard`:** `risk: low` is never allowed for a task that owns any of these paths: `**/prisma/**`, `**/migrations/**`, `**/auth/**`, `**/microsoft-login*`, `stack/**`, `ops/**`, `.github/**`. — local: `project.yaml`
- **Project rules** (added to every session prompt):
  - Read AGENTS.md, docs/README.md and docs/plans/2026-11-01_pilot-readiness.md first.
  - One task = one PR; no AI attribution.
  - Change only owned files; otherwise report `blocked` with the paths in backticks.
  - Never touch package.json or the lockfile.
  - German and English strings via the catalog after LNG.
  - Ids, never display names, after IDN.
  - lint, typecheck, test and build green.

  — local: `project.yaml`
- **Sample sub-plan (`projects/nextup/CLK/PLAN.md`):** waves G → W1 [A, C] → W2 [B, D] → Z, `max_parallel: 2`, decisions D1..D15 marked "(from PILOT/HDn)", 6 tasks.
- **Sample task (`CLK-B1`):**
  - `risk: high`, 12 explicit owned paths including new test files, `budget 90 min / 15 %`.
  - Two proofs: a vitest filter `-t 'CLK day labels'`, and a DB test through `bash ops/test-db.sh … -t 'CLK working-day stamps'` with `DATABASE_URL` pointing at 5442.

  — local: `projects/nextup/CLK/PLAN.md`, `tasks/CLK-B1.md`
- **Master plan `PILOT.md`:**
  - 24 phases (AUD, ARC, OPS, STR, LNG, CNX, IDN, CLK…), each with `after`, `go` (`auto` or `kevin`), `stage`, `size` and `budget_pct`.
  - 14 HD decisions; HD13 says plans, code, comments and PRs are in English.
  - 9 HQ questions, each with a default.
  - "Done when" names exact e2e/load test titles on `main`.

  — local: `repos/plans/projects/nextup/hauptplaene/PILOT.md`
- **Session protocol:** a session ends its turn with `[<Task>] question: …`, `[<Task>] blocked: …` or `[<Task>] done: …`. A blocked task holds its lane and paths. — local: `format.md` § Controller

### Inferences
- **How to reuse the schema for Codex (minimal schema):**

  | Field | Notes |
  |---|---|
  | `id` | |
  | `title` | |
  | `wave/phase` | |
  | `needs` | |
  | `owns` | Exact paths |
  | `risk` | `low` / `normal` / `high`, checked against `risk_guard` |
  | `uses` | Decision ids |
  | `proofs` | `[{id, says, run, expect}]` |
  | `budget` | |
  | `executor` | New, optional: `codex-local` / `codex-cloud` / `claude` |
  | `sandbox` | New, optional |

  The body keeps What / Not / Done when. That way `orch validate` / `ready` / `prove` keep working, and only the session launcher changes from a Workbench Claude session to `codex exec`.
- **The project rule "Read AGENTS.md" is nearly empty for Codex.** For Claude it implicitly meant CLAUDE.md. Before Codex runs any lane, NextUp needs one of these:
  - (a) Add a real rules section above or below the generated turbo block in root `AGENTS.md`. Generated blocks are delimited by BEGIN/END markers, so hand-written text outside them should survive.
  - (b) Make AGENTS.md point to CLAUDE.md.

  Note that `project_doc_fallback_filenames = ["CLAUDE.md"]` would NOT help at the root: AGENTS.md exists there, and Codex takes at most one file per directory.
- **Two plan formats.** `docs/plans/YYYY-MM-DD_name.md` in the Nextup repo is the human-readable overview, while the executable plan lives in the plans repo (orch). A Codex-oriented ExecPlan should sit in the plans repo next to PLAN.md (or be generated from it), not as a third format.

### Gaps
- I did not read `references/freigabe.md`, `sprechen.md` and `hauptplan.md` in full; their approval and communication details are summarised from `format.md` only.
- `project.yaml` lists the kev-pc main checkout as `D:\06_CODE\Projects\agility_startup\nextup`. This laptop has the repos under `B:\06_CODE\06_Projects\Startup_speed\repos`, so lane paths for a Codex runner on this machine would need their own host entry.

## Q3: Is Codex configured on this machine? (names and non-secret keys only; auth.json not opened)

### Takeaway
Yes. `C:\Users\k_sch\.codex` exists and is used by the Codex desktop app and the CLI. `auth.json` is present (not opened). The config sets `approval_policy = "never"` and the Windows sandbox `elevated`. It sets no `model`, no `sandbox_mode`, no `project_doc_*` keys, and no trust entry for the NextUp repos. The global `AGENTS.md` is empty (0 bytes).

### Cited Findings (local, read-only)
- **Files and folders in `C:/Users/k_sch/.codex`:**
  - `config.toml` (3.1 KB)
  - `auth.json` (present, not opened)
  - `AGENTS.md` (0 bytes)
  - `version.json` (`latest_version` "0.164.0")
  - `models_cache.json`, `history.jsonl`, `session_index.jsonl`
  - folders `sessions/`, `skills/`, `plugins/`, `memories/`, `memories_v2/`, `.sandbox/`, `.sandbox-secrets/`, `.sandbox-bin/`, `browser/`, `computer-use/`, `code-review-plugin/`, `node_repl/`, `app-server-*`
  - SQLite stores (`state_5`, `logs_2`, `thread_history_1`, `goals_1`, `queue_1`, `memories*`)
  - `.codex-global-state.json`

  The `.desktop-created` marker suggests the Codex desktop app set it up on 20 Oct 2026. — local directory listing
- **Keys in `config.toml`:**
  - `approval_policy = "never"`
  - `notify` (value not shown)
  - `[desktop]` UI keys
  - `[marketplaces.openai-bundled]` and `[marketplaces.openai-primary-runtime]`
  - `[plugins."…"] enabled` for browser, unified-computer-use, visualize, documents, pdf, spreadsheets, presentations, template-creator, computer-use, codex-app-tools
  - `[mcp_servers.node_repl]` with an env block (values not shown)
  - `[windows] sandbox = "elevated"`
  - `[features] memories`; `[memories] generate_memories`, `use_memories`
  - `[tui]`
  - one `[projects.'…\temp\claude\b--03-business-programming-workbench\…\accept-repo'] trust_level`

  Not set: `model`, `model_reasoning_effort`, `sandbox_mode`, `[sandbox_workspace_write]`, `project_doc_max_bytes`, `project_doc_fallback_filenames`, `[profiles.*]`, and no trust entry for Startup_speed or Nextup. — local `config.toml` (keys only)

### Inferences
- **`approval_policy = "never"` without a `sandbox_mode`** means the sandbox decides what Codex may do. OpenAI recommends `never` mainly together with a restrictive sandbox. For lane runs, set it explicitly on every call (`-s workspace-write -a never`) or define a profile `[profiles.lane]`, rather than relying on the global defaults.
- **`windows.sandbox = "elevated"` is the legacy fallback.** Current docs prefer MXC (`[features] prefer_mxc = true`). Untrusted folders may start read-only, so the NextUp lanes need trusting or explicit `-s` flags.
- **`version.json` shows only `latest_version` 0.164.0.** The installed CLI version was not checked (no command was run). Run `codex --version` before relying on newer flags such as `--approve-for-me`.

### Gaps
- I did not check whether the `codex` CLI binary is on PATH or which version is installed (to stay read-only and avoid starting anything).
- I did not check whether a Codex Cloud environment exists for `nextup-de/nextup`; that is only visible in the web UI.

## Q4: Recommended template for one Codex task prompt

### Takeaway
Combine OpenAI's four-element prompt (goal, context, constraints, done-when) with the orch task body (What / Not / Done when). Add three Codex-specific parts:
- explicit verify commands the agent runs itself, separate from the orch proofs it must not fake
- a structured final report (`--output-schema`)
- a stop rule for blocked or question cases

### Cited Findings
- OpenAI's prompt elements are goal, context, constraints and a "done when" condition. — [Codex best practices](https://learn.chatgpt.com/docs/learn/best-practices)
- Durable rules belong in AGENTS.md or skills, not repeated in every prompt. Tell the agent how to build and test. — [Codex best practices](https://learn.chatgpt.com/docs/learn/best-practices)
- `--output-schema` forces the final response into a JSON Schema, and `-o` writes the final message to a file. — [Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)
- The orch task body is: one sentence of context plus docs to read, **What** (paths and function names, the test with its exact title = the proof), **Not**, **Done when**, and the commit footer. — local `mods/orch/skills/bauplan/templates/task.md`
- The ExecPlan rules: self-contained, terms defined, acceptance as observable behavior, idempotent steps, keep going without asking. — [Cookbook](https://developers.openai.com/cookbook/articles/codex_exec_plans)

### Proposed template (derived from the sources above; an inference, not an OpenAI template)

````markdown
---  (orch frontmatter, unchanged: id, title, wp, needs, owns, risk, uses, proofs, budget; plus executor: codex-local)
---
# <TASK-ID> <title>

## Goal
<one or two sentences: what is true after this task that is false now. Plan <PLAN> (phase of <HID>).>

## Context (read first)
- AGENTS.md (repo rules), docs/plans/<date>_<plan>.md, <exact source files and functions>
- Decisions you must follow: D1 … Dn (text inlined by `orch prompt`)
- Terms: <define any project term, e.g. "working-day number" = …>

## What
- `<path>`: <function/signature and behaviour>
- New test `<file>` with `describe("<exact title>")` covering: <cases with inputs → outputs>

## Not
- <files/behaviour owned by other tasks>; no package.json/lockfile; no .prisma unless owned; no .github/

## Constraints
- Edit only these paths: <owns list>. If you need another path, stop and report blocked with the paths.
- No network, no installs. Do not run DB/e2e proofs; orch runs them.

## Verify before you finish (you run these)
- npm run lint && npm run typecheck
- npm test -w @nextup/app -- <new test file> -t '<exact title>'   (must show ≥1 passed)

## Done when
- orch proofs B1..Bn (listed in frontmatter) will pass: red before, green after.
- lint, typecheck, test, build stay green; no file outside owns changed.

## Final report (JSON, matches task-result.schema.json)
{ "task": "<ID>", "status": "done|blocked|question", "summary": "...",
  "files_changed": [...], "blocked_paths": [...], "question": null }
````

Example invocation by the runner (an inference, built from the documented flags):
`codex exec -C <lane> -s workspace-write -a never -m <model> --output-schema task-result.schema.json -o belege/<id>.result.json - < prompt.md`

After that the runner commits (`.git` is read-only inside the sandbox), then runs `orch prove` and opens the PR.

### Inferences
- **Keep task sizes at the orch rule (~90 min, split above ~150 min) with one PR each.** OpenAI's "one thread per coherent unit of work" and worktree isolation support this. Use `--attempts 2-4` on Codex Cloud only for `risk: high` or exploratory tasks.
- **Review and merge rules stay as in orch:**
  - `risk_guard` paths are never `low`.
  - `low` auto-merges after green proofs and CI.
  - `normal` and `high` wait for Kevin.
  - Optionally add `codex review --base origin/main` as an advisory, non-blocking check on the PR.
- **Codex Cloud's "diff → PR" flow skips the orch proof step** unless orch fetches the diff with `codex apply` into a lane and then proves it. For Cloud tasks, the runner should therefore do: `codex cloud exec --env …` → `codex apply TASK_ID` in a lane → commit → `orch prove` → PR.

### Gaps
- OpenAI publishes no official single-task prompt template beyond the four elements. The template above is a synthesis.
- I did not test `--output-schema` together with `-a never` in a worktree lane on this machine.
