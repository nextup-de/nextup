# Assistant sources, language and M365 search, 2026-11-09

Work for the pilot targets on the raise-page assistant and Microsoft 365 search, after the AIT live run
(`AIT-live-2026-11-08.md`) and the M365 re-run (`TST-M365-LIVE.md`, 11 of 21 pass, 0 leaks). Two PRs:

- nextup-de/nextup#626 `feat/assist-sources`: loader, search words, more hits, folders out, counts-only search log.
- `fix/assist-language-dates` (this PR): answer language, search before a rule, newest version, event date,
  `[S1, S4]` citations, date ranges no longer masked.

Everything here was measured offline: the recorded question sets, a local Postgres, the mock provider. Nothing was
deployed and nothing was run on Musterwerk or the test tenant; the live re-run is phase 2.

## Against the targets

| Target | Before | After (offline) | Still open |
|---|---|---|---|
| ≥ 80 % of answers with a source | Musterwerk: 0 documents, 91 % of answers unsourced | 51 company-wide documents load; the right file is among the 8 hits for **26 of 26** answerable catalog questions (was 13 of 14 with the old loader, 22 of 26 with the old search), right file at the top for 22 of 26 (was 11 of 26) | Kevin loads the pack (command in #626). 27 of 53 catalog questions need restricted-site files, which only Microsoft 365 can serve per person. The live share depends on the model citing; measure in phase 2 |
| Answer in the question's language | 1 of 6 English questions answered in English (live) | Detector right for **74 of 74** catalog and ground-truth questions; the system prompt names the language as its last line | Live check in phase 2 |
| M365 ≥ 17 of 21, 0 leaks | 11 pass, 5 fail, 5 not run, 0 leaks | The 4 F9 questions get a source offline (pipeline is not the cause); fixes target q01, q02, q11, q19 and q18; 0 leaks in every test | **17 needs at least one of the 5 not-run questions**: 16 is the maximum without them. q14 needs only the ceiling set to `confidential` for one run (Kevin); q06, q10, q17, q21 need Ben or Fiona signed in (F3, Entra admin) |

## M365: what each fix aims at

| Q | Failed because | Change |
|---|---|---|
| q01 | no source; Kevin's direct OR search found the file at rank 1-2, so the model most likely did not search (spend limit looked up as a role) | prompt: a rule, limit or date needs `search_documents` first, even when a role seems to answer; a second search with other words when the first finds nothing |
| q02 | German question, English policy: no shared word (old query `bis OR zu OR welchem OR betrag OR dürfen OR teamleiter OR ersatzteile OR bestellen`) | glossary twins: now also `amount`, `limit`, `spare`, `order` |
| q11 | English question, German "Wer entscheidet was" | twins `entscheidet`, `entscheidung`, `prüfstand` (from `test-rig`) |
| q19 | English question, German "Werksurlaub 2026"; and F10: the document's date given instead of the shutdown | twin `werksurlaub`; prompt: give the event's date, not the document's; F4: a date range like `07.12. - 03.01.2027` was masked as `[phone]`, now kept |
| q18 | F8: right file, but the reason is not in Graph's snippet | "why" now also searches `cause`/`Ursache`, so Graph highlights near the cause. Reading the file itself is blocked, see F8 |
| all | F5: `[S1, S4]` lost every source; folders ranked above files; only 4 hits | `[S1, S4]` is read as `[S1][S4]`; folders dropped; 8 hits, Graph asked for 14 |

The stop words matter as much as the twins: before, `when OR is OR the OR plant ...` matched nearly every file.

## F9: reproduced locally, cause needs the log

Replayed q01, q02, q11 and q19 through the whole assistant (redaction, tools, citation check, mock provider) with
the recorded set `tests/fixtures/graph/responses/`: **all four get the right source.** So the KQL builder, the
parser, the ceiling and the merge are not the cause. But every response file is still `source: "synthetic"`
(Graph returns the right file whatever is asked), so this cannot show how the real index ranks the model's
words. What is left is one of three, and only the server log tells them apart:

1. the model did not call `search_documents` (no search line in that question's seconds);
2. it searched, Graph returned 0 hits for its words (`[m365] search: 0 hits`);
3. Graph returned hits, but the answer cited none (hits > 0 and `unsourced`), e.g. F5.

**Lines for Kevin to send** (counts and timings only; these lines never hold a query, title or token). From the
Musterwerk box, for Julia's pass 1 (2026-11-08 23:59 to 2026-11-09 00:11 UTC):

```
docker compose logs app --timestamps --since 2026-11-08T23:55:00Z --until 2026-11-09T00:15:00Z \
  | grep -E '\[m365\] search|\[assist\]'
```

and the times of the assistant turns in the same window, to match each line to its question:

```
SELECT "createdAt", "unsourced", "latencyMs" FROM "AssistTurn"
WHERE "companyId" = (SELECT "id" FROM "Company" WHERE "slug" = 'musterwerk')
  AND "role" = 'assistant' AND "createdAt" BETWEEN '2026-11-08 23:55Z' AND '2026-11-09 00:15Z' ORDER BY 1;
```

The app logs rotate at 3 × 10 MB (`stack/compose.yml`), so that window may be gone. Then: after #626 is deployed,
ask q01, q02, q11 and q19 once as Julia and send the same grep for those minutes. #626 adds one line per document
search, `[assist] search_documents: <n> local, <n> m365, <n> handed on`, which answers 1-3 directly.

## F8: reading more than the snippet is blocked on a rule (Kevin)

Graph search gives a snippet only. The file's text needs `GET /drives/{drive-id}/items/{item-id}/content`, which
answers with a redirect to the tenant's own `*.sharepoint.com` download URL: a host `CLAUDE.md` does not allow
(only `graph.microsoft.com` and `login.microsoftonline.com`). A `.docx` is also a zip; reading its text needs
Node's own `zlib` and an XML strip, no new dependency. Not built. If Kevin wants it, the proposal:

- allow `<tenant>.sharepoint.com` for downloading a file the person's own search just returned, as that person;
- the top 2 hits only, text cut to 4,000 characters, redacted like a snippet, classification re-checked on the
  full text (a "Vertraulich" inside the file drops it), never stored (decision 8 unchanged);
- a DPIA note: whole files, not snippets, then go to the model (decision 5 says snippets).

## Not done here

- Ben and Fiona (F3) and the `confidential` ceiling runs: Entra admin and Kevin.
- The Musterwerk pack's restricted sites in the test tenant (`AI_QUALITY.md` section 1): the tenant holds the Acme
  pack, so `ask.ts --persona all` cannot score the 27 site questions yet.
- The glossary was written while looking at these questions; new questions and the live run are the real test.
