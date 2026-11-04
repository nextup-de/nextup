# Musterwerk document pack (AIT-A1)

A made-up, mostly German document pack for the AI quality test: about 300 files for the fictional Musterwerk, with
site permissions, group files and ERP extracts. It is generated from a seed; nothing in it is real (no real people,
companies or customers; emails end in `example.test`, phones start `+49 000`, IBANs start `DE00`).

**The output is never committed.** Write it outside the repository; the tests build it in memory.

## Write it

From `apps/app`:

```
npx tsx prisma/generators/musterwerk-docs/run-pack.ts --seed 1 --out ../../../../ait-pack
```

`--out` inside the repo is refused. The same seed gives the same pack. It writes:

- `sites/Musterwerk <Site>/…` – the m365 files (Company, Werk Nord, Werk Süd, Zentrale, Finance, HR, Board)
- `api/<kind>/…` – what an ERP or n8n pushes (orders, stock, suppliers, cost-centres, downtime, scrap), each ≤ 20,000 characters
- `manifest.json` – every file's fields except the body, plus `site` and `size`
- `sites/permissions.csv` – site, group, permission
- `directory/groups/<group>.csv` – persona emails (`<persona>.member@nextuptest.onmicrosoft.com`) per group

## Fields (`PackFile`, `manifest.ts`)

`path`, `channel` (`m365` | `api`), `title`, `body`, `format` (`md` | `txt` | `csv` | `html`), `lang` (`de` | `en`),
`classification` (`public` | `internal` | `confidential` | `strictly_confidential`, also stated in the text as
"Vertraulich" / "Streng vertraulich"), `readers` (group names; empty for api files), `year`, `kind`.

Groups, sites and personas are in `manifest.ts` (`MW_GROUPS`, `MW_SITES`, `MW_PERSONAS`).

## On purpose in the pack

Stale files (2021–2022), the superseded spending policy (2.500 EUR vs 5.000 EUR in 2026), saved-twice copies
("Kopie", "(v2)", "final_neu"), personal data in HR and finance, one file that tells an assistant to ignore its rules
(`Hinweise für KI-Assistenten.md`) and strictly confidential Board files ("Projekt Adler").

## Layout

`pack.ts` joins the modules in `content/`; `write.ts` writes; `run-pack.ts` is the command line. Randomness comes
only from TST's seeded `rng.ts`.
