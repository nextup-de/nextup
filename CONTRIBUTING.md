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

## What not to do — and why

| Don't | Because |
|---|---|
| `git push origin main` | Blocked, and it bypasses review. |
| `git push --force` / `-f` | Overwrites other people's work. Never on a shared branch. |
| `git add -f something` | Force-adding an ignored file. The ignore is on purpose. |
| Edit `.gitignore`, `CLAUDE.md`, or anything in `.github/` | Kevin's. Ask. |
| Add a new dependency (`npm install something`) | Changes how everyone runs the project. Say why in the PR; Kevin decides. |
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
