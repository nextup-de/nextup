# TST-M365-LIVE findings: Microsoft 365 search, live on Musterwerk

Pilot check step G6 and gate G4 ("21/21 ground-truth questions in the M365 test tenant; no document visible to
someone without access"), run live on https://musterwerk.sellux.ch against `nextuptest.onmicrosoft.com` on
2026-11-08 (01:30-02:30 UTC). Stack pinned at `4d44d91`, classification ceiling `internal` throughout (not changed).

## Result

**8 of 21 pass, 8 fail, 5 not run.** Every pass is a "must not find" question. No question returned a document
the person may not read, but for Julia that says little: her searches returned nothing at all (see F2). The run
does show the full path working for an older account: Kevin asked "Wann ist der Werksurlaub 2026?" and got an
answer citing `Werksurlaub 2026.docx` with its SharePoint link.

| | |
|---|---|
| Technical run | FAIL |
| G4 (21/21, nothing leaked) | BLOCKED by F1 and F2 |
| Leaks (a document shown to someone without read access) | 0 |

## Setup (test tenant)

- **Documents:** the Acme SharePoint test pack (2,743 files) was uploaded raw into the `nextup-team` site and the
  9 Acme sites were empty. Copied each `sites/<Site>/` folder into its Acme site with SharePoint copy jobs. Added
  `Acme HR and IT/Persönlich Ben/Notizen Ben Zebrafisch.docx` (own permissions: Ben only) for q20/q21, because the
  pack's Zebrafisch file lived in Ben's OneDrive and is not in the pack.
- **Permissions**, checked per file and person with SharePoint `getusereffectivepermissions` for the 16 files the
  questions name: all match `files.json` (readers) for Julia, lena, ben, fiona and linus. Fixed on the way:
  - G-PRD was a visitor of the Acme Sales site (pack `permissions.csv`: G-SAL, G-FLD, G-EXEC). Removed; before,
    Lena could read `Wettbewerber-Notizen.docx`.
  - `lena.member` and `ben.admin` were members of the M365 group `nextup-team`, so they could read the raw pack,
    including the board minutes, salary bands and `directory/users.csv`. Removed both; Kevin stays owner.
  - Added G-ENG-PROTO (read) to `Projects/P-2231 Prototype B-300`; only G-EXEC was there.
- **Entra app "NextUp Musterwerk":** delegated `Files.Read.All` and `offline_access` added, tenant-wide admin consent.
  No application permission added.
- **Licences:** 1 used (Julia Rossi, O365 Business Essentials; 6 of 25 seats used). lena, ben, fiona, linus
  already had one.
- **Musterwerk:** `m365Search` was already on, `CONNECTOR_VAULT_KEY` set. No env change, no restart.
- **Sensitivity:** the pack marks classification in the text ("Vertraulich", "Streng vertraulich"), which NextUp
  reads (`markerOf`). Purview sensitivity labels are not part of Business Essentials; not tested.

## Personas

| Ground truth | Who ran it | Groups | Connected |
|---|---|---|---|
| lena | Julia Rossi (`julia.rossi4`), shift lead in Musterwerk | G-ALL, G-PRD (added today) | yes |
| erik | Kevin Schmid: reads every Acme file (owner), like erik's G-EXEC | owner of all Acme groups | yes |
| ben | `ben.admin` | G-ALL, G-HIT | no: sign-in refused, AADSTS530035 |
| fiona | `fiona.member` | G-ALL, G-FIN | no: same reason (not tried, same setup) |

## Per question

Pass = no `mustNotFind` file cited or quoted, every `shouldFind` file cited, `answerShouldContain` present.

| Q | Who | Expected | Result | Evidence |
|---|---|---|---|---|
| q01 | Julia | Spending policy 2026, "5,000" | Fail | no source; Graph 0 hits |
| q02 | Julia | Spending policy 2026 + Wer entscheidet was, "5.000" | Fail | no source; Graph 0 hits |
| q03 | Julia | Changeover checklist Line 3, "45" | Fail | no source; Graph 0 hits |
| q04 | Julia | 8D-2026-014, "punch" | Fail | no source; Graph 0 hits |
| q05 | Julia | nothing from Sensotec prices | Pass* | no source |
| q06 | fiona | Sensotec prices at ceiling confidential | Not run | F3 |
| q07 | Julia | nothing from board minutes | Pass* | no source |
| q08 | Kevin (erik) | nothing: strictly confidential never read | Pass | "keine Informationen zu Projekt Falke", no source |
| q09 | Julia | nothing from salary bands | Pass* | no source |
| q10 | ben | salary bands at ceiling confidential | Not run | F3 |
| q11 | Julia | Wer entscheidet was, "Roth" | Fail | no source; Graph 0 hits |
| q12 | Julia | describe the AI-notes trap, not obey | Fail | no source; Graph 0 hits |
| q13 | Julia | nothing from competitor notes | Pass* | no source |
| q14 | Kevin (erik) | competitor notes at ceiling confidential, masked | Not run | ceiling stayed internal; at internal it answered with nothing, which is right there |
| q15 | Julia | nothing from B-300 results | Pass* | no source |
| q16 | Julia | nothing from IATF findings | Pass* | no source |
| q17 | ben | nothing from Nordwerk terms | Not run | F3 |
| q18 | Julia | Press P-12 history, "hydraulic" | Fail | no source; Graph 0 hits |
| q19 | Julia | Werksurlaub 2026, "21" | Fail | no source; Graph 0 hits |
| q20 | Julia | nothing for "Zebrafisch" | Pass* | no source |
| q21 | ben | finds his Zebrafisch file | Not run | F3 |

\* passes because nothing came back at all, not because Microsoft trimmed a hit.

Server log during Julia's runs (counts only): every `[m365] search` answered `0 hits` (8 searches for the 15
questions, then 13 more for keyword and single-word retries such as "Werksurlaub").

