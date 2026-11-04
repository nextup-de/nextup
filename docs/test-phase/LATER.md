# After the test phase: medium and low findings and wishes (D2)

Only fixes go in during TST; everything here waits. Sources are the findings files in `findings/`.

## Retrieval (AIT-Z1, medium)

- No cross-language matching: the English question `m51` misses the German stock CSV (`Artikel`, `Mindestbestand`, `Bestand`).
- The `simple` text search has no German stemming or compound splitting (`Mindestbestand` is not found by `Bestand`).
- Only 4 hits per search: with an OR query over up to 12 words, generic CSV exports crowd out the right file; try a higher limit or a rerank.
- Numeric tables rank on shared words only; "which row is furthest below" needs the model to read the whole file.
- The catalog has one English api question; it needs more to call an English hit rate.

## Load (TST-L1)

- TST-FL1-1 is fixed (`findings/TST-L1.md`). What is left: the case-view count and the session check still run on every page; the 77 KB
  page carries the viewer's whole window of events; a change on another replica shows after `COMPANY_CACHE_MS` (3 s).
- Response size will matter at 2,000 people and 500 shipped cases (`WINDOW_CASES`); the 2,000-account run tells.

## Scenario notes (low)

- Channels (TST-C1): `raiseFromFloor` takes no injected `now`, so floor cases carry the real clock. A channel scenario must move the
  company from `sandbox` to `pilot` and switch `notifications` on, and needs `entraTenantId` and a `teams` `Integration` row.
- Core loop (TST-S1): generated check-ins have all fallen due by the generator's own clock run, so the scenario starts its own round;
  the scenarios share one company and move the clock forward only, so their order matters.
- Acceptance spec: a streamed not-found for a case the viewer may not open answers 200; the proof reads the page and payload, not the status.
- Playwright's config starts local servers even in remote mode; a config without `webServer` for remote runs.
