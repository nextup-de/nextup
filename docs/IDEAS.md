# The idea studio

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
3. Every turn is kept: server mode in `IdeaDraft` / `IdeaTurn`, the local demo in this browser's
   localStorage (`src/lib/idea-drafts.ts`, same shapes).
4. At the company's threshold (`CompanyConfig.publishThreshold`, default 70, set on
   `/admin/knowledge`) **Publish idea** unlocks. The page mints the case id and asks the server
   (`publishIdeaDraftAction`), which recomputes the score from the stored turns and refuses below the
   line. Only then does the page append the usual `case.raised` (kind `idea`) and play the route.
5. Where the stack runs the brain (`services/brain`, `BRAIN_URL`), the page asks it for the routing
   row and "raised before?" between the server's yes and `case.raised` (`brainProposalAction`).
   It gets the routing rows (owner's role and department, never a name), the company's cases and
   known problems, and the idea's title and body - redacted like every model call (names become
   roles, the company's patterns apply; above the ceiling nothing is sent). Its answer is checked against what was sent and
   stored as the proposal (`source: "llm"`, `brain-route-v1`); no answer within `BRAIN_TIMEOUT_MS`,
   or any error, and the keyword row is used as before.

## Privacy

- A draft is its author's alone: every query names the company **and** the author. No lead, manager
  or admin reads drafts; `/admin/knowledge` shows counts only (BetrVG §87).
- Only redacted text reaches a model. The author's own words are stored as written - they become the
  case body when published.
- Discarded drafts are deleted after the company's retention period (purged on use, like assistant turns).

## Not in this step

- **Action items on a published idea, tracked here instead of in Jira** - needs `idea.action.*`
  events, which is reducer work (Kevin).
- Customer feedback and market research as inputs to opportunity detection.
- Similarity by embeddings (pgvector) instead of shared words; connecting authors of close ideas.
- `AssistAnswer` / `src/lib/use-assist.ts` (the old "ask first, then raise") are no longer used by
  the page; `/api/[company]/assist` still works. Remove or reuse them.
