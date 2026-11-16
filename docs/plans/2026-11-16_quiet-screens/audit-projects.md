# Audit: Projects

> **Audit · 2026-11-16.** Read from `main` at ac734532, before any change of this plan. Kinds: 1 duplicate, 2 noise,
> 3 always open, 4 unclear action, 5 gap in the flow. Line numbers are those of that commit.

Paths are relative to `apps/app/src/components/projects/` unless noted. Kinds: 1 duplicate, 2 noise, 3 always open, 4 unclear action, 5 flow gap.

## 1. Measure panel, `ProjectMeasure.tsx` `MeasurePanel`/`Check` (shown in Results tab, Results drawer, and on Overview while a result is unconfirmed)

**Panel**
- L166-167: "Measure" + muted "the verdict is computed, never typed in". Kind 2. Remove the sub.
- L173: "Checks open 30 and 90 days after the project is done." Kind 2. Remove; the check rows already carry dates.
- L170: "Not measured: no number was possible. {why}". Keep it, it is the only line.

**Every line a check row can render**
- Head, L287-289: "30-day check", muted "opens 10 Dec · due 17 Dec", chip "late" / "late · with {name}".
- Sent back, L293: "Sent back on {date}: {why}".
- Result stands, L298-343:
  - big "258 → 123 min"
  - then either a VerdictChip (once confirmed) or muted "Not confirmed yet" / "Not confirmed yet · was due {day}" / "Waiting for a second person until {day}"
  - "−52.3 %"
  - source line: "Typed by {role} · not confirmed" / "Typed by {role} · Confirmed by {confirmer} on {date}" / "From {file} · imported {date}" / "From {system} · {date}"
  - up to 4 impact lines ("{value} € saved per year", …)
  - "Entered again on {date}; it was {value}"
  - "Questioned twice: a manager confirms it"
  - "As sponsor you may confirm it"
  - ghost "Confirm result", which opens "Confirm {value} for the {check}-day check? You confirm that the number is right, not that the project was good." with primary "Yes, the number is right" + Cancel
  - quiet "Send it back", which opens "What looks wrong?" input + ghost "Send it back" + Cancel
- Not open, L346: "Opens {day}.". This repeats the head's "opens …" (Kevin's example). Kind 1.
- May record, L350-386:
  - two equal ghost buttons "Type the number" / "Enter this check again" and "Import from a file"
  - form: "The number now (min)", "Note (optional)" (placeholder "Where the number comes from"), 4 impact fields ("Saving per year (€)", "CO₂ per year (kg)", …), primary "Record the measure", preview "That reads as [chip] −x %"
  - import: "KPI file (CSV: date, metric, value)" + status list
- Others, L390: "Open since {day}. The lead records it." This repeats the head date and explains the system. Kind 1+2.

**Findings**
- L288 + L346/L390: the date is shown twice (Kind 1). Results card and drawer show it a third time ("Check after 30 days · Due {date}", `hub/results/Results.tsx` L50, `ResultPanel.tsx` L22). Fix: the head carries one date (opens before open, due while open, none once a result stands). Remove L346 and L390.
- L300-305 + L309: "Not confirmed yet" and "· not confirmed" both show (Kind 1). Fix: one chip "Not confirmed"; the deadline and "Typed by …" fold away.
- L311-318: impact, re-entered, manager-only and sponsor-may lines are always open (Kind 2/3). Fold behind "Details".
- L319-342: the confirm button is ghost and "Send it back" sits next to it, so the confirmer has no primary, and confirming takes a second click (Kind 4). Make "Confirm" primary and one click; keep the "number is right" wording as a tooltip; "Send back" stays quiet.
- L350-354: two equal ghost buttons hide the input (Kind 4/3). Fix: show the input inline with primary "Record"; import becomes a quiet link.
- L365-370: the 4 impact fields and the note are always in the form (Kind 3). Fold behind "+ Impact and note".
- L322: the confirm sentence explains the obvious (Kind 2). Remove.

