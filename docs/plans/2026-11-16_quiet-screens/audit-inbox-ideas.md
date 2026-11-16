# Audit: Inbox and ideas

> **Audit · 2026-11-16.** Read from `main` at ac734532, before any change of this plan and before #983 (one page per
> idea). Kinds: 1 duplicate, 2 noise, 3 always open, 4 unclear action, 5 gap in the flow. Paths are relative to
> `apps/app/src/`; line numbers are those of that commit.

## How the inbox page is built today
1. `app/[company]/(app)/inbox/page.tsx` renders `components/inbox/InboxPage.tsx`. It shows the list as one SectionCard per ask ("Decide", "Approve or confirm", "Do my part") from `features/inbox` `inboxItems`, the Today line above it and the Notices card below.
2. Only `ask==="decide"` items open in place. With `?id=` the page swaps to `InboxOpen.tsx`, which shows an avatar rail of the *decide items only* plus `leader/IdeaDetail.tsx` (data from `inbox/useOpenItem.ts`). On a phone it shows `IdeaDetailPhone` instead.
3. IdeaDetail is the centre (idea card, five score gauges, "What the AI found") plus the side `<aside>`: "Your decision" (StatusBox + DecisionList) and "From the feed".
4. Every other kind (approval, question, view, appeal, comment, confirm, project moves) is a `<Link>` to `/cases/<id>` (`CaseDetailView`) or to a project page. Their decision controls live on those pages, not in the side view.
5. The "Decisions" tab comes from `config/nav.ts:88-92` `SECTION_TABS.inbox` (Inbox | Decisions, leader/manager, only with the `projects` flag). Without that flag it is a separate nav item (`NAV_SIMPLE`, lines 37/45). `/decisions` is `components/decisions/DecisionLog.tsx`. `leader/InboxView.tsx` is only named in a comment, so it looks dead.

## Opened inbox item (IdeaDetail + useOpenItem)
Most damaging first:
- **4 UNCLEAR ACTION (the controls move around).** A desk decide item has its buttons in the side card (`IdeaDetail.tsx:185-194`). An approval, a question or a second look jumps to `/cases/<id>` (`features/inbox/sources/approvals.ts:31`, `cases.ts:69,75,81`), where the controls sit mid-page. On `/idea` the same desk buttons are a top bar (`team/DeskDecision.tsx`). That makes three placements for "decide". **Fix:** every item kind opens in the same side view; approval, answer and confirm forms render there.
- **4 UNCLEAR ACTION (5 to 6 equal buttons).** A desk case shows "Yes, do it", "Discuss first", "No, and why", "Pass to {name}", "Ask a question" (`features/ideas/brief.ts:356`, `features/cases/discussion.ts:53`). In discussion it shows "Check in", Yes, No, Pass, "Invite more" (`discussion.ts:69`). Only an "AI suggests" tag marks one. **Fix:** one filled primary (the recommendation), Yes/No as a pair, the rest under "More".
- **4 Dead buttons.** A fresh idea shows "Approve", "Start as pilot", "More info", "Route to expert", "Decline". Three of them are disabled with "Soon" (`brief.ts:41-47`, `IdeaParts.tsx:299`), so there is **no live No** on an idea. **Fix:** hide buttons that are not live; give ideas a working No.
- **3 ALWAYS OPEN.** The AI panel shows everything at once (`IdeaParts.tsx:185-272`): summary, lead, bars, after, Advice/Why/Next step/Answer by, timeline, "Worth asking {name}", "Similar ideas", "Suggested reviewers", Pattern/Categorised as, plus five gauges (`IdeaDetail.tsx:89-111`). **Fix:** keep the summary sentence and the advice line; fold the rest behind "What the AI found ›".
- **1 DUPLICATE (deadline shown four times).** Row "Due {day}" plus badge "Due soon" (`InboxPage.tsx:230-232`), header badge "{n} d left" (`IdeaDetail.tsx:55`), and AI "Answer by: Within {count} day, to keep the {days}-day promise" (`IdeaParts.tsx:208`). **Fix:** keep only the header badge.
- **1 DUPLICATE.** "Advice: Yes, do it" plus "Next step: Say yes; {from} hears it today." (`IdeaParts.tsx:205-207`) repeat the "AI suggests" tag on the button. **Fix:** drop Advice and Next step; keep Why, folded.
- **2 NOISE.** "AI suggestions only. You make the decision." (`IdeaParts.tsx:269`). "{name} has been told." (`useOpenItem.ts:52`). The discussion StatusBox stacks "In discussion · round {round} of {of}", "Invited: {who}, and {from}", "Check-in {round}, {day}: …" and "Next check-in {day}" (`useOpenItem.ts:84-93`), while `recCheckin` ("A check-in ends the round: ready to decide, or another round… Everyone in the discussion sees it.") says it again. **Fix:** one status line, details folded.
- **3 ALWAYS OPEN.** "From the feed" shows the supporter and comment counts, the sentiment, "No comments yet." and a comment box (`IdeaParts.tsx:316-360`). **Fix:** fold to one line, "3 comments ›".
- **1 DUPLICATE.** "Inbox" appears as the nav item, the tab (`shell.navInbox`), the h1 (`InboxPage.tsx:189`) and the rail title (`InboxOpen.tsx:52`). **Fix:** drop the h1 and the rail title.
- **3 ALWAYS OPEN.** The Notices card stays under the open item (`InboxPage.tsx:174`). **Fix:** hide it while an item is open.

