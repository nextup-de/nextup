# The idea studio

> **Updated 2026-11-06** · reference: how the idea studio works. Where the stack has a model, the model reads the idea on every message and the page shows that reading ("The reading", below); the keyword benchmark answers when there is none.

The member home (`/[company]/raise`) develops ideas instead of taking a one-line problem. It follows
the whiteboard sessions of 28 Sep 2026: idea → AI → feedback ⇄ develop → decision → outcome.

```
drafts (left)        the chat with the coach (middle)          score + actions (right)
New idea             you: one line                              ring of four coloured quarters
Draft A · 42         coach: what got better + one question      meter with the publish tick
Draft B · 71         [four benchmark bars, ▲/▼, gaps as chips]  Publish idea (locked below the line)
Published ✓          you: the answer …                          Save as draft · Rename · Affected
                                                                Attach evidence · Already raised · Discard
```

Below 1100px the drafts become a drawer; below 760px the actions become a bottom sheet opened from
the score in the header bar.

## How an idea is scored without a model: the keyword benchmark

`src/features/ideas/benchmarks.ts` - four bars, 0-100 each, overall = their mean. Arithmetic over
the author's own words and the company context, **never model output**: every point names the fact
behind it (hover a bar), and chatting cannot talk the score up.

The benchmark runs on every message in every stack. The page's dials, advice and open questions
come from it only when no model read the idea (see "The reading"). Beside a reading it still
supplies the `parts` and `sameAs` of the `scores` event, the suggested answers (`replies.ts`) and
the offline coach.

| Bar | Colour token | What counts |
|---|---|---|
| Strategic fit | `--nh-bench-fit` | matches a company goal (most keyword hits), names a measure, puts a figure on it |
| Impact & reach | `--nh-bench-impact` | a number on the upside, people added as Affected, reach words (every shift, all teams), evidence attached |
| Feasibility | `--nh-bench-feas` | a route owner on the map, spend within team authority (€5k) or none, a first small step |
| Novelty & clarity | `--nh-bench-clarity` | no open case that reads the same, enough detail, says why and for whom |

Each bar also lists what is `missing`; the coach asks about the weakest one.

## The loop

1. The author writes a message. `POST /api/[company]/ideas/turn` rebuilds the idea from all of the
   author's messages (`ideaFromTurns` - the coach's words are never part of the idea) and benchmarks
   it on the server. Where the stack has the brain and the gate allows it, the brain then **reads**
   the idea (`POST /v1/read`, "The reading" below). The route streams `scores` - the overall, the
   benchmark's bars, the suggested answers and `reading` (`null` when no model read the idea) - then
   the coach's `text`, then `done`.
