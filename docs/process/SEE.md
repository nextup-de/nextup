# SEE: The raiser sees the whole way

> Area: case. Written only by this phase (see [README](README.md)).

## Data model

SEE adds two `case.*` events, one payload field on `case.raised`, one type and a status. All are declared in
`apps/app/src/features/cases/events/case.ts` and reduced in `features/cases/reducer.ts`; an old log has none of them and
replays as before (`tests/unit/see/replay.test.ts` and its golden). None of them sends a notice (D21).

| Event | Payload | What the reducer does |
|---|---|---|
| `case.merged` | `{ into, note? }` | The desk closes an undecided case as a duplicate of `into`: status `merged`, archived, off the desk, clock stopped on the merge day. The raiser is pushed onto the target's `mergedIn`. |
| `case.linked` | `{ to }` | Marks this case and `to` as related, both ways. Both stay as they are. No unlink. |
| `case.raised` | `follows?: string` | The raise follows up the case `follows` (D15): `follows` on the new case, `followedBy` on the old one. Dropped when that case does not exist or is this one. |

`case.raised` also reads `proposal.sameAs` and `proposal.related` (D16). `CaseProposal = RouteProposal & { sameAs?: string | null;
related?: string[] }` is the type of the case payload's `proposal`; `RouteProposal` in `events.ts` is unchanged.

**New `ReducedCase` fields:** `follows`, `followedBy`, `sameAs`, `related` (ids of cases that exist when the raise is applied, never
the case itself), `merged` (`{ into, day, by, byUserId, note }`), `mergedIn` (`{ id, userId, day }[]`: the raisers merged into this case,
for the affected count by user id; a page shows only the count, never the ids or names) and `links`. The status gains `merged`.

**Merge rules** (the reducer ignores an event that breaks them; the server checks who may write it, SEE-B1):

- Only an undecided case (`open`, `asked`, `discussion`, no `decided`) that is neither withdrawn nor merged, into another case that is
  neither merged nor withdrawn. A decided target is allowed.
- **No chains, no cycles.** A case that already absorbed repeats (`mergedIn` is not empty) is not merged itself, so every merge points
  at a case that stays and the destination of an earlier merge never changes. After A merged into B, B cannot merge into A (A is merged).
- Merging twice, and merging into oneself, are ignored. Events of one day are applied in log order.
- A link needs two existing cases, different, neither merged; the case that writes it is not withdrawn; a second link of the same pair is
  ignored.

**Audience.** No merge or link widens who can read either case. The helpers in `features/cases/links.ts` (`mayMerge`, `mayLink`) take the
target case from the caller, which offers only cases the person may open; they never look a case up in the company's whole state.

## Loop

## Clock

## Notices

## Release note
