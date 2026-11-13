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

The raiser follows the idea from the card on My cases (`/<company>/team`, SentView) and from the case page. Both are built from the same
pure helpers, `features/cases/selectors.ts` (`journeyOf`), `features/cases/raiser-view.ts` and `features/cases/links.ts`, and nothing is stored as text.

**The journey.** `journeyOf(case, project, { discussion, projects, today })` gives the stages in this order: Raised, With the desk, Discussion,
Decision, Project. A company that has switched a step off does not see its stage (Discussion only with the discussion step on, Project only
with projects on). Each stage is `done`, `now`, `late`, `todo` or `skipped` and carries the role that holds it, the day it was done and the
day it is due. The decision stage ends in its outcome: Yes, "No · {category}", Withdrawn, "Merged into {title}"; a case that came back (a
revisit day or a reopened second look) shows the desk stage as now again with "Came back on {date}". The Project stage shows the project's
status and is skipped after a no, a withdrawal or a merge. A legacy idea that went straight to a build keeps its four steps.

**The no block** (`noBlockOf(case, today, appealDays)`): on the case page and, as plain lines, in the reply of the card on My cases. It shows the
category, the reason, "What would make it a yes" when the desk gave one, "Back on the desk on {date}" for a decision with a revisit day, for the
category duplicate the link to the case or project it duplicates, and the second look: "Ask for a second look" with its last day for the raiser
while it is open, "Second look asked on {date}" while it is pending, then the answer. **Decided before your answer** is shown when the desk
decided while its question to the raiser was still open.

**Decision expected by** (`expectedByDay`): while a case is in a discussion the raiser sees the last day of the discussion in place of the
answer date, on My cases, in the answer promise on the case page, in the decision stage of the track and as one line in the mail that
announces the discussion. Past that day it reads "Decision was expected by".

**The better idea.** The raiser of a case whose latest decision is a no (any category, also while a second look runs) gets "Start a better idea
from it", never on a withdrawn or merged case. It opens `/raise?follows=<case>` with the old title as the first line and the context "Follows up
on … The answer was … What would make it a yes …" in the editable draft; the new case's `follows` and the old case's `followedBy` link both
ways, the old case keeps its no and is not reopened. The server keeps `follows` only for the raiser's own no and drops it otherwise: the raise
itself still goes through.

**Maybe the same as.** The raise keeps the case it looked like (`proposal.sameAs`, from the keyword match when the AI is off). The desk (the
holders of the case's role or the role it was escalated to) and managers see "Maybe the same as {title}" on the case page when they may open that case; the raiser never
does.

**Merge and link, and who may.** The desk and managers may close an undecided case (open, asked or in discussion) as a duplicate of another case
with `case.merged { into, note? }`: the case is "Merged", archived, off the desk and out of the inbox, its clock stops, and its raiser counts as
affected on the target. A repeat is not merged away once it has absorbed another (no chain), and nothing is merged back into a merged case (no
cycle). `case.linked { to }` marks two cases as related. Both need the person to be able to open both cases at the time of the append: a private
case of another desk, another company's case and a case that is not there are the same missing case to them, with the same answer. No unmerge,
no unlink, no text merging. A viewer who may not open the other end of an edge never gets it: the log shipped to them has the edge cut, and the
page names the case "a case" without a link.

**Versions panel.** The raiser sees it while the case is undecided and neither withdrawn nor merged, with Revise; everyone who opens the
case sees it once there are two versions or more.

**The inactive raiser.** The case page shows a muted "(inactive)" after the raiser's name when the raiser's user is switched off. The flag comes from the
server (`raiserIsInactive`); a handle never shows it.

## Clock

SEE adds no clock rule. A merged case stops its clock on the day of the merge (reducer); the discussion's last day is the one NOR and the idea
loop already keep.

## Notices

SEE adds no notice. A merge, a link and a raise that follows another case send nothing, so the raiser of a merged case finds the merge on My
cases and on the case page, not in the mail. The one change is a line in the mail that already tells the raiser a discussion started:
"Decision expected by {date}" (the last day of the discussion, in the date layout the revisit date has).

## Release note: SEE

For the support owner's release mail (Q10.1): the person who raised an idea now sees why a no was given (its category, the reason, what would
make it a yes and the day it comes back) and a track of where the idea stands; they can start a better idea from a no, linked both ways, and
see the day a discussion is expected to end. Desks can merge a duplicate into the first idea or link related ones; the raiser of a merged idea
is not mailed, they see it on My cases. The case page marks a raiser who has left as inactive.

Acceptance: `apps/app/tests/e2e/db/see.spec.ts` (one story on a sandbox company with the AI, Teams, Jira and Microsoft 365 off).