**Minimal row**
- Before it opens: "90-day check · opens 9 Mar".
- Open, for the lead: "30-day check · due 17 Dec [late]" · [number] [Record]. "Import file" is a link.
- Open, for others: "30-day check · due 17 Dec [late]".
- Unconfirmed: "30-day check  258 → 123 min  −52.3 %  [Not confirmed]". The confirmer also sees [Confirm] (primary) and "Send back" (quiet).
- Confirmed: "30-day check  258 → 123 min  −52.3 %  [Better]".
- Sent back: "Sent back: {why}" + [Enter again].
- Everything else (source/typed by, confirmed by, deadline, impact, re-entered, manager-only) goes behind "Details ›".

## 2. Results tool and drawer, `hub/results/Results.tsx`, `ResultPanel.tsx`
- Results.tsx L40: "What this project changes, measured against its baseline." Kind 2. Remove.
- L44-50: the card shows title, chip, "Baseline …" → "Measured value", confirmation, owner, "Check after 30 days", "Due {date}". The owner is the lead, already in the head. Kind 1. Keep title, chip and the movement; drop owner and "Check after".
- ResultPanel L20-25: the drawer repeats the title, chip, owner, check and due, then shows Baseline + Measure (dates again) + Reward. Kind 1. Drop L20-22 and let the panels speak.

## 3. Baseline panel, `ProjectMeasure.tsx` `BaselinePanel`
- L79: muted "taken {day} by {name}" / "the number before the start". Kind 2 (inside the draft the stepper already says "Baseline"). Fold behind the value.
- L84: "{metric} · {better} · source: {source}". Kind 3. Fold.
- L89: "Confirmed by {name} on {date}" is a second meta line next to "taken … by". Kind 1. Merge into one ✓.
- L93: "A second person confirms the baseline before the start, because a reward is possible." Kind 2. Make it a chip "Needs confirming"; confirmer gets primary "Confirm".
- L96: "The sponsor or the route's deputy confirms it, not the lead or who typed it." Kind 2. Remove.
- L99: "Not taken yet. The lead takes it before the project starts." Kind 2. "Not taken yet."
- L100-150: the form is always open with suggestion row, checkbox and 5 fields. Kind 3. Keep the suggestion row with a one-tap "Use it", the number and Save; fold source and direction.