2. The coach answers in two or three short paragraphs. Who writes it depends on what is available;
   the first that applies answers:
   - **The brain**, when it read the idea this message: it coaches from that reading, on every
     message, not only below the publish line (`POST /v1/coach`, `features/ideas/brain-coach.ts`).
     It answers what the author asked (from the company's goals and routing map, which it is sent),
     says what it really thinks of the message, and asks one question - the reading's first open
     question, an earlier case about the same problem raised first - with its own best-guess answer.
     The guess joins the suggested answers as the first one whenever it is a real sentence and not a
     repeat (event `replies`); it is not re-scored and not filtered by score. It never states or
     changes a number: the numbers are the reading's, and an answer that states one is rejected. When
     nothing is open, it says the idea is ready for the person who decides. The prompt versions of
     both calls are stored (the coach's on the turn, the reading's inside it).
   - **The assistant's model** (Bedrock, only where the assistant gate allows it), when the brain did
     not read the idea: the reply goes through the assistant's pipeline - redaction, classification
     gate, tools, answer check - in coach mode (`PromptInput.coach`), with the benchmark's brief
     (`coachBrief()`); the model is told the numbers are not its to change. Prompt version
     `idea-coach-v1`.
   - **The offline coach** (`features/ideas/coach.ts`, `coachMock`), with no model or when the others
     fail: what the benchmarks can already see and what they cannot (from the bars' `found` /
     `missing`), then **one** challenging question aimed at the weakest bar and, in a sentence, why the
     person who decides will ask it.

   The benchmark's suggested answers under the coach (`features/ideas/replies.ts`) are whole
   sentences with a figure and where it comes from, so the demo reads like a real exchange; each is
   re-scored before it is shown. The brain is used only where the `coach` gate (`aiGate`,
   docs/ASSISTANT.md) is open and, in a real stage, the company has not switched the assistant off.
   The brain not answering within `BRAIN_TIMEOUT_MS` (each of its two calls waits that long), or any
   error, counts as no answer, and the next on the list answers.
3. Every turn is kept: server mode in `IdeaDraft` / `IdeaTurn`, the local demo in this browser's
   localStorage (`src/lib/idea-drafts.ts`, same shapes). The coach's turn carries the reading it was
   written from (`IdeaTurn.reading`, "The reading" below). In server mode the next message sends the
   latest one back as the brain's "last reading"; the local demo sends none.
4. **Publish idea** is available from the first answer on - the author decides when it is ready; the
   company's threshold (`CompanyConfig.publishThreshold`, default 70, set on `/admin/knowledge`)
   drives the analysis' advice (Approve at the line) only where no model read the idea; with a
   reading, the advice is the model's. The page mints the case id and asks the server
   (`publishIdeaDraftAction`), which checks the draft is still open and recomputes the benchmark from
   the stored turns; the overall it stores and returns is the latest reading's when there is one (the
   number the author was shown), else the benchmark's. Only then does the page append the usual
   `case.raised` (kind `idea`).
   Before that, the page asks who should receive it: the button says each step as it runs ("Asking
   the router…", our thinking orb in front), then "Who should get this?" offers 2-3 people
   (`features/ideas/receivers.ts`): the router's proposal, the route owners the idea's words match,
   the team lead, the lead's manager when fewer than two. Each has a match % built only from facts
   that are also listed as its "why": where they start (the routing row's keyword score, or their
   place in the org), the idea landing in their area, being able to approve its spend, and answering
   the last cases on their desk within the promised days.
   The author picks one or anyone from the directory; the case is raised with that person as its
   `assignee`, the router's own proposal kept in the payload.
5. Where the stack runs the brain (`services/brain`, `BRAIN_URL`), the page asks it for the routing
   row and "raised before?" between the server's yes and `case.raised` (`brainProposalAction`).
   It gets the routing rows (owner's role and department, never a name), the company's cases and
   known problems, and the idea's title and body - redacted like every model call (names become
   roles, the company's patterns apply; above the ceiling nothing is sent). Its answer is checked against what was sent and
   stored as the proposal (`source: "llm"`, `brain-route-v1`); no answer within `BRAIN_TIMEOUT_MS`,
   or any error, and the keyword row is used as before.

## The reading

Where the stack runs the brain (`BRAIN_URL`, `BRAIN_API_KEY`) and the gate allows it, the model reads
the idea on **every message**: `POST /v1/read` (`services/brain/brain/read.py`, `askBrainRead` in
`src/server/brain.ts`, the pure half in `src/features/ideas/reading.ts`). The reading is what the
raise page shows; the coach answers from it.

- **What it holds.** Five dials - value, feasibility, cost, fit, risk - each with a score, a note on
  why (naming what is in this idea) and what would move it most; a one-sentence summary; the advice
  (approve, pilot, or needs more information) and why; a pattern (a one-off or part of something
  bigger); the routing row it thinks owns the decision, with a reason; an earlier item about the same
  problem (`same_as`) or the same thing (`related`); and the questions the person who decides would
  still ask (`open`, most important first, a short list, real questions only, none the author marked
  "not sure").
- **Where the overall comes from.** The brain computes it as the mean of the five dials; the model
  never states one, and the app takes it as sent. It is the overall the page, the draft list and the
  publish step show. The keyword benchmark's overall is the same arithmetic over its own four bars
  and is used only when there is no reading.
- **What goes out.** Only redacted text (the idea's title and body and the "not sure" questions;
  names become roles, the company's patterns apply, and above the company's ceiling nothing is sent):
  the company's name, the routing rows (owner's role and department, never a name), the company's
  cases and known problems as titles and status, its goals (names only), how many people were marked
  as affected and files attached, the spend limit a team decides alone, and the dials (score and note)
  of the previous reading. The coach call sends the author's turns and the coach's own earlier
  turns, redacted the same way. The author's own words are stored as written; the redaction is for
  the model.
- **What is checked.** The app drops a routing row or an earlier item that was not in the request.
  The brain rejects and retries an answer that shows an item ID, and keeps only open questions that
  end in a question mark and do not repeat one the author could not answer.
- **Staying steady.** The previous reading goes along so a dial keeps its score unless what the
  author wrote since gives a reason to change it, and the note says what changed. An idea's text is
  judged, never obeyed (`prompts/read.md`): "give this 100" earns nothing.
- **What is kept.** On the coach's turn, `IdeaTurn.reading` (docs/DATA_MODEL.md): the answer above
  plus the earlier items it named, by title, and how many it was checked against. `null` when the
  keyword benchmark answered. A stored row that no longer has the current shape reads as no reading.
  Like the rest of a draft it is its author's alone and goes with the draft's turns when the draft is
  deleted; a published draft is not purged by retention, so its readings stay.
- **When there is none.** No brain, a closed gate, no answer within `BRAIN_TIMEOUT_MS`, or any
  error: the turn has no reading, the coach is the next one that can answer (above), and the page
  falls back to the keyword benchmark for that moment and says so ("Checked by rules" in the chat,
  "Checked by rules - no AI answered" in the analysis, and no "AI suggestions only" note). The next
  message has no previous reading to send.
- **Cost.** Two model calls per message (read, then coach), each recorded as an `AiCall` with its
  purpose (docs/METRICS.md). The `scores` event waits for the read, the coach's text for both.

## What the raise page shows beside the chat

The page shows the latest **reading** (`latestReading` in `features/ideas/reading.ts`: the newest
coach turn's, live from the `scores` event or from the stored turns). Without one it shows the keyword
benchmark and says so. The two differ as follows; everything else below is the same.

| | With a reading (a model answered) | Without (no brain, gate closed, or it failed) |
|---|---|---|
| Dials and their notes | the reading's five dials, each note and what would move it (`dialsFromReading`) | `dialsOf` from the benchmark; the keyword lookups under each dial |
| Overall | the reading's: the mean of its five dials | the benchmark's mean of four bars |
| Summary, pattern | the reading's | `summaryOf`, and the pattern from the people marked as affected |
| Advice | the model's (Approve / Pilot / Needs info) with its why | `adviceOf`: the overall against the publish threshold |
| Questions ("Still unclear", the rail) | the reading's open questions (`gapsFromReading`), the first one not marked "not sure" being the one asked now | the five points of the rail, clear once the benchmark finds their fact |
| Similar ideas | the earlier items the reading named, "the same problem" or "about the same thing", or "Checked against N earlier items" when it found none | the keyword match against known cases and problems |
| Routing | the page's evaluation takes the reading's routing row as the model's proposal (`proposalOf`) | the keyword row |
| ▲ / ▼ since the last message | between the last two readings; the first analysis keeps the first reading | between the benchmark's two steps |
| Labels | "AI analysis", "AI suggestions only. You make the decision." | "Checked by rules", "Checked by rules - no AI answered"; no AI note |

The demo script (`/demo`) reads as the AI does but is prepared text, with no model behind it.

- **The full analysis above NextUp's first reply** (`Analysis` in `components/ideas/RaiseSheets.tsx`,
  `inChat`): the five dials with their numbers, what the AI found, the advice, pattern, categories and
  similar ideas. Once later replies came, it keeps the scores of the first message.
- **The AI analysis under every later reply** (`ReadCard` in `components/ideas/RaiseChat.tsx`): the
  analysis' five dials - Value, Feasibility, Cost, Fit, Risk (`dialsOf` in `features/ideas/raise.ts`) -
  each as a bar, one word (`levelOf`: Strong / Medium / Weak; for Cost and Risk the cost or the risk
  itself, so Low is good there) and what was found, then the advice (Approve / Pilot / Needs info).
  No numbers there: they stay in the full analysis ("View full analysis").
- **One question at a time**: under the latest reply, "Still unclear" holds a single point - the one the
  rail is asking now. Under earlier replies it reads "Asked", ticked once answered. With a reading the
  model words its questions anew each turn, so an earlier one that is no longer listed counts as
  answered.
- **The rail on the right: the five points a decision needs** (`RAIL`, `railOf`; with a reading the rail
  lists the reading's open questions instead, in the order the model gave them): the same five, each
  with the one fact the person who decides cannot do without - a number on what it saves, who can
  decide it, a rough cost, the company goal, a small first step. A photo, who else it helps or how far a
  number moves make an idea stronger but never stop a publish, so they are not on it. A point is clear
  once the benchmark finds its fact, unknown after "not sure"; the first open one is "Next". From a
  720px wide chat it is a card with the names and what was found; narrower, a column of dots.
- **Leaving the page keeps it**: the open conversation, the view, unsent text and the stand-ins
  (`raisePreview.ts`) are kept per company and person in module memory (`lib/use-kept.ts`), so the
  dashboard and back - or switching person and back - reopens the same chat. A reload forgets it.

## The demo page

`/demo` (`src/app/demo`) is the raise page for showing people how NextUp works, with nothing behind
it: made-up data (`features/demo/static-demo.ts`: the built-in seed plus what is listed below), no
company, no login, no database, no model. It opens on `/demo/raise`; the bar's Dashboard goes to
`/demo/dashboard`, where a published idea shows up.

- **The script** (`features/ideas/demo-script.ts`): one prepared idea and two prepared answers. While
  the composer is empty, a gold button on its right puts the next one in the field ("Prepared idea",
  "Next answer", "Last answer"); Send works as usual. The coach answers each with a prepared reply
  after about 2.5 s; anything else typed gets the offline coach (`coachMock`). The rail walks with it:
  Value is next after the idea, the first step after the first answer, and after the last answer it
  reads "Ready to publish" and the chat offers Publish now. The first answer stays in the chat instead
  of opening the analysis.
- **No numbers in the replies.** The AI analysis card under each latest reply shows the five dials as
  bars and words; the numbers are in the analysis. All of it is the benchmark's own, computed in the
  browser. `tests/unit/ideas-demo-script.test.ts` checks that what the replies say (goal, decider, over
  the line, the two points that stay open without blocking it) and the rail's steps are still true.
- **The published case carries the main points** (`DEMO_CASE`): one sentence as the idea, the context,
  then `*Label* text` lines (Goal, First step, Cost, Then, Still open) that the case view lists as facts
  next to Worth (`splitBody` in `features/ideas/brief.ts` - the start page's prompts use the same lines).
  About 8 s after publishing, whoever received it reads it and asks one question (`DESK_REPLY`, written
  by the demo frame), so the case shows a conversation and "Your move" without switching person.
- **Cases have an address**: on the demo, a dashboard row and "Open the case" go to `/demo/cases/<id>`,
  the dashboard's case overview opened on that case (`DashboardView linkCases`); ✕ goes back.
- **The board is never empty**: three more of the employee's ideas - a question waiting for them (Your
  move), a question they answered (Replied), one past the 5-day promise that moved to the deputy - and
  the changeover-sheet problem handed to Quality with a question and an answer. All seed history, so
  "Reset demo" keeps them; acme's own seed is untouched (`tests/unit/static-demo.test.ts`).
- **What happens next** (`features/ideas/demo-loop.ts`, `components/demo/LoopPlayer.tsx`): once the
  script's idea is published, a player in the bottom left plays the rest of the loop one step at a
  time (docs/plans/2026-10-15_idea-to-project.md): Jonas answers the desk's question, the team lead
  asks Quality for a number (a discussion), Quality posts it, Jonas posts version 2, the check-in three
  days later says "ready to decide", the yes archives the idea and opens P-1 with its steps and the
  number to beat (38 min per changeover), the team starts, a week later it is done, and the checks
  after 30 and 90 days measure 24 and 19 minutes - then the plant manager's thanks. Each step is the
  events its people would send, written into this browser's log; where the story stands is read from
  the log, so the app's own buttons can take a turn in between (a yes clicked by hand is picked up).
  `tests/unit/demo-loop.test.ts` plays it through.
- **The dev panel is on**: "Viewing as" switches person in this browser (the inbox and the overview
  live under `/demo` too), "Reset demo" goes back to the seed, "+1 day" moves the clock.
- **Clear names**: the demo's copy of the seed and of the written briefs uses full German names, mostly
  men's (Jonas Schmidt, Thomas Vogel, Hans Sander, …), instead of "T. Vogel" and anonymous handles
  (`DEMO_NAMES`); the employee posts under his name. acme keeps its names - the database stacks store
  them as users.
- **Earlier chats, each person's own**: the employee's list starts with four of his conversations with
  the coach - three published (each opens its case) and one draft still open; the team lead and the
  manager have one draft each (`staticDemoDrafts`). Drafts in the browser are kept per company and
  person (`draftScope`), like the database's, so switching person never shows someone else's chats.
  The prepared texts are the employee's story: only he gets the "Prepared idea" button.
- **Nothing leaves the browser**: `useIdeaStudio(…, local)` scores and answers here, publishing skips
  the router, and the event log and drafts are the local demo's, under the slug `demo`. Every page
  load starts from the seed (`components/demo/StaticDemo.tsx`); moving between the demo's pages keeps
  what was just published.
- The proxy passes `/demo` through in path mode and on the demo stack; any other single stack answers 404 (`STATIC_DEMO` in `features/auth/request.ts`),
  so it is never read as a company and never asks for a login. A company's own `/raise` is unchanged.
- **A stack that is the demo**: a single-mode stack whose company is called `demo` (`COMPANY_SLUG=demo`,
  demo.sellux.ch) serves the static demo at its root - `/raise`, `/dashboard`, `/` - with no login
  page, and its links drop the `/demo` (`staticDemoPrefix()`). `/admin` stays the admin surface; the
  stack's own database company is no longer reachable from that host.

## After the publish: discussion, decision, project

Built 15 Oct 2026 (docs/plans/2026-10-15_idea-to-project.md). Behind the flags `discussion` and
`projects`: on for demo companies and the static demo, off for real ones until admin.sellux.ch turns
them on. The company's rhythm, measure days and reward rule are on `/admin/knowledge` ("After the
decision", `CompanyConfig` → `Seed.loop`, `features/loop/rules.ts`).

- **Discuss first** (`components/shell/LoopSheets.tsx`, `features/cases/discussion.ts`): next to Yes,
  No, Pass and Ask, the desk holder opens a discussion: what is still missing, and whom to ask (the
  sheet suggests the route's buddy and deputy, the people affected, the department's head, authors of
  close ideas). Invited people get "Asked for your view" in their inbox and a mail; they comment on
  the case. The author posts a new version from the case page; each one is scored again
  (v1 → v2, ▲ on the dials that got better). A check-in every `discussEveryDays` (3) ends a round:
  another round, or ready to decide - drafted offline from the new versions, comments and weak dials,
  or by the brain (`/v1/checkin`) where the stack has one. After `discussMaxRounds` (3) the decision
  is due; one more round needs a manager. A late check-in goes to the deputy, like a late decision.
  An idea within the team's spend authority (`fastLaneEur`) keeps Yes as the main button.
- **Yes, do it** opens a project: lead (the decider by default), title, an optional first step. The
  idea is archived - read-only, out of the open lists, in the Archive tab - and points to P-n. A no
  archives it with its reason.
- **The project** (`/projects/[id]`, `components/projects`, `features/projects`): a board (To do,
  Doing, Blocked, Done), the team, links (http(s) only; Jira keys from the connector), comments and
  the timeline. The baseline comes before the start - or "no number possible" with a why. Steps and
  the metric are suggested from the brief's own lines, and by the brain (`/v1/plan`) where there is
  one. A project not started within the promise goes to the deputy; so does a late measure.
- **Measure** at done + 30 and + 90 days (`measureDays`): the verdict - better, same within the
  tolerance, or worse - is computed from the numbers (`features/projects/verdict.ts`), never typed.
- **Recognise** by the company's own rule (none, thanks, fixed, share of the measured saving): a
  manager records it, an anonymous author claims it. Counts only, no ranking of people.
- **The author sees every step** on `/team`: Sent · Read · In discussion · Approved · Planning ·
  In progress · Done · Measured · Recognised, with a mail at each (`features/loop/notice.ts`).
- **The team lead's inbox** lists the projects waiting on them (`ProjectDesk`): their next move as a
  lead, and a late start or measure that moved to them.

## Privacy

- A draft is its author's alone: every query names the company **and** the author. No lead, manager
  or admin reads drafts; `/admin/knowledge` shows counts only (BetrVG §87).
- Only redacted text reaches a model, on every message since the brain reads the idea each time
  ("The reading"). The author's own words are stored as written - they become the case body when
  published. What the model made of them is stored too: the reading on each coach turn
  (`IdeaTurn.reading`), which includes the titles of the earlier items it named, with the draft and
  under the same rules (private to the author, in the author's own export, deleted with an unpublished draft).
- Discarded drafts are deleted after the company's retention period (purged on use, like assistant turns).

## Not in this step

- **The brain following a project** after its start (reminders, spotting a stuck step): it only
  proposes the first steps and the metric for now.
- **Escalating a late step**: a step's due day shows on the board, but nothing moves on its own -
  no per-person overdue counts, for the works council.
- Customer feedback and market research as inputs to opportunity detection.
- Similarity by embeddings (pgvector) instead of shared words; connecting authors of close ideas.
- `AssistAnswer` / `src/lib/use-assist.ts` (the old "ask first, then raise") are no longer used by
  the page; `/api/[company]/assist` still works. Remove or reuse them.
