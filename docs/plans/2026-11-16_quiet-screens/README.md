# Quiet screens: one fact once, folded by default

> **Plan · 2026-11-16 · in progress.** Kevin, 16 Nov: the main pages (bar, Inbox, Feed, Projects, Dashboard and
> their sub pages) say too much. Titles and grey sub lines repeat each other, sections stand open, and it is not
> clear what to press. This plan holds the findings, the target per screen and who builds what. The rules it
> follows are `docs/DESIGN_RULES.md` §9 (new with this plan) on top of §1–§8.

## Why

The example Kevin sent is a project's Measure section. On one screen it says: "Measure" with the note "the verdict
is computed, never typed in"; "30-day check · opens 6 Nov · due today"; "120 → 165 €k / quarter · Not confirmed
yet · +37.5 % · Typed by A. Weber · not confirmed"; "90-day check · opens 5 Jan · due 10 Jan" and under it "Opens
5 Jan."; and a card below ends with "90-day check opens 5 Jan". One date three times, one status twice, one
sentence about how the software works, and no button that says what to do.

The same five faults are on every main page. The three audits list them with file and line:

- [audit-inbox-ideas.md](audit-inbox-ideas.md): Inbox list, opened item, idea page, raise and publish, Mine, Decisions.
- [audit-projects.md](audit-projects.md): Projects list, project page, Measure, Baseline, Reward, draft and setup, board.
- [audit-dashboard-feed-shell.md](audit-dashboard-feed-shell.md): bar and account menu, Dashboard, KPIs, Feed, Profile, Reports, old routes.

| Fault | Seen as | Rule (§9) |
|---|---|---|
| A name twice | "Inbox" as pill, tab and heading; "Overview" as side entry and heading | One name per place |
| A fact twice | due date in the row, a chip, a panel and the AI text; "not confirmed" twice | One fact, once per screen |
| Grey text that explains | "A desk, never a person", "Invitations never block the start" | No grey text that explains |
| Everything open | AI panel, weekly update, how we work, filters, forms | Folded by default |
| No clear button | five equal decision buttons; "Confirm result" as a ghost button | One filled button per screen |

## Target per screen

What stays in view. Everything not named here folds away (`Fold` from `components/ui/elements`) or goes.

**Bar and side view.** The bar's pill names the area. Each area lists its pages in one side view on the left,
hidden at the start, as Projects already does; the strip of tabs under the bar goes on laptop and monitor (a phone
keeps it). Inbox: Inbox, Decisions. Ideas: New idea, Mine. Dashboard: Dashboard, KPIs. Profile: My profile, My
reports. Kevin said yes to this for every area on 16 Nov; it changes §4's tab rule (package C2).

**Inbox list.** No "Inbox" heading and no Today line: the group headings carry the counts ("Decide 6"). A row is
the title and one fact: who raised it, or the cause ("Passed to you by …"). One chip when late or due soon; no
"Case", no red title on top of the chip. Notices is not drawn when empty.

**Opened item.** Centre: who and one due chip, the title, the text (three lines, more on demand), one line of
advice ("Discuss first: it does not say what it costs"). Folds: Details (affects, context, attachments), What the
AI found (scores, reasoning, reviewers, pattern, sources), Comments (n), What happened. Side: "Your move" with one
filled button (the recommended move), a quiet No, and "More" for pass, ask and discuss. The same block, in the same
place, for every kind of item: desk decision, approval, question to answer, result to confirm. Buttons that do
nothing yet are not drawn.

**Idea page (`/idea?id=`).** The same layout as the opened item, for whoever looks: the raiser sees the status in
one line and their one move (answer, send again, withdraw under More); an approver sees Approve. The question to
answer is quoted above its button. After the last yes the status line is the link to the project.

**Raise and publish.** One Publish button. The window asks one thing per step, with no kicker above the heading.
After sending: one line, "Sent to {desk} · answer by {date}", and one link, to Ideas › Mine.

**Projects list.** No heading that repeats the area. A row: title, stage with its bar, on whose desk, one status
chip. No "P-4 · project" under the title, one date at most. No "New idea" button here (§8).

**Project page.** The project's title once; the page's name lives in the side view only. Top of the Overview: the
one next move as a single card with its filled button (take the baseline, add the first step, start, record the
30-day number, confirm the result). Below it one line per section: Result, Steps, Team, Activity. Weekly update and
How we work are folds, not open forms. One team block, one "Open the board" link.

