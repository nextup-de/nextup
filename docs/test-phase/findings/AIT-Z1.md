# AIT-Z1 findings

## Measured offline hit rate

Pack seed 1, api part loaded into a sandbox company, `searchDocuments(companyId, ceiling, question, 4)` for 14 api or both questions (14 with a shouldFind file). Leaks: 0.

| Language | Hit rate |
|---|---|
| all | 92.9 % (13/14) |
| German | 100.0 % (13/13) |
| English | 0.0 % (0/1) |

Missed question ids: `m51`.

| Missed id | Top hits |
|---|---|
| `m51` | `api/downtime/Stillstand-Werk-Nord-Linie-B-01.csv`<br>`api/downtime/Stillstand-Werk-Nord-Linie-A-01.csv`<br>`api/scrap/Ausschuss-Werk-Nord-01.csv`<br>`api/orders/Auftraege-2026-03.csv` |

## Likely causes

What the miss and the search itself point to, as a list for a later plan (no fix in AIT, D2):

- `m51` (English question, German data): the question words (`article`, `minimum`, `stock`, `furthest`) do not occur in the German stock CSV (`Artikel`, `Mindestbestand`, `Bestand`), so the OR search ranks downtime, scrap and order files above `api/stock/Bestand-2026-01.csv`. No cross-language matching.
- The `simple` text search has no German stemming and no compound splitting (`Mindestbestand` is not found by `Bestand`; the `:*` prefix only helps at the word start).
- Only 4 hits per search: with an OR query over up to 12 words, generic CSV exports crowd out the right file; a higher limit or a rerank would show how much is lost.
- Numeric tables (CSV) rank on shared words only; "which row is furthest below" cannot be answered by retrieval, the model has to read the whole file.
- 1 of 14 api questions is English, too few to call the English rate; the catalog needs more English api questions.

The live numbers (with a model, per persona) come from `docs/test-phase/AI_QUALITY.md`.
