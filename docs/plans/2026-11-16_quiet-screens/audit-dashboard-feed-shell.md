# Audit: Dashboard, Feed, Profile and the bar

> **Audit · 2026-11-16.** Read from `main` at ac734532, before any change of this plan. Kinds: 1 duplicate, 2 noise,
> 3 always open, 4 unclear action or orientation, 5 inconsistency. Paths are relative to `apps/app/src/`; line
> numbers are those of that commit.

## 1. Dashboard (`components/dashboard/shared/DashboardBoard.tsx`), the worst offender

| Line | English shown | Kind | Fix |
|---|---|---|---|
| 190 + nav.ts:42/95 | "Dashboard" appears as the nav pill, the section tab and the h1 (the h1 is visible whenever the KPIs tab is hidden, e.g. in the demo) | 1 | Always make the h1 sr-only. The pill names the page. |
| 129-134, 191 | Lead: "1 Oct – 30 Oct · 42 cases · baseline 1 Aug - 30 Aug · simulated days" | 1+2 | The dates repeat the "Last 30 days" pill. Drop the dates and the baseline range. Keep "42 cases" only if needed. |
| 193-195 | " · Set a baseline" link in the lead, plus "Baseline…" in the period menu (217) | 1 | Keep only the menu item. |
| 176, dashboard.ts:151 | Every tile carries "baseline 3 working days · counted from the log" | 2 | Show the delta chip only. The baseline value goes into the overlay. |
| 235-237 | Overlay: note + "Routed by keywords - the AI is off…" + "Baseline from {source} · file {hash} · {date}" | 2 | Keep the note. Fold provenance behind an "i". |
| 245, 260 | Legend "■ baseline ■ now", plus the caption "Each step is 30 working days, named by the month it ends in; the last one ends with the period." | 2 | Drop the caption. Tint the baseline bars instead of using a legend. |
| 283-288 | "Cases raised per month" draws 3 series (Raised/Answered/On time), meta "{raised} raised · {answered} answered", plus a legend row | 1+2 | Rename it "Cases per month". Drop the meta, because the bars say it. |
| 310, 321 | "Open cases per stage" + "{n} open", plus "{n} days on average" under every stage | 1+2 | Drop the meta. Show the average on hover. |
| 342-353 | "How cases were answered": the meta "{n} answers in this period", then a stacked bar, then a list with n and % | 1 | Keep the stack and the list with %. Drop the meta and the raw n. |
| 363 | "Verified results of finished projects" | 2 | Drop it. |
| 331, BreakdownCard.tsx:62-71 | "By unit and role": a 7-column table, always open | 3 | Fold it behind one line, "By unit and role ›". |
| 334, DeskLoadCard.tsx:33-57 | "Load per desk" + lede "Open work divided by the colleagues who are present. A desk, never a person." + 6 columns, always open | 2+3 | Drop the lede. Draw the card only when a desk is not Normal, and fold it to "2 desks loaded ›". |
| DeskLoadCard.tsx:52-53 | Raw `{r.late}` `{r.pinned}` print "0". The "Normal" chip shows on every row | 2 (breaks the no-0 rule) | Pass the counts through `shows()`. Show the state only when it is not normal. |
| DeskLoadCard.tsx:79-83 | Three actions inline in each loaded row ("Add a colleague to the desk", "Appoint a cover…", "Pass cases on in one go") | 4 | Put them behind one RowMenu "···". |
| BreakdownCard.tsx:66 | Column "First answer (working days)" | 2 | Use "First answer". Put the unit in the cell. |
| BreakdownCard.tsx:114 | "{count} more not shown: fewer than 5 people" | 2 | Shorten to "+{count} too few". |

**Minimal first view.** Above the fold: the unit pill, the period pill and "Export" (one row), then the tiles (value + delta only). Folded: Trend and Stages as one "Trend ›" row; Answers and Pay-off as "Answers ›"; By unit and role ›; Load per desk (only when a desk is loaded). Baseline, provenance and captions live in the tile overlay only.