**Result (was Measure).** One row per check:

```
30 days    120 → 165 €k / quarter    +37.5 %    [Not confirmed]   [Confirm]   ⌄
90 days    opens 5 Jan
```

`[Confirm]` is filled and only for who may confirm; "Send back" is quiet, inside the fold with who typed it, the
source, the impact lines and the history. Before a check opens the row is its date and nothing else. Baseline and
Reward follow the same shape: the number, one chip, one button, the rest folded.

**Draft and setup.** The title, the stepper, and the open step with one filled button (Save, Next, Start). No
lede, no "Step 2 of 5", no list that repeats the stepper. Who is not the lead reads one line: "{lead} starts it."

**Dashboard.** One row of controls, then the tiles (value and change). Below, one line each: Trend, Answers, By
unit and role, Load per desk (drawn only when a desk is loaded). No lede, no legend captions, no "0", no "Normal".

**Feed.** A card: who, where, when (once), the title, Support with its count. No "Be the first to back it", no
"Raised · 4 d ago" under a card that already says when, no footer about 90 days. Site, unit and sort sit in one
Filter menu.

**Profile.** Name, role and unit once. Language, mails and Microsoft 365 are one line each that opens.

## Colour

Status uses the status tokens and nothing else (§9, last row): `--nh-ok` good, `--nh-warn` needs you, `--nh-danger`
late or worse. Blue (`--nh-brand`) is for actions and selection. The private palettes named at the end of
[audit-dashboard-feed-shell.md](audit-dashboard-feed-shell.md) go; the colour allowlist only shrinks (§6).

## Packages

Three sessions build at once. Each owns its files; nobody edits another package's files. `Fold`, `tokens.css`,
`globals.css` and `docs/DESIGN_RULES.md` came with the foundation PR and stay as they are; a package that needs a
change there says so in its PR text.

| Package | Screens | Owns |
|---|---|---|
| **A · Inbox and ideas** | Inbox list, opened item, idea page, raise and publish, Mine, Decisions | `components/inbox`, `components/dashboard/leader`, `components/dashboard/shared/{CaseDetailView,CaseLoop}*`, `components/dashboard/team/{OverviewIdea,DeskDecision,SentView,DashboardView,OverviewChats,OverviewPhone}*`, `components/cases`, `components/ideas`, `components/decisions`, `components/projects/IdeaPage*`, `features/inbox`, `features/ideas`; catalogs `inbox`, `ideas`, `cases*`, `decisions`, `approvals`, `team`, `brief` |
| **B · Projects** | Projects list, project page, Result, Baseline, Reward, draft and setup, board, Collaboration, Progress | `components/projects` (not `IdeaPage*`), `components/dashboard/shared/{CollaborationView,ProgressView}*`; catalogs `projects*` |
| **C1 · Dashboard, Feed, Profile** | Dashboard, KPIs, Feed, Profile, Reports, account menu, old routes | `components/dashboard/shared/{DashboardBoard,BreakdownCard,DeskLoadCard}*`, `components/dashboard/team/FeedView*`, `components/metrics`, `components/profile`, `components/report`, `components/overload`, `components/shell/SimpleShell*`; catalogs `dashboard`, `feed`, `metrics`, `kpis`, `profile`, `shell` |
| **C2 · Side view** (Kevin, 16 Nov: yes, every area) | One side view per area in place of the tab strip. `AreaFrame` and Dashboard and Profile first; Inbox and Ideas join when package A moves their lists into it with `AreaSideSlot` | `components/shell/AreaFrame*`, `SectionTabs.tsx`, `config/nav.ts`, `docs/DESIGN_RULES.md` §4, `tests/unit/design/side-view.test.tsx` |

Not in any package: rights (`features/projects/views.ts`, `confirm.ts`, `features/*/permissions.ts`), the reducer
and the events. A screen is built on today's rights and events.

Each package ships one screen per PR, small, with its tests: a test that expected a removed line is updated in the
same PR and the PR says so; a test that guards a rule of §1–§8 is never changed.

## Done

1. Every screen named above matches its target, in English and German, at 1366 px and at 390 px.
2. `npm run lint && npm run typecheck && npm test && npm run build` pass, and the demo and database e2e suites.
3. One walk through the whole way, in the demo and on Musterwerk: raise an idea, the desk says yes, the approvers
   vote, the draft appears under Projects, setup (baseline, first steps, start), done, the 30-day number, the
   confirmation. At each step the screen shows one filled button and it is the right one.
