# 10 · Existing pages: design improvements

> **Plan · 2026-11-02 · open: page specs for Sam. Part of [the pilot pages plan](../2026-11-02_pilot-pages.md); read its
> "Start here, Sam", its ground rules and its shared building blocks first.**
> Eight pages that are built and work today and that no PILOT phase rebuilds: Projects, the project page, Raise as a
> whole, and five pages outside the navigation (Ideas, Problems, Collaboration, Progress, My reports). They keep what
> they do. They change how clearly they say it: one meaning per colour, one font for text, phone layouts that work at
> 375 px, and only elements from the design and elements page. Design Projects, the project page and Raise right after
> [04](04-everyday-app.md), because every role opens them daily; the five pages outside the navigation come last and
> only once their open question below is answered.

Context for this file:

- **Who does what.** Kevin builds the infrastructure; you design and build the interface. Each page below says what it
  needs: content, actions, states, rules and the names in code. The layouts are suggestions; arrange them as you think
  works best. Where a page here and its code disagree on data, tell Kevin.
- **English for design, German for the LLM.** Design and test in English. The German column of each Content table is
  input for the LLM that fills the German catalog; you never need to read or check it. Every label, chip, column head
  and button must leave room for German text about 30 % longer (it wraps or truncates with a tooltip, never clips).
  Where today's German catalog uses «…» or "—", the new entries use „…“ and a spaced hyphen " - ".
- **Phases.** Most of these pages are not in any phase. Where one touches a page, its *Phase* line says so:
  LOOP (projects switchable per company, raise placeholders removed: spec 04), MET (per-person numbers removed, the
  wait ledger from real events; no Bauplan yet), IDN-S1 (`viewerOf` removed, everything by id), CLK-B1 (dates on
  pages), HD5 (roles, not people: no person rankings, no person metrics), HD10 (people are ids, never names).
- **Code.** Pages in `apps/app/src/app/[company]/(app)/`; components in `components/projects/`,
  `components/ideas/`, `components/dashboard/shared/`, `components/report/`; logic in `features/projects/`
  (`views.ts`, `selectors.ts`, `permissions.ts`), `features/ideas/`, `features/metrics/`, `features/org/`. Text
  namespaces: `projects`, `ideas`, `dashboard`, `report`, `shell`.
- **Navigation.** `apps/app/src/config/nav.ts` `NAV_SIMPLE` is what every role sees (`SHELL` is "simple" for all
  three roles): member Ideas (`/raise`), Feed, Projects; leader and manager add Inbox, the manager Dashboard. Projects
  shows while the `projects` flag is on, Overview while it is off. Ideas, Problems, Collaboration and Progress are only
  in the old rail `NAV`, which no role uses; My reports is in neither.

### One-off elements today that belong on the design and elements page

These pages invent their own small elements. Each one either becomes a shared element on the design and elements page
or is replaced by one that is already there. Do not rebuild them per page.