## 2. KPIs (`components/metrics/KpisView.tsx`, `dashboard/kpis/page.tsx`)

| Line | Text | Kind | Fix |
|---|---|---|---|
| 86, page.tsx:10 | The tab says "KPIs" but the title is "Idea management figures" | 1/5 | Use one name: "KPIs". |
| 89 | Card title "Company" over the company tiles | 2 | Drop it. |
| 90 | A raw "2026-01-01 – 2026-11-16" line under the period buttons | 1 | Drop it. The period button already says this. |
| 109 | Banner "Baseline counted from the log." | 2 | Drop it, or fold it into the footnote. |
| 145-146 | The hidden-units line plus the 5-sentence footnote "Counted per unit, never per person…" | 2 | Put both behind one "How this is counted ›" fold. |
| 71-77 | A segmented period control (This year/Last year/Since go-live), while the Dashboard uses a pill menu with different periods | 5 | Use one period control for both. |

## 3. Shell (`components/shell/SimpleShell.tsx`, `config/nav.ts`)

| Line | Text | Kind | Fix |
|---|---|---|---|
| 115-118 | Account menu stats: "3 decisions waiting" for a manager, "2 in inbox" for a leader | 1 | These repeat the Inbox badge. Drop them for those roles. |
| 120-126 | "How others see you" / handle / "Anonymous · name and role hidden" | 2 | Keep only the handle line. |
| 128-136 | Up to 5 links (My profile, What I sent, Settings, IT console, My reports) + Log out | 4 | My reports is already a tab of Profile, so drop it. "What I sent" duplicates Ideas › Mine (see the routes below). |
| nav.ts:8-18 | `NAV` rail ("My cases", "Collaboration", "Progress"…) and `navFor` | 4 | Only tests use them, no component does. Delete them. |
| SectionTabs.tsx | Fine. It uses `Tabs` from ui/elements. | | |

**Routes:**
- `/manager`: redirects to /dashboard. Nothing links to it. Dead alias.
- `/leader`: redirects to /inbox. Still linked from ProfileView.tsx:79 ("Open inbox") and still in config/roles.ts:22. Change the link to /inbox.
- `/team`: a live page, SentView, "What I sent". It is not in NAV_SIMPLE; you reach it only through the account menu (SimpleShell:130) and twice on Profile (79, 94). It duplicates Ideas › Mine (`/ideas`, DESIGN_RULES §8). Redirect it to /ideas.
- `/overview`: live. It is in the nav only while the projects flag is off. With the flag on it renders the ideas table inside the Projects frame, and `projectsTabAt` (nav.ts:73) marks the Projects "Overview" tab as current. That breaks §8 "No idea under Projects". It is still linked from ProfileView:68 ("← Overview") and PersonView:14. Redirect it to /inbox when the flag is on.
- `/progress`, `/collaboration`: redirects. ProfileView.tsx:63 still links to `/collaboration?id=`. Point it to /projects/collaboration.
- `/problems`: redirects to /feed. Dead.

## 4. Feed (`components/dashboard/team/FeedView.tsx`)

| Line | Text | Kind | Fix |
|---|---|---|---|
| 262-270 | Each card shows the supporters line ("{count} people back this" / "You support this"), 3 avatars, and the count again inside "Support 4" | 1 | Keep the Support button with its count. Drop the supporters line. |
| 263, feed.ts | "Be the first to back it." | 2 | Drop it. |
| 250 + 262 | The "3 d ago" in the cover meta, and "Raised · 3 d ago" when that is the only event | 1 | Show the latest line only when it is not "raised". |
| 285 | "Showing cases open now or moved in the last 90 working days." on every visit | 2 | Drop it. |
| 140-224 | One row holds All + 3 department chips + More + Site + Unit + Sort + "Archive" (up to 8 controls) | 3/4 | Keep the department chips. Fold Site, Unit and Sort into one "Filter" menu. Keep Archive. |
| 252 | Stage chip on the cover | | Fine, it uses tokens. |

## 5. Overview table (`components/dashboard/team/DashboardView.tsx`)