**Proposed minimal layout.** Visible:
1. Title
2. Who raised it, plus one due badge
3. Description, clamped to 3 lines
4. One AI line: the recommendation and why, in one sentence
5. The decision block in the side view: one primary (the recommended action), a secondary No, and "More ▾" (pass, ask, discuss)

Folded, each behind one line: "Details ›" (affects, context, attachments), "What the AI found ›" (scores, reasoning, similar, sources), "Comments (n) ›", "Status ›" (discussion rounds, questions). The primary always sits at the top of the side panel, the same for every item kind.

## Inbox list and group headings
- **2 NOISE.** Every desk case is labelled "Case" (`inbox.kindCase`, `InboxPage.tsx:230`). **Fix:** show nothing, or the cause only.
- **1 DUPLICATE.** The Today line "Today 3 to decide · 1 late · 2 to do my part" (`InboxPage.tsx:190-197`) repeats the section headings and the Late badges. **Fix:** drop it, or put the counts on the headings.
- **5 Wrong label.** A raiser's returned idea (`approval-back`, `approvals.ts:36`) uses kind `approval`, so its row reads "Approval asked". **Fix:** a kind of its own, e.g. "Sent back to you".
- **1 Mismatched name.** The heading "Approve or confirm" (`inbox.sectionConfirm`) does not match `askConfirm` "Confirm". **Fix:** use one word.
- **2 NOISE.** The pass cause "Passed to you by {role}: {why}" runs together with the kind and due date in one grey line (`InboxPage.tsx:230`). **Fix:** cause only; the why goes in the open item.

## Idea / case page (`/cases/<id>`, CaseDetailView; `/idea`, DashboardView + OverviewIdea)
- **5 FLOW GAP.** The approver's form exists only on `/cases/<id>` (`CaseDetailView.tsx:183-184`). `/idea` has no ApproverLine or ApprovalsBlock (`team/DashboardView.tsx:348-350`), so on "the one idea page" an approver cannot vote. In the demo the form is server-only (`ApprovalsBlock.tsx:67`), so an approver sees no button at all. **Fix:** approval form in the side view and on `/idea`.
- **4 UNCLEAR ACTION.** The "Your move" card can show two primaries: "Affects my team too" or "Re-evaluate the score" next to "Answer the question" (`CaseDetailView.tsx:206-215`). Approve is a third primary in the left card (`ApprovalsBlock.tsx:149`). **Fix:** one primary per state (approver: Approve; raiser with a question: Answer); the rest goes to secondary or "More".
- **5 Question hidden.** The question to answer is not shown next to "Answer the question" (no `c.question` in CaseDetailView); only the chip "Question for you" and the timeline mention it. **Fix:** quote the question above the button.
- **1 DUPLICATE.** Desk and clock appear four times: the chip plus "raised {date} · {clock}" (`:148-150`), AnswerPromise "Answer by / With" (`:146`), the "Desks" chain (`:168-179`), and the tiles "on whose desk it is", "deputy {deputy} · buddy {buddy}" (`:185-190`). **Fix:** keep AnswerPromise; fold the chain and tiles into "Details".
- **2 NOISE.** "Every line is one event in the log. Nothing on this page is stored as text…" (`:297`). The tiles "what it costs while it waits" / "not estimated yet" / "outcome" / "pending". The lede "Idea · C-123" (`:138`). "score · base only" (`:200`). **Fix:** delete them, or fold.
- **3 ALWAYS OPEN.** "What happened" timeline (`:276-298`). **Fix:** fold behind its heading with the last event shown.
- **2 NOISE.** The `/idea` band "Not a project yet. It becomes one after a yes." (`team.ideaKindOpen`, DashboardView `:124`). **Fix:** drop it (the steps show the stage).
- **1 DUPLICATE.** On `/idea`, "Raised {raised} · {dept}" (`OverviewIdea.tsx:130`) and the "Who / Raised by / Team" block (`:205-223`) say the same; "On the desk of" (`:154`) repeats the steps' sub lines. "No attachments." (`:272`) is an empty-state line. **Fix:** remove the duplicates and hide empty sections.
- **1 Desk buttons in two styles.** In the inbox they are a stacked list in the side card; on `/idea` they are a top bar (`DeskDecision.tsx:14-29`). **Fix:** one component, one place.
- **2 Misleading tag.** An accepted idea is tagged "Archived" (`CaseLoop.tsx:77`, `dashboard.loopArchived`). **Fix:** tag it "Project".

