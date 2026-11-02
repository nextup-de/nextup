# 04 · Everyday app: real data, the loop and the decision log

> **Plan · 2026-11-02 · open: page specs for Sam. Part of [the pilot pages plan](../2026-11-02_pilot-pages.md); read its
> ground rules and shared building blocks first.**
> Nine pages people open every day: Dashboard, Feed, Overview, Person page, the publishing step of Raise, the Case
> page, Inbox and My cases, Profile, and the new Decision log. Eight are redesigns of screens that work today: keep
> their look (the Claude Design handoffs converted 1:1, `design-system/ui_kits/app/`) and change what they show:
> stand-in numbers become log numbers, people become roles, calendar days become working days. Design them third,
> after the settings and connector pages (01-03).

Context for this file:

- **MET and LOOP have no Bauplan yet.** Dashboard, Feed, Overview, Person page, the publishing step and the Decision
  log follow their PILOT briefs (`hauptplaene/PILOT.md` ### MET, ### LOOP) and may change when those Baupläne are
  written. Data they need that no plan names is marked *(proposal, not in any plan)*.
- **Bauplan VIS:** D4 the visibility rule (`canOpen`, raiser's choice, desk, invitees, managers), D7 readers
  `inboxView`, `caseView`, `visibleCaseIds`, `metricInputs`, D8 and D9 the window (open cases plus the last 90 working
  days, at most 500 cases; older cases load on their page through `loadCaseLog`; a case the viewer may not open is a
  404), D10 the raiser's audience by id (`seenByUserIds`, `seenByUnitIds`). Tasks VIS-A1 (rule, audience picker in
  `RaiseMenu.tsx` / `RaisePublish.tsx`), VIS-C1 (filtered log, case page loads on demand). VIS has no paging in the UI:
  the window replaces it.
- **Bauplan CLK:** D8 clock mode (demo or workdays), D9 dates on pages (`features/cases/rows.ts` shows day n as
  `dateOfWorkday(n)`, every rule counts working days), D10 and D11 `clock.due` facts (at a deadline the owner keeps
  the case and the escalation role gets it too). Tasks CLK-B1 (page dates), CLK-C1 (escalation from due facts).
- **Bauplan IDN:** D8 desk by role (`onDeskOf`: everyone who holds the role of the seat a case sits on has it on
  their desk), seats (`SeatRow`, `deskSeats`), IDN-P1 (dashboards and case helpers on ids), IDN-S1 (hand-over by seat,
  shell, profile). **Bauplan AIP:** D9 proposal made on the server (`RouteProposal.source` "keywords" or "llm"), D10
  `overrideRate` per company, no per-person number. **Bauplan NTF:** D8 gating, D12 digest, NTF-D1 (the "Mails"
  section on the profile, `setNotifyPrefAction`, `NotifyPreference` rows).
- Today: `components/dashboard/shared/DashboardBoard.tsx`, `team/FeedView.tsx`, `team/DashboardView.tsx` (the
  Overview table), `shared/CaseDetailView.tsx`, `leader/InboxView.tsx`, `team/SentView.tsx`,
  `components/ideas/{PublishPreview,RaisePublish,IdeaCard,RaiseMenu}.tsx`, `components/profile/ProfileView.tsx`. The
  stand-ins `dashboardPreview.ts`, `feedPreview.ts`, `overviewPreview.ts` and `raisePreview.ts` go in MET and LOOP.
  `components/dashboard/manager/OverviewView.tsx` is imported by no page on main.
- Text namespaces: `dashboard` (Dashboard, Case page), `team` (Feed, Overview, My cases), `leader` (Inbox), `ideas`
  (publishing step), `profile` (Profile, Person page), new `decisions` *(proposal)* (Decision log).

Three rules that recur on every page of this file:

| Rule | EN | DE |
|---|---|---|
| A desk is a role first, its people second. Two holders: both names; three or more: the first two and "+n". A vacant role shows the role only. | Quality lead Süd · H. Sander, L. Brandt | Qualitätsleitung Süd · H. Sander, L. Brandt |
| In a real company (workdays mode, CLK/D8) every count of days is working days and every day is a date; "Today" and "Yesterday" stay relative. Demo companies keep today's day labels. | 3 working days left · due Fri 14 Nov | noch 3 Arbeitstage · fällig Fr., 14. Nov. |
| Wherever a routing proposal shows and the AI is off or did not answer (`source: "keywords"`), the AI-off line replaces the AI wording. | Routed by keywords - the AI is off for this company. | Nach Stichwörtern zugeordnet - die KI ist für diese Firma aus. |

---

## Dashboard

- **Route:** `/[company]/dashboard` (redesign)
- **Who:** managers (`ROLE_ACCESS["/dashboard"]`; their home page, `ROLE_HOME.manager`)
- **Phase:** MET (no Bauplan yet). Reads VIS `metricInputs(companyId, from, to)`, AIP `overrideRate(events, from, to)`,
  CLK's working days and `clock.due` facts; hands PIL `pilotReport(companyId, from, to)`.
- **Data:** per case from `metricInputs` (status, route, `dueDay`, `lastDay`; MET adds the day of the first answer
  *(MET Bauplan)*); route → owner role → unit (`Route`, `OrgRole`, `OrgUnit`); `clock.due` kind deadline (escalations);
  `case.decided`, `case.asked`, `case.handed`, `case.discussion` (how cases were answered); `case.affected` (support);
  `project.measured` (pay-off); `overrideRate`. Baseline period *(proposal, not in any plan: MET stores `{ from, to }`
  in `CompanyConfig`)*.
- **Today:** `DashboardBoard.tsx`, the handoff 1:1: six KPI tiles, "Ideas raised per month", "Ideas per stage",
  "How team leads answered" with a per-lead table, "Did shipped work pay off", "Where the waiting goes", three lists.
  The figures come from `dashboardPreview.ts` and the seed's `ledger` and `metrics`, the same for every company; the
  department menu filters nothing.

**Purpose:** show management whether people get an answer on time, per unit and role, against a baseline, counted
from the log.

### What stays / what changes

- **Stays:** the title row with the scope menu on the right; the row of KPI tiles (label, value, delta against the
  baseline, small month bars, a click opens the month-by-month view with the split); the line chart and the stage
  bars side by side; "Did shipped work pay off"; widgets that open in place over a scrim (✕, Escape, click outside).
  Colours: blue for state, red only for a late number.
- **Changes:**
  - Every number comes from the log; `dashboardPreview.ts` is deleted, and so are the seed's `ledger` and `metrics`
    as a source.
  - The tiles become the wait ledger: first answer, answered on time, idea to decision, past the promise now,
    escalated to the deputy, proposal overruled. "Value booked", "Waiting days saved" and "Shipped this year" go: no
    event records them.
  - The per-lead table under "How team leads answered" goes (HD5). A new card **By unit and role** carries the
    breakdown, with `TooFewToShow` below 5 people.
  - "Where the waiting goes" goes: its stall reasons exist only in the seed. *Later* if a phase records a reason.
  - "Ideas by department" goes (the breakdown card replaces it). "Highest AI score" becomes "Highest score": the
    score (`features/scoring`) is not the AI.
  - The scope menu lists units from Org; a period menu and **Export CSV** join it. A baseline replaces the
    hard-coded "before NextUp" months.

### Layout (desktop, ≥ 1200 px)

```
Dashboard                        [All units ▾] [Last 30 days ▾]  [Export CSV]
1 Oct - 31 Oct 2026 · baseline 1 - 30 Sep 2026 · 143 cases

┌ First answer ─────────┐┌ Answered on time ─────┐┌ Idea to decision ─────┐
│ 2 working days        ││ 84 %                  ││ 6 working days        │
│ baseline 4            ││ baseline 61 %         ││ baseline 9            │
│ ▁▂▃▅▆▇                ││ ▁▂▄▅▆▇                ││ ▇▆▅▄▃▂                │
└───────────────────────┘└───────────────────────┘└───────────────────────┘
┌ Past the promise now ─┐┌ Escalated to deputy ──┐┌ Proposal overruled ───┐
│ 7                     ││ 11                    ││ 9 of 112              │
│ of 58 open            ││ baseline 19           ││ by keywords           │
│ ▃▄▂▃▂▂                ││ ▅▄▃▃▂▂                ││ ▃▃▂▂▂▂                │
└───────────────────────┘└───────────────────────┘└───────────────────────┘
  (one row of six at ≥ 1200 px; drawn as 3 × 2 here for width)

┌ Cases raised per month ───────────────┐┌ Open cases per stage ───────────────┐
│ ── raised  ── answered  ── on time    ││  ▆     ▃     ▂     ▅     ▃          │
│ line chart, 6 months, baseline months ││ Sent  Read  Quest. Disc. Building   │
│ on grey                               ││ 21    9     4      14    10         │
│ May Jun Jul Aug Sep Oct               ││ 1.2   0.8   2.1    6.4   (running)  │
└───────────────────────────────────────┘└─────────────────────────────────────┘

┌ By unit and role ─────────────────────────────────────── ( Units | Roles ) ─┐
│ Unit                   Cases  First answer  On time  Past promise  Escal.   │
│ Werk Süd · Quality        38  1.5 wd        89 %     1             2        │
│ Werk Süd · Assembly       52  2 wd          81 %     3             4        │
│ Werk Nord · Logistics   ┌ Too few to show · fewer than 5 people ─────────┐  │
│                         └────────────────────────────────────────────────┘  │
│ Board                     11  3 wd          73 %     0             1        │
│ 1-20 of 41                                                   ( ‹ )  ( › )   │
└─────────────────────────────────────────────────────────────────────────────┘

┌ How cases were answered ──────────────┐┌ Did shipped work pay off ───────────┐
│ ███████████▓▓▓▓▓░░░░▒▒▒▒████          ││ Retrofit kit line   −12 % scrap  ✓  │
│ Yes 64 · Yes, as a project 18 ·       ││ Label printers      +4 % OEE     ✓  │
│ Question 31 · Handed over 14 · No 41  ││ Shared forklift     unchanged    –  │
└───────────────────────────────────────┘└─────────────────────────────────────┘
┌ Most supported ───────────────────────┐┌ Highest score ──────────────────────┐
│ Night-shift handover checklist   23   ││ Shared supplier scorecard      86   │
│ …  8 rows, title · stage · count      ││ …  8 rows, title · stage · score    │
└───────────────────────────────────────┘└─────────────────────────────────────┘
```

- Six tiles in one row at ≥ 1200 px, three per row from 760 to 1199 px. Tile value `--nh-fs-3xl`, tabular figures.
  "wd" in the table is drawn as the unit column header "working days", not as an abbreviation in the cells.
- The baseline is drawn as grey bars in each tile and as grey months in the line chart; the current period is blue.
  A tile whose value is worse than its baseline shows the delta in red; better in ink. Never green.
- *Proposal overruled* is company-wide only (AIP/D10): it never splits by unit, so its detail overlay has no split.
- The breakdown card toggles between **Units** (each unit of the tree, indented under its parent) and **Roles** (each
  role, under its unit). Rows link nowhere: there is no per-desk page.
- *Did shipped work pay off* shows only while the company has projects on (LOOP switch); otherwise the two lists move
  up into its row.

Tile detail overlay (opens in place, like today):

```
84 %  Answered on time                                                     ✕
Share of cases with a yes, a no or a question within 5 working days.
┌ Month by month ───────────── ■ baseline ■ now ┐ ┌ By unit, this period ─────┐
│ 61 %  58 %  63 %  │ 72 %  80 %  84 %          │ │ Quality        ████ 89 %  │
│ ▅     ▄     ▅     │ ▆     ▇     ▇             │ │ Assembly       ███▌ 81 %  │
│ Jul   Aug   Sep   │ Oct   Nov   Dec           │ │ Logistics   Too few to show│
└───────────────────────────────────────────────┘ └───────────────────────────┘
```

### Phone (≤ 760 px)

Tiles in two columns; the scope and period menus become one "Filter ▾" chip that opens a sheet; *Export CSV* moves
into a ⋯ menu next to the title. Cards stack in the order of the desktop page. The breakdown becomes one stacked card
per unit (name, then "38 cases · 1.5 working days · 89 % on time"), the Units/Roles toggle above it.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Title | H1 | | Dashboard | Dashboard |
| Lead | meta line | period, baseline, case count | {from} - {to} · baseline {bfrom} - {bto} · {n} cases | {from} - {to} · Basislinie {bfrom} - {bto} · {n} Fälle |
| Scope menu | menu, unit tree | default all units; a unit includes its sub-units | All units | Alle Einheiten |
| Period menu | menu | default last 30 days | Last 30 days · This quarter · Since go-live · Custom… | Letzte 30 Tage · Dieses Quartal · Seit dem Start · Eigener Zeitraum … |
| Export | grey pill | CSV of the breakdown for the period and scope | Export CSV | CSV exportieren |
| First answer | tile | median working days from `case.raised` to the first yes, no, question or discussion by someone else *(MET Bauplan fixes the events)* | First answer · {n} working days · median | Erste Antwort · {n} Arbeitstage · Median |
| Answered on time | tile | share of cases raised in the period answered within `promise_days`; open cases past the promise count as late, open ones within it do not count | Answered on time · within {days} working days | Rechtzeitig beantwortet · innerhalb von {days} Arbeitstagen |
| Idea to decision | tile | median working days from raise to `case.decided`, ideas only | Idea to decision · {n} working days · median | Idee bis Entscheidung · {n} Arbeitstage · Median |
| Past the promise now | tile | open cases with `dueDay` before today, of all open | Past the promise now · of {n} open | Jetzt über dem Versprechen · von {n} offenen |
| Escalated | tile | `clock.due` kind deadline in the period | Escalated to the deputy · in this period | An die Vertretung eskaliert · in diesem Zeitraum |
| Proposal overruled | tile | `overrideRate`: overridden of proposed; subline by source | Proposal overruled · {o} of {p} · AI proposals · by keywords | Vorschlag übersteuert · {o} von {p} · KI-Vorschläge · nach Stichwörtern |
| Baseline | tile subline | none set: link to the dialog | baseline {value} · No baseline yet. Set one | Basislinie {value} · Noch keine Basislinie. Festlegen |
| Trend card | line chart | raised, answered, answered on time per month, last 6 months | Cases raised per month | Eingebrachte Fälle pro Monat |
| Stage card | bars | open cases per status; days = average working days in that stage; Building is "running", never late | Open cases per stage · Sent · Read · Question out · In discussion · Decided · Building | Offene Fälle pro Phase · Gesendet · Gelesen · Rückfrage offen · In Diskussion · Entschieden · In Umsetzung |
| Breakdown | card + `DataTable` + segmented | 20 rows a page; a row with fewer than 5 people behind it is `TooFewToShow` | By unit and role · Units · Roles · Cases · First answer · On time · Past the promise · Escalated · working days | Nach Einheit und Rolle · Einheiten · Rollen · Fälle · Erste Antwort · Rechtzeitig · Über dem Versprechen · Eskaliert · Arbeitstage |
| Answers card | stacked bar + legend | counts per kind in the period | How cases were answered · Yes · Yes, as a project · Question · Handed over · No | Wie Fälle beantwortet wurden · Ja · Ja, als Projekt · Rückfrage · Übergeben · Nein |
| Pay-off card | rows | `project.measured` verdicts; only with projects on | Did shipped work pay off · Better · Worse · Unchanged · Still measuring | Hat sich die Umsetzung gelohnt · Besser · Schlechter · Unverändert · Wird noch gemessen |
| Lists | two cards, 8 rows | support = people who said "affects me too"; score = `scoreCase` | Most supported · Highest score | Meist unterstützt · Höchste Bewertung |
| AI-off note | grey line under the overruled tile | when the company's AI is off | Routed by keywords - the AI is off for this company. | Nach Stichwörtern zugeordnet - die KI ist für diese Firma aus. |

**Who counts as "behind" a row** (MET, minimum group size 5): for a unit row, the active members whose seats are in
that unit or its sub-units; for a role row, the people holding its seats. Most roles have fewer than 5 holders, so
the Roles view is mostly hidden; its numbers still count in their unit's row. A scope whose unit has fewer than 5
people shows `TooFewToShow` in every tile. Open question 04-Q1.

### Actions

- *Export CSV*: downloads `nextup-dashboard-{company}-{from}-{to}.csv` (UTF-8, semicolon, German decimal comma when
  the viewer's language is German). Columns: unit, role, cases, first answer (working days), on time (%), past the
  promise, escalated. Hidden rows carry "too few" in every number column. No names, no ids of people. Toast "Exported
  {n} rows." / "{n} Zeilen exportiert."
- *Set baseline* (link in a tile, or the period menu's last item "Baseline…"): a small dialog with a from/to date
  range and *Save*. "The baseline is the period every number is compared with. Pick the weeks before the pilot
  started." / "Die Basislinie ist der Zeitraum, mit dem jede Zahl verglichen wird. Wähle die Wochen vor dem
  Pilotstart." Toast "Saved" / "Gespeichert". *(proposal: MET decides where it is stored and whether the company
  admin page sets it instead)*
- A list row opens the case page.

### States

- Loading: `PageSkeleton kind="dashboard"` as today.
- No cases in the period: tiles show "–" and every card its own empty line, "No cases in this period yet." / "In
  diesem Zeitraum gibt es noch keine Fälle."; the trend card keeps its axes.
- Too few people in the scope: every tile is `TooFewToShow`; the cards stay empty.
- AI off: the overruled tile reads "by keywords" and shows the AI-off line.
- Demo company: the same page on the demo company's log; numbers count simulated days (CLK/D14), the lead line adds
  "simulated days" / "simulierte Tage".

### Done when

- [ ] Desktop, tablet and phone frames in German with real-looking numbers; one tile worse than its baseline.
- [ ] The tile overlay; the breakdown in Units and in Roles with `TooFewToShow` rows; the baseline dialog.
- [ ] Empty period, too few in scope, AI off, no baseline yet, projects off (pay-off card gone).

---

## Feed

- **Route:** `/[company]/feed` (redesign)
- **Who:** every role
- **Phase:** MET ("feed on real events", no Bauplan yet); VIS-C1 (only the cases the viewer may open, in the window);
  IDN-P1 (support and comments by id); CLK-B1 (dates)
- **Data:** the cases the viewer may open (`visibleCaseIds` within the VIS window), each with its stage
  (`features/cases/feed.ts` `feedStage`), cover (`features/cases/thumbs.ts`), support (`case.affected` /
  `case.unaffected`, `affectedOn`), comments (`case.commented`, `commentsOn`), score (`scoreCase`), the written brief
  (`briefForCase`), and its latest event.
- **Today:** `FeedView.tsx`, the "Idea Feed" handoff: a grid of cover cards, filters by site and department, sort by
  support or age, Open/Archive tabs; a card opens in place with the five score dials, "What the AI found", Support and
  comments. Likes, replies under a comment and the one-tap reasons are stand-ins (`feedPreview.ts`).

**Purpose:** let everyone browse what colleagues raised, back it, and add what they know.

### What stays / what changes

- **Stays:** the cover grid, the cards' look and lift, the Open/Archive tabs, the opened view (case on the left,
  Support and comments on the right), ↑/↓ and Escape, `?id=` to open one.
- **Changes:**
  - `feedPreview.ts` is deleted: no *Like*, no replies under a comment (one flat thread, as on the case page), no
    "Tell {name} why, in one tap". *Later*, if LOOP adds a reply event.
  - Each card gets a **latest event** line ("Answered yes by Quality lead Süd · 2 days ago"): that is the feed on real
    events. The *Newest* sort becomes *Latest activity* (by `lastDay`).
  - Site and department filters read the Org tree: the first level of units ("Werk Süd", "Werk Nord") and the units
    under the chosen one.
  - The supporter line names a unit only when at least 5 supporters come from it; otherwise it gives the count.
  - "Decision by" names the desk role first.
  - "What the AI found" has an AI-off variant.
  - A footer says what the window holds (VIS/D9).

### Layout (desktop)

```
Feed                   [All sites ▾] [All units ▾]  ( Most supported | Latest activity )
( Open | Archive )

┌ cover ─────────────────┐ ┌ cover ─────────────────┐ ┌ cover ─────────────────┐
│ [Under review]   €18k  │ │ [In discussion]   12 % │ │ [New]                  │
│                        │ │                        │ │                        │
├────────────────────────┤ ├────────────────────────┤ ├────────────────────────┤
│ Night-shift handover   │ │ Shared forklift        │ │ Label printers at      │
│ checklist              │ │ booking                │ │ every line             │
│ Asked a question ·     │ │ Discussion started by  │ │ Raised · today         │
│ Quality lead Süd · 1 d │ │ Logistics lead Nord ·  │ │                        │
│                        │ │ 3 d                    │ │                        │
│ ↑ 23 people back this  │ │ ↑ 7 from Werk Nord     │ │ Be the first to back it│
└────────────────────────┘ └────────────────────────┘ └────────────────────────┘
…
Showing cases open now or moved in the last 90 working days.
```

Opened card (in place, as today):

```
← Feed                                                              ↑ ↓   ✕
┌ Idea · C-1042 ─────────────────────────────────┐ ┌ Support ──────────────┐
│ Night-shift handover checklist                 │ │ ↑ 23 people back this │
│ raised 3 Nov by Anonymous Falcon               │ │ [ Support this idea ] │
│ Affects  Werk Süd · Assembly                   │ ├ Comments ─────────────┤
│ Context  …                                     │ │ (LB) L. Brandt · 4 Nov│
│ (dials) Impact Clarity Fit Urgency Evidence    │ │ We had the same on    │
│ What the AI found                              │ │ line 3 …              │
│  Advice · Why · Next step                      │ │ …                     │
│ Where it stands                                │ │ [Add a comment ] Send │
│  ▬▬▬▬ ▬▬▬▬ ░░░░ ░░░░  Quality lead Süd ·       │ │                       │
│  H. Sander, L. Brandt · 2 working days left    │ │                       │
└────────────────────────────────────────────────┘ └───────────────────────┘
```

### Phone

One card per row, full width; filters as a scrolling chip row; the opened card is full screen with Support and
comments under the case.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Filters | two menus + segmented | sites = first level of units; units = children of the chosen site | All sites · All units · Most supported · Latest activity | Alle Standorte · Alle Einheiten · Meist unterstützt · Letzte Aktivität |
| Latest event | card meta line | the case's newest visible event, actor as desk role when it was a desk holder | Raised · Read by {role} · Asked a question · {role} · Answered yes by {role} · Answered no by {role} · Handed to {role} · Discussion started by {role} · Escalated to {role} · {when} | Eingebracht · Gelesen von {role} · Rückfrage · {role} · Mit Ja beantwortet von {role} · Mit Nein beantwortet von {role} · Übergeben an {role} · Diskussion gestartet von {role} · Eskaliert an {role} · {when} |
| Supporters | card line | unit named only with ≥ 5 from it | {count} people back this · {count} from {unit} back this · You support this · Be the first to back it. | {count} Personen unterstützen das · {count} aus {unit} unterstützen das · Du unterstützt das · Sei die erste Person, die es unterstützt. |
| What the AI found | section | AI off: the section is replaced by the AI-off line | What the AI found · Advice · Why · Next step | Was die KI gefunden hat · Rat · Warum · Nächster Schritt |
| AI off | grey line | | No AI analysis - the AI is off for this company. | Keine KI-Analyse - die KI ist für diese Firma aus. |
| Where it stands | step track + desk strip | desk rule of this file | Where it stands · {role} · {names} · {n} working days left | Stand · {role} · {names} · noch {n} Arbeitstage |
| Window footer | meta | always | Showing cases open now or moved in the last 90 working days. | Zu sehen sind offene Fälle und alles, was sich in den letzten 90 Arbeitstagen bewegt hat. |

### Actions

- *Support this idea / problem* toggles `case.affected` / `case.unaffected`; toast "You back this now." / "Du
  unterstützt das jetzt." A lead is asked why (as today on the case page).
- *Send* posts `case.commented`; the comment appears at once with "you" and today's date.

### States

- Loading: as today. Empty feed: `EmptyState` "Nothing in the feed yet. What people raise shows here." / "Noch nichts
  im Feed. Was Leute einbringen, erscheint hier." No match: "No ideas match these filters." / "Keine Ideen passen zu
  diesen Filtern." Empty archive: as today.
- Anonymous raisers keep their handle ("Anonymous Falcon"); the handle never links to a person page.

### Done when

- [ ] Grid desktop and phone in German, with each kind of latest-event line; the opened card with and without the AI
      (AI-off line); supporter line with and without a unit; empty, no-match and archive states.

---

## Overview

- **Route:** `/[company]/overview` (redesign). With the projects flag on it is the "Ideas" column of
  `ProjectsHub` (same page as `/projects`); with it off, the table full width.
- **Who:** every role; the rows are what the viewer may open (VIS/D4): a member their own and those shared with them,
  a leader also their desk's and their reports', a manager every case in the window.
- **Phase:** MET (no Bauplan yet; `overviewPreview.ts` removed), VIS-C1 (rows from the filtered log), IDN-P1 (desk and
  "Your move" by id), CLK-B1 (dates)
- **Data:** visible cases with `dashboardRow()` (`features/cases/rows.ts`): title, kind, raised day, status, step,
  desk (`assigneeSeatId` / `assigneeRoleId`, escalation role), clock; comments (`case.commented`), versions
  (`case.revised`), the raiser's answers (`case.answered`).
- **Today:** `team/DashboardView.tsx` ("Overview" handoff): a table What / Open since / Stage / On whose desk /
  Status, filters All, Your move, Problems, Ideas, Mine, two sorts, Open/Archive tabs. A row opens the case in place
  (`OverviewIdea`, `OverviewChats`); edits, chats with people, the raiser's response to an answer and replies are
  stand-ins in `overviewPreview.ts`. A name opens a person card.

**Purpose:** one table of every problem and idea the viewer may see: how long it is open, where it stands, on whose
desk, and whose move it is.

### What stays / what changes

- **Stays:** the table and its five columns, the filters and sorts, the Open/Archive tabs, the case opening in place
  with ✕ and Escape, the phone layout (`OverviewPhone`).
- **Changes:**
  - `overviewPreview.ts` is deleted. The opened case shows the real comment thread and the raiser's real versions
    (`case.revised`, as `VersionsPanel` on the case page). Editing the idea in place, "Start a chat with …" and the
    raiser's one-tap response to an answer go; a raiser answers a question with *Answer the question*
    (`case.answered`), which exists.
  - **On whose desk** shows the role first, its people second, and the escalation role when there is one.
  - **Open since** shows a date and working days in a real company.
  - The person card on a name shows the person's seats, not counts (as the Person page).
  - Paging: `DataTable` paging, 50 rows a page; a window footer under it.
  - `components/dashboard/manager/OverviewView.tsx` (no page imports it) and the name-based `desks()` in
    `features/metrics/overview.ts` are deleted in MET.

### Layout (desktop)

```
Overview                                            [Filter: All ▾] [Sort ▾]
( Open | Archive )
┌ Problems and ideas ─────────────────────────────────────────────────────────┐
│ What                         Open since       Stage      On whose desk          Status      │
│ Night-shift handover check…  3 Nov · 4 wd     ▬▬░░░      Quality lead Süd ·     Your move   │
│ Idea · Werk Süd · Assembly                               H. Sander, L. Brandt               │
│ Shared forklift booking      28 Oct · 7 wd    ▬▬▬░░      Logistics lead Nord ·  In discuss. │
│ Idea · Werk Nord · Logistics                             M. Keller              round 2 of 3│
│ Scrap bins overflow at L4    21 Oct · 12 wd   ▬▬░░░      Assembly lead Süd      Waiting     │
│ Problem · Werk Süd                       red: 7 past     + Plant manager Süd    past promise│
│ …                                                                                           │
│ 1-50 of 312                                                        ( ‹ )  ( › )             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
Showing cases open now or moved in the last 90 working days.
```

"wd" stands for the column's unit; draw it as "4 working days" when the column is wide enough, and the number alone
with the header "Open since · working days" when it is not.

### Phone

As today (`OverviewPhone`): one card per case (title, stage track, desk line, status pill); the opened case full
screen.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Columns | table header | | What · Open since · Stage · On whose desk · Status | Was · Offen seit · Phase · Auf wessen Tisch · Status |
| Open since | cell | date + working days; red when past the promise | {date} · {n} working days · {n} past the promise | {date} · {n} Arbeitstage · {n} über dem Versprechen |
| Desk | cell, two lines | desk rule; escalation on the second line with "+" | {role} · {names} · + {escalationRole} | {role} · {names} · + {escalationRole} |
| No desk | cell | a case whose seat is unknown (IDN/D8) | No desk yet - a manager assigns it | Noch kein Tisch - eine Führungskraft weist ihn zu |
| Filters, sorts, status | as today | strings exist in `team` | All · Your move · Problems · Ideas · Mine · Your move first · Longest waiting | Alle · Du bist dran · Probleme · Ideen · Meine · Du zuerst · Am längsten wartend |
| Paging | `DataTable` | 50 a page | {from}-{to} of {n} | {from}-{to} von {n} |
| Window footer | meta | | Showing cases open now or moved in the last 90 working days. | Zu sehen sind offene Fälle und alles, was sich in den letzten 90 Arbeitstagen bewegt hat. |

### Actions

- A row opens the case in place (or `/cases/<id>` in the static demo, as today). A role or name in the desk cell
  opens the person card of that person.

### States

- Empty for a member: "You have not raised anything yet." + *Raise the first one →* (exist). Empty for others:
  "Nothing here yet." (exists).
- New user without a seat: the plan's state "You are signed in, but no role in {company} is yours yet…" above the
  table; *Your move* is then empty.

### Done when

- [ ] Desktop table (flag off) and the Ideas column inside the Projects hub (flag on), phone list, the opened case
      with real comments and versions; a row past the promise, an escalated row, a row without a desk; in German.

---

## Person page

- **Route:** `/[company]/people/[name]` (redesign). The route is keyed by display name, which HD10 rules out for
  deciding who someone is; proposal: `/people/[userId]` with the name only shown *(proposal, not in any plan; IDN/D14
  left the people pages to ADM, the MET brief removes their counts)*.
- **Who:** every signed-in role. Anonymous handles have no person page.
- **Phase:** MET (counts removed; no Bauplan yet)
- **Data:** `User` (name, email, department), the person's seats (`OrgRoleHolder.userId` → `OrgRole` title,
  `decides`, `reportsToId` → `OrgUnit`), the role they report to and its holders, the other seats of the same unit.
  Never the personnel number (HD14).
