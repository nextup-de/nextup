# The idea studio

> **Updated 2026-10-06** · reference: how the idea studio works.

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

## How an idea is scored

`src/features/ideas/benchmarks.ts` - four bars, 0-100 each, overall = their mean. Arithmetic over
the author's own words and the company context, **never model output**: every point names the fact
behind it (hover a bar), and chatting cannot talk the score up.

| Bar | Colour token | What counts |
|---|---|---|
| Strategic fit | `--nh-bench-fit` | matches a company goal (most keyword hits), names a measure, puts a figure on it |
| Impact & reach | `--nh-bench-impact` | a number on the upside, people added as Affected, reach words (every shift, all teams), evidence attached |
| Feasibility | `--nh-bench-feas` | a route owner on the map, spend within team authority (€5k) or none, a first small step |
| Novelty & clarity | `--nh-bench-clarity` | no open case that reads the same, enough detail, says why and for whom |

Each bar also lists what is `missing`; the coach asks about the weakest one.

## The loop

1. The author writes a message. `POST /api/[company]/ideas/turn` rebuilds the idea from all of the
   author's messages (`ideaFromTurns` - the coach's words are never part of the idea), benchmarks it
   on the server, and streams `scores`, then the coach's `text`, then `done`.
2. The coach (`features/ideas/coach.ts`) answers in two or three short paragraphs: what the
   benchmarks can already see and what they cannot (from the bars' `found` / `missing`), then
   **one** challenging question aimed at the weakest bar and, in a sentence, why the person who
   decides will ask it. With a model (Bedrock, only where the assistant gate allows it) the
   reply goes through the assistant's pipeline - redaction, classification gate, tools, answer
   check - in coach mode (`PromptInput.coach`); the model is told the numbers are not its to change
   and gets the same two-paragraph shape. Without one, `coachMock` answers. Prompt version `idea-coach-v1`.
   The suggested answers under the coach (`features/ideas/replies.ts`) are whole sentences with a
   figure and where it comes from, so the demo reads like a real exchange; each is re-scored before
   it is shown.
   **With the brain** (`services/brain`, `BRAIN_URL`), the brain coaches while the idea is below
   the publish line: the grilling - the first open point in the order problem, context, evidence,
   impact, solution, risks, success - one question per turn, an earlier case about the same problem
   raised first, and its own best-guess answer, which joins the suggested answers (re-scored, only
   when it really moves the score; event `replies`). It gets `coachBrief()` and the redacted turns,
   never changes a number, and is off where the company switched the assistant off. At the line,
   or when it does not answer within `BRAIN_TIMEOUT_MS`, the coach above answers. Prompt version
   `brain-coach-v1`, stored on the turn.
3. Every turn is kept: server mode in `IdeaDraft` / `IdeaTurn`, the local demo in this browser's
   localStorage (`src/lib/idea-drafts.ts`, same shapes).
4. **Publish idea** is available from the first answer on - the author decides when it is ready; the
   company's threshold (`CompanyConfig.publishThreshold`, default 70, set on `/admin/knowledge`)
   only drives the analysis' advice (Approve at the line). The page mints the case id and asks the
   server (`publishIdeaDraftAction`), which checks the draft is still open and recomputes the score
   from the stored turns. Only then does the page append the usual `case.raised` (kind `idea`).
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

## What the raise page shows beside the chat

- **The AI analysis under the latest reply** (`ReadCard` in `components/ideas/RaiseChat.tsx`): the
  analysis' five dials - Value, Feasibility, Cost, Fit, Risk (`dialsOf` in `features/ideas/raise.ts`) -
  each as a bar, one word (`levelOf`: Strong / Medium / Weak; for Cost and Risk the cost or the risk
  itself, so Low is good there) and what was found, then the advice (Approve / Pilot / Needs info).
  A ▲ marks the dials the answer before it made better (`dialsUp`). No numbers in the chat: they stay in
  the analysis. Under it, Publish now (once the rail is clear) and Review analysis, in blue.
- **The rail on the right: the five points a decision needs** (`RAIL`, `railOf`): the same five, each
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
- The proxy passes `/demo` through in path and single mode (`STATIC_DEMO` in `features/auth/request.ts`),
  so it is never read as a company and never asks for a login. A company's own `/raise` is unchanged.
- **A stack that is the demo**: a single-mode stack whose company is called `demo` (`COMPANY_SLUG=demo`,
  demo.sellux.ch) serves the static demo at its root - `/raise`, `/dashboard`, `/` - with no login
  page, and its links drop the `/demo` (`staticDemoPrefix()`). `/admin` stays the admin surface; the
  stack's own database company is no longer reachable from that host.

## Privacy

- A draft is its author's alone: every query names the company **and** the author. No lead, manager
  or admin reads drafts; `/admin/knowledge` shows counts only (BetrVG §87).
- Only redacted text reaches a model. The author's own words are stored as written - they become the
  case body when published.
- Discarded drafts are deleted after the company's retention period (purged on use, like assistant turns).

## Not in this step

- **After "Yes, do it": a board to work it** (Kevin, 6 Oct 2026 - later). A decided idea moves onto a
  kanban / project board that the team leader or manager runs, with the central brain helping to plan
  and follow the steps. Builds on the action items below.
- **Action items on a published idea, tracked here instead of in Jira** - needs `idea.action.*`
  events, which is reducer work (Kevin).
- Customer feedback and market research as inputs to opportunity detection.
- Similarity by embeddings (pgvector) instead of shared words; connecting authors of close ideas.
- `AssistAnswer` / `src/lib/use-assist.ts` (the old "ask first, then raise") are no longer used by
  the page; `/api/[company]/assist` still works. Remove or reuse them.
