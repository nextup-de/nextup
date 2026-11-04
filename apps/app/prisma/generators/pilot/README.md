# Pilot bootstrap (PIL D13)

One command makes a sandbox company for a pilot from a config file and four CSV files, and ends with the go-live
checks (D9), one line each, so every missing setting is named. It never moves the stage: that is the Go-live page.

Run from `apps/app`, with `DATABASE_URL` in the environment or `.env.local`.

```
npx tsx prisma/generators/pilot/run.ts sample --people 150 --seed 1 --out ./pilot-files
npx tsx prisma/generators/pilot/run.ts bootstrap --config pilot.json [--codes codes.tsv] [--json]
npx tsx prisma/generators/pilot/run.ts report --slug acme-pilot --now 2026-11-09T09:00:00+01:00
```

## Config (JSON)

```json
{
  "slug": "acme-pilot",
  "name": "Acme GmbH",
  "admin": { "name": "Erika Muster", "email": "erika.muster@acme.example" },
  "calendar": "de-by",
  "promiseDays": 5,
  "flags": { "discussion": true },
  "ai": { "choice": "off" },
  "structureDir": "./pilot-files",
  "directory": "entra"
}
```

- `calendar`: `"de"`, `"de-by"` or `{ "workdays": [1,2,3,4,5], "holidays": ["2026-12-24"] }`.
- `structureDir`: a folder with `units.csv`, `roles.csv`, `members.csv`, `routes.csv`, relative to the config file.
- `directory`: runs the directory sync once, only when that source is configured in the console or the environment.
- A key that is not listed is refused, and so is anything that looks like a secret. Keys for AI, directory and mail are
  set in the console or the stack's environment, never here. A refused config writes nothing (exit 2).

## What a run does

1. Creates the company in stage `sandbox` (the rows `createCompany` writes for the empty template, and its first admin).
   An existing company must be a sandbox and takes the remaining steps again; an import never deletes.
2. Saves the calendar, the promise days, the flags and the AI choice.
3. Checks the CSV files and, only when they have no error, writes them. Otherwise every error is listed (exit 3) and the
   structure stays unwritten.
4. Makes login codes for new users with no code and no Microsoft id. The codes are kept only with `--codes <file>`.
5. Runs the directory once when `directory` is set and configured.
6. Prints the checks: `[state] level key: text`; `--json` gives the same list as data.

A second run with the same files adds nothing. Exit code: 0 done (open checks are listed, not an error), 1 refused
(the company is not a sandbox) or failed, 2 config refused, 3 CSV errors.

## sample

Writes the four CSV files for N people (12 to 2000) on 3 sites, with exactly one `app_role` manager and one team of
fewer than 5 people. The same seed gives the same files. Names and the random source are the TST generator's.