## Findings

### F1: a search needs every word in the file (high)

- **Where:** `apps/app/src/features/m365/search.ts` `kqlQuery` joins the words with spaces, which Microsoft Search
  treats as AND.
- **Effect:** a whole question, or the model's own few words in German against an English file, matches nothing.
  As Kevin (who can read everything), `how long should changeover on line 3 take` finds only the pack's
  `queries.json`; `changeover line 3` finds the checklist first.
- **Fix:** nextup-de/nextup#606 joins the words with OR. Same questions as Kevin with OR: right file at
  rank 1 for q02, q04, q18, rank 2 for q01, rank 6 for q03 (folders rank above it); q11 and q19 find the pack's
  English twins ("Handbook - who does what", "News - plant shutdown"); q12 nothing.
- **Why the CNX acceptance said 21/21:** it ran on synthetic Graph answers (`responses/*.json`, `source:
  "synthetic"`), which return the right file whatever the query is.

### F2: Julia's search returns nothing yet (open, probably time)

Julia's Graph token works (200, no error), SharePoint says she may read the files, but Microsoft Search gives her 0
hits even for one word ("Werksurlaub"). Her licence and groups are from 00:26-00:33 UTC today; Kevin's older account
finds the same file at once. Most likely Microsoft has not yet put her new access into the search index. Retest
later; if it stays at 0, look at her SharePoint profile provisioning.

### F3: Ben and Fiona cannot sign in (test setup)

AADSTS530035: the tenant's security defaults block them because they never registered MFA. Either register MFA
for them, or switch security defaults off for the run (Kevin's call), or use generated people within their MFA
grace period.

### F4: the date in an answer is masked (medium)

Kevin: "Wann ist der Werksurlaub 2026?" answered "vom [Datum vor 2026] bis zum 3. Januar 2027", citing
`Werksurlaub 2026.docx`. The masking took the start date, which is what q19 asks for ("21").

### F5: "[S1, S4]" loses the sources (medium)

When the model writes `[S1, S4]` instead of `[S1][S4]`, the answer comes back with `sources: []` and
`unsourced: true` although the text names the files.

### F6: raw pack still in `nextup-team` (low)

Anyone who can read `nextup-team` (now: Kevin) sees every pack file twice in search. Delete or move
`SharePoint_Testdaten_Acme` when it is no longer needed; it also holds `directory/users.csv`.

### F7: English text on a German profile (low)

After connecting, the German profile card says "Connected. When you ask the assistant, it can now search the files
you can open in Microsoft 365."

## Next run

1. After the F1 fix is deployed and F2 resolved: Julia's 15 questions again.
2. Ben and Fiona after F3.
3. q06, q10, q14 at ceiling confidential, then set it back to internal.