## 4. Reward panel, `ProjectMeasure.tsx` `RewardPanel`
- L422: "the company’s own rule · payroll pays it, outside NextUp". Kind 2. Remove.
- L424 + L445: "Recognition due by {date}" and "Reward due by your rule: {rule}" are two due lines. Kind 1. Merge into one.
- L439: "A reward is due after a confirmed better result." Kind 2. Hide the panel until it is due.
- L441: "This company gives no reward, so the project is closed once it is measured." Kind 2. Hide.
- L443-462: the form is always open (saving, amount, note). Kind 3. One primary "Record reward €X" (the rule's suggestion), with "Change" folded.

## 5. Project head and Overview page, `ProjectView.tsx`, `hub/overview/Overview.tsx`, `tools/OverviewTool.tsx`
- ProjectView L98-108: on a planned project the head h1 is the project title, and PageHead adds the h1 "Overview" (plus sr-h2 Overview.tsx L89). Kind 1. No page title on the home page.
- ProjectView L117-122 (`PageMove`): banner "Your move · Take the baseline" sits directly above BaselinePanel's own Save, and the head's Start is disabled with tooltip "Take the baseline first…". The same instruction appears three times (Kind 1/4). Drop the banner when the move's panel is on screen.
- Overview L113-114: "Plan the first steps" + "Nothing to show yet. Add the first step, and this page fills in by itself: …". Kind 2. Title + button only.
- L127 "Open the board →" and NextPanel's "Open the board →" (`ProjectNext.tsx` L28) are on one screen. Kind 1. Keep one.
- `ProjectNext.tsx` L27 "What happens next" overlaps "Where the steps are" and "Who has what". Kind 1. Merge into one list.
- L148: "{count} steps done in {weeks} weeks" restates the bars. Kind 2. Remove.
- L159: "Days a step stood still because it was waiting on one person or supplier. Visible to the project team only." Kind 2. Remove.
- L122: "Last one done on {date}." Kind 2.
- `move/WeeklyUpdate.tsx` L41: "Built from the board since the last check-in. Edit it, then send it to …" Kind 2. The 7-row textarea is always open (Kind 3): fold behind "Weekly update ready · Review and send".
- L60: "Last update, sent {date}:" plus full text. Kind 3. Fold.
- `move/HowWeWork.tsx` L33-55: select + textarea + ghost "Save" sit at the bottom of every Overview. Kind 3. Collapse to "Weekly check-in: Monday ›".
- ProjectView L250-283 (`ProjectInfo`): fine, already folded behind the (i).

## 6. Tab-mode Overview (`projectPages` off), `ProjectSummary.tsx`
- L47: "{pct}% · {count} in progress" repeats the bar. Kind 1.
- L66-68: "Running 12 d · since the start, {day}" repeats the stepper's start date. Kind 1.
- L78: "{change} · 30-day check" duplicates Measure; "Taken before the start" is noise. Kind 1/2.
- ProjectView L171-178: the Your-move banner repeats the head's Start and the panel. Kind 1.

## 7. Draft / setup flow, `draft/DraftView.tsx` and children
- L81-86: back link, chip "Draft", "Start expected {date}", h1, lede "From the idea “X” · {name} leads". Then the stepper sub for Start repeats the date, and the Lead sub repeats the name (`DraftProgress.tsx` L27-29). The lead step adds h2 "Lead" + "{name} leads" (L96-97). The lead name appears three times and the date twice (Kind 1). Keep the h1 + stepper; drop the lede and the top line.
- `DraftProgress.tsx` L41 "{done} of {total} done" + DraftView L93 "Step {n} of {total}". Kind 1. Keep the stepper only.
- `DraftTemplate.tsx` L44: "A template puts the first steps on the board. None is required…". Kind 2.
- L66 "{count} steps · about {days} days" and L72 "· {role} · day {n}". Kind 3.
- L82: "Steps already moved or edited stay…". Kind 2.
- DraftView L103-106: "On the board" lists the same steps the template card just listed. Kind 1. Remove.
- `DraftInvites.tsx` L38 "Nobody invited yet. Invitations never block the start." and L73 "Suggested roles, open for now". Kind 2. "Invite" is ghost (L67), so this step has no primary (Kind 4).
- DraftView L125: the Goal step stacks DraftGoal ("Save the goal", ghost) and HowWeWork ("Save", ghost). Two equal saves and no primary (Kind 4). `DraftGoal.tsx` L83 "Goal and done-when need 3 to 400 characters each." is noise (Kind 2). Fix: make "Save" primary; move how-we-work out of setup.
- L126: the baseline step repeats "Baseline / the number before the start" (Kind 1). Once saved and waiting for a second person, the lead only gets a grey line and no way to nudge the confirmer (Kind 5). Add a "Remind {sponsor}" action.
- L131-155 (Start step): "Ready to start?", "Start opens the board for the team.", "Still needed to start" list (repeats the stepper's "Needed to start" subs), Start, then up to 5 notes ("The project cannot start while it waits for approval." also repeats the L87 badge "Waits for approval"), baseline-waits hint, "Template and team help, but you can start without them." Kind 1/2. Keep Start (or the one missing item as a link) and drop the rest.
- L142: a non-lead on the Start step sees no button and no sentence saying who starts (Kind 5). Add "{lead} starts it."
- L171-175: Next is ghost while a step is open, and template/team have no primary of their own, so the user is never told the one thing to do (Kind 5). Make "Next" or "Skip" primary on optional steps.
- ProjectView L64: `PlanDraftLink` "AI planning draft" sits above the back link. Kind 2. Move it into the menu.

## 8. Projects hub tabs
- `overview/OverviewList.tsx` L105: visible h2 "Overview" under the area tab "Overview". Kind 1. Remove.
- L473 empty sub "Ideas you raise and projects you join show up on this page…" and L449 no-match sub. Kind 2. One line.
- `ProjectsHub.tsx` L61: h2 "Projects" + count under the Projects area (fallback). Kind 1.
- `area/Collaboration.tsx` L43-45: every card has a hint ("You are on the team and someone else leads.", "Help, resources or a handoff that people outside the team asked…", "Projects whose team comes from more than one unit."), and L51 adds a grey line per empty section. Kind 2. Drop the hints; hide empty sections.
- `dashboard/shared/ProgressView.tsx` L38 and `ProjectMovement.tsx` L58 render two "Wait ledger, after the yes" cards with the same medians, escalated, owed and unmeasured counts (Kind 1). Remove one.
- `ProjectMovement.tsx` L34 sub "The number before the start against the number at each check. The verdict is computed, and worse shows too." Kind 2.
- L41 + L48: the verdict chip appears per project and per measure. Kind 1.
- `area/ProgressSteps.tsx` L20 sub "How far each project's board has come. A step is stuck after 14 days…" Kind 2.
- L38 "{done} of {total} steps done" repeats the bar. Kind 1.

## 9. Board and step detail
- `ProjectBoard.tsx` L131-132: "Board" + "{done} of {total} done" while the tab already says "Board (n)". Kind 1.
- L150 "You follow this project. Its team moves the steps; open a card…" Kind 2.
- L155 "from the idea’s brief - you decide which go on the board". Kind 2.
- `StepDetail.tsx` (tab mode) L171 "No details yet." and L184 "Not linked to a ticket yet." Kind 2. The link form L186-198, the facts L224-227 and the history L229-238 are always open (Kind 3). Fold behind "More".
- `steps/StepPanel.tsx` L136: "Waiting on: Nobody yet" always shows. Kind 2. Show only when set.

## 10. Files / Idea (tab mode)
- `ProjectOrigin.tsx` L25: "as it was raised, and what the discussion made of it". Kind 2.
- L30 "Raised by {name} · {day}" repeats the (i) "Raised by". Kind 1.
- The DiscussionPanel (L45) is always open. Kind 3. Fold behind "Discussion (n)".
- `ProjectTeam.tsx` L103 "{count} connected" (Kind 1 with the chips) and L177's three-sentence Jira hint (Kind 2).

## Shared pieces a rewrite touches
- `Projects.module.css`: `.panel`, `.panelHead` (h2 + muted span), `.h2`, `.muted`, `.hint`, `.emptyLine`, `.quiet`, `.quietLink`, `.big`, `.strong`, `.baseline`, `.check`, `.checkHead`, `.result`, `.change`, `.due[data-late]`, `.measureForm`, `.preview`, `.claim`, `.form`, `.fields`, `.suggestRow`, `.actionRow`, `.readOnly`.
- `parts.tsx`: `VerdictChip`, `DueBadge`, `nextLine`, `useRights`, `useSend`, `idViewerOf`.
- `features/projects/views.ts`: `movement`, `changeText`, `measureSourceLine`, `impactLines`, `baselineText`, `rewardRuleText`, `measureShown`, `rewardShown`. This file is in Kevin's Rights row: wording-only changes are fine, but it needs its own PR.
- Others: `features/projects/measure-view.ts`; `move/Move.module.css` (`.block`, `.title`, `.hint`); `draft/Draft.module.css` (`.muted`, `.hint`, `.stepCount`); `SectionCard` `hint` prop (area/progress).

## Patterns that repeat
1. Every `panelHead` and `SectionCard` has a grey sub that describes the system. Drop all of them.
2. Dates are shown in the head and again in the body or a sibling card (checks, start, done-by).
3. A status shows as a chip plus a sentence plus a meta suffix ("not confirmed" ×2, "waits for approval" ×2).
4. The "Your move" banner repeats the button that is already on screen.
5. Forms are open by default (baseline, measure, reward, weekly update, how we work, link ticket).
6. Two ghost buttons side by side, and the needed action is ghost or two clicks deep.
7. Empty states explain the rules ("never block", "the lead records it") instead of one short line.
8. Page title repeats the tab or area title (Overview, Board, Projects).
9. The lead's name and the project facts repeat across head, (i), stepper and cards.
10. Counts repeat what a bar or list already shows.