| Today | Where | On the design and elements page as |
|---|---|---|
| Coloured letter tiles "JI", "TE", "SP", "AZ" in other companies' brand colours (`.toolMark[data-tool]`, `TOOLS[].short` in `features/projects/views.ts`) | project header tool chips, Connected tools panel | **Tool chip**: the tool's name as text and the app's own link icon. No letter tiles, no brand colours of other companies (plan rule: the Microsoft logo on its sign-in button is the only third-party logo). |
| "SYNC" uppercase outlined green (`.toolMode`), the Jira sync chips (`.syncChip` tones ok / problem / sending) | tool chips, Connected tools | `StatusBadge` (On, Setting up, Error, Synced) |
| Mono caps code-and-status label "P-12 · RUNNING" (`.label`), mono counts (`.count`), mono dates (`.stageDay`, `.tlDay`, `.age`) | project cards, header, timeline | Mono only for codes (`P-12`, `C-1042`, `NUP-44`); status as `StatusBadge`; counts and dates in Inter with tabular figures (design system: "IBM Plex Mono is kept for codes and the DEV badge only") |
| Due chip on greige `#f0efea`, late in orange-red (`.due`, `DueBadge`) | project cards, header | `StatusBadge` "Due 14 Nov" (neutral) and "3 days late" (red text, red is for a late number only) |
| Four-colour step bar: green, blue, orange, greige (`.segbar`) | project cards, summary band | **Progress bar**: done ink, in progress blue, the rest grey; blocked and late said in words next to it |
| Column-coloured top borders and pills (`.column[data-col]`, `.colPill`, `.segBtn[data-col]`) | board, card sheet | **Board column** with one look for all four columns; segmented control for "Move to" |
| "YOUR MOVE" banner in mono caps (`.yourMove`) | project page | **Banner** (the same element the sandbox banner uses), sentence case |
| `Pill` with eight tones (accent, ink, ok, grey, soft, ghost, none, purple) in `dashboard/shared/primitives.tsx`, plus `statusTone`, `trendTone`, `ownerTone`, `verdictTone` | Ideas, Problems, Progress, Collaboration | `StatusBadge` with its tones only |
| `ViewHead`, `ListTools`, `FilterStrip` (`dashboard/shared/ViewHead.tsx`) | Ideas, Problems, Progress, Collaboration | `PageHeader`, the sort menu, filter chips with their "clear" chip |
| `Tile` and the seven-bar sparkline `Bars` | Ideas, Problems, Progress | the stat tile the Dashboard in 04 uses |
| Hard-coded map colours `INK`, `BRAND`, `ACCENT #ff5a1f`, `MUTE` and dashed lines (`CollaborationView.tsx`) | Collaboration map | chart colours of the design and elements page (no orange, design system) |
| Overview status pills and the red clock text | Ideas column of Projects (`team/DashboardView.tsx`) | `StatusBadge` and the clock line of [04 Overview](04-everyday-app.md#overview) |
| The composer's gold ring and breathing aura (`.ring`, `.aura` in `Raise.module.css`) | Raise | **Composer**, kept: the design system's one gradient, as a named element |
| Ticket status pill (`ReportsView.module.css` `[data-status]`) | My reports, `/admin` Tickets | `StatusBadge` |

Rules that recur on every page of this file:

| Rule | EN | DE |
|---|---|---|
| Colour carries one meaning. Blue: now, selected, in progress. Red: a late number or an error. Amber: needs you or review. Black: the action. Ink with a check: done or better. Nothing else gets its own colour: not a column, not a status, not a tool. | Doing · 3 days late · ✓ Done | In Arbeit · 3 Tage überfällig · ✓ Erledigt |
| Days are written out, never "d". In a real company a day is a date ("Due 14 Nov"); a count says its unit. | 4 days in Doing · due Fri 14 Nov | seit 4 Tagen in Arbeit · fällig Fr., 14. Nov. |
| Escalations and desks name the role first, the person second (HD5). | with Plant manager Süd · M. Keller | bei Werksleitung Süd · M. Keller |

---

## Projects

- **Route:** `/[company]/projects` (redesign). `/[company]/overview` shows the same page while the `projects` flag is
  on (`ProjectsHub`, `tab="projects"`).
- **Who:** every role (`ROLE_ACCESS["/projects"]`). Members see the projects of their own ideas and the ones they are
  on; leaders and managers see all (`visibleProjectsFor`).
- **Phase:** none for the projects column. LOOP makes projects switchable per company (today the `projects` flag in
  `config/flags.ts`). The Ideas column is the Overview table of [04](04-everyday-app.md#overview) (MET, VIS-C1, IDN-P1,
  CLK-B1): design it there, not here.
- **Data:** `visibleProjectsFor(S, idViewerOf(ctx), demo)`, `groupProjects(list, locale)` (Planning, Running,
  Measuring, Measured and recognised, Stopped). Per card: `projectLabel(p)`, `p.title`, `p.lead`, `p.members`,
  `board(p)` (steps per column), `nextMove(p, day)` and `nextLine(…)`, `p.verdict`, `p.dueDay`, `p.overdue`,
  `p.escalated` (`to`, `toRoleId`).
- **Today:** `components/projects/ProjectsHub.tsx`, a wide page (about 80 % of the screen): title and a lead line per
  role, then two columns side by side from 1100 px: **Projects** grouped by state (`ProjectsList`, cards from
  `ProjectCard` in `parts.tsx`: mono label, verdict pill, title, "Lead {name} · {n} people", a four-colour step bar
  with "2 blocked · 1 late", the next line and the due chip) and **Ideas** (the Overview table with Open/Archive,
  Filter, Sort). Below 1100 px they stack, projects first. In `NAV_SIMPLE` for every role while the flag is on.

**Purpose:** one page where everyone sees what ideas became and every idea on its way there.

### What stays / what changes

- **Stays:** projects left, ideas right; the five groups in their order, empty groups hidden; what a card says (code,
  title, lead, team size, where it stands next, the due); a card opens the project page.
- **Changes:**
  - The step bar on a card uses the progress bar element: done ink, in progress blue, the rest grey. Blocked and late
    stay in the words next to it ("2 blocked · 1 late"); they get no colour of their own.
  - Verdict and due are one badge family (`StatusBadge`). Today they are a `Pill` in one of four tones and a greige
    chip. A worse verdict is a word, not red: red is only for a late number.
  - The project code is the only mono text. Group heads, counts and the status in Inter.
  - A card whose next move is the viewer's says so in words ("Your move: Take the baseline"), not only by colour.
  - A late project that moved to a deputy names the role first: "3 days late · with Plant manager Süd · M. Keller"
    (from `p.escalated.toRoleId`; today `dueLateWith` shows the person's name only).
  - In the Ideas column the clock and the status follow [04 Overview](04-everyday-app.md#overview): today the clock is
    a red sentence ("8 d past promise") next to status pills in four styles; there, only the late number is red and
    every status is one `StatusBadge`.

### Layout (desktop, suggestion)

```
Projects
Every idea from the first word to the measured result, and the projects it became.

┌ Projects · 7 ───────────────────────┐ ┌ Ideas ──────────────────────────────────┐
│ Running · 3                         │ │ ( Open | Archive )   [Filter ▾] [Sort ▾]│
│ ┌─────────────────────────────────┐ │ │ What              Open since   Desk     │
│ │ P-12                   [Better] │ │ │ Night-shift han…  3 Nov ·      Quality  │
│ │ Retrofit kit line 4             │ │ │ Idea · Werk Süd   4 working d  lead Süd │
│ │ Lead H. Sander · 4 people       │ │ │ Scrap bins over…  21 Oct ·     Assembly │
│ │ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬░░░░░░░░          │ │ │ Problem           12 working d lead Süd │
│ │ 5/9 steps · 2 blocked · 1 late  │ │ │ …  (spec 04, Overview)                  │
│ │ Your move: Mark it done         │ │ └─────────────────────────────────────────┘
│ │ Due 14 Nov                      │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ P-9                             │ │
│ │ Shared forklift booking         │ │
│ │ Lead M. Keller · 3 people       │ │
│ │ 3 days late · with Plant        │ │
│ │ manager Süd · M. Keller         │ │
│ └─────────────────────────────────┘ │
│ Planning · 2                        │
│ …                                   │
└─────────────────────────────────────┘
```

### Phone (≤ 760 px)

One column: Projects, then Ideas (as today below 1100 px). Each group shows its first three cards and "Show all
{count}"; the Ideas column is the Overview phone list of 04. Cards are full width; the due badge moves under the next
line.

### Content

Namespace `projects` unless noted.

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Title | `PageHeader` | no primary action | Projects | Projekte |
| Lead | `PageHeader` lead | member text vs leader and manager text (`hubSubMember`, `hubSubLead`) | What your ideas became, and every idea and problem on its way there. · Every idea from the first word to the measured result, and the projects it became. | Was aus deinen Ideen wurde, und jede Idee und jedes Problem auf dem Weg dorthin. · Jede Idee vom ersten Wort bis zum gemessenen Ergebnis, und die Projekte, die daraus wurden. |
| Column heads | section head + count | | Projects · {n} · Ideas | Projekte · {n} · Ideen |
| Group heads | head + count | fixed order, empty groups hidden | Planning · Running · Measuring · Measured and recognised · Stopped | In Planung · Laufend · In Messung · Gemessen und gewürdigt · Gestoppt |
| Code | code, mono | `projectLabel(p)` | P-12 | P-12 |
| Verdict | `StatusBadge` | only once measured; never green, never red | better · same · worse · not measured | besser · gleich · schlechter · nicht gemessen |
| Lead line | meta | the lead is a person (projects are led by people); team size, never a per-person number | Lead {name} · {count} people | Leitung {name} · {count} Personen |
| Steps | progress bar + text | bar: done, in progress, rest; text only for what needs attention | {done}/{total} steps · {count} blocked · {count} late | {done}/{total} Schritte · {count} blockiert · {count} überfällig |
| Next line | meta | `nextLine()`: the move for the lead, the state for everyone else | Your move: {move} · Planning, baseline next · Planning, ready to start · Running, no steps yet · {check}-day check opens {day} · Measured, reward due · Stopped: {why} · Recognised | Du bist dran: {move} · In Planung, als Nächstes der Ausgangswert · In Planung, bereit zum Start · Laufend, noch keine Schritte · {check}-Tage-Prüfung öffnet {day} · Gemessen, Belohnung fällig · Gestoppt: {why} · Gewürdigt |
| Due | `StatusBadge` | `DueBadge`; late = red number; escalated adds the role | Due {day} · {count} days late · with {role} · {name} | Fällig {day} · {count} Tage überfällig · bei {role} · {name} |
| Show all | text button | phone, per group | Show all {count} | Alle {count} anzeigen |
| Empty | `EmptyState` | no visible project | No projects yet · An idea becomes a project once it gets a yes. | Noch keine Projekte · Eine Idee wird zum Projekt, sobald sie ein Ja bekommt. |

### Actions

- A card opens `/projects/<id>`. A row in the Ideas column behaves as in [04 Overview](04-everyday-app.md#overview).
  Nothing on this page changes data.

### States

- Loading: `PageSkeleton kind="list"`.
- No projects yet: the Projects column shows its `EmptyState`; the Ideas column as usual.
- `projects` off for the company: the page is the Overview of 04, full width (`DashboardView`).
- A member: only their projects; a leader or manager: all.
- A card with the viewer's move; a late card; a late card moved to a deputy; a stopped card ("Stopped: {why}").

### Done when

- [ ] Desktop and phone in English with all five groups, one card with the viewer's move, one late, one late and
      escalated (role first), one measured worse, one stopped.
- [ ] Empty projects column; `projects` off (Overview full width); a member's view with one project.
- [ ] Only elements of the design and elements page: progress bar, `StatusBadge`, code, `EmptyState`.

---

## Project page

- **Route:** `/[company]/projects/[projectId]` (redesign)
- **Who:** every role that may see the project (`visibleProjectsFor`); what each person may do comes from the server's
  own rules (`useRights(p)` → `mayAppendProject` in `features/projects/permissions.ts`): the lead, team members, a
  manager, and followers who only read.
- **Phase:** none. LOOP makes projects switchable per company. CNX (Jira behind `WorkTracker`) changes nothing on this
  page: the Jira row stays the same `JiraRow`.
- **Data:** `ReducedProject` (`features/projects/types.ts`): status, `sources`, `authors`, `openedBy`, `openedDay`,
  `lead`, `leadUserId`, `members`, `memberUserIds`, `steps` (`column`, `text`, `note`, `owner`, `ownerUserId`,
  `dueDay`, `movedDay`, `startedDay`, `doneDay`, `why`, `external`), `baseline`, `measures`, `checks`, `verdict`,
  `escalated`, `history`. Derived: `lifecycle(p, locale)` (the stages), `boardStats(p, day)`, `board(p)`,
  `nextMove`, `connectionsOf(p)`, `jiraRowOf(p, view, now, locale)` with the company's `jiraStatusView` read on the
  server, `timelineOf(p, locale)`, `suggestedSteps` and the brain's steps (`useBrainPlan`, AI on only),
  `suggestedBaseline`. Every button sends one `project.*` event (`act.project.*`).
- **Today:** `components/projects/ProjectView.tsx`: **header** (← All projects, mono "P-12 · Running", verdict and
  due chips, title, "From {idea} · raised by … · opened … by …", up to five faces and "{lead} leads · {n} on the
  team", tool chips with coloured letter tiles and a "SYNC" badge, the Start / Mark it done… / Stop the project
  actions); **summary band** (`ProjectSummary.tsx`: a six-stage track and six KPI tiles: Steps done, Blocked, Late,
  Cycle time, Running, Baseline → now); a **Your move** banner; the **board** (`ProjectBoard.tsx`: four columns with
  coloured tops, filters All, Mine, No owner and one face per owner, suggested steps, drag and drop, a composer per
  column); below it Baseline, Measure, Reward, Activity with comments, The idea; on the right Team, Connected tools,
  Files and sources. A card opens a right sheet (`StepDetail.tsx`).

**Purpose:** where a project stands and what needs doing next, with the board as the place where the work happens.

### What stays / what changes

- **Stays:** the order of the page (who and what, where it stands, the board, then the record); the board with four
  columns, drag and drop, the touch grip, the composer at a column's foot, the "What blocks it?" question on a drop on
  Blocked, the filters; buttons shown only when the rules let them through; the card sheet's content; the right rail
  with Team, Connected tools, Files and sources; Activity newest first with the comment box on top.
- **Changes:**
  - **The band answers one question: where it stands and what needs attention.** It must show the stage track, the
    steps done (x of y), what needs attention in one line (blocked, late, open without an owner, the longest-stuck
    step), and baseline → latest measure. Cycle time and running days are secondary facts: they may move into a
    details line or the board's head. Today six equal tiles compete with the track above them.
  - **Colour on the board means state only.** The four columns look the same; their names say what they are. A card
    is coloured only for what is true of it: late (red date), the viewer's own (blue marker), done (ink check).
    Today each column has its own top colour (grey, blue, orange, green) and cards add more accent colours.
  - **Tools are named, not logo-tiled.** A tool chip reads "Jira NUP-41", "Teams", "SharePoint" with the link icon;
    Jira's sync state is a `StatusBadge` from `JiraRow` (Synced, Sending, Problem). No "JI", "TE", "SP" tiles in
    Atlassian or Microsoft colours, no one-off "SYNC" style.
  - **Mono only for codes**: the project code and ticket keys. Dates, ages and counts in Inter with tabular figures;
    "3d" becomes "3 days" (`unitDays` goes).
  - **Your move** uses the shared banner, sentence case.
  - **Escalation names the role** ("Moved to you" stays for the viewer; elsewhere "with {role} · {name}").
  - **The team list shows no per-person count.** Today each person has "{n} open" (open steps they own); that is a
    per-person number (HD5, MET "no screen renders a per-person count"). The board's person filter answers it when
    someone asks. Open question 10-Q6.
  - **Measure and Reward follow spec 11** once their tasks are merged: the Measure card gains preset metrics, KPI
    import, the source line and the second person's confirmation
    ([11, Measurement from data sources](11-defensible-offer-pages.md#measurement-from-data-sources); PROOF-A1 to
    PROOF-C1); the Reward card shows the computed premium, "due only after a confirmed better result", the paid state
    and the premium letter ([11, Reward and premium letter](11-defensible-offer-pages.md#reward-and-premium-letter);
    TRUTH-G1, BVW-E1, BVW-F1). Design them in their current form now and add these states when the data exists.
  - **Phone, fixed:** the stage track fits 375 px (today it is cut off after "Done" with a partial grey track); no
    label collides with another (today "BASELINE → NOW" runs into its neighbour and under the Dev button on demo
    companies); the first screen shows the title, the stage and the viewer's move, and the board starts within the
    second screen (today the header alone fills the first).

### Layout (desktop, suggestion)

```
← All projects
P-12  [Running]                                                     [Due 14 Nov]
Retrofit kit line 4
From Night-shift handover checklist · raised by L. Brandt · opened 3 Oct by M. Keller
(HS)(LB)(MK)(TV)  H. Sander leads · 4 on the team
[Jira NUP-41 · Synced] [Teams ↗] [SharePoint ↗]  + Connect another tool
                                              [Mark it done…]  Stop the project
┌ Where it stands ──────────────────────────────────────────────────────────────┐
│ ●──────────●──────────●──────────○──────────○──────────○                      │
│ Opened     Set up     Started    Done       Measured   Recognised             │
│ 3 Oct      8 Oct      10 Oct     next                                         │
│ 5 of 9 steps done  ▬▬▬▬▬▬▬▬▬▬▬▬░░░░░░░░                                       │
│ Needs attention: 2 blocked (longest 6 days) · 1 late · 1 without an owner      │
│ Scrap rate 4.1 % → 3.6 %  · better · 30-day check                             │
│ Cycle time 3 days · running 23 days, since 10 Oct                              │
└───────────────────────────────────────────────────────────────────────────────┘
┌ Your move: Mark it done ──────────────────────────────────────────────────────┐
Board · 5 of 9 done            ( All | Mine | No owner )  (HS)(LB)    2 hidden
┌ To do · 3 ─────────┐┌ Doing · 2 ─────────┐┌ Blocked · 2 ───────┐┌ Done · 2 ──────────┐
│ Train night shift  ││ NUP-44 · 4 days    ││ Supplier quote     ││ ✓ Order kits       │
│ (MK) M. Keller     ││ Mount brackets L4  ││ Blocked: PO waits  ││ (HS) done 9 Oct    │
│ due 12 Nov         ││ (LB) due 14 Nov    ││ on Purchasing      ││                    │
│                    ││                    ││ (MK) late · 7 Nov  ││                    │
│ + Add a step       ││ + Add a step       ││                    ││ + Add a step       │
└────────────────────┘└────────────────────┘└────────────────────┘└────────────────────┘
┌ Baseline ───────────────────────────────────┐ ┌ Team · 4 people ─────────────┐
┌ Measure ────────────────────────────────────┐ │ (HS) H. Sander  Lead         │
┌ Reward ─────────────────────────────────────┐ │ (LB) L. Brandt               │
┌ Activity · 3 comments · 12 events ──────────┐ │ (MK) M. Keller               │
│ [Say something to the team            ]     │ │ [Add someone… ▾]  Add        │
│ (LB) L. Brandt · 4 Nov  Brackets arrived.   │ ├ Connected tools · 3 ─────────┤
│ 3 Nov  M. Keller moved "Order kits" to Done │ │ Jira NUP-41   [Synced]       │
└─────────────────────────────────────────────┘ │ Teams, SharePoint (links)    │
┌ The idea ───────────────────────────────────┐ ├ Files and sources ───────────┤
└─────────────────────────────────────────────┘ └──────────────────────────────┘
```

While the project is planned, the Baseline panel and the suggested steps sit above the board (as today), because
"Start the project" waits for the baseline.

*Updated 2026-11-03:* the second stage is **Set up**, not Baseline, and while the project is setting up its Overview
shows the setup checklist (team, roles, goal, baseline, tools, context, how we work) in place of the Baseline panel.
See [spec 12](12-project-setup.md) and [the project setup plan](../2026-11-03_project-setup.md).

Card sheet (opens from the right, 480 px, as `EditDrawer`; suggestion):

```
                                 ┌ [Doing]  Jira NUP-44 ↗                     ✕ ┐
                                 │ Mount brackets on line 4                      │
                                 │ Move to ( To do | Doing | Blocked | Done )    │
                                 │ ─ Who and when ─────────────────────────────  │
                                 │ Owner     (LB) L. Brandt ▾        Take it     │
                                 │ Due       14 Nov  [Today][+3 days][+1 week]   │
                                 │                   [+2 weeks][ days ][None]    │
                                 │ ─ Details ──────────────────────────────────  │
                                 │ [ Bracket set B, torque per drawing 4711  ]   │
                                 │ [Save changes]  Undo                          │
                                 │ ─ In a tool ────────────────────────────────  │
                                 │ Jira NUP-44 · its status comes back here      │
                                 │ ─ Record ───────────────────────────────────  │
                                 │ Added      3 Oct by M. Keller                 │
                                 │ In Doing   since 6 Oct · 4 days               │
                                 │ History    6 Oct  L. Brandt moved it to Doing │
                                 │ Remove this step                              │
                                 └───────────────────────────────────────────────┘
```

Labels in the sheet are sentence case (today plain caps everywhere); the four groups (who and when, details, in a
tool, record) are a suggestion for giving the same fields more structure.

### Phone (≤ 760 px)

- **Header:** back, code, status badge and due on one line; the title (wraps); "H. Sander leads · 4 on the team".
  The origin line, the tool chips and Stop the project sit behind a "Details" disclosure; the one primary action
  (Start, Mark it done) stays visible, full width.
- **Stage:** one line "Started · stage 3 of 6 · since 10 Oct" with a compact track that fits 375 px; a tap opens the
  six stages with their days as a sheet. No sideways scrolling track.
- **Band:** the facts as a list, one per line, label above value where a label is longer than half the width.
- **Board:** one column at a time, snapping sideways as today, with the column names as a tab row above it
  ("To do 3 · Doing 2 · Blocked 2 · Done 2") so the viewer knows where they are. Cards move by drag (the grip) or
  through the sheet's "Move to".
- **Card sheet:** full-screen sheet from the bottom.
- Test with the Dev button and the demo controls open on a demo company: they must not hide any content of the page.

### Content

Namespace `projects`.

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Back | text link | | ← All projects | ← Alle Projekte |
| Code and status | code + `StatusBadge` | `projectLabel(p)`, `status_*` | P-12 · Planning · Running · Measuring · Measured · Recognised · Stopped | P-12 · In Planung · Laufend · In Messung · Gemessen · Gewürdigt · Gestoppt |
| Origin | meta with links | each source links to its case or idea; a handle stays a handle | From {ideas} · raised by {authors} · opened {day} by {name} | Aus {ideas} · eingereicht von {authors} · eröffnet {day} von {name} |
| Team line | avatars + text | up to 5 faces | {lead} leads · {count} on the team | {lead} leitet · {count} im Team |
| Tool chip | tool chip | `connectionsOf(p)`: tool name + first key; opens the link | Jira {key} · Teams · SharePoint · Azure DevOps · Planner · Polarion · codebeamer · Other links | Jira {key} · Teams · SharePoint · Azure DevOps · Planner · Polarion · codebeamer · Andere Links |
| Sync state | `StatusBadge` | Jira only, from `JiraRow` | Synced · Sending · Problem · {count} steps | Abgeglichen · Wird gesendet · Problem · {count} Schritte |
| Connect | text link | `r.link`; jumps to Connected tools | + Connect a tool · + Connect another tool | + Tool verbinden · + Weiteres Tool verbinden |
| Start | black pill | lead, planning; disabled until a baseline or "no number" | Start the project · Take the baseline first - or say why there is no number. | Projekt starten · Erfasse zuerst den Ausgangswert - oder sag, warum es keine Zahl gibt. |
| Done | text button → note + pill | `r.done`; a quiet link while steps are open, the primary button once the board is done | Mark it done… · What is done (optional) · Mark it done · {count} steps still open | Als erledigt markieren … · Was ist erledigt (optional) · Als erledigt markieren · {count} Schritte noch offen |
| Stop | text button → reason + pill | `r.stop`; reason required | Stop the project · Why does it stop? · Stop it | Projekt stoppen · Warum endet es? · Stoppen |
| Stage track | stepper | `lifecycle(p)`; done ink, now blue, next grey; a stopped project ends at Stopped | Opened · Baseline · Started · Done · Measured · Not measured · Recognised · Stopped · next · opens {day} | Eröffnet · Ausgangswert · Gestartet · Erledigt · Gemessen · Nicht gemessen · Gewürdigt · Gestoppt · als Nächstes · öffnet {day} |
| Steps done | fact + progress bar | `boardStats` | {done} of {total} steps done · {pct} % · {count} in progress · Add the first steps | {done} von {total} Schritten erledigt · {pct} % · {count} in Arbeit · Füge die ersten Schritte hinzu |
| Needs attention | one line | blocked, late, without owner, longest stuck; "Nothing stuck" when none | Needs attention: {count} blocked (longest {days} in {column}) · {count} late · {count} without an owner · Nothing stuck | Braucht Aufmerksamkeit: {count} blockiert (am längsten {days} in „{column}“) · {count} überfällig · {count} ohne Zuständige · Nichts hängt fest |
| Baseline → now | fact | `baseline`, last `measure`; better in ink with a check, worse as a word | {metric} {before} → {now} {unit} · {change} · {check}-day check · Not taken · No number · Taken before the start | {metric} {before} → {now} {unit} · {change} · {check}-Tage-Prüfung · Nicht erfasst · Keine Zahl · Wird vor dem Start erfasst |
| Secondary facts | meta | cycle time = median Doing → Done | Cycle time {days} · running {days}, since {day} · took {days} · open for {days}, since the yes, {day} | Durchlaufzeit {days} · läuft seit {days}, seit {day} · dauerte {days} · offen seit {days}, seit dem Ja, {day} |
| Your move | banner | the lead's next move, or a late start or measure that moved to the viewer | Your move · {move} · Moved to you · The start is late - it is on your desk too. · A measure is late - it is on your desk too. | Du bist dran · {move} · An dich übergegangen · Der Start ist überfällig - es liegt auch bei dir. · Eine Messung ist überfällig - es liegt auch bei dir. |
| Board head | title + meta | | Board · {done} of {total} done · No steps yet | Board · {done} von {total} erledigt · Noch keine Schritte |
| Filters | filter chips + avatar chips | All, Mine, No owner, one chip per owner (by user id) | All · Mine · No owner · Only {name}'s steps · {count} hidden | Alle · Meine · Niemand zuständig · Nur Schritte von {name} · {count} ausgeblendet |
| Read-only | meta line | follower without rights | You follow this project. Its team moves the steps; open a card to see its details. | Du verfolgst dieses Projekt. Das Team bewegt die Schritte; öffne eine Karte, um die Details zu sehen. |
| Suggested steps | list + Add | planning only; from the brief, plus the brain's steps when the AI is on | Suggested steps · from the idea's brief - you decide which go on the board · Add | Vorgeschlagene Schritte · aus dem Steckbrief der Idee - du entscheidest, welche aufs Board kommen · Hinzufügen |
| Columns | board column | same look for all four | To do · Doing · Blocked · Done | Offen · In Arbeit · Blockiert · Erledigt |
| Empty column | meta | per column; with a filter: "None for this filter." | Nothing waiting. · Drag a step here when someone starts it. · Nothing blocked. · Finished steps land here. · None for this filter. | Nichts wartet. · Zieh einen Schritt hierher, wenn jemand ihn beginnt. · Nichts blockiert. · Fertige Schritte landen hier. · Keine für diesen Filter. |
| Card top | code + meta | ticket key (mono, opens the issue) or "waiting for Jira"; days in this column | NUP-44 · waiting for Jira · {days} days in {column} | NUP-44 · wartet auf Jira · seit {days} Tagen in „{column}“ |
| Card foot | avatar + due | owner by id; due red when late | {name} · No owner · Due {day} · late · {day} · done {day} · Has details | {name} · Niemand zuständig · Fällig {day} · überfällig · {day} · erledigt {day} · Hat Details |
| Blocked reason | line on the card | required when moved to Blocked | Blocked: {why} · What blocks it? · Mark blocked | Blockiert: {why} · Was blockiert ihn? · Als blockiert markieren |
| Composer | text + owner picker + days | max 500 characters; owner picked from the team, never typed | What needs doing? · No owner yet · Due in days · Add step · Close · Add a step | Was ist zu tun? · Noch niemand zuständig · Fällig in Tagen · Schritt hinzufügen · Schließen · Schritt hinzufügen |
| Panels | section cards | as today | Baseline · Measure · Reward · Activity · The idea · Team · Connected tools · Files and sources | Ausgangswert · Messung · Belohnung · Aktivität · Die Idee · Team · Verbundene Tools · Dateien und Quellen |
| Team | list | lead tag; no per-person count (10-Q6) | Lead · Add someone… · Add · Remove · Hand over the lead · Hand the lead to… | Leitung · Jemanden hinzufügen … · Hinzufügen · Entfernen · Leitung übergeben · Leitung übergeben an … |
| Activity | comment box + feed | newest first, 8 shown | {count} comments · {count} events · Say something to the team · Comment · Show all {count} · Show less | {count} Kommentare · {count} Ereignisse · Sag dem Team etwas · Kommentieren · Alle {count} anzeigen · Weniger anzeigen |
| Phone details | disclosure | phone only *(new key)* | Details | Details |

Card sheet (`StepDetail.tsx`):

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Head | `StatusBadge` + ticket link + close | | {column} · {tool} · {key} | {column} · {tool} · {key} |
| Title | text area or heading | editable with `r.editStep(s)`, max 500 | Step | Schritt |
| Move to | segmented control | `r.moveStep(s)`; Blocked asks for the reason first | Move to · To do · Doing · Blocked · Done | Verschieben nach · Offen · In Arbeit · Blockiert · Erledigt |
| Owner | person picker | the team by user id; "Take it" for a team member | Owner · No owner · Take it | Zuständig · Niemand zuständig · Übernehmen |
| Due | date + quick chips | late in red | Due · No due day · Late since {day} · Today · +3 days · +1 week · +2 weeks · None | Fällig · Kein Fälligkeitsdatum · Überfällig seit {day} · Heute · +3 Tage · +1 Woche · +2 Wochen · Keine |
| Details | text area | max 2,000; saves with the title | Details · No details yet. · Save changes · Undo | Details · Noch keine Details. · Änderungen speichern · Rückgängig |
| In a tool | meta + link form | http(s) only | In a tool · its status comes back to this board · Waiting for Jira: the issue is created in the next round. · Not linked to a ticket yet. · Ticket address · Link | In einem Tool · sein Status kommt zurück auf dieses Board · Wartet auf Jira: Das Issue wird in der nächsten Runde angelegt. · Noch mit keinem Ticket verknüpft. · Ticket-Adresse · Verknüpfen |
| Record | label/value | | Added · {day} by {name} · In {column} · since {day} · Cycle time · History | Hinzugefügt · {day} von {name} · In „{column}“ · seit {day} · Durchlaufzeit · Verlauf |
| Remove | text button → inline confirm | `r.removeStep(s)` | Remove this step · Take it off the board? The history keeps it. · Yes, remove · Keep it | Diesen Schritt entfernen · Vom Board nehmen? Der Verlauf behält ihn. · Ja, entfernen · Behalten |

### Actions

- Every button sends one `project.*` event through `useSend(p)`, which asks the server's rules first; a refusal shows
  its reason as a `Toast` (the `perm*` texts, for example "Only the step's owner or the project's lead can move it.").
- Drag a card: `project.step.moved` with `before` (the order is the team's priority). Dropped on Blocked: the card asks
  "What blocks it?" first; nothing moves until the reason is given.
- Start, Mark it done, Stop: as listed in Content; Stop needs a reason.
- Comment: `project.commented`, appears at once at the top of Activity.

### States

- Loading: `PageSkeleton kind="list"`.
- Projects off for the company: "Projects are not turned on for this company yet. When they are, every idea that gets
  a yes becomes one here." with *Back to the feed* (`ProjectsOff`).
- No such project, or not one the viewer may see: "No such project" / "It does not exist, or it is not one of yours to
  see." with *All projects*.
- Planned, no steps: the To do composer is open, suggested steps above the board; no baseline yet: Start is disabled
  with its hint.
- AI off: suggested steps come from the brief only; nothing on this page names the AI.
- A follower: the read-only line, no composer, cards open read-only.
- Jira: off (links only), waiting (cards show "waiting for Jira"), synced, problem (`StatusBadge` Error and the
  problem text in Connected tools).
- A late start or measure moved to the viewer; a stopped project; a measured project with a worse verdict; a
  recognised project.
- While dragging: the drop line; columns show where the card can land.

### Done when

- [ ] Desktop and phone (375 px) in English: a running project with the viewer's move; a planned one without steps
      and without a baseline (suggested steps, Start disabled); a measured one, worse; a stopped one.
- [ ] Phone: the full stage track fits or opens as a sheet, nothing collides, the title and the move are on the first
      screen; checked with the Dev button open on a demo company.
- [ ] The board in one look for all columns: a late card, a blocked card with its reason, the viewer's card, a done
      card, a filtered column ("None for this filter."), the drop on Blocked asking why, the composer.
- [ ] The card sheet: editable (lead), read-only (follower), the "Move to" control, the remove confirm.
- [ ] Tool chips without logo tiles: Jira synced, Jira sending, Jira problem, link-only tools.
- [ ] Projects off, no such project, read-only follower.

---

## Raise

- **Route:** `/[company]/raise` (redesign of the page as a whole). The publishing step (*Publish* → last look →
  "Where should it go?" → sent) is specified in [04 Raise: publishing step](04-everyday-app.md#raise-publishing-step);
  it is not repeated here.
- **Who:** every role. The member's home (`ROLE_HOME.member`), "Ideas" in `NAV_SIMPLE` for members and leaders.
- **Phase:** LOOP removes the stand-ins (receiver, colleagues, meeting; `raisePreview.ts`) and moves "Who sees it" into
  the publishing step (04, VIS-A1). AIP-A1 puts the coach behind the AI gate: with the AI off the coach gives its
  offline answer. Otherwise none.
- **Data:** the idea studio `lib/use-idea-studio.ts` (the conversation, the drafts, the benchmark, publishing), one
  turn at a time from `/api/[company]/ideas/turn` (server score + coach reply), drafts and their state kept per company
  and person (`lib/use-kept.ts`), prompt blocks (`features/ideas/prompts.ts`: Impact, Who's blocked, Already tried,
  Trial, Deadline, or a custom label), the score's five dials, files, the affected units.
- **Today:** `components/ideas/Raise.tsx` and its parts. **Sidebar** (`RaiseSidebar.tsx`): search, New idea, the open
  draft (title, *Publish idea*, Idea / Analysis, "Actions made"), the ideas list (Pinned, Recent, Published, Show
  all), collapsible, a drawer on phones. **Start** (`RaiseStart.tsx`): "Raise it, {name}" and the gold-ringed
  composer (`RaiseComposer.tsx`) at the optical centre, the actions as a row of six buttons (receiver, colleague,
  meeting, file, affected, who sees it; `RaiseMenu.tsx`), the prompt blocks tucked under it (`RaisePrompts.tsx`),
  dictation. **Chat** (`RaiseChat.tsx`): the idea as asked on top, "Evaluating" until the first reply, the full
  analysis above NextUp's first reply, then per reply its text, the dials it moved as bars and words, and one
  question still open; a turn rail on the right (one segment per unclear point); the composer docked at the bottom;
  *Publish* under the latest reply once the conversation is long enough. **Sheets** over the chat
  (`RaiseSheets.tsx`): the idea (edited in place) and the AI analysis. **Export view** (`RaiseExport.tsx`).

**Purpose:** say what should change in your own words, sharpen it with a few questions, and send it when it is ready.

### What stays / what changes

- **Stays:** the three areas (sidebar, start, chat), the greeting and the composer at the optical centre, the gold
  ring (the design system's one gradient), Enter sends and Shift+Enter breaks a line, dictation where the browser has
  it, the prompt blocks, one question per reply, the turn rail, the analysis above the first reply, the idea and
  analysis sheets, the export view, drafts kept across visits.
- **Changes:**
  - **Fewer actions.** Receiver, colleague and meeting go (LOOP, 04). Who sees it moves into the publishing step
    (04). The start page's action row keeps *Attach file* and *Who's affected* (units picked by id, 04).
  - **AI off has its own look.** With the AI off (or not answering) the coach asks its offline questions, the reply
    has no "AI read", and the chat head shows the AI-off line. The five dials are the score (`features/scoring`), not
    the AI: they stay.
  - **One composer element.** The composer (ring, field, actions button, dictation, send) is one element on the design
    and elements page, used on the start page and docked under the chat.
  - **Sidebar rows** use the shared list row (title, one meta line, a pin, a ⋯ menu); "Chats & drafts" becomes
    "Chats and drafts".
  - **Phone:** the turn rail becomes one line above the composer ("3 of 5 points clear"), tapping it opens the rail as
    a sheet; the composer stays docked above the keyboard.
  - The static demo (`/demo`, the `script` prop and the demo controls) keeps working; it is not designed here.

### Layout: start (desktop, suggestion)

```
┌ Sidebar ──────────────┐
│ [Search ideas      ]  │
│ [+ New idea]          │
│ Draft                 │                     Raise it, Lena
│ Night-shift handover… │   ┌───────────────────────────────────────────────┐
│ ( Idea | Analysis )   │   │ Share an idea that would make work better…    │
│ [Publish idea]        │   │                                               │
│ Pinned                │   │ Impact  40 min lost per shift change          │
│ · Label printers      │   │ (⚡ Actions)                          (🎤) (↑)  │
│ Recent                │   └───────────────────────────────────────────────┘
│ · Shared forklift …   │     [Attach file] [Who's affected]
│ Published             │     + Impact  + Who's blocked  + Already tried
│ · Scrap bins L4       │     + Trial  + Deadline  + Custom
│ Show all              │
└───────────────────────┘
```

(The bolt and microphone stand for the app's own stroke icons, not emoji.)

### Layout: chat (desktop, suggestion)

```
┌ Sidebar ┐ ┌ Night-shift handover checklist ───────────────────┐ ┌ 3 of 5 points ┐
│  …      │ │ Each shift writes three lines on open faults …    │ │ ▬ Impact  ✓   │
│         │ │ Affects Werk Süd · Assembly · 1 file              │ │ ▬ Who      ✓  │
│         │ ├ AI analysis ──────────────────────────────────────┤ │ ▬ Cost  asking│
│         │ │ (dials) Impact 72 · Clarity 58 · Fit 80 · …       │ │ ░ Trial       │
│         │ │ What the AI found …          View full analysis   │ │ ░ Deadline    │
│         │ ├ NextUp ───────────────────────────────────────────┤ └───────────────┘
│         │ │ Good: the 40 minutes make the impact concrete.    │
│         │ │ Moved: Impact ▲ better                            │
│         │ │ Still unclear: what does a lost shift change cost?│
│         │ ├───────────────────────────────────────────────────┤
│         │ │ (you) About 2 scrap parts per change, ~€35 each.  │
│         │ │                                     [Publish]     │
│         │ └───────────────────────────────────────────────────┘
│         │ ┌ composer, docked ─────────────────────────────────┐
└─────────┘ └───────────────────────────────────────────────────┘
```

### Phone (≤ 760 px)

The sidebar is a drawer from the left (as today), opened from a button in the page head. Start: greeting and
composer centred, the two actions and the prompt blocks as a wrapping chip row under it. Chat: one column; the rail is
the line "{clear} of {total} points clear" above the docked composer; the sheets are full-screen sheets from the
bottom.

### Content

Namespace `ideas`.

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Greeting | H1 | the viewer's first name | Raise it, {name} | Bring es ein, {name} |
| Composer | composer | Enter sends; Shift+Enter new line | Share an idea that would make work better… · Actions · Dictate · Insert: {text} | Teile eine Idee, die die Arbeit besser machen würde … · Aktionen · Diktieren · Einfügen: {text} |
| Actions | two buttons (start) / menu (chat) | after LOOP only these two; affected = units by id | Attach file · Photos or PDFs · pick several · Who's affected | Datei anhängen · Fotos oder PDFs · mehrere möglich · Wer betroffen ist |
| Prompt blocks | chips → labelled lines | presets and a custom label; the presets are English constants today (`PRESETS` in `features/ideas/prompts.ts`) and go into the catalog *(new keys)* | Impact · Who's blocked · Already tried · Trial · Deadline · Custom · More context · Add a line | Auswirkung · Wer blockiert ist · Schon versucht · Test · Frist · Eigener · Mehr Kontext · Zeile hinzufügen |
| Evaluating | inline state | until the first reply | Evaluating | Wird ausgewertet |
| Analysis | card above the first reply | AI on only for "What the AI found"; dials always | AI analysis · View full analysis | KI-Analyse · Ganze Analyse ansehen |
| Reply read | bars + words | the dials this answer moved | Better · Worse · This answer did not move the scores. | Besser · Schlechter · Diese Antwort hat die Bewertung nicht verändert. |
| Open point | line under a reply | one at most | Still unclear · Answer this next · Asked · Answered | Noch unklar · Als Nächstes beantworten · Gefragt · Beantwortet |
| Turn rail | rail / phone line | one segment per unclear point | {clear} of {total} points clear · Asking now · Still to ask · Unknown for now · to ask | {clear} von {total} Punkten geklärt · Wird gerade gefragt · Noch zu fragen · Vorerst unbekannt · noch zu fragen |
| Typing | inline state | | NextUp is typing | NextUp schreibt |
| Publish | black pill | under the latest reply once long enough; opens the last look (04) | Publish | Veröffentlichen |
| AI off | grey line, chat head | AI off or no answer; the offline coach asks | The coach asks set questions - the AI is off for this company. *(new key)* | Der Coach stellt feste Fragen - die KI ist für diese Firma aus. *(neuer Schlüssel)* |
| Sidebar | list | pinned on top; search over title and text | Search ideas · New idea · Draft · Idea · Analysis · Publish idea · Actions made · Chats and drafts · Pinned · Recent · Published · Show all · Show less · Hide sidebar | Ideen durchsuchen · Neue Idee · Entwurf · Idee · Analyse · Idee veröffentlichen · Ausgeführte Aktionen · Chats und Entwürfe · Angeheftet · Zuletzt · Veröffentlicht · Alle anzeigen · Weniger anzeigen · Seitenleiste ausblenden |
| Row menu | ⋯ menu | | Rename · Pin to top · Unpin · Remove | Umbenennen · Oben anheften · Lösen · Entfernen |
| Discard | inline confirm | | Keep it · Yes, discard | Behalten · Ja, verwerfen |
| Untitled | meta | | Untitled idea · Give it a short title | Idee ohne Titel · Gib ihr einen kurzen Titel |
| Empty sidebar | meta | | Nothing yet. Your ideas and drafts land here. | Noch nichts da. Deine Ideen und Entwürfe landen hier. |

### Actions

- Send (Enter or the arrow): the first send opens the chat and evaluates; later sends are answers to the coach.
- *Publish* and *Publish idea*: open the last look of [04](04-everyday-app.md#raise-publishing-step).
- *New idea*: a fresh start page; the current draft stays in the list.
- Row menu: rename, pin and unpin, remove (asks "Keep it" / "Yes, discard" first).
- *View full analysis* opens the analysis sheet; *Idea* in the sidebar opens the idea sheet.

### States

- Start, empty: greeting and composer only. Start with a draft open: the draft's text in the composer.
- Evaluating; the first reply with the analysis; a later reply with moved dials; a reply that moved nothing; all
  points clear (the rail full, *Publish* shown).
- AI off: the offline coach, no "What the AI found", the AI-off line.
- Dictation running; dictation not available (the button is not shown).
- Sidebar collapsed; sidebar empty; search with no match ("No matches").

### Done when

- [ ] Desktop and phone in English: start (empty, with prompt blocks, with the two actions), chat (first reply with
      the analysis, a later reply, all points clear with *Publish*), AI off.
- [ ] The sidebar open, collapsed and as a phone drawer; empty; a pinned and a published row; the row menu and the
      discard confirm.
- [ ] The composer as one element (start and docked), with dictation on and off.

---

## Ideas

- **Route:** `/[company]/ideas` (`?id=` selects a row)
- **Who:** every role. Members co-sign; managers approve and assign or fund a trial; anyone asks a question.
- **Phase:** none.
- **Data:** the seed's ideas model, not the cases raised on `/raise`: `scopedIdeas(ctx)` over `D.ideas` (`ReducedIdea`:
  `criteria`, `status` Awaiting decision / In trial / Building / Unfunded / Shipped, `effort`, `expected`,
  `proposedBy`, `rationale`, `upside`, `wait`, `cosigners` by user id, `thread`, `team`, `approved`), its problem
  (`problemOf`), events `idea.cosigned`, `idea.asked`, `idea.approved`; `criteriaTags`, `sortIdeas`, search
  `ideaHay`. A real company without seeded ideas sees the page empty.
- **Today:** `components/dashboard/shared/IdeasView.tsx`, a port of the legacy demo: `ViewHead` "Ideas from the
  organisation" with sort and a Status filter, a list (criteria tags in three tones, title, "solves: {problem}",
  status pill, effort, expected, raised by) and a sticky selected-idea card (status, waiting days or no owner,
  rationale, two tiles, approval note, co-signers, *Co-sign* / *Approve and assign* / *Fund a trial*, *Ask a
  question*, questions asked, the problem it answers, who would run it). **Not in the simple shell's navigation**
  (`NAV_SIMPLE`); reached through `?id=` links from the project page's origin, the Problems page and search.

**Purpose:** see the organisation's ideas by how well they meet the case criteria, and act on one.

### What stays / what changes

- **Stays:** list and selected item side by side; the three criteria; sort, the Status filter and the search chip
  strip; the role's one primary action; asking a question.
- **Changes:**
  - Tags in one style: the criteria are one row of neutral tags (met: ink text; not met: grey); the status is one
    `StatusBadge`. Today Strategic fit, Awaiting decision, Flat, No owner each use another pill tone.
  - Header, sort and filter from `PageHeader` and the shared filter chips (no `ViewHead`).
  - "Approve and assign" picks people by id from the company's members (HD10); today the sheet offers the idea's
    `team` names.
  - The em dash in the lead and empty texts becomes " - ".
- Design after the pages in the navigation, once 10-Q1 is answered.

### Layout (desktop, suggestion)

```
Ideas from the organisation                       [Sort: Most criteria met ▾] [Status ▾]
Each idea is tagged on three case criteria - strategic fit, urgency and the manager
KPI it moves. No score, no ranking of people.
┌ 12 of 18 ────────────────────────────────┐ ┌ Selected idea ───────────────────────┐
│ Strategic fit · Urgent · Scrap rate      │ │ Shared supplier scorecard            │
│ Shared supplier scorecard   [Awaiting d.]│ │ [Awaiting decision] waiting 6 days   │
│ solves: Late supplier parts · 2 weeks    │ │ One sheet per supplier, updated …    │
│ €40k / yr · raised by L. Brandt          │ │ €40k / yr      2 weeks               │
├──────────────────────────────────────────┤ │ upside / yr    to find out           │
│ Urgent · OEE                             │ │ 4 co-signed                          │
│ Label printers at every line  [In trial] │ │ [Approve and assign] [Ask a question]│
│ …                                        │ │ Problem it answers · Who would run it│
└──────────────────────────────────────────┘ └──────────────────────────────────────┘
```

### Phone

The list full width; a row opens the selected idea as a full-screen sheet with ✕. Sort and Status as one "Filter ▾"
chip that opens a sheet.

### Content

Namespace `dashboard`.

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Title, lead | `PageHeader` | | Ideas from the organisation · Each idea is tagged on three case criteria - strategic fit, urgency and the manager KPI it moves. No score, no ranking of people. | Ideen aus der Organisation · Jede Idee ist nach drei Kriterien markiert - strategische Passung, Dringlichkeit und die Führungskennzahl, die sie bewegt. Keine Bewertung, kein Ranking von Personen. |
| Sort | menu | | Most criteria met · Longest waiting · Biggest upside · A-Z | Meiste Kriterien erfüllt · Wartet am längsten · Größtes Potenzial · A-Z |
| Status filter | filter chips | with counts | Status · All · Awaiting decision · In trial · Building · Unfunded · Shipped | Status · Alle · Wartet auf Entscheidung · In der Erprobung · Im Bau · Nicht finanziert · Ausgeliefert |
| Criteria | tags, one style | met vs not met | (from `criteriaTags`) | (aus `criteriaTags`) |
| Row meta | meta | | solves: {title} · raised by {by} | löst: {title} · eingebracht von {by} |
| Selected | card | | Selected idea · waiting {n} days · no owner assigned | Ausgewählte Idee · wartet seit {n} Tagen · keine Zuständigkeit zugewiesen |
| Tiles | stat tiles | | expected upside / yr · to find out if it works | erwartetes Potenzial / Jahr · um herauszufinden, ob es funktioniert |
| Primary | black pill | member: co-sign; manager: approve or fund | Co-sign this idea · Approve and assign · Fund a trial | Diese Idee mitunterzeichnen · Genehmigen und zuweisen · Erprobung finanzieren |
| Ask | grey pill | | Ask a question · Questions asked | Frage stellen · Gestellte Fragen |
| Sections | heads | | Problem it answers · Who would run it | Problem, das es löst · Wer es durchführen würde |
| Empty | `EmptyState` | live company vs filtered | No ideas yet · No ideas match | Noch keine Ideen · Keine Idee passt |

### States

- Loading; empty (a real company: the live empty text); no match with *Clear*; a member who co-signed (the button
  reads co-signed); an approved idea with its note.

### Done when

- [ ] Desktop and phone in English, as a member and as a manager; empty, no match; tags in one style. Only after
      10-Q1.

---

## Problems

- **Route:** `/[company]/problems` (`?id=` selects a row)
- **Who:** every role.
- **Phase:** none. MET's minimum group size of 5 applies to its people counts.
- **Data:** the seed's problems model: `scopedProblems(ctx)` over `D.problems` (`ReducedProblem`: `title`, `sub`,
  `detail`, `people`, `spark`, `trend` Worsening / Flat / Improving, `owner` none / ideas / trial, `depts`, `months`,
  `age`, `timeLost`, `signals` with quotes and `by`, `ideas`); the discovery box from `seed.metrics.discovery` (demo
  companies only); `sortProblems`, search `problemHay`.
- **Today:** `components/dashboard/shared/ProblemsView.tsx`: `ViewHead` "Problems named by employees" with sort and two
  filters (Trend, Ownership), a discovery-round box ("{done} of {total} interviewed"), a list (title, sub, a large
  people count, a sparkline, trend and ownership pills, departments, source, first raised) and a selected card (people
  affected and time lost tiles, "In their words" quotes, ideas against it). **Not in the simple shell's navigation**;
  reached from the Ideas page ("Problem it answers") and search.

**Purpose:** see which problems hurt the most people and how they develop, with the ideas raised against each.

### What stays / what changes

- **Stays:** list and selected item; sort and the two filters; the quotes; the linked ideas.
- **Changes:**
  - The people count is a fact on the row, not the largest thing on it. Where a department filter is on and fewer
    than 5 people stand behind a count, the count is `TooFewToShow` *(proposal, not in any plan; MET's rule applied
    here)*.
  - Trend and ownership are one `StatusBadge` each in the same family; the sparkline uses chart colours from the
    elements page.
  - The discovery-round box shows only on demo companies (its numbers are seed data; no plan records interviews).
    10-Q2.
  - A quote shows the name only when the person chose to sign it (today `by`); otherwise "Anonymous".
- Design after the pages in the navigation, once 10-Q2 is answered.

### Layout (desktop, suggestion)

```
Problems named by employees                     [Sort ▾] [Trend ▾] [Ownership ▾]
Root problems clustered from 412 signals. People choose whether to sign their name.
┌ 9 of 9 ──────────────────────────────────┐ ┌ Selected problem ────────────────────┐
│ Late supplier parts at Werk Süd          │ │ Late supplier parts at Werk Süd      │
│ Line stops while parts wait at the gate  │ │ …detail…                             │
│ [Worsening] [No owner] Logistics ·       │ │ 38 people affected · 120 h / month   │
│ Assembly · first raised 4 months ago     │ │ In their words                       │
│ 38 people affected   ▂▃▅▆▇               │ │ "We stop line 4 twice a week …"      │
├──────────────────────────────────────────┤ │  - Anonymous                         │
│ …                                        │ │ Ideas against this problem           │
└──────────────────────────────────────────┘ └──────────────────────────────────────┘
```

### Phone

As Ideas: list full width, the selected problem as a full-screen sheet, filters in one sheet.

### Content

Namespace `dashboard`.

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Title, lead | `PageHeader` | | Problems named by employees · Root problems clustered from {signals} signals. People choose whether to sign their name. | Von Mitarbeitenden genannte Probleme · Grundprobleme, gebündelt aus {signals} Hinweisen. Die Leute entscheiden selbst, ob sie mit Namen unterschreiben. |
| Sort | menu | | Most people affected · Getting worse fastest · Longest open · A-Z | Meiste Betroffene · Verschlechtert sich am schnellsten · Am längsten offen · A-Z |
| Filters | filter chips | | Trend · Worsening · Flat · Improving · Ownership · No owner · Ideas submitted · Fix in trial | Trend · Verschlechtert sich · Gleichbleibend · Verbessert sich · Zuständigkeit · Keine Zuständigkeit · Ideen eingereicht · Fix in der Erprobung |
| People | row fact | `TooFewToShow` below 5 with a department filter | {n} people affected | {n} betroffene Personen |
| Row meta | meta | | {departments} · first raised {age} | {departments} · zuerst eingebracht {age} |
| Selected | card | | Selected problem · est. time lost / month · In their words · Ideas against this problem | Ausgewähltes Problem · geschätzter Zeitverlust / Monat · In ihren Worten · Ideen gegen dieses Problem |
| Discovery | `InfoPanel` | demo companies only (10-Q2) | Discovery round {n} · {done} of {total} interviewed | Entdeckungsrunde {n} · {done} von {total} befragt |
| Empty | `EmptyState` | | No problems recorded yet · No problems match | Noch keine Probleme erfasst · Kein Problem passt |

### States

- Loading; empty; no match; a count hidden as too few; a problem without ideas against it.

### Done when

- [ ] Desktop and phone in English; a hidden count; empty and no match; demo company with the discovery box. Only
      after 10-Q2.

---

## Collaboration

- **Route:** `/[company]/collaboration` (`?id=` selects a project)
- **Who:** every role.
- **Phase:** IDN-S1 removes `viewerOf`, which this page still uses (`visibleProjects(S, viewerOf(ctx), demo)`);
  HD5 and HD10 apply. No phase redesigns it.
- **Data:** projects as initiatives (`asInitiatives(visibleProjects(…))`, status, members, `stuckOn` with a person's
  name and a reason), the people directory `D.people` (name, role, dept, `reportsTo` by name), `features/org`
  (`layoutTree`, `chainEdges`, `coworkersOf`, `projectsOf`, `namedMembers`).
- **Today:** `components/dashboard/shared/CollaborationView.tsx`, three windows: a **map** (a mind map of the selected
  project or person above a pan-and-zoom org chart, edges coloured and dashed by status, "waiting here" marked on a
  person), a **Projects** window (search, sort, filter "Stuck on someone", 5 a page) and a **People** window (search,
  sort by name, department or role, On it / Works with / Everyone, 8 a page). Selection is by name. **Not in the
  simple shell's navigation**; the old rail counted its initiatives; reachable by its address only.

**Purpose:** see who works with whom across departments and where a project waits, without ranking anyone.

### What stays / what changes

- **Stays:** the projects list with search, sort and filter; a directory of people with their role and unit (a
  directory is fine under HD5); the link from a project to its project page.
- **Changes:**
  - **Waiting is on a role, not a person.** "Stuck on someone", "waiting here" and "waiting on them" mark a person as
    where work stalls, visible to everyone: that is a person signal (HD5). A project waits at a desk: "Waiting at
    Purchasing lead Süd". The person's own row carries no marker. Needs `stuckOn` as a role *(proposal, not in any
    plan)*.
  - **Selection by id**, not by name (HD10, IDN-S1).
  - **The org chart** is the company's Org tree (units and roles, `OrgUnit`, `OrgRole`) read-only, not the seed's
    `reportsTo` names; the same tree the Org settings page edits ([01 Org](01-settings-and-structure.md#org)). 10-Q3.
  - Map colours from the elements page (no orange), one line style per status, a legend in words.
- Design after the pages in the navigation, once 10-Q3 is answered.

### Layout (desktop, suggestion)

```
Collaboration across departments
Every project, the units and roles on it, and where it waits. Pick a project or a role.
┌ Map ───────────────────────────────────────────────────────────────────────────┐
│ Retrofit kit line 4 · waiting at Purchasing lead Süd                 [Running] │
│            (Quality lead Süd)───(Retrofit kit line 4)───(Assembly lead Süd)     │
│                                      ┆                                         │
│                            (Purchasing lead Süd) waiting since 4 Nov           │
│ ── running  ┄┄ waiting on a decision   [Zoom out] [Zoom in] [Fit all]          │
└────────────────────────────────────────────────────────────────────────────────┘
┌ Projects · 5 of 12 ──────────────────┐ ┌ People ──────────────────────────────┐
│ [Search projects] [Sort ▾] [Filter ▾]│ │ [Search people] ( On it | Everyone ) │
│ Retrofit kit line 4    waits at desk │ │ (HS) H. Sander  Quality lead Süd     │
│ …                       ( ‹ ) ( › )  │ │ …                      ( ‹ ) ( › )   │
└──────────────────────────────────────┘ └──────────────────────────────────────┘
```

### Phone

Projects list first; the map opens full screen from a project; People as a second tab.

### Content

Namespace `dashboard`.

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Title, lead | `PageHeader` | new lead (roles) | Collaboration across departments · Every project, the units and roles on it, and where it waits. Pick a project or a role. | Zusammenarbeit über Abteilungen hinweg · Jedes Projekt, die Einheiten und Rollen darin und wo es wartet. Wähle ein Projekt oder eine Rolle. |
| Waiting | meta + `StatusBadge` | at a role, never on a person *(proposal)* | Waiting at {role} · since {date} | Wartet bei {role} · seit {date} |
| Legend | words | | running now · waiting on a decision · proposed, nobody assigned · shipped | läuft gerade · wartet auf eine Entscheidung · vorgeschlagen, niemand zugewiesen · ausgeliefert |
| Map tools | icon buttons | | Zoom out · Zoom in · Fit all | Verkleinern · Vergrößern · Alles einpassen |
| Projects | list | 5 a page | Projects · Search projects · Waiting at a desk · Open the project → | Projekte · Projekte suchen · Wartet an einem Tisch · Projekt öffnen → |
| People | directory | name, role, unit; no marker on a person | People · Search people · On it · Everyone | Personen · Personen suchen · Dabei · Alle |
| Empty | `EmptyState` | | Nothing to map yet. | Noch nichts zum Darstellen. |

### States

- Loading; no projects; a project selected; a role selected; a project waiting at a vacant role ("Vacant").

### Done when

- [ ] Desktop and phone in English with a waiting project shown at a role, no person marked; the directory. Only
      after 10-Q3.

---

## Progress

- **Route:** `/[company]/progress`
- **Who:** every role.
- **Phase:** TRUTH-A1 of the [defensible-offer Codex plan](../2026-11-02_defensible-offer-codex.md) removes the
  "most relied-on contributors" ranking and every per-person number now, ahead of MET (spec
  [11](11-defensible-offer-pages.md#removed-contributor-ranking-and-person-pages)); MET (numbers from the log instead
  of the seed; no Bauplan yet), LOOP (projects switch). HD5.
- **Data:** with projects on, `ProjectMovement` (`measuredProjects`, `movement`, `projectWaits`, and three counts from
  the seed's `S.ledger`: `projectsEscalated`, `measuresOwed`, `unmeasured`); then `funnel(N, t)` (demo numbers only),
  `D.outcomes`, `stalled(D)`, `seed.metrics.answered`, `contributors(D, handle)`.
- **Today:** `components/dashboard/shared/ProgressView.tsx`, "Does the system actually move": **Movement since
  baseline** (each measured project's before and after, with verdict), **Wait ledger, after the yes** (five tiles),
  **How ideas actually move** (a twelve-month funnel, "Read the width, not the number"), **Did the shipped ones
  deliver**, **Stuck the longest**, **Did anyone answer them** (four tiles and the **Most relied-on contributors**
  list with each person's signals and ideas). In a real company most cards show "—". **Not in the simple shell's
  navigation**; linked from Collaboration ("See the outcome").

**Purpose:** show whether decided work moves and pays off, counted per project and per company, never per person.

### What stays / what changes

- **Stays:** Movement since baseline (real project data, worse verdicts shown too); the wait ledger after the yes.
- **Changes:**
  - **Most relied-on contributors goes** (TRUTH-A1, before MET; HD5). So does every per-person number on the page.
  - The funnel, "Did anyone answer them" and "Stuck the longest" either come from the log (MET) or go; they are seed
    numbers today. The answered numbers duplicate the Dashboard's tiles (04). 10-Q4.
  - The ledger's three seed counts come from the projects (`p.escalated`, open checks past due, done without a
    number) *(MET Bauplan)*.
  - Fewer, calmer numbers: one stat tile style; red only for a late count.
- Design after the pages in the navigation, once 10-Q4 is answered.

### Layout (desktop, suggestion)

```
Does the system actually move
Measured projects before and after, and where decided work waits.
┌ Movement since baseline ────────────────┐ ┌ Wait ledger, after the yes ─────────┐
│ P-12 · Retrofit kit line 4    [better]  │ │ 6 days        decided → started     │
│ Scrap rate, lower is better             │ │ median of 8 · 2 not started yet     │
│ 30 days  4.1 % → 3.6 %  −12 %           │ │ 21 days       done → measured       │
│ P-9 · Shared forklift booking  [same]   │ │ 1   late starts or measures moved   │
│ …                                       │ │ 2   measures owed, past their day   │
└─────────────────────────────────────────┘ │ 1   done without a number           │
                                            └─────────────────────────────────────┘
```

### Phone

The two cards stacked; tiles two per row.

### Content

Namespaces `dashboard` and `projects`.

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Title, lead | `PageHeader` | new lead | Does the system actually move · Measured projects before and after, and where decided work waits. | Bewegt sich das System wirklich · Gemessene Projekte vorher und nachher, und wo entschiedene Arbeit wartet. |
| Movement | card + list | `projects` on; verdict as `StatusBadge` | Movement since baseline · The number before the start against the number at each check. The verdict is computed, and worse shows too. | Entwicklung seit dem Ausgangswert · Die Zahl vor dem Start im Vergleich zur Zahl bei jeder Prüfung. Das Urteil wird berechnet, auch ein schlechteres wird gezeigt. |
| Wait ledger | card + stat tiles | counts and medians only | Wait ledger, after the yes · Where projects wait. Counts only - nobody's speed. · decided → started · done → measured · late starts or measures moved to a deputy · measures owed, past their due day · done without a number (not measured) | Wartebuch, nach dem Ja · Wo Projekte warten. Nur Zahlen - nicht das Tempo einzelner Personen. · entschieden → gestartet · erledigt → gemessen · überfällige Starts oder Messungen, an eine Vertretung übergegangen · ausstehende Messungen, über ihrem Fälligkeitstag · erledigt ohne Zahl (nicht gemessen) |
| Empty | `EmptyState` | no measured project | Nothing measured yet. The first check opens {count} days after a project is done. *(new key)* | Noch nichts gemessen. Die erste Prüfung öffnet {count} Tage, nachdem ein Projekt erledigt ist. *(neuer Schlüssel)* |
| Projects off | `EmptyState` | | Progress shows once projects are on for {company}. *(new key)* | Der Fortschritt erscheint, sobald Projekte für {company} eingeschaltet sind. *(neuer Schlüssel)* |

### States

- Loading; projects off; nothing measured yet; a worse verdict.

### Done when

- [ ] Desktop and phone in English with the two cards, a worse verdict, empty and projects-off states; no per-person
      number anywhere. Only after 10-Q4.

---

## My reports

- **Route:** `/[company]/reports`
- **Who:** every signed-in person, their own reports only. The same list renders in `/admin` → Tickets with the
  reporter and forwarding shown (`admin` prop).
- **Phase:** none.
- **Data:** `ticketsOf(companyId, userId)` (`lib/db/tickets.ts`, `TicketListRow`: `number`, `kind` bug / idea /
  question, `impact`, `status` new / in_progress / fixed / closed, `description`, `expected`, `createdAt`,
  `assignee`, `hasScreenshot`, `replies`); `ticketLabel(number)`; the screenshot at
  `/api/{company}/tickets/{id}/screenshot`; replies arrive through `server/tickets-sync.ts`.
- **Today:** `components/report/ReportsView.tsx`: "My reports", a lead line, one item per report (label, kind and
  impact, status, the text, expected, date · created by you · assigned to, the screenshot, the NextUp team's
  replies). This is the list of bug reports sent with the bug icon, not a data report. **Not in the simple shell's
  navigation**; linked from the profile menu ("My reports →", server mode only) and from the bug dialog's sent
  confirmation.

**Purpose:** let a person follow what they reported to the NextUp team and read the answers.

### What stays / what changes

- **Stays:** one item per report, newest first, with its status, text, screenshot and replies; the `/admin` variant.
- **Changes:**
  - Status as `StatusBadge` (Received, Being worked on, Fixed, Closed); kind and impact as one meta line; the ticket
    label as a code.
  - Replies as a thread under the report, the NextUp team as the sender.
  - The screenshot as a thumbnail that opens full size.
- Design after the pages in the navigation, once 10-Q5 is answered.

### Layout (desktop, suggestion)

```
My reports
What you sent with the bug icon, bottom left, and what the NextUp team answered.
┌──────────────────────────────────────────────────────────────────────────────┐
│ NU-104  Bug · blocks work                                         [Fixed]    │
│ The board does not save a card moved on the phone.                           │
│ Expected: the card stays in Doing.                                           │
│ 3 Nov 2026, 14:20 · created by you · assigned to NextUp support             │
│ [screenshot thumbnail]                                                       │
│ ┌ NextUp team · 4 Nov 2026, 09:12 ─────────────────────────────────────────┐ │
│ │ Fixed in today's update. Thanks for the report.                          │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Phone

Items full width; the screenshot full width under the text.

### Content

Namespace `report`.

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Title, lead | `PageHeader` | | My reports · What you sent with the bug icon, bottom left, and what the NextUp team answered. You also get a mail for every reply. | Meine Meldungen · Was du mit dem Bug-Symbol unten links gesendet hast und was das NextUp-Team geantwortet hat. Zu jeder Antwort bekommst du auch eine Mail. |
| Kind, impact | meta | impact for bugs only | Bug · Idea · Question · blocks work · annoying · cosmetic | Fehler · Idee · Frage · blockiert die Arbeit · nervig · kosmetisch |
| Status | `StatusBadge` | | Received · Being worked on · Fixed · Closed | Eingegangen · In Bearbeitung · Behoben · Geschlossen |
| Meta | meta | | Expected: · Created by {who} · you · Assigned to {who} · Not assigned yet | Erwartet: · Erstellt von {who} · dir · Zugewiesen an {who} · Noch nicht zugewiesen |
| Reply | thread item | | NextUp team | NextUp-Team |
| Empty | `EmptyState` | | Nothing yet. When something breaks or you have an idea, press the bug icon at the bottom left. | Noch nichts. Wenn etwas kaputtgeht oder du eine Idee hast, drücke unten links auf das Bug-Symbol. |
| Offline | meta | no database (offline demo) | Reports need the database, and this is the offline demo. | Meldungen brauchen die Datenbank, und das hier ist die Offline-Demo. |

### States

- Empty; offline demo; a report with replies; a report with a screenshot; the `/admin` variant (reporter, forwarded).

### Done when

- [ ] Desktop and phone in English: a report with a screenshot and two replies, empty, offline. Only after 10-Q5.

---

## Open questions added by this file

| # | Question | Default |
|---|---|---|
| 10-Q1 | Ideas (`/ideas`) is not in the navigation and shows the seed's ideas model, not the cases raised on `/raise`; a real company sees it empty. Does it stay, merge into another page (Feed or the Projects hub's Ideas column, which show the real cases), or go? | Keep the route out of the navigation; design it only after the pages in the navigation. MET or LOOP decides whether it reads cases. |
| 10-Q2 | Problems (`/problems`): same question. Its people counts, trend and discovery round are seed data. | Keep the route out of the navigation; design it after the pages in the navigation; the discovery box shows on demo companies only. |
| 10-Q3 | Collaboration (`/collaboration`) is person-centric (who is "waiting here") and draws its org chart from names. Stays, merges, or goes? | Keep the route out of the navigation; design it after the pages in the navigation, role-centric: waiting at a role, the Org tree read-only, a plain directory. |
| 10-Q4 | Progress (`/progress`) overlaps the Dashboard (04) and carries MET's removed ranking. Stays, merges, or goes? | Keep the route out of the navigation; design it after the pages in the navigation with only Movement since baseline and the wait ledger after the yes; the rest goes in MET. |
| 10-Q5 | My reports (`/reports`) is reached only from the profile menu and the bug dialog. Stays, merges into Profile, or goes? | Keep the route and those two links; design it after the pages in the navigation. |
| 10-Q6 | The project page's team list shows "{n} open" per person (open steps they own). Remove it as a per-person count (HD5, MET)? | Remove; the board's person filter shows a person's steps on demand. |
| 10-Q7 | Project day counts (step age, cycle time, running, due) count calendar days. Move them to working days like cases (CLK/D9)? | Dates on the page now; counts stay calendar days, written out ("4 days"), until LOOP or CLK moves projects onto the working-day clock. |
| 10-Q8 | Collaboration's "waiting at a role" needs `stuckOn` as a role id instead of a person's name. Who builds it? | Nobody yet: draw it; build it only with 10-Q3 decided and the data from MET or IDN. |