## Approval states (ApproverLine)
- **5 FLOW GAP.** After the last yes it says "All approved: the project draft is open" (`ApproverLine.tsx:45`) with no link. **Fix:** make the line the link to the draft.
- **5 FLOW GAP.** "Change the idea if you like, then send it again. The approvers are asked afresh." (`:51`) sits next to "Send again" on `/cases`, but editing lives on `/idea` (the OverviewIdea pencil). **Fix:** edit and resend on one page; shorten the hint to the button.

## Raise start, chat, publish
- **4 Two publish buttons.** "Publish idea" in the sidebar (`RaiseSidebar.tsx:119-122`) and "Publish" in the chat (`RaiseChat.tsx:91`), then three modal steps: preview → desk → sent. **Fix:** one Publish; desk choice inside the preview.
- **1 DUPLICATE.** Kicker plus heading: "Preview · how it lands in their inbox" + "Last look before it goes out" (`PublishPreview.tsx:76-77`); "Before it goes out" + "Where should it go?" (`RaisePublish.tsx:113-114`). **Fix:** drop the kickers.
- **1 DUPLICATE.** A desk row shows its title in the name and again in the sub line `[d.title, d.dept, who]` (`RaisePublish.tsx:93`). **Fix:** drop d.title from the sub line.
- **2 NOISE.** "NextUp analysis is attached below this" + "Generated by NextUp, so it can't be edited here." (`PublishPreview.tsx:117-118`); "Changes save to your draft" (`:124`); the long posted-as help texts (`:101`). **Fix:** remove, or put in a tooltip.
- **5 FLOW GAP (after publish, three different destinations, none is Ideas › Mine).**
  - "Follow it in My cases →" goes to `/team` (`RaisePublish.tsx:126`, `Raise.tsx:863`).
  - "…you'll see their reply in Overview." plus "Open the case" goes to `/cases/<id>` (`Raise.tsx:671`).
  - "On {lead}'s desk · follow it in Overview" (`ideas.pagePubHintPublished`).

  **Fix:** one line, "Sent to {role} · see it in Mine →".
- **1 Contradiction.** The sidebar hint "Goes to your team lead, {lead}" (`Raise.tsx:681`) conflicts with the desk picker, which lets you choose another desk. **Fix:** name the chosen desk.
- **2 NOISE.** The sent message "{names} owe you a yes, a no or a question by {date}." and its five variants (`RaisePublish.tsx:121-125`). **Fix:** "Sent to {role} · answer by {date}".
- Raise start (`RaiseStart.tsx:26`, "Raise it, {name}") is clean. The chat empty title and text (`RaiseChat.tsx:66-67`) are fine.

## Mine list
- **5 Wrong target.** Rows link to `/cases/<id>`, not `/idea?id=` (`MineView.tsx:44`). Otherwise the list is minimal and good (What / Open since / Status).

## Decisions log
- **5 Wrong target.** Rows link to `/cases/<id>` (`DecisionLog.tsx:91`).
- **2 NOISE.** The meta line "{caseId} · Idea/Problem" (`:92`). Without projects: h1 "Decision log" plus lede "Every yes and no on a case, who decided it and what came of it." (`:46`). With projects: the tab says "Decisions" and the h2 says "Every yes and no" (`:45`), which is a duplicate title. The comment calls it "a tab of Projects", which is stale. **Fix:** no h2 and no lede; the count goes on the tab.
- **3 ALWAYS OPEN.** The filter form with its Apply button (`:49-70`). **Fix:** search field only; period, answer and project under "Filter ▾"; apply on change.

## Patterns across the area
1. Decision controls live in three places (inbox side card, `/cases` mid-page, `/idea` top bar), chosen by item kind, not by intent.
2. Two idea pages still exist. Mine, Decisions, the publish flow, and approvals point to `/cases/<id>`; `/idea` lacks the approval UI.
3. Disabled "Soon" buttons are shown as real choices.
4. AI output is fully expanded: advice, why, next step and answer-by restate the button and the badge.
5. Deadlines and desk owners are repeated 3 to 4 times per screen (row, badge, promise panel, AI panel, tiles).
6. Kicker plus heading pairs, and h1s that repeat the nav or tab label.
7. Grey system-explaining lines ("Every line is one event in the log…", "AI suggestions only…", "{name} has been told.").
8. Many equal-weight buttons; the recommendation is shown by a small tag instead of a single filled primary.
9. Pointers to places that no longer exist (My cases, Overview) after publish.
10. Status chips with a sentence underneath saying the same thing (the "Archived" banner, StatusBox label plus sub, the Today line plus the section headings).
