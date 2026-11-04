# TST-C1 findings

Channel scenarios on a fresh Musterwerk (150 people, 2 weeks, seed 11), `apps/app/tests/db/tst-channels.test.ts`.

## Result

No product bug found; no `it.fails` and no TST-F finding. All five scenarios pass as normal tests:

- Teams for one site (`Werk Nord`, every person adds the bot through the fake Bot Framework): a passed deadline reaches the deputy as a reminder card, no mail; the card's answer appends one `case.decided` (source `teams`) that reduces onto the case.
- A deputy at `Werk Süd` (no Teams) gets the same reminder as a `mail` outbox row, delivered through the captured transport, nothing on the fake bot.
- A QR raise from an area at each of the three sites lands on the area's role seat (on its holder's desk); the reference shows `sent`, then the decision. The desk is told by Teams at Nord and by mail elsewhere.
- Teams switched off (D3): no new `teams` rows or bot posts; the Nord desk holder gets mail; raise, route (`proposeOnRaise`), ask, answer and decide still work.

## Notes for whoever writes the next scenario (not defects)

- The generator makes a `sandbox` company, and the notify gate skips everything there. A channel scenario has to move the company to `pilot` and switch `notifications` on first.
- The Teams path also needs `entraTenantId` on the company and an `Integration` row for `teams`.
- The seed's route id is the routing rule's `key`, not its `id`; a case raised with the rule's `id` has no route and the clock never fires for it.
- `DE-BY` holidays apply: with Good Friday and Easter Monday a 5 d wait started on 22 March falls due on 1 April.
- `raiseFromFloor` takes no injected `now`, so floor cases are stamped with the real clock while the scheduler tests run on 2027 dates. The scenario filters by case id and is not affected.
