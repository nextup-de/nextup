# Codex plan: the defensible offer, task by task

> **Plan · 2026-11-02 · open: Kevin approves P0 and the TRUTH tasks first; nothing here runs before P0 is merged.**
> The build plan behind [2026-11-02_defensible-offer.md](2026-11-02_defensible-offer.md), written so that OpenAI Codex
> (`codex exec`) can build each code task in its own branch and PR. Business phases are checklists for the team and
> are marked **not for Codex**. Every duration and budget is an **estimate**. The pages these tasks feed are specified
> for Sam in [11-defensible-offer-pages.md](2026-11-02_pilot-pages/11-defensible-offer-pages.md).

The task prompts live in [2026-11-02_defensible-offer-codex/](2026-11-02_defensible-offer-codex/), one file per task.
Each file is the orch-like front matter plus a ready-to-paste prompt body.

## How to run this with Codex

### Prerequisites (before any task runs)

1. **P0: real rules in `AGENTS.md`.** The root [AGENTS.md](../../AGENTS.md) holds only the generated Turborepo block,
   and `apps/app/AGENTS.md` only the generated Next.js block. Codex reads at most one instruction file per directory
   (`AGENTS.override.md`, then `AGENTS.md`, then fallback names), so it never sees [CLAUDE.md](../../CLAUDE.md), and a
   `project_doc_fallback_filenames = ["CLAUDE.md"]` entry does not help where `AGENTS.md` exists. Task
   [P0](2026-11-02_defensible-offer-codex/P0.md) writes the working rules into the root `AGENTS.md` **outside** the
   `<!-- BEGIN:turborepo-agent-rules -->` / `<!-- END:... -->` markers, so `turbo` can keep rewriting its block. Kevin
   owns repo rules (CLAUDE.md "Ownership"), so P0 is written by Kevin or a Claude session he starts, not by Codex.
2. **The runner commits, not Codex.** In `workspace-write` the `.git` folder (and the target of a worktree's `gitdir:`
   file) is read-only, so a sandboxed session cannot commit. The runner commits after `codex exec` returns. Test this
   once on a throwaway branch before the first real task.
3. **Network is off in the sandbox.** `npm ci`, `npx prisma generate` and every proof that needs the test Postgres on
   `127.0.0.1:5442` (`bash ops/test-db.sh …`) or Docker run **outside** the Codex session: setup before, proofs after.
   The session runs only the unit-level verify commands its prompt lists.
4. **Prefer local lanes over Cloud PRs.** Run tasks in an orch lane checkout (the lanes orch already has on kev-pc),
   not in a new git worktree per task (repo rule: no new worktrees for a normal task). Codex Cloud is fine for a task
   whose proofs are all unit tests; bring its diff into a lane with `codex apply <TASK_ID>` and prove it there,
   never through Cloud's own "open PR" button, which skips the proofs.
5. **Pin the call.** Set the sandbox and approval on every call (the global `~/.codex/config.toml` has
   `approval_policy = "never"` and no `sandbox_mode`); check `codex --version` before relying on `--output-schema`.

### The runner, per task

```bash
# in the lane checkout, on a fresh branch from origin/main
git -c safe.directory=* fetch origin && git -c safe.directory=* checkout -B <branch> origin/main
npm ci && (cd apps/app && npx prisma generate)
codex exec -C <repo> -s workspace-write -a never \
  --output-schema docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json \
  -o .codex-out/<ID>.json - < docs/plans/2026-11-02_defensible-offer-codex/<ID>.md
# the runner, outside the sandbox:
git -c safe.directory=* status --short          # only paths from the task's owns
git -c safe.directory=* add <owned paths> && git -c safe.directory=* commit -m "<pr_title>"
<run every proof of the task; each must print [1-9]\d* passed>
git -c safe.directory=* push -u origin <branch> && gh pr create --title "<pr_title>" --body-file <summary>
```

- `.codex-out/` is the runner's scratch folder; it must not be committed (ask Kevin to ignore it, or keep it outside
  the repo).
