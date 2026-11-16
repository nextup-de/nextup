# Contributing

Three of us work in this repo. Kevin (@selluxhenner) reviews and merges
everything. This page is the whole process — if you follow it, nothing you do
can break the project for anyone else.

The one rule that matters most: **nobody pushes to `main`.** Not even Kevin.
Everything goes through a branch and a pull request. GitHub is configured to
reject direct pushes, so if you ever see a "protected branch" error, that's
working as intended — you're on the wrong branch.

---

## First-time setup (once)

```bash
git clone https://github.com/nextup-de/nextup.git
cd nexthub
git config user.name "Your Name"
git config user.email "you@example.com"
```

Install and run the app (needs Node 20+):

```bash
npm install
npm run dev
```

Open http://localhost:3000.

If you use Claude Code: it reads `CLAUDE.md` automatically. Don't tell it to
ignore those rules; they are the same rules as on this page.

---

## Every task — the loop

### 1. Start from a fresh `main`

```bash
git checkout main
git pull
```

### 2. Make a branch for this one task

```bash
git checkout -b feat/inbox-sort-by-age
```

Prefixes: `feat/` new thing · `fix/` bug · `chore/` housekeeping.
Short, lowercase, dashes. One task = one branch. If you get a second idea while
working, write it down and do it on a new branch afterwards.

### 3. Work and commit

```bash
git add <the files you changed>      # not "git add ." blindly — look at git status first
git commit -m "feat: sort inbox by age, oldest first"
```

Commit as often as you like. Messages: one line, say what and why.

Before you commit, run `git status` and read it. If you see a file you didn't
mean to change (especially `.gitignore`, anything in `.github/`, `package-lock.json`
you didn't intend to touch, or a file ending in `.env`) — **don't add it**, and ask Kevin what happened.

### 4. Push the branch

```bash
git push -u origin feat/inbox-sort-by-age
```

(After the first push, plain `git push` is enough.)

### 5. Open a pull request

Go to the repo on GitHub — there'll be a yellow "Compare & pull request" banner.
Click it, fill in the template (what / why / how tested), click **Create**.
Kevin is added as reviewer automatically.

### 6. Wait for the checks and the review

Green checkmark = automated checks passed. Red X = click "Details", read the
error, fix it on your branch, push again — the PR updates by itself.

Kevin may leave comments. Fix what's asked, push again, reply "done" on the
comment. When approved, Kevin merges.

### 7. Clean up

```bash
git checkout main
git pull
git branch -d feat/inbox-sort-by-age
```

Back to step 1 for the next task.

---

## Keeping your branch fresh

If `main` moved while you were working (someone else's PR got merged), pull it
into your branch **before** opening the PR, so conflicts land on your machine
and not in the review:

```bash
git checkout main && git pull
git checkout feat/your-branch
git merge main
```

If git says CONFLICT: open the file(s) it names, look for `<<<<<<<` /
`=======` / `>>>>>>>` markers, decide what the file should look like, delete
the markers, then `git add <file>` and `git commit`. If you're not sure how to
resolve it, stop and ask Kevin — don't guess and don't delete the other
person's code to make the error go away.

---

## Rights — who may do what

Who may do what (add a step, revise an idea, stop a project …) is Kevin's call, even when the change is small and
comes as part of a feature. Everyone may still build features that need a rights change; the change just has to
be visible. The table of all rights is `docs/RIGHTS.md`. It is generated from the rights code, and a unit test fails
when the two disagree.

The rights code: `apps/app/src/features/*/permissions.ts`, `features/*/rights.ts`, `features/cases/reducer.ts` and
`visibility.ts`, `features/projects/views.ts` and `confirm.ts`, `features/auth/`, `config/roles.ts`.

1. **Rights get their own PR.** Never inside a design or feature PR. Build the feature on the rights as they are,
   and open a small `rights:` PR for what it needs (`fix(rights): the raiser may add steps to their project`).
2. **Change the table with the code.** Run `npm run rights:write -w @nextup/app` and commit `docs/RIGHTS.md`.
   A new action or a new kind of person gets its row or column in `apps/app/tests/unit/rights-table.test.ts`.
3. **Say it in the PR**, under "Rights" in the template: which row changes from what to what, and why. "Kevin said
   yes" is not enough — name the rows, so the answer was to the actual change.
4. **Don't loosen a rights test to make it pass.** If a rights test fails, the rights changed: that is rule 1–3,
   not a test fix.

A PR that touches the rights code gets the `rights` label and a comment with the changed table rows from the
`Rights` workflow, and Kevin is mentioned on it. It doesn't block the merge: approvals stay optional. Merging
it without the table and the PR note is what is not OK.

---

## What not to do — and why

| Don't | Because |
|---|---|
| `git push origin main` | Blocked, and it bypasses review. |
| `git push --force` / `-f` | Overwrites other people's work. Never on a shared branch. |
| `git add -f something` | Force-adding an ignored file. The ignore is on purpose. |
| Edit `.gitignore`, `CLAUDE.md`, or anything in `.github/` | Kevin's. Ask. |
| Add a new dependency (`npm install something`) | Changes how everyone runs the project. Say why in the PR; Kevin decides. |
| Change who may do what inside a feature or design PR | Rights are Kevin's call; mixed in, 20 lines hide in 600. See "Rights" above. |
| Reformat a whole file "to clean it up" | 400-line diffs hide the 3 lines that matter. |
| Commit `.env`, keys, passwords, tokens | It's public the second it's pushed. Rotate it and tell Kevin. |
| Click "bypass" on a push-protection warning | It's telling you there's a secret. Remove it instead. |
| Keep a branch alive for weeks | It will conflict. Ship small, ship often. |

---

## Before you open a PR — checklist

- [ ] `npm run lint`, `npm run typecheck`, `npm test` all pass
- [ ] `npm run build` succeeds
- [ ] The pages you touched load with no console errors
- [ ] Below 760px still works (drag the window narrow)
- [ ] `git status` shows only files you meant to change
- [ ] PR description says what, why, and how you tested it

---

## Getting help

Stuck on git → message Kevin with the exact command you ran and the exact error.
Stuck on the code → open a **draft** PR with what you have and ask there; it's
easier to help when the code is visible.