| Line | Text | Kind | Fix |
|---|---|---|---|
| 370 + ProjectsHub:36-38 | Visible h1 "Overview" when the flag is off. With the flag on: sr-only h1 "Ideas" + a visible h2 "Ideas" + the "Overview" tab | 1/5 | One sr-only h1. Delete the route (see /overview above). |
| 455-456, 478-480 | "Stage" shows a label and a 5-dot stepper, and the "Status" badge also says the stage | 1 | Keep the dots and the status. Put the stage label on hover. |
| 446-450 | Second line under the wait: "Since 4 Nov" / "{n} d left" / "answered" / "clock paused" | 2 | Keep it only when the clock is paused or the case is late. |
| 501-505 | Pages of 50 rows | 5 | The rule is "over 7 shows 5 + Show all". Use `useCapped`. |
| OverviewChats.tsx:85, 232-233 | The "Nextup AI · Grill your idea" thread + "Coming soon" + "AI chat for this idea opens here." | 2/4 | Hide it until it works. |
| OverviewChats.tsx:82, 184-185 | The supporter and comment counts appear twice: the thread sub and the feed head | 1 | Show them once. |

## 6. Profile (`components/profile/ProfileView.tsx`)

| Line | Text | Kind | Fix |
|---|---|---|---|
| 68 | "← Overview" back link on a page that is a tab | 4 | Drop it. |
| 69, 77 | The company name as a lone span in the header, and again in "Berlin · Acme" | 1 | Show it once. |
| 75 | A "You" chip on your own profile | 2 | Drop it. |
| 76 + 102 | Role and department in the identity card, and again in the "Details" card (plus location, and the email that is also in the account menu) | 1 | Drop Details. Put the email under the name. |
| 79 + 94 + menu | "My cases →" / "Open inbox →", plus the "Follow what you sent · See updates and answers to your cases" card, plus the menu's "What I sent", all going to the same place | 1 | Remove all three. Ideas › Mine is in the nav. |
| 84 + 90 | The stats strip ("Cases you raised / Ideas / Collaborations") and a count badge on "Your work" | 1 | `StatStrip` already has an `echo` flag for this; use it or drop the strip. Drop the badge. |
| 65 | `.slice(0, 6)` with no "Show all" | 5 | Use `useCapped` + `ShowAll`. |
| 88 | Banner "How people see you · Your submissions appear as X. Your name and role stay hidden on those posts." | 2 | Shorten to one line: "Others see you as X". |
| NotifySettings:67 | "Choose which mails NextUp sends you." | 2 | Drop it. |
| M365Card:21-24 | Long explanation, 2-3 sentences | 2/3 | Keep "Connect Microsoft 365". Fold the explanation behind "What it reads ›". |
| AwayCard:34, 45-46 | Lede "While you are away…"; the heading "Cases handed on while you were away" plus "Nothing to take back." even when empty | 2 (breaks "nothing empty is drawn") | Drop the lede. Draw the take-back block only when it has rows. |
| 101-106 | The side column draws 5 cards open (Details, Language, M365, Mails, People nearby) | 3 | Group them as "Settings ›" rows (Language, Mails, Microsoft 365). |

## 7. Reports (`components/report/ReportsView.tsx`)

| Line | Text | Kind | Fix |
|---|---|---|---|
| 37 | Lede "What you sent with the bug icon, bottom left, and what the NextUp team answered. You also get a mail for every reply." | 2 | Drop it. Keep the empty-state sentence. |
| 62-66 | "Created by you · Not assigned yet" on every ticket | 2 | Drop "by you". Show the assignee only when there is one. |
| 39 | One SectionCard wrapping an `<ol>` | 5 | Use the grouped-list style from rule §1. |

## Shared pieces and who bypasses them

