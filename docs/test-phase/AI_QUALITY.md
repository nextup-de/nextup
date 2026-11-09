# AI quality test on Musterwerk (runbook)

Plan AIT. A live run Kevin starts against a stack: the four test people ask the question catalog
(`apps/app/prisma/generators/musterwerk-docs/questions.json`) through the assistant, and `ask.ts` scores the answers.
Everything below stays outside the repository: the pack, the cookies and the results are never committed.

Needs: the pack generator (AIT-A1), the catalog (AIT-B1), the loader `run-load.ts` (AIT-C1). Bedrock setup:
`docs/demo/AI_DEMO.md`.

## 1. Test tenant (Microsoft 365)

1. Write the pack, from `apps/app`:
   `npx tsx prisma/generators/musterwerk-docs/run-pack.ts --seed 1 --out <dir outside the repo>/ait-pack`
2. Create the seven sites as private team sites and the seven groups in the test tenant: MW-ALL, MW-NORD, MW-SUED,
   MW-ZENTRALE, MW-FIN, MW-HR, MW-EXEC. Site owners/members follow `sites/permissions.csv`.
3. Import the group files `directory/groups/<group>.csv`.
4. Add the four personas (the licensed accounts of the test tenant): lena (MW-ALL, MW-NORD), ben (MW-ALL, MW-HR,
   MW-ZENTRALE), fiona (MW-ALL, MW-FIN), linus (MW-ALL, MW-EXEC).
5. Upload `sites/<Site>/` into each site's Documents.
6. Wait for the index: a search as lena for `Schichtübergabe` finds the Werk Nord file.

## 2. The stack (test VM or demo box)

1. Generate Musterwerk (TST).
2. Turn Bedrock on for the company as in `docs/demo/AI_DEMO.md`.
3. Set the assistant ceiling (Settings, Assistant). Note it for the results table; pass it to `ask.ts --ceiling`.
4. Switch on Microsoft 365 search.
5. Invite the four personas with their tenant emails (`<persona>.member@nextuptest.onmicrosoft.com`) as members.
6. Create a token with `knowledge:write` and run `run-load.ts` (pushes the `api/` files).

## 3. Ask

1. Sign in as each persona. Copy the session cookie (browser dev tools, Application, Cookies) as one `name=value`
   line into `<dir outside the repo>/<persona>.txt`. A persona without a file is skipped (SKIP rows).
2. From `apps/app`:

```
npx tsx prisma/generators/musterwerk-docs/ask.ts --base https://<stack> --slug <slug> --persona all \
  --cookies <cookie dir> --ceiling internal --out <dir outside the repo>/ait-run.json
```

   Other options: `--ids m01,m02` (only these questions), `--delay <ms>` (default 1500 between questions),
   `--dry` (scores a canned stream, no network, no cookies needed). Each question has 120 s. `--out` and
   `--cookies` inside the repo are refused.
3. Read `ait-run.md` (id, persona, pass, found, leaked, contains, seconds) next to the JSON. It holds no answer text.
4. Delete the cookie files afterwards and sign the personas out.

## 4. Results

A question passes when at least one expected file is among the sources (or none was expected and none came), no
forbidden file and no source above the ceiling appears, and every expected word is in the answer (any case).
Fill one row per run:

| Date | Stack | Model | Ceiling | Pass rate all | German | English | Leaks | Median seconds |
|---|---|---|---|---|---|---|---|---|
| 2026-11-08 | musterwerk.sellux.ch, `4d44d91`, 0 documents | Azure `gpt-4.1-mini` | internal | not measurable: 0 documents (`findings/AIT-live-2026-11-08.md`) | 10 / 10 | 1 / 6 | 0 | 1.1 (server) |
| 2026-11-09 | musterwerk.sellux.ch, `0db9d91`, 51 documents, as Julia (not the four personas) | as configured | internal | 14 / 53 by `ask.ts` (19 / 53 matching titles); answerable: 13 / 26 correct (`findings/AIT-live-2026-11-09.md`) | 48 / 48 | 19 / 19 | 0 | 2.8 (browser) |

**Leaks above zero stop the pilot.** Weak pass rates are findings, not fixes; Kevin decides any change.
