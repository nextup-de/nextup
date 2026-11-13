# Pilot bootstrap (PIL D13)

One command makes a sandbox company for a pilot from a config file and four CSV files, and ends with the go-live
checks (D9), one line each, so every missing setting is named. It never moves the stage: that is the Go-live page.

Run from `apps/app`, with `DATABASE_URL` in the environment or `.env.local`.

```
npx tsx prisma/generators/pilot/run.ts sample --people 150 --seed 1 --out ./pilot-files
npx tsx prisma/generators/pilot/run.ts bootstrap --config pilot.json [--codes codes.tsv] [--dry-run] [--json]
npx tsx prisma/generators/pilot/run.ts report --slug acme-pilot --now 2026-11-09T09:00:00+01:00
```

## Config (JSON)

```json
{
  "slug": "acme-pilot",
  "name": "Acme GmbH",
  "admin": { "name": "Erika Muster", "email": "erika.muster@acme.example", "stackAdmin": true },
  "calendar": "de-by",
  "promiseDays": 5,
  "flags": { "discussion": true },
  "ai": { "choice": "off" },
  "structureDir": "./pilot-files",
  "directory": "entra"
}
```

- `admin.stackAdmin`: only `true` is a value. It makes the first admin the stack admin as well, the one person who signs in to the console of a one-company stack (`isStackAdmin`, written with an audit row). There is exactly one: a company that already has another active stack admin is refused (exit 2, nothing written). Left out, the admin is only the company admin, as before.
- `calendar`: `"de"`, `"de-by"` or `{ "workdays": [1,2,3,4,5], "holidays": ["2026-12-24"] }`.
- `structureDir`: a folder with `units.csv`, `roles.csv`, `members.csv`, `routes.csv`, relative to the config file.
- `directory`: runs the directory sync once, only when that source is configured in the console or the environment.
- A key that is not listed is refused, and so is anything that looks like a secret. Keys for AI, directory and mail are
  set in the console or the stack's environment, never here. A refused config writes nothing (exit 2).
- `flags` names only the flags it sets; flags it does not name are left as they are.

## What a run does

1. Creates the company in stage `sandbox` (the rows `createCompany` writes for the empty template, and its first admin).
   An existing company must be a sandbox and takes the remaining steps again; an import never deletes.
2. Saves the calendar, the promise days, the flags and the AI choice.
3. Checks the CSV files (before step 1, see Safety) and, only when they have no error, writes them. Otherwise every
   error is listed (exit 2) and nothing is written.
4. Makes login codes for new users with no code and no Microsoft id. The codes are kept only with `--codes <file>`.
5. Runs the directory once when `directory` is set and configured.
6. Prints the checks: `[state] level key: text`; `--json` gives the same list as data.

A second run with the same files adds nothing.

## Safety (PIL D18)

- **Looks before it writes.** The config, the `--codes` file name and every CSV file are checked before the first
  write, and all errors are listed together. With any error nothing is written, not even the company.
- **`--dry-run`** does the same checks and prints what a real run would do (`would …`). It writes nothing: no company,
  no row, no codes file. For a company that does not exist yet there are no checks to show.
- **No mail.** The bootstrap never calls `createCompany` in `server/platform-jobs-sync.ts` (which mails the admin), so
  no mail is queued or sent.
- **Stage.** Only a company in stage `sandbox` is taken; any other stage is refused (exit 1) before anything is written.
  The stage is never moved.
- **A rerun keeps** users, login code hashes, notification preferences, the AI settings (an existing AI row is kept) and
  every flag, rule or setting the config does not name. It never makes a second code for someone who has one. A run
  that was interrupted is simply run again: each step looks first, so nothing is duplicated, and people who still have
  no code get one now. (A code made by an interrupted run that never reached the `--codes` file is lost; the admin
  issues a new one in the console.) The CSV files still win for what they name: a member's row is matched by email and
  brought in line with the file.

### `--codes <file>`

Without it, login codes are made and stored only as hashes; nobody can read them. With it, the file is created
exclusively with mode `0600` (where the file system has modes) and holds `<email><TAB><code>` for the people who got a
code in this run. An existing file is refused before anything is written (exit 2): the run never overwrites or
appends. The codes are never printed, not in `--json`, and never logged. Hand the file over safely and delete it.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Done. Open checks are listed and named, they are not an error. |
| 1 | Refused (the company is not a sandbox) or the command failed. |
| 2 | The config, an option (`--codes` with an existing file) or a CSV file has errors. Nothing is written. |
| 3 | The directory run failed (its error is in the steps). Everything before it is done; the checks are listed. |

## sample

Writes the four CSV files for N people (12 to 2000) on 3 sites, with exactly one `app_role` manager and one team of
fewer than 5 people. The same seed gives the same files. Names and the random source are the TST generator's.