- `<branch>`: `fix/<id>` for TRUTH, `feat/<id>` otherwise, lower case (`fix/truth-a1`). One task = one branch = one
  PR, from a fresh `main` (CONTRIBUTING.md).
- If the JSON result says `blocked` or `question`, the runner commits nothing and reports the paths or the question
  to Kevin. A blocked task keeps its paths reserved.
- A changed file outside `owns` fails the task, even if the proofs pass.

### Review and merge rules

- **Proofs before the build.** Each task names its proofs: a filtered test command that is red on `main` and green
  after. Green means exit 0 **and** the output matches `[1-9]\d* passed` (vitest exits 0 when a `-t` filter matches
  nothing). The runner runs them, never the session.
- **Risk.** `low` may auto-merge after green proofs and CI. `normal`: Kevin merges. `high`: Kevin approves the start
  and merges. A task that owns `**/prisma/**`, `**/migrations/**`, `**/auth/**`, `stack/**`, `ops/**`, `.github/**`,
  `src/config/roles.ts`, `src/proxy.ts` or `src/features/cases/reducer.ts`, adds an event type, or touches sign-in or
  deploy is **high**: schema, migrations, auth, deploy and CI always get a human merge. No task in this plan is `low`.
- Optional second opinion: `codex review --base origin/main` on the PR, advisory only.
- No AI attribution in commits or PRs. PR title `type(area): short`.

### Overlap with PILOT

Many goals here are already PILOT phases with a Bauplan ([build-plans/](2026-11-02_pilot-pages/build-plans/README.md)).
Codex does **not** rebuild them. Where this plan needs more than the phase builds, it defines only the delta, as its
own task that `needs` the phase's task.

| PILOT phase | State on `main` 1cfe2b5 / plans `139bbd3` | Used here as |
|---|---|---|
| CLK | A1, B1, C1, G1 merged; D1 built; Z1 ready | Reference. Delta: CORE-H1 (real hand-over), CORE-S1 (answer promise for the submitter). |
| AIP | G1, A1, B1, E1 merged; C1 running; Z1 ready | Reference (server-side proposal, override rate). Delta: TRUTH-D1 (model route earns no points). |
| VIS | all 6 ready | Reference (projections, server-side visibility). TRUTH-C1 is a stopgap that must merge **before** VIS-C1, and VIS-C1 keeps its redaction. |
| ADM | G1 merged; A1 built; B1 running; rest ready | Reference (routing editor ADM-B1, personal admins and 2FA ADM-E1). Delta: TRUTH-F2 wires ADM-E1's admin sign-in into the audit table. |
| NTF | all ready | Reference (reminders, digests). CORE-H1's hand-over is one more event NTF plans into a message; no NTF change here. |
| GDP | brief only (stage idea) | TRUTH-F1, CORE-X1, CORE-P1 are GDP's first tasks pulled forward. When Kevin writes the GDP Bauplan, he adopts them instead of planning them again. |
| MET | brief only | Reference (ranking removal is in the MET brief; TRUTH-A1 does it now and MET drops it from its scope). BVW-G1 adds the ZI KPIs as pure functions MET's dashboards read. |
| LOOP | brief only | Reference (projects switch per company, decision log). BVW-B1/C1 add the review and committee step on top of the loop. |
| SEC | brief only | Reference (DPA, TOMs, DPIA, works-agreement template). PACK generates the works-council and AI-Act pack from the running config and links SEC's documents. |
| IDN | done | Prerequisite only. |

Send Kevin one line per delta so the plans repo gets the matching `needs` (VIS-C1 needs TRUTH-B1 and TRUTH-C1; GDP
adopts TRUTH-F1, CORE-X1, CORE-P1; MET drops the ranking removal).

## Phases

Order: P0 → TRUTH → CORE → BVW and PROOF in parallel → PACK (starts with CORE, legal review in parallel) → BENCH.
FOUND runs from now; PILOT-PAID after CORE and FOUND; TRUST from the LOI; RAISE after the PoC result.