- **Today:** `ProfileView.tsx` with a `target`: hero (avatar, name, role · department, location from the demo
  profiles, *Email*), a stats strip (cases raised, ideas, collaborations), "Shared work" (up to 6 ideas and
  collaborations), Details, "People nearby" (manager and four colleagues). The page returns not-found for any user
  with a `handle`, and IDN-C1 gives every member a handle.

**Purpose:** show who a person is and which roles they hold, so a colleague knows whom a case reaches through them.

### What stays / what changes

- **Stays:** the hero (avatar on the person's tint, name, a line under it, *Email ↗*), the two-column body, the
  Details card, the linked list of people on the side.
- **Changes:**
  - The stats strip goes (MET: no per-person number).
  - "Shared work" goes: a list of one person's ideas is a per-person tally *(open question 04-Q2, default removed)*.
  - A **Roles** card lists the person's seats: role, unit path, what the role decides, who else holds it.
  - "People nearby" becomes **Reports to** (the role above, with its holders) and **Same unit** (up to 6 other seats).
  - Location goes (demo-only data).
  - The page finds the person by user id, not by name, and no longer hides people who have a handle.

### Layout (desktop)

```
← Back
┌──────────────────────────────────────────────────────────────────────────────┐
│ (LB)  L. Brandt                                                  [ Email ↗ ] │
│       Quality lead Süd · Werk Süd › Quality · Acme Automotive                │
└──────────────────────────────────────────────────────────────────────────────┘
┌ Roles ──────────────────────────────────────────┐ ┌ Details ──────────────────┐
│ ┌ InfoPanel ──────────────────────────────────┐ │ │ Department  Quality       │
│ │ Quality lead Süd                            │ │ │ Email  l.brandt@acme.de   │
│ │ Werk Süd › Quality                          │ │ └───────────────────────────┘
│ │ Decides  scrap rule · supplier claims       │ │ ┌ Reports to ───────────────┐
│ │ Shares the role with (HS) H. Sander         │ │ │ Plant manager Süd         │
│ └─────────────────────────────────────────────┘ │ │ (MK) M. Keller          → │
│ ┌ InfoPanel ──────────────────────────────────┐ │ ├ Same unit ────────────────┤
│ │ Deputy plant manager Süd                    │ │ │ Quality engineer          │
│ │ Werk Süd                                    │ │ │ (TV) T. Vogel           → │
│ └─────────────────────────────────────────────┘ │ │ Quality engineer · Vacant │
└─────────────────────────────────────────────────┘ └───────────────────────────┘
```

The first line under the name is the person's first seat (by sort) and its unit path, then the company. Without a
seat it is the department.

### Phone

Hero, Roles, Details, Reports to, Same unit, stacked. *Email* is a full-width grey button under the hero.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Back | text link | to where the viewer came from, else Overview | ← Back | ← Zurück |
| Hero line | meta | first seat · unit path · company; no seat: department | {role} · {unitPath} · {company} | {role} · {unitPath} · {company} |
| Email | grey pill, mailto | only with an email | Email ↗ | E-Mail ↗ |
| Roles card | `InfoPanel` per seat | role title, unit path, `decides`, co-holders as avatar chips | Roles · Decides · Shares the role with | Rollen · Entscheidet · Teilt die Rolle mit |
| No seat | line in the Roles card | | {name} holds no role in {company} yet. | {name} hat in {company} noch keine Rolle. |
| Details | label/value | department, email | Details · Department · Email | Details · Abteilung · E-Mail |
| Reports to | linked rows | the role their first seat reports to, its holders | Reports to | Berichtet an |
| Same unit | linked rows | up to 6 other seats of the unit; vacant seats unlinked | Same unit · Vacant | Gleiche Einheit · Frei |

### States

- Unknown or deactivated person: the not-found page. A deactivated person's name on old cases stays a label without
  a link.
- Viewing yourself: `/people/<you>` redirects to `/profile`.

### Done when

- [ ] Desktop and phone in German for a person with two seats, one with a co-holder; a person without a seat; the
      not-found case.

---

## Raise: publishing step

- **Route:** `/[company]/raise`, the step after *Publish* (redesign)
- **Who:** every role
- **Phase:** LOOP (no Bauplan yet; PILOT "raise-menu placeholders finished or removed", plan question Q6), VIS-A1
  (the audience by id), AIP-C1 (the proposal made on the server), IDN-A1 (the seat on `case.raised`)
- **Data:** the routing proposal (`RouteProposal { routeId, confidence, source: "keywords" | "llm", version }`, made
  by `proposeOnRaise` at raise, AIP/D9; the page shows the same proposal before sending *(proposal: LOOP calls the
  same function for the preview)*); `Route` (owner role, deputy role, type), the owner role's seats and holders; the
  author's own seat and the role it reports to; `case.raised` payload `routeId`, `assigneeRoleHolderId`, `visibility`,
  `seenByUserIds`, `seenByUnitIds`, `affected`. Promise days (`promise_days`) and the calendar for the due date.
- **Today:** *Publish* → a loading frame → **Last look before it goes out** (`PublishPreview.tsx` with `IdeaCard`:
  title, description, *Request a meeting*, *Raised with* colleagues, *Affects*, context, attachments; the NextUp
  analysis as a locked note; *Export*, *Find receiver*) → **Who should get this?** (`RaisePublish.tsx`: 2-3 people
  with a match %, reasons including "Answered 4 of the last 5 cases on their desk within 5 days", *Choose someone
  else* from the directory) → *Send to {name}*. Receiver, colleagues, meeting and visibility are stand-ins
  (`raisePreview.ts`, see the comment at the top of `Raise.tsx`).

**Purpose:** before an idea goes out, the author checks it once and sends it to the right desk, with one choice of
who may see it.

### What stays / what changes (the finished simplest form, Q6)

- **Stays:** the two windows and their look (kicker, heading, white card, grey foot with the black action), the
  loading frame, the locked analysis note, *Export*, the working glyph in the send button.
- **Changes:**
  - **Requested meeting** goes. **Raised with** (colleagues) goes: to involve people, the desk invites them into a
    discussion (`case.discussion` / `case.invited`), and the author can let them see it (below).
  - **Affects** stays and picks units from Org by id *(proposal, not in any plan: `affectedUnitIds` next to the
    `affected` labels)*.
  - The receiver is a **desk, not a person** (HD5): the proposed route's owner role with its holders, the author's
    lead's role, or another desk picked from a search of roles. No match %, no track record of a person.
  - **Who sees it** moves from the actions menu into this window, with ids (VIS-A1): everyone at the company, only the
    desk, or chosen people and units.
  - The proposal says whether it came from the AI or from keywords (AI-off line).
  - After sending, the page says who owes an answer by which date.

### Layout: last look (desktop, centred window 640 px)

```
Preview · how it lands in their inbox                                       ✕
Last look before it goes out
┌───────────────────────────────────────────────────────────────────────┐
│ Night-shift handover checklist                               (title)  │
│ Each shift writes three lines on open faults before it leaves …       │
│ Affects     [Werk Süd · Assembly ×] [+ Add]                           │
│ Context     Impact · 40 min lost per shift change                     │
│             Already tried · a whiteboard at line 3                    │
│             [+ Add a line]                                            │
│ Attachments [shift-log.pdf ×] [+ Add file]                            │
└───────────────────────────────────────────────────────────────────────┘
(lock) NextUp analysis is attached below this. Generated by NextUp, so it
       can't be edited here.
───────────────────────────────────────────────────────────────────────────
Changes save to your draft                    [Export]  [Choose a desk  ›]
```

### Layout: where it goes (desktop, centred window 560 px)

```
Before it goes out                                                          ✕
Where should it go?
( ● ) Quality lead Süd                                          [Proposed]
      Werk Süd › Quality · H. Sander, L. Brandt
      Why: owns "Scrap and rework"; your idea mentions "Ausschuss",
      "Nacharbeit" · can approve up to €10,000
( ○ ) Assembly lead Süd                                    [Your lead's role]
      Werk Süd › Assembly · M. Keller
( ○ ) Choose another desk                                                  ›
      Search roles and units
┌ AI-off line (grey, keyword icon) ─────────────────────────────────────┐
│ Routed by keywords - the AI is off for this company.                  │
└───────────────────────────────────────────────────────────────────────┘
Who sees it   ( Everyone at Acme | Only the desk | Choose… )
              Choose…: [L. Brandt ×] [Werk Süd · Assembly ×] [+ Add]
───────────────────────────────────────────────────────────────────────────
[Cancel]                                        [↑ Send to Quality lead Süd]
```

- The proposed desk is selected when the window opens. With the AI on and answering, the tag reads "Proposed by the
  AI" and the AI-off line is not there; the reason line is the brain's reason.
- *Choose another desk* expands a search field and up to 5 rows: role title, unit path, holders. Vacant roles are
  listed with "Vacant - waits until someone sits here" and can be chosen.
- No route matches: no row is selected, the first line reads "No desk matches this idea. Choose one." and *Send*
  stays disabled until a desk is chosen *(proposal: today an unrouted case lands on no desk, IDN/D8)*.
- Choosing a desk other than the proposed one needs no extra step; the difference is stored in `case.raised`
  (`proposal.routeId` vs `routeId`) and counted by `overrideRate` (AIP/D10).

After *Send*, the window closes and the page shows the sent state:

```
✓ Sent to Quality lead Süd.
  H. Sander and L. Brandt owe you a yes, a no or a question by Fri 14 Nov.
  [Follow it in My cases →]
```

### Phone

Both windows are full-screen sheets from the bottom; the foot sticks to the bottom; *Who sees it* is a segmented row
that wraps under its label.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Last-look action | black pill | needs title and description | Choose a desk › | Tisch wählen › |
| Affects | chips + unit picker | units by id | Affects · Add | Betrifft · Hinzufügen |
| Window title | | | Before it goes out · Where should it go? | Bevor es rausgeht · Wohin soll es gehen? |
| Desk row | radio row | desk rule; reasons are facts about the role, never about a person | {role} · {unitPath} · {names} · Why: {reasons} | {role} · {unitPath} · {names} · Warum: {reasons} |
| Tags | badge | | Proposed · Proposed by the AI · Your lead's role | Vorgeschlagen · Von der KI vorgeschlagen · Rolle deiner Leitung |
| Reasons | list | from the route and the role only | owns "{type}" · your idea mentions {keys} · can approve up to {limit} · {unit} is their area | ist zuständig für „{type}“ · deine Idee erwähnt {keys} · kann bis {limit} genehmigen · {unit} ist ihr Bereich |
| Other desk | expanding row + search | roles of the company, by title and unit | Choose another desk · Search roles and units · No matches | Anderen Tisch wählen · Rollen und Einheiten suchen · Keine Treffer |
| Vacant | meta | | Vacant - waits until someone sits here | Frei - wartet, bis jemand den Platz besetzt |
| No route | line | | No desk matches this idea. Choose one. | Kein Tisch passt zu dieser Idee. Wähle einen. |
| AI-off line | grey line | `source: "keywords"` | Routed by keywords - the AI is off for this company. | Nach Stichwörtern zugeordnet - die KI ist für diese Firma aus. |
| AI timed out | grey line | AI on, no answer within 8 s (AIP/D9) | Routed by keywords - the AI did not answer in time. | Nach Stichwörtern zugeordnet - die KI hat nicht rechtzeitig geantwortet. |
| Who sees it | segmented + picker | people and units by id (VIS/D10); default Everyone | Who sees it · Everyone at {company} · Only the desk · Choose… | Wer es sieht · Alle bei {company} · Nur der Tisch · Auswählen … |
| Send | black pill | | Send to {role} | An {role} senden |
| Sent | inline confirmation | due date = `addWorkdays(today, promise_days)` | Sent to {role}. {names} owe you a yes, a no or a question by {date}. · Follow it in My cases → | An {role} gesendet. {names} schulden dir bis {date} ein Ja, ein Nein oder eine Rückfrage. · In Meine Fälle verfolgen → |

### Actions

- *Send* appends `case.raised` with the chosen route and seat (the server stamps the seat, IDN-A1, and replaces the
  proposal with its own, AIP/D9). A refusal (the desk was removed meanwhile) shows "This desk no longer exists. Choose
  another one." / "Diesen Tisch gibt es nicht mehr. Wähle einen anderen." in the window.
- *Cancel* or ✕ returns to the last look; the draft keeps everything.

### States

- Loading the proposal: the desk list shows two skeleton rows and the button's working glyph "Finding the desk…" /
  "Suche den Tisch …".
- AI off, AI timed out, no route, a vacant proposed role, the sent state.

### Done when

- [ ] Last look and "Where should it go?" in German, desktop and phone; AI on (tag "Proposed by the AI"), AI off,
      AI timed out, no route, another desk expanded, *Choose…* audience open, a vacant role, the sent state.

---

## Case page

- **Route:** `/[company]/cases/[caseId]` (redesign)
- **Who:** anyone who may open the case (VIS/D4); anyone else gets the not-found page (VIS/D9)
- **Phase:** LOOP (override visible to the author; no Bauplan yet), CLK-B1 (dates in workdays mode), CLK-C1 (the
  escalation from `clock.due`), VIS-C1 (only visible cases; an older case loads on demand), IDN-P1 and IDN-S1 (desk
  by role, hand-over by seat)
- **Data:** the reduced case (`ReducedCase`: status, `assigneeSeatId`, `assigneeRoleId`, `escalated` with
  `toRoleId`, route, clock), its events in the viewer's log or from `loadCaseLog(slug, caseId)`, `clock.due` kind
  deadline, the `case.raised` proposal, `case.override`, `visibility` with `seenBy` labels, comments, support, score.
- **Today:** `CaseDetailView.tsx`: a bar (*← Back*, *Copy link*), the archive banner, on the left the case card
  (kind · id, title, status and reason pills, "raised {date} · {clock}", the raiser's text with screenshots, the
  **Desks** chain of names, four tiles: on whose desk, route with deputy and buddy, cost while waiting, outcome), the
  discussion and versions panels; on the right **Your move** (score, actions, support, comments) and **What happened**
  (a timeline from the log). A case the viewer may not open shows an in-page "No such case" card. Escalation is
  computed while rendering.

**Purpose:** everything about one case: what was raised, whose desk it is on and until when, how it was routed, and
every step that happened.

### What stays / what changes

- **Stays:** the two-column layout, the bar, the case card, the discussion and versions panels, *Your move* with the
  score and its actions, the timeline with its log note, the screenshots lightbox.
- **Changes:**
  - **Desks** chain and the desk tile: roles first, people second. An escalated case reads "also {deputy role} since
    {date}" (CLK/D11: the owner keeps it).
  - A **Routing** panel: what was proposed (by the AI or by keywords) and where it went, with who chose or moved it.
    Shown to the raiser, the desk and managers (LOOP: "override visible to the author").
  - A **Who sees it** line under the raiser's text.
  - Dates are real dates and every count is working days in a real company (CLK-B1).
  - Timeline actors are "role · person" for desk holders; the escalation is a timeline line from the stored
    `clock.due` fact, with NextUp as the actor.
  - A case outside the window shows a short loading state while it loads (VIS/D9); a case the viewer may not open
    is the not-found page (the in-page card goes).
  - The route tile drops "buddy" when the route has none.

### Layout (desktop)

```
← Back                                                               Copy link
┌ Idea · C-1042 ──────────────────────────────────┐ ┌ Your move ───────────────────┐
│ Night-shift handover checklist                  │ │ 72  score · impact, clarity  │
│ [Waiting] [Process]  raised Mon 3 Nov ·         │ │ [Affects my team too]        │
│ 2 working days past the promise                 │ │ (HS)(LB) 3 teams affected    │
│ ┌ quote ──────────────────────────────────────┐ │ │ ─────────────────────────────│
│ │ Each shift writes three lines on open …     │ │ │ (LB) L. Brandt · 4 Nov       │
│ │ (AF) Anonymous Falcon · Assembly            │ │ │ We had the same on line 3 …  │
│ └─────────────────────────────────────────────┘ │ │ [Add to the thread    ] Post │
│ Who sees it  Everyone at Acme Automotive        │ └──────────────────────────────┘
│ Desks  Assembly lead Süd → Quality lead Süd     │ ┌ What happened ───────────────┐
│        + Plant manager Süd  [auto-escalated]    │ │ • Anonymous Falcon raised    │
│ ┌ Routing (InfoPanel) ────────────────────────┐ │ │   this · Mon 3 Nov           │
│ │ Proposed   Quality lead Süd · by keywords   │ │ │ • Assembly lead Süd ·        │
│ │ Sent to    Assembly lead Süd · chosen by    │ │ │   M. Keller handed it to     │
│ │            the raiser                       │ │ │   Quality lead Süd · 4 Nov   │
│ │ Moved to   Quality lead Süd · by Assembly   │ │ │ • Past the 5-working-day     │
│ │            lead Süd · M. Keller, Tue 4 Nov  │ │ │   promise. NextUp gave it to │
│ └─────────────────────────────────────────────┘ │ │   Plant manager Süd as well  │
│ ┌ tile ──────────────────┐ ┌ tile ─────────────┐│ │   · Tue 11 Nov               │
│ │ Quality lead Süd ·     │ │ Scrap and rework  ││ │ Every line is one event …    │
│ │ H. Sander, L. Brandt   │ │ deputy Plant      ││ └──────────────────────────────┘
│ │ also Plant manager Süd │ │ manager Süd       ││
│ │ since Tue 11 Nov       │ └───────────────────┘│
│ └────────────────────────┘                      │
│ ┌ tile: cost while waiting┐ ┌ tile: outcome ───┐│
└─────────────────────────────────────────────────┘
```

- The **Routing** panel has two to three rows: *Proposed*, *Sent to*, and *Moved to* for each later
  `case.override`. When proposal and choice are the same: one row "Proposed and sent to {role} · by {source}".
- Dates in the timeline sit right-aligned on their own line, `--nh-fs-xs` `--nh-mute`, as today.

### Phone

One column: the case card, *Your move*, discussion, versions, *What happened*. The Desks chain wraps; the Routing
panel's rows become label above value.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Raised line | meta | date + clock in working days | raised {date} · {n} working days left on the promise · {n} working days past the promise · answered in {n} working days · clock paused at {n} working days | eingebracht {date} · noch {n} Arbeitstage bis zum Versprechen · {n} Arbeitstage über dem Versprechen · beantwortet in {n} Arbeitstagen · Uhr angehalten bei {n} Arbeitstagen |
| Who sees it | meta line | `visibility`; custom shows the `seenBy` labels (ids decide, VIS/D10) | Who sees it · Everyone at {company} · Only the raiser, the desk and managers · {names and units} | Wer es sieht · Alle bei {company} · Nur die einbringende Person, der Tisch und Führungskräfte · {names and units} |
| Desks | chain | desk rule; escalation with "+" and the badge | Desks · auto-escalated | Tische · automatisch eskaliert |
| Desk tile | tile | | {role} · {names} · on whose desk it is · also {role} since {date} | {role} · {names} · auf wessen Tisch es liegt · auch {role} seit {date} |
| Route tile | tile | buddy only when set | {type} · deputy {role} · buddy {role} · no matching route · a manager assigns it | {type} · Vertretung {role} · Buddy {role} · keine passende Route · eine Führungskraft weist es zu |
| Routing panel | `InfoPanel` | raiser, desk holders, managers only | Routing · Proposed · Sent to · Moved to · by the AI · by keywords · chosen by the raiser · chosen by you · by {role} · {name}, {date} · Proposed and sent to {role} | Zuordnung · Vorgeschlagen · Gesendet an · Verschoben an · von der KI · nach Stichwörtern · von der einbringenden Person gewählt · von dir gewählt · von {role} · {name}, {date} · Vorgeschlagen und gesendet an {role} |
| Escalation line | timeline item, blue dot | from `clock.due` kind deadline | Past the {n}-working-day promise. NextUp gave it to {role} as well. | Über dem Versprechen von {n} Arbeitstagen. NextUp hat es zusätzlich an {role} gegeben. |
| Timeline actor | in each sentence | desk holders as "role · name"; others by name or handle | {role} · {name} answered "yes" | {role} · {name} hat mit „Ja“ geantwortet |
| Loading older case | inline skeleton | case outside the window | Loading the case… | Fall wird geladen … |

### Actions

- Unchanged: *Affects my team too* / *Re-evaluate the score*, *Answer the question*, *Raise a follow-up*, *Post*,
  *Copy link*.
- *Hand over* (from the inbox, IDN-S1) and every action that names a receiver pick a seat from a list "role · person";
  a missing seat is refused with "Choose who to hand it to." / "Wähle, an wen du es übergibst."
  (`cases.permHandSeat`).

### States

- Not allowed or unknown id: the not-found page, the same text as today ("No such case" / "Diesen Fall gibt es
  nicht", "Nothing with the id "{id}" is in your view for this company."), so a hidden case reads like a missing one.
- Older case: loading line, then the page as usual.
- AI off: the Routing panel says "by keywords"; no other change.
- No seat known: desk tile "No desk yet - a manager assigns it" / "Noch kein Tisch - eine Führungskraft weist ihn zu".
- Demo company: day labels as today; the escalation line comes from the render-time rule (CLK/D14).

### Done when

- [ ] Desktop and phone in German: a case on time, one escalated (Desks chain, desk tile, timeline line), one
      re-routed (Routing panel with three rows), one sent as proposed (one row), one with a custom audience.
- [ ] Loading an older case; the not-found page; no desk yet; AI off.

---

## Inbox

- **Route:** `/[company]/leader` (redesign)
- **Who:** leaders and managers (`ROLE_ACCESS["/leader"]`; the leader's home page)
- **Phase:** IDN-P1 (desk by role), IDN-S1 (hand-over by seat), VIS-C1 (`inboxView`), CLK-B1 and CLK-C1 (dates,
  escalation), MET (the two stat tiles, no Bauplan yet)
- **Data:** VIS `inboxView(companyId, viewerKeys, me)` (open cases on the viewer's desk), IDN `inboxOf`, `deskOf`,
  `deskSeats`, the viewer's seats (`SeatRow`); for managers the ideas waiting on their decision; for the stat tiles the
  desk's answered cases of the last 90 working days *(MET Bauplan)*.
- **Today:** `InboxView.tsx`: "Fresh ideas" with filter (all, late, on time) and sort; a card whose head is a stats
  strip (on your desk, past the promise, median time to answer and "within the promise, Q3", the last two from the
  seed's `metrics.lead`); one row per item (sender, title, when, the promise badge); a picked row docks the list left
  and opens `IdeaDetail` (`IdeaDetailPhone` on a phone) with yes / no + why / hand over / ask one question. "Mine" is
  decided by display name.

**Purpose:** everything on the viewer's desks that owes an answer, oldest promise first, one action each.

### What stays / what changes

- **Stays:** the title row, filter and sort, the card with its stats head, the rows, the docked list with the avatar
  rail, the opened item and its four actions, ↑/↓ and Escape, the phone layout.
- **Changes:**
  - A **Your desks** line under the title: every role the viewer holds, with who else holds it (IDN/D8: everyone in
    the role sees the case).
  - Rows get a desk chip when the viewer holds more than one role.
  - Badges and the escalation line use working days and dates, and name roles: "Escalated to your desk on Tue 11 Nov
    - Quality lead Süd missed the 5-working-day promise."
  - The two seed tiles become the desk's own numbers from the log (last 90 working days), shown only to the desk's
    holders *(open question 04-Q3)*; "Q3" goes.
  - *Hand over* picks a seat (role · person), never a typed name.

### Layout (desktop)

```
Inbox                                                [Filter: all ▾] [Oldest ▾]
Your desks: Quality lead Süd (with L. Brandt) · Deputy plant manager Süd
┌──────────────────────────────────────────────────────────────────────────────┐
│  12 on your desk      3 past the 5-working-  1.5 working days   86 %         │
│  · 2 paused           day promise            median to answer   within the   │
│                                                                 promise      │
├──────────────────────────────────────────────────────────────────────────────┤
│ (AF) Anonymous Falcon   Night-shift handover checklist   Mon 3 Nov  [2 late] │
│      Assembly           Escalated to your desk on Tue 11 Nov                 │
│ (TV) T. Vogel           Scrap bins overflow at L4        Thu 6 Nov  [1 left] │
│      Quality            [Deputy plant manager Süd]                           │
│ (MK) M. Keller          Shared forklift booking          Fri 7 Nov  [paused] │
│ …                                                                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

Hand-over picker (inside the opened item, replaces today's name list):

```
Hand it to
[ Search roles…                         ]
 Quality engineer · Werk Süd › Quality · T. Vogel
 Maintenance lead Süd · Werk Süd › Maintenance · R. Keller
 Maintenance lead Süd · Werk Süd › Maintenance · Vacant      (disabled)
Why (optional) [                                          ]
                                              [Cancel]  [Hand over]
```

### Phone

As today (`IdeaDetailPhone`). The *Your desks* line wraps to two lines; the stats strip becomes a 2 × 2 grid.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Your desks | meta line | every seat's role; co-holders in brackets | Your desks: {role} (with {names}) · {role} | Deine Tische: {role} (mit {names}) · {role} |
| Stat 1 | tile | open + paused on the viewer's desks | on your desk · {count} paused | auf deinem Tisch · {count} pausiert |
| Stat 2 | tile, red when > 0 | | past the {days}-working-day promise | über dem Versprechen von {days} Arbeitstagen |
| Stat 3 | tile | median, desk's answers in the last 90 working days; fewer than 5 answers: "–" | median to answer · working days · too few answers yet | Median bis zur Antwort · Arbeitstage · noch zu wenige Antworten |
| Stat 4 | tile | share within the promise, same window | within the promise · last 90 working days | innerhalb des Versprechens · letzte 90 Arbeitstage |
| Badges | pill | | {n} working days left · {n} working days late · paused | noch {n} AT · {n} AT überfällig · pausiert |
| Desk chip | small grey pill | only when the viewer holds ≥ 2 roles | {role} | {role} |
| Escalated line | row meta | from `clock.due` | Escalated to your desk on {date} - {role} missed the {days}-working-day promise. | Am {date} an deinen Tisch eskaliert - {role} hat das Versprechen von {days} Arbeitstagen verpasst. |
| Past the promise (owner side) | row meta | | Past the promise since {date} - {role} has it too. | Über dem Versprechen seit {date} - {role} hat es auch. |
| Hand-over picker | search + list | seats of the company; vacant seats disabled | Hand it to · Search roles… · Why (optional) · Hand over | Übergeben an · Rollen suchen … · Warum (optional) · Übergeben |

German badges use "AT" only inside the 22 px pill, with the full words in its tooltip ("noch 3 Arbeitstage"); everywhere
else write "Arbeitstage" out.

### Actions

- As today: *Yes*, *No* + why, *Hand over*, *Ask one question*. Toasts name the role: "Handed to Maintenance lead Süd."
  / "An Instandhaltungsleitung Süd übergeben."

### States

- Empty: "Nothing is waiting on you." (exists).
- New user without a seat: the plan's "no role is yours yet" `EmptyState` replaces the card.
- A case on a desk the viewer shares: when a co-holder answers, the row leaves the list for both, with the toast "L.
  Brandt answered this." / "L. Brandt hat das beantwortet." on the next refresh.

### Done when

- [ ] Desktop list and opened item, phone, in German; a viewer with two desks (chips), an escalated row, a paused row,
      stat 3 with too few answers; the hand-over picker with a vacant seat; empty and no-seat states.

---

## My cases

- **Route:** `/[company]/team` (redesign; the plan lists it with the Inbox as one page)
- **Who:** every role (the profile menu's "What I sent")
- **Phase:** IDN-P1 (`mineOf`, `cosignedOf`, invitations by id), VIS-C1 (window), CLK-B1 (dates)
- **Data:** the viewer's raised cases (`fromUserId`), co-signed ideas, cases they were invited into
  (`invitedUserIds`), each with status, desk, due date (`dueDay` → `dateOfWorkday`), answer, outcome.
- **Today:** `SentView.tsx`: "What happened to what I sent", a summary line, the promise paragraph, "Asked for your
  view", one card per case with the four steps (Sent, Read, Answered, Live), who has it, the date they owe an answer,
  what they said, what it changed.

**Purpose:** a member sees that what they sent is on a desk and when the answer is due.

### What stays / what changes

- **Stays:** everything in the layout; the four steps in employee words; the promise paragraph; "Asked for your
  view".
- **Changes:**
  - The promise paragraph names roles and working days (below).
  - "Who has it" is the desk: role first, people second, plus the escalation role.
  - The due date is the real working-day date.
  - A footer says older cases are not listed; they still open from a link (VIS/D9). *Later:* a "Show older" button if a
    phase adds a paged reader beyond the window *(proposal, not in any plan)*.

### Layout (desktop)

```
What happened to what I sent
2 waiting for an answer · 5 answered · 1 live

Everything you send lands on a role's desk; everyone in that role sees it. They owe
you a yes, a no or a question within 5 working days. If they miss that date, the
deputy gets it too - nothing you send can get lost.

┌ Asked for your view ─────────────────────────────────────────────────────────┐
│ Shared forklift booking        Logistics lead Nord asked · round 2 of 3 ·    │
│                                check-in Wed 12 Nov                           │
└──────────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────────────┐
│ Night-shift handover checklist                      [Waiting for an answer]  │
│ ▬▬▬▬ Sent  ▬▬▬▬ Read  ░░░░ Answered  ░░░░ Live                               │
│ On the desk of Quality lead Süd · H. Sander, L. Brandt                       │
│ They owe you an answer by Mon 10 Nov · now also Plant manager Süd            │
└──────────────────────────────────────────────────────────────────────────────┘
…
Showing what moved in the last 90 working days. Older cases open from their link.
```

### Phone

As today: cards full width.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Promise | paragraph | days = `promise_days` | Everything you send lands on a role's desk; everyone in that role sees it. They owe you a yes, a no or a question within {days} working days. If they miss that date, the deputy gets it too - nothing you send can get lost. | Alles, was du sendest, landet auf dem Tisch einer Rolle; alle in dieser Rolle sehen es. Sie schulden dir innerhalb von {days} Arbeitstagen ein Ja, ein Nein oder eine Rückfrage. Verpassen sie das, bekommt es zusätzlich die Vertretung - nichts geht verloren. |
| Desk line | card meta | desk rule | On the desk of {role} · {names} | Auf dem Tisch von {role} · {names} |
| Due line | card meta | escalation appended | They owe you an answer by {date} · now also {role} | Antwort fällig bis {date} · jetzt auch {role} |
| Window footer | meta | | Showing what moved in the last 90 working days. Older cases open from their link. | Zu sehen ist, was sich in den letzten 90 Arbeitstagen bewegt hat. Ältere Fälle öffnen sich über ihren Link. |

### States

- Nothing sent: as today ("You have not sent anything yet", *Raise a problem or an idea →*).
- An anonymous raise shows the handle the case carries; the page is still only the raiser's.

### Done when

- [ ] Desktop and phone in German with a waiting, an escalated, an answered and a live case, "Asked for your view",
      the footer; the empty state.

---

## Profile

- **Route:** `/[company]/profile` (redesign)
- **Who:** every signed-in person, their own profile only
- **Phase:** NTF-D1 (the "Mails" section), IDN-S1 (profile on ids), MET (counts removed), LNG-A1 (language switch,
  built)
- **Data:** the viewer's `User` (name, email, department, locale), seats, their cases; `NotifyPreference` rows per
  template (`raised`, `loop.*`, `reminder.*`, `digest`; NTF/D5), the company's `CompanyConfig.notifications` and
  stage (NTF/D8); the Microsoft 365 card (`m365Card`).
- **Today:** `ProfileView.tsx` without a target: back link, "My profile", hero with *My cases* / *Open inbox*, a stats
  strip (cases you raised, ideas, collaborations), the anonymous-handle note, "Your work" (6 items with a count),
  *Follow what you sent*; side column: Details, Language, Microsoft 365, People nearby.

**Purpose:** your own details, your roles, your language, and which mails NextUp sends you.

### What stays / what changes

- **Stays:** hero and its button, the anonymous-handle note, "Your work" as a list, *Follow what you sent*, Details,
  Language (LNG-A1), Microsoft 365.
- **Changes:**
  - The stats strip and the count next to "Your work" go (MET).
  - A **Your roles** card lists your seats (as the Person page's Roles card).
  - A **Mails** card (NTF-D1) with four switches.
  - "People nearby" becomes *Reports to* and *Same unit*, as on the Person page.
  - The language buttons move to the system's segmented control.

### Layout (desktop)

```
My profile                                                     Acme Automotive
┌──────────────────────────────────────────────────────────────────────────────┐
│ (HS)  H. Sander  [You]                                       [Open inbox →]  │
│       Quality lead Süd · Werk Süd › Quality                                  │
└──────────────────────────────────────────────────────────────────────────────┘
┌ Your work ──────────────────────────────────────┐ ┌ Details ──────────────────┐
│ ✳ Night-shift handover checklist   Waiting   →  │ │ Department  Quality       │
│ P Scrap bins overflow at L4        Decided   →  │ │ Email  h.sander@acme.de   │
│ …                                               │ └───────────────────────────┘
├─────────────────────────────────────────────────┤ ┌ Language ─────────────────┐
│ Follow what you sent                         →  │ │ ( Deutsch | English )     │
└─────────────────────────────────────────────────┘ └───────────────────────────┘
┌ Your roles ─────────────────────────────────────┐ ┌ Microsoft 365 ────────────┐
│ InfoPanel per seat, as on the Person page       │ │ (unchanged)               │
└─────────────────────────────────────────────────┘ └───────────────────────────┘
┌ Mails ──────────────────────────────────────────────────────────────────────┐
│ Mails go to h.sander@acme.de, in Deutsch.                                   │
│ A case lands on my desk                                              [on ]  │
│ Discussions and projects I am part of                                [on ]  │
│ Reminders when a deadline, check-in, start or measure is due         [on ]  │
│ Daily digest at 07:00 on working days                                [off]  │
│   Only on days with at least one case on your desk.                         │
│ ┌ grey line ──────────────────────────────────────────────────────────────┐ │
│ │ Acme Automotive has reminders and the digest switched off.              │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│ Teams  later (TMS)                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

- Each switch saves on its own (`setNotifyPrefAction(slug, template, on)`), no Save button.
- When the company's `notifications` switch is off, the reminder and digest switches are disabled (grey, their stored
  value kept) and the grey line explains why. The other two stay usable (NTF/D8: raise and loop mails go out anyway).
- *Later (TMS):* a Teams row per switch; draw it in a second frame.

### Phone

One column: hero, Your work, Your roles, Mails, Details, Language, Microsoft 365. Switch labels wrap; the switch stays
right.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Your roles | `InfoPanel` per seat | none: one line | Your roles · You hold no role in {company} yet. A manager sets this up. | Deine Rollen · Du hast in {company} noch keine Rolle. Das richtet eine Führungskraft ein. |
| Mails intro | line | email and the language of the switch above | Mails go to {email}, in {language}. | Mails gehen an {email}, auf {language}. |
| Raised | switch | template `raised`; default on | A case lands on my desk | Ein Fall landet auf meinem Tisch |
| Loop | switch | `loop.*`; default on | Discussions and projects I am part of | Diskussionen und Projekte, an denen ich beteiligt bin |
| Reminders | switch | `reminder.*`; default on; needs the company switch | Reminders when a deadline, check-in, start or measure is due | Erinnerungen, wenn eine Frist, ein Check-in, ein Start oder eine Messung fällig ist |
| Digest | switch + hint | `digest`; default off; needs the company switch | Daily digest at 07:00 on working days · Only on days with at least one case on your desk. | Tägliche Übersicht um 07:00 an Arbeitstagen · Nur an Tagen mit mindestens einem Fall auf deinem Tisch. |
| Company off | grey line | `CompanyConfig.notifications` false | {company} has reminders and the digest switched off. | {company} hat Erinnerungen und die tägliche Übersicht ausgeschaltet. |
| Sandbox | grey line | stage sandbox | Sandbox: nothing is sent yet. Your choices apply once {company} is a pilot. | Sandbox: Es wird noch nichts verschickt. Deine Auswahl gilt, sobald {company} ein Pilot ist. |
| No email | grey line, switches disabled | user without email | Your account has no email address, so NextUp cannot mail you. A manager can add one. | Dein Konto hat keine E-Mail-Adresse, deshalb kann NextUp dir nichts schicken. Eine Führungskraft kann eine eintragen. |
| Language | segmented | exists | Language · Deutsch · English | Sprache · Deutsch · English |

### Actions

- A switch: toast "Saved" / "Gespeichert". A failed save turns the switch back and shows "Not saved. Try again." /
  "Nicht gespeichert. Bitte noch einmal versuchen."

### States

- Loading: skeleton in each card. Company switch off; sandbox; no email; no seat; anonymous handle note (exists).

### Done when

- [ ] Desktop and phone in German; Mails with the company switch on and off; sandbox; no email; no seat; the *later*
      Teams frame.

---

## Decision log

- **Route:** `/[company]/decisions` (new)
- **Who:** *(proposal, LOOP decides; open question 04-Q4)* every signed-in role. A row shows only when the viewer may
  open its case (VIS/D4), so a member sees decisions on public cases and their own, a manager every decision. In the
  nav for managers and leaders after *Feed*; for members a link in the profile menu under "What I sent".
  `ROLE_ACCESS` gets no entry (any signed-in role).
- **Phase:** LOOP (no Bauplan yet; PILOT "decision log view")
- **Data:** every `case.decided` event (`answer`, `reason`, `note`, `projectId`, `lead`, `leadUserId`, `actorUserId`,
  `day`), the case's title, id, kind and unit (`CaseView`), the deciding role = the role of the actor's seat on the
  case's desk at that moment *(proposal: LOOP stamps `actorRoleId` on `case.decided`, as NTF/D10 derives
  `actor.roleId`)*, the project (`projectLabel`, title, state). Older than the VIS window, so it needs its own paged
  reader *(proposal, not in any plan: `decisionLog(companyId, viewerKeys, filter, page)` in
  `lib/db/projections/`)*.
- **Today:** nothing in the app. `/admin/decisions` is a different log: the router's proposals against what people
  did, for NextUp's team (`features/admin/decisions.ts`).

**Purpose:** a read-only record of every yes and no on a case: what was decided, by which role, when, and what came
of it.

### Layout (desktop)

```
Decision log
Every yes and no on a case, who decided it and what came of it.

[ Search case or reason…   ]  [Last 90 days ▾] [All units ▾] [Yes and no ▾] [Project ▾]

┌──────────────────────────────────────────────────────────────────────────────────┐
│ Date        Case                         Decision             Decided by    Project       │
│ Tue 11 Nov  Night-shift handover check…  Yes                  Quality lead  P-12 Handover │
│             C-1042 · Idea · Assembly     "Start on line 3"    Süd ·         checklist     │
│                                                               H. Sander     [Planning]    │
│ Mon 10 Nov  Shared forklift booking      No                   Logistics     –             │
│             C-1031 · Idea · Logistics    "Covered by the new  lead Nord ·                 │
│                                          yard system in Q1"   M. Keller                   │
│ Fri 7 Nov   Scrap bins overflow at L4    Yes                  Plant manager –             │
│             C-1019 · Problem · Werk Süd                       Süd · L. Brandt             │
│ …                                                                                         │
│ 1-50 of 214                                                          ( ‹ )  ( › )         │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- `DataTable`, newest first. The Decision cell: a `StatusBadge`-sized pill (*Yes* ink on grey fill, *No* white with a
  1 px line; never green or red), the reason or note in quotes under it, two lines at most, the full text in the
  tooltip.
- *Decided by*: role on the first line, person second (`--nh-mute`). A role that no longer exists shows the role title
  stored with the event and "(former role)".
- *Project* column and filter only while the company has projects on; a project cell links to the project page and
  shows its state badge.
- A row opens the case page. Nothing on this page edits anything.

### Phone

Each row is a card: date and decision pill on the first line, case title, "Decided by {role} · {name}", the reason,
the project link. Filters as one scrolling chip row; search on top.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Title, lead | `PageHeader` | no primary action | Decision log · Every yes and no on a case, who decided it and what came of it. | Entscheidungsprotokoll · Jedes Ja und Nein zu einem Fall, wer entschieden hat und was daraus wurde. |
| Search | text input | case title, case id, reason, note | Search case or reason | Fall oder Begründung suchen |
| Period | menu | default last 90 days | Last 30 days · Last 90 days · This year · Everything · Custom… | Letzte 30 Tage · Letzte 90 Tage · Dieses Jahr · Alles · Eigener Zeitraum … |
| Unit | menu, unit tree | the case's unit (its route owner's unit) | All units | Alle Einheiten |
| Answer | menu | | Yes and no · Yes · No | Ja und Nein · Ja · Nein |
| Project | menu | only with projects on | With or without project · Opened a project · No project | Mit oder ohne Projekt · Mit Projekt · Ohne Projekt |
| Columns | | | Date · Case · Decision · Decided by · Project | Datum · Fall · Entscheidung · Entschieden von · Projekt |
| Decision pill | pill | | Yes · No | Ja · Nein |
| Former role | meta | role deleted since | (former role) | (frühere Rolle) |
| Paging | `DataTable` | 50 a page | {from}-{to} of {n} | {from}-{to} von {n} |

### States

- Loading: 8 skeleton rows.
- Empty: `EmptyState` "No decisions yet. The first yes or no on a case shows here." / "Noch keine Entscheidungen. Das
  erste Ja oder Nein zu einem Fall erscheint hier."
- No match: "No decision matches these filters." / "Keine Entscheidung passt zu diesen Filtern."
- Projects off: no Project column or filter.
- A decision on a case the viewer may not open is not listed and not counted in "of {n}".

### Done when

- [ ] Desktop and phone in German, as a manager (all rows) and as a member (fewer rows); with and without the
      projects column; a former role; empty, no-match and loading states.

---

## Open questions in this file

Each has a default; the page specs above follow it.

| # | Question | Default |
|---|---|---|
| 04-Q1 | For "Too few to show": who stands behind a unit or role row of the Dashboard - the seat holders, the raisers, or both? Role rows will almost always be hidden. | Seat holders (a unit's members, a role's holders); role rows below 5 holders are hidden but count in their unit. MET's Bauplan decides. |
| 04-Q2 | Does the Person page still list a person's ideas and collaborations? | No: it is a per-person tally (HD5). The page shows roles only. |
| 04-Q3 | The Inbox's "median to answer" and "within the promise" are a desk's numbers; a desk with one holder is one person. Keep them? | Keep, shown only to the desk's own holders, with "–" below 5 answers. Never shown to anyone else. |
| 04-Q4 | Who may open the Decision log? | Every role, each row only when its case is visible to the viewer; in the nav for leaders and managers. |
| 04-Q5 | The Person page route is a display name (`/people/[name]`). Move it to the user id? | Decided (PILOT, MET): `/people/[userId]`; a name URL redirects when exactly one active member has the name; anonymous members have no person page. |
| 04-Q6 | The baseline period: a stored date range per company, set on the Dashboard? | Yes, `{ from, to }` in `CompanyConfig`, set by a manager on the Dashboard; PIL reads it for the pilot report. |