- **Page heads.** `PageHeader` in ui/elements is used only in offline branches (KpisView:86, ReportsView:37, Profile:69). With a server, those pages, the Feed (sr-only h1) and the Dashboard (`s.h1`/`titleRow`) each build their own head. `ViewHead`/`ListTools`/`FilterStrip` (shared/ViewHead.tsx) are imported nowhere: dead code.
- **Cards and section headings.** `SectionCard` (h2, used by Profile/KPIs/Reports) vs DashboardBoard `card2` + `h3.cardTitle` vs DeskLoadCard's own `.card` (border, raw `#fff`) vs Profile's own `.stats`/`.myCases`.
- **Segmented controls, three of them.** BreakdownCard `.seg`, KpisView `.periods`, Profile `.segment`.
- **Menus.** Dashboard `.menu`, Feed `.div7`, Overview `.div12`, `ListTools` (unused). Four drop-down implementations.
- **Status chips.** `primitives.Pill` (raw hex), Feed `.stage` (tokens), Overview `.badge`, Reports `.status`, DeskLoad `.level`, Dashboard `.verdict`/`.badge`.

## Fold/expand ("disclosure")

- **What exists.** `ShowAll`/`useCapped` (ui/elements/capped.tsx) for the 5-of-N list cap, used by the Feed. `RowMenu` (interactive.tsx:12) is the only shared `<details>`/`<summary>`, styled in elements.module.css:57-60.
- **Ad-hoc copies.** Ten other `<details>` with their own classes: ProjectOrigin:35, ProjectView:273, CaseLoop:223, IdeaParts:162, ApprovalsBlock:69, AuditLog:169/180, SettingsMenu:46, CompanyAccess:54, and the RowMenu copies in RoutingEditor/MembersView. BreakdownCard has its own `.twisty`.
- **Proposal.** Add a `Fold({ summary, count?, children })` to ui/elements on native `<details>`, with one chevron style in elements.module.css. Every section above uses it.

## Status colour tokens (`styles/tokens.css:47-52`)

The tokens are `--nh-ok`/`-tint`, `--nh-warn`/`-tint`, `--nh-danger`/`-tint`, `--nh-brand`/`-tint`/`-ink`, and `--nh-accent` (time/overdue). Places that bypass them:
- DashboardBoard.module.css:7-14 adds a private palette (`--d-sky #4ba3ef`, `--d-amber #e9a100`, `--d-teal`, `--d-slate`). Line 66: a worse delta uses `#c2410c`. Line 188: late uses `#c2410c`. Line 189: escalated uses `#8a5a00`. Lines 183-185: the on-time meter uses bench and amber colours. Line 157: "worse" uses `--nh-problem`, which is the problem-kind colour.
- DeskLoadCard.module.css:11 shows up/overflow in **brand blue**; it should be warn/danger.
- ReportsView.module.css:12: "Being worked on" in brand blue, while "Fixed" gets no ok colour.
- M365Card.module.css:5 uses `#1b6e34` instead of `--nh-ok`.
- shared/ui.module.css:44-51: Pill tones in raw hex (`#ffe7dc/#b23c07`, `#dcf3e3/#116634`, `#e8e4ff`).
- Feed.module.css:204-206: raw red and violet.
- KpisView.module.css:18-21: raw KPI colours.

## Patterns across the area

1. Each card has a title, a grey meta line that restates its own numbers, and a legend or caption.
2. A grey lede under each heading explains the system ("A desk, never a person", "Counted per unit…").
3. Data-heavy blocks are drawn fully open; nothing folds except list caps and row menus.
4. The same link or fact shows 2-3 times: /team three times, role and department twice, the company twice, the inbox count twice.
5. Server branches hide the h1 while offline branches use `PageHeader`, so page heads differ by mode.
6. Old routes stay live or keep being linked (/overview, /team, /leader, /collaboration), and /overview breaks §8.
7. Each screen hand-rolls its own menus, segmented controls and chips instead of using ui/elements.
8. Status is coloured with private palettes and brand blue rather than the ok/warn/danger tokens.
9. Empty sub-blocks are still drawn ("Nothing to take back.", 0s in Load per desk), against the quiet rules.
10. Dead code is still around: the `NAV` rail, `ViewHead`/`ListTools`/`FilterStrip`.