Each code task: about 90-150 minutes of agent work (estimate), one PR, below ~300 changed lines where it can.

### P0 Prerequisite

- **Goal:** Codex sees the same rules as Claude and the team.
- **Gate:** Kevin merges P0; one dry run of the runner on a throwaway branch commits from outside the sandbox.

| Task | Title | Needs | Risk | Budget |
|---|---|---|---|---|
| [P0](2026-11-02_defensible-offer-codex/P0.md) | Root AGENTS.md carries the working rules outside the generated block | - | high (repo rules; not Codex) | 45 min |

### 0 TRUTH: claims and contradictions (about 1 week)

- **Goal:** the code no longer contradicts what NextUp says, and what NextUp says no longer contradicts the code.
- **Gate:** every TRUTH proof green on `main`; the landing checklist TRUTH-L ticked by whoever owns `nextup-landing`;
  Kevin signs off before CORE starts.

| Task | Title | Needs | Risk | Budget |
|---|---|---|---|---|
| [TRUTH-A1](2026-11-02_defensible-offer-codex/TRUTH-A1.md) | The contributor ranking and every per-person tally on Progress are gone | P0 | normal | 90 min |
| [TRUTH-B1](2026-11-02_defensible-offer-codex/TRUTH-B1.md) | `/people/[name]` and its profile links are gone, and `hiddenPeople` no longer reaches the browser | P0 | normal | 120 min |
| [TRUTH-C1](2026-11-02_defensible-offer-codex/TRUTH-C1.md) | The browser's log carries no real actor id of an anonymous member and no private case it may not see (stopgap until VIS-C1) | TRUTH-B1 | high (what the browser receives) | 150 min |
| [TRUTH-D1](2026-11-02_defensible-offer-codex/TRUTH-D1.md) | A route proposed by the AI earns no score points; only a keyword or a person's route does | AIP-C1 | normal | 90 min |
| [TRUTH-E1](2026-11-02_defensible-offer-codex/TRUTH-E1.md) | Suggested answers are no longer ranked by score gain, and a turn sent verbatim from a suggestion is recorded | P0 | high (migration) | 150 min |
| [TRUTH-F1](2026-11-02_defensible-offer-codex/TRUTH-F1.md) | Admin actions are written to an append-only audit table instead of the console (GDP's first task) | P0 | high (schema) | 150 min |
| [TRUTH-F2](2026-11-02_defensible-offer-codex/TRUTH-F2.md) | Admin sign-in and break-glass are audit events | TRUTH-F1, ADM-E1 | high (auth) | 60 min |
| [TRUTH-G1](2026-11-02_defensible-offer-codex/TRUTH-G1.md) | A reward falls due only on a "better" verdict | P0 | normal | 60 min |
| [TRUTH-H1](2026-11-02_defensible-offer-codex/TRUTH-H1.md) | The idea bars understand German, and code and docs say "deterministic and traceable" | P0 | normal | 120 min |

**TRUTH-L: landing and deck checklist (not for Codex; repo `nextup-landing`, owner Kevin or Marc).**

- [ ] `page.tsx:37` "moves to the deputy by itself" → "planned for the pilot: a visible answer date, with the deputy
      flagged on breach" (until CORE-H1 is live; then "handed to the deputy").
- [ ] `page.tsx:81-84`, `pricing/page.tsx:76`, `privacy/page.tsx:134-136` "never people" / "keine
      personenbezogenen Leistungskennzahlen": keep only once TRUTH-A1 and TRUTH-B1 are live on every stack.
- [ ] `pricing/page.tsx:47`, `privacy/page.tsx:137-138` export and deletion: "planned for the pilot" until CORE-X1
      and CORE-P1 are live.
- [ ] `pricing/page.tsx:46` "Routing table editor" and `page.tsx:35` "the routing is done for you": "planned" until
      ADM-B1 and AIP-C1 are live; then "proposed for you, a person confirms".
- [ ] "Chatting cannot talk the score up", "never model output": "deterministic and traceable".
- [ ] `page.tsx:43` "Safe to raise things anonymously": "raise under a stable pseudonym".
- [ ] The DPA / works-council description promise: only once SEC's templates exist.
- [ ] Deck: drop "rivals have no deadlines", "none ties reward to measured impact", "none is works-council-ready",
      "none offers on-prem".

### 1 CORE: finish PILOT's spine (3-6 weeks at orch pace)

- **Goal:** a real company's case gets an answer date its submitter sees, moves to the deputy on breach, is seen only
  by those allowed, and its data can be exported and a person pseudonymised.
- **Gate:** CLK-Z1, AIP-Z1, VIS-Z1, NTF-Z1 and ADM-Z1 green (their own acceptance tests), plus every CORE proof.

Referenced, not rebuilt: CLK-D1, CLK-Z1 (scheduler, acceptance), AIP-C1, AIP-Z1 (server-side routing), VIS-G1 to
VIS-Z1 (projections, server-side visibility), NTF-G1 to NTF-Z1 (reminders, digest), ADM-B1 (routing editor), ADM-E1
(personal admins, 2FA), SEC (templates, once its Bauplan exists).

| Task | Title | Needs | Risk | Budget |
|---|---|---|---|---|
| [CORE-S1](2026-11-02_defensible-offer-codex/CORE-S1.md) | The submitter's answer promise (date, state, owner or deputy) is one pure function | CLK-Z1 | normal | 90 min |
| [CORE-H1](2026-11-02_defensible-offer-codex/CORE-H1.md) | A breached deadline hands the case to the deputy seat, once, when the company's rule says so | CLK-Z1, CORE-S1 | high (event, reducer) | 150 min |
| [CORE-X1](2026-11-02_defensible-offer-codex/CORE-X1.md) | A company admin exports the company's data, or one person's, as JSON (GDP) | TRUTH-F1, VIS-Z1 | high (schema) | 150 min |
| [CORE-P1](2026-11-02_defensible-offer-codex/CORE-P1.md) | A person is pseudonymised: their name appears nowhere, ids stay (GDP) | CORE-X1, DIR-D1 | high (people data) | 150 min |

Retention rules and the screenshot policy stay in GDP's Bauplan (spec 05).

### 2 BVW: close the expected offer (about 3-5 weeks)

- **Goal:** NextUp passes the first round of a German BVW tender: Gutachter and committee, premium by formula,
  payroll file, ZI KPIs, idea content in the reader's language.
- **Gate:** every BVW proof green; a demo company runs one idea from raise through review, committee, project,
  measurement and premium to a payroll CSV row (a Playwright run Kevin records once).

| Task | Title | Needs | Risk | Budget |
|---|---|---|---|---|
| [BVW-A1](2026-11-02_defensible-offer-codex/BVW-A1.md) | The review model: assessment form, review state and who may review, all pure | CORE-S1 | normal | 120 min |
| [BVW-B1](2026-11-02_defensible-offer-codex/BVW-B1.md) | A case can be sent to a Gutachter, who submits the assessment on the clock | BVW-A1, VIS-Z1, CORE-H1 | high (event types) | 150 min |
| [BVW-C1](2026-11-02_defensible-offer-codex/BVW-C1.md) | The committee sees its agenda and records a decision with minutes | BVW-B1 | high (event types) | 150 min |
| [BVW-D1](2026-11-02_defensible-offer-codex/BVW-D1.md) | The premium formula of a works agreement is computed, pure | TRUTH-G1 | normal | 120 min |
| [BVW-E1](2026-11-02_defensible-offer-codex/BVW-E1.md) | Premium rules are stored per company and a reward's amount comes from the formula | BVW-D1, AIP-C1 | normal | 120 min |
| [BVW-F1](2026-11-02_defensible-offer-codex/BVW-F1.md) | A payroll CSV for SAP HCM, SuccessFactors or DATEV is built from the due premiums | BVW-E1 | high (personnel number, HD14) | 120 min |
| [BVW-G1](2026-11-02_defensible-offer-codex/BVW-G1.md) | ZI KPIs per org unit with a minimum group of 5, pure | VIS-Z1 | normal | 120 min |
| [BVW-H1](2026-11-02_defensible-offer-codex/BVW-H1.md) | Idea content is translated through the AI gate, the original kept | AIP-Z1 | high (schema) | 150 min |

Embeddings similarity (report, BVW) waits for a real brain per company; not planned here.

### 3 PROOF: outcome integrity (parallel to BVW, about 2-4 weeks)

- **Goal:** a measured result is either from a system or confirmed by a second person, and every case leaves a row
  that can calibrate the score and, with consent, feed a benchmark.
- **Gate:** every PROOF proof green; on a demo company a typed result without confirmation shows "not confirmed" and
  does not make a reward due.

Referenced: AIP-C1 (routing-override rate), TRUTH-G1 (reward only on "better").

| Task | Title | Needs | Risk | Budget |
|---|---|---|---|---|
| [PROOF-A1](2026-11-02_defensible-offer-codex/PROOF-A1.md) | A measured value carries its source, and KPI exports are imported as measures | TRUTH-G1 | normal | 150 min |
| [PROOF-B1](2026-11-02_defensible-offer-codex/PROOF-B1.md) | A typed measure counts only after a second person confirms it | PROOF-A1 | high (event type) | 120 min |
| [PROOF-C1](2026-11-02_defensible-offer-codex/PROOF-C1.md) | CO₂, energy and scrap metrics with fixed units and a company emission factor | PROOF-A1, CORE-H1 | normal | 90 min |
| [PROOF-D1](2026-11-02_defensible-offer-codex/PROOF-D1.md) | One outcome record per decided case, with the company's consent stored | PROOF-B1, VIS-Z1 | high (schema) | 150 min |
| [PROOF-E1](2026-11-02_defensible-offer-codex/PROOF-E1.md) | A calibration table of score parts against decisions and +90-day verdicts | PROOF-D1 | normal | 90 min |

### 4 PACK: works council and AI Act as a product (starts with CORE; legal review 1-3 months)

- **Goal:** a company admin downloads a works-council pack and an AI-Act pack that describe exactly what this stack
  does, generated from its configuration, and a works council member has a read-only view.
- **Gate:** every PACK proof green; a lawyer has reviewed the model annex and the DPIA template (checklist below).

| Task | Title | Needs | Risk | Budget |
|---|---|---|---|---|
| [PACK-A1](2026-11-02_defensible-offer-codex/PACK-A1.md) | The works-council pack is generated from the running configuration | TRUTH-F1, BVW-E1 | normal | 150 min |
| [PACK-B1](2026-11-02_defensible-offer-codex/PACK-B1.md) | Each decision exports its explanation; the AI-Act information sheet is filled from the AI settings | PACK-A1, TRUTH-D1, TRUTH-E1 | normal | 120 min |
| [PACK-C1](2026-11-02_defensible-offer-codex/PACK-C1.md) | A read-only works-council and DPO role sees aggregates, the audit log and the pack, never case content | PACK-A1, VIS-Z1 | high (new role) | 150 min |

**PACK-L: legal checklist (not for Codex; owner Kevin with a lawyer).**

- [ ] Model works-agreement annex (BetrVG § 87(1) Nr. 6 and Nr. 12) that matches PACK-A1's output line by line.
- [ ] DPIA template and record of processing (with SEC).
- [ ] AI Act Art. 26(7) information template for worker representatives and Art. 50 transparency text.
- [ ] Decide which parts of the pack are sold separately (pricing).

### 5 FOUND: company and IP (not for Codex; now, 1-3 months)

- [ ] GmbH founded; four founders sign the shareholder agreement.
- [ ] Written IP assignment of all code, plans and designs from the four founders to the GmbH.
- [ ] Trademark clearance for "NextUp" (DE/EU, classes 9, 35, 42), then filing.
- [ ] Trade-secret file: what is confidential (calibration data, routing maps, plans repo), who has access.
- [ ] Pilot contract template: no reverse engineering, case-study right, right to use anonymised outcome data
      (feeds PROOF-D1 and BENCH).
- [ ] EXIST or Berliner Startup Stipendium application (check 2026 rates and CODE's eligibility).

### 6 PILOT-PAID: first customer (not for Codex; after CORE and FOUND, 4-12 months)

- [ ] Paid PoC (€20-60k, estimate) signed with a named Tier-1 supplier or OEM plant.
- [ ] Baseline of answer times before go-live (MET's baseline period).
- [ ] Works-council sign-off on the annex (PACK-L).
- [ ] One recorded real-tenant run of M365 and Jira (CNX fixtures marked `recorded`).
- [ ] A measured users-per-stack figure from a load test (G-238/G-239).
- [ ] Written support SLA.
- [ ] Case study with measured outcomes, and an LOI with a path to a frame contract.

### 7 TRUST: certification (not for Codex; from the LOI)

- [ ] ISO 27001 (about €10-25k, 3-6 months) once the GmbH and an LOI exist.
- [ ] TISAX AL2 if a customer asks.
- [ ] External pentest before the first go-live.
- [ ] Code parts that TRUST needs (log export, key rotation, ZAP scan) are SEC and EID tasks, not new ones here.

### 8 BENCH: data moat (from customer 3-5; 12-24 months)

- **Goal:** companies that opt in see where they stand against anonymised peers; nobody can be singled out.
- **Gate:** every BENCH proof green; at least five consenting companies in the dataset before any number is shown.

| Task | Title | Needs | Risk | Budget |
|---|---|---|---|---|
| [BENCH-A1](2026-11-02_defensible-offer-codex/BENCH-A1.md) | Anonymised benchmark cells from outcome records, suppressed below 5 companies or 5 cases | PROOF-D1 | normal | 120 min |
| [BENCH-B1](2026-11-02_defensible-offer-codex/BENCH-B1.md) | A company opts in, exports its contribution and imports the published benchmark | BENCH-A1 | normal | 150 min |

The central aggregation across stacks (collecting contributions, publishing the file) runs outside this repo, in
`nextup-admin` or by hand; not for Codex here.

### 9 RAISE: pre-seed (not for Codex; after the PoC result and the LOI)

- [ ] Data room: the defensible-offer analysis, PoC contract, LOI, measured case study, works-council sign-off.
- [ ] Story: system of record for improvement decisions in operations, not idea management.
- [ ] €0.5-1.5M at €3-6M pre-money (estimate); IBB Pro FIT phase 1 alongside once the GmbH exists.

## Every task

| Phase | Tasks |
|---|---|
| P0 | [P0](2026-11-02_defensible-offer-codex/P0.md) |
| TRUTH | [A1](2026-11-02_defensible-offer-codex/TRUTH-A1.md) · [B1](2026-11-02_defensible-offer-codex/TRUTH-B1.md) · [C1](2026-11-02_defensible-offer-codex/TRUTH-C1.md) · [D1](2026-11-02_defensible-offer-codex/TRUTH-D1.md) · [E1](2026-11-02_defensible-offer-codex/TRUTH-E1.md) · [F1](2026-11-02_defensible-offer-codex/TRUTH-F1.md) · [F2](2026-11-02_defensible-offer-codex/TRUTH-F2.md) · [G1](2026-11-02_defensible-offer-codex/TRUTH-G1.md) · [H1](2026-11-02_defensible-offer-codex/TRUTH-H1.md) |
| CORE | [S1](2026-11-02_defensible-offer-codex/CORE-S1.md) · [H1](2026-11-02_defensible-offer-codex/CORE-H1.md) · [X1](2026-11-02_defensible-offer-codex/CORE-X1.md) · [P1](2026-11-02_defensible-offer-codex/CORE-P1.md) |
| BVW | [A1](2026-11-02_defensible-offer-codex/BVW-A1.md) · [B1](2026-11-02_defensible-offer-codex/BVW-B1.md) · [C1](2026-11-02_defensible-offer-codex/BVW-C1.md) · [D1](2026-11-02_defensible-offer-codex/BVW-D1.md) · [E1](2026-11-02_defensible-offer-codex/BVW-E1.md) · [F1](2026-11-02_defensible-offer-codex/BVW-F1.md) · [G1](2026-11-02_defensible-offer-codex/BVW-G1.md) · [H1](2026-11-02_defensible-offer-codex/BVW-H1.md) |
| PROOF | [A1](2026-11-02_defensible-offer-codex/PROOF-A1.md) · [B1](2026-11-02_defensible-offer-codex/PROOF-B1.md) · [C1](2026-11-02_defensible-offer-codex/PROOF-C1.md) · [D1](2026-11-02_defensible-offer-codex/PROOF-D1.md) · [E1](2026-11-02_defensible-offer-codex/PROOF-E1.md) |
| PACK | [A1](2026-11-02_defensible-offer-codex/PACK-A1.md) · [B1](2026-11-02_defensible-offer-codex/PACK-B1.md) · [C1](2026-11-02_defensible-offer-codex/PACK-C1.md) |
| BENCH | [A1](2026-11-02_defensible-offer-codex/BENCH-A1.md) · [B1](2026-11-02_defensible-offer-codex/BENCH-B1.md) |

32 task files (31 for Codex, P0 for Kevin), about 3,900 minutes (65 hours) of agent work in total (estimate), plus Kevin's
reviews.

## Shared decisions for every task

- **DO1** Hold every PILOT decision HD1-HD15 ([build-plans/PILOT.md](2026-11-02_pilot-pages/build-plans/PILOT.md)),
  above all HD5 (no person rankings or person metrics), HD7 (works with AI off), HD9 (strings in both catalogs),
  HD10 (people are ids), HD11 (schema areas), HD12 (no package changes), HD14 (personnel number never shown).
- **DO2** No model output ever changes a score, a verdict, a premium or a KPI. A model may propose; a person or a
  rule decides, and the record says which.
- **DO3** Every new number broken down by unit or role is hidden below 5 people (`TooFewToShow`), and every
  cross-company number below 5 companies.
- **DO4** New event types are added only in the task that owns `features/cases/events.ts` or the feature's own event
  file, with Kevin's approval (risk high); the reducer in `features/cases/reducer.ts` changes only in tasks that say so.
- **DO5** Pages are Sam's (spec 11). A Codex task builds the feature, server action and data a page needs, plus at
  most a plain route that renders it with existing components when its prompt says so.

## Open questions

| # | Question | Default |
|---|---|---|
| DQ1 | Does Kevin want Codex lanes next to orch's Claude lanes, or Codex only for TRUTH as a trial? | TRUTH as a trial; decide after TRUTH-A1 to TRUTH-D1. |
| DQ2 | HD14 says the personnel number is never exported; a payroll file needs it (BVW-F1). | Amend HD14: the payroll CSV is the one place it appears, generated for the payroll role only, audit-logged, never previewed. |
| DQ3 | CLK keeps the case with the owner on breach (CLK risks); the offer promises a hand-over. | CORE-H1 adds a company rule `deadline_handover` (default on for new companies, off for existing demo data) and writes `case.handed {why: "deadline"}`. |
| DQ4 | TRUTH-C1 is throw-away once VIS-C1 lands. Skip it? | Build it: VIS-C1 waits on CLK-Z1, DIR-C1 and AIP-A1, and a pilot conversation may come first. VIS-C1 then keeps the actor redaction. |
| DQ5 | Who reviews the Gutachter and committee flow with a real BVW lead before BVW-B1 starts? | Marc finds one BVW lead for a 30-minute review of spec 11's review and committee pages. |
| DQ6 | Where do cross-company benchmark contributions go? | A file the company admin downloads and sends; NextUp aggregates by hand in `nextup-admin` until five companies opted in. |
