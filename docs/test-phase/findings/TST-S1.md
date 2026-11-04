# TST-S1 findings

Core-loop scenarios on Musterwerk (`apps/app/tests/db/tst-core.test.ts`, `describe("TST core loop")`, 150 people, 2 weeks, AI and integrations off).

**Findings: none.** All 12 scenarios hold as normal `it`s; no `it.fails` was needed.

## What the scenarios cover

| Scenario | Result |
| --- | --- |
| AI routing and assistant off, sandbox company | holds |
| A raise lands on the route's owner seat, whatever the client sent | holds |
| Ask, answer and decide: only the owner desk asks and decides, only the raiser answers | holds |
| The decision reaches the decision log for manager and raiser, not for another member or another unit's leader | holds |
| A member and a leader of another unit cannot open the case, load it or see it in their log; raiser, owner and manager can | holds |
| Deadline: no fact on the due working day, one the next; one hand-over to the deputy seat across repeated passes | holds |
| Check-in falls due the working day after its date, once | holds |
| Measure falls due the working day after its check date, once | holds |
| Deadline across a weekend (Fri 20 Nov to Mon 23 Nov) | holds |
| Deadline across a public holiday (Fri 25 Dec, Bavaria) | holds |
| The wait ledger counts the raised, decided and handed cases | holds |
| Unit and role numbers below 5 people are hidden, from 5 shown | holds |

## Notes for later (not findings)

- Check-ins of the generated history have all fallen due by the generator's own clock run, so the check-in scenario starts its own discussion round instead of reusing a generated one.
- The scenarios share one company and move the clock forward only, so their order in the file matters (check-in and measure before the weekend and holiday cases).
