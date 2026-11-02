# 01 · Settings shell, company and structure

> **Plan · 2026-11-02 · open: page specs for Sam. Part of [the pilot pages plan](../2026-11-02_pilot-pages.md); read its
> ground rules and shared building blocks first.**
> Six pages: the settings shell, Company, Rules, Calendar, Org and Members. They are the first pages to design: ADM
> builds them right after IDN and LNG, and the setup wizard ([02](02-routing-and-setup-wizard.md)) reuses their forms
> step by step.

Context for this file:

- **Bauplan ADM** (plans repo `projects/nextup/ADM/PLAN.md`): D6 company admin = an active manager of the company,
  D7 settings sections, D8 org editor rules, D9 rules and calendar, D11 members and invite. Tasks: ADM-G1 (frame),
  ADM-A1 (company, rules, calendar), ADM-B1 (org), ADM-D1 (members: seats and invite).
- **Bauplan DIR** D13 (deactivate and delete in Members, DIR-D1), D5 (the personnel number is never shown).
  **Bauplan IDN** (seats: `OrgRoleHolder` rows, `SeatRow` in `features/auth/identity.ts`). **Bauplan CLK** D6 and D7
  (`CompanyCalendar`, `CalendarSpec`, `holidaysOf`).
- Tables: `OrgUnit`, `OrgRole`, `OrgRoleHolder` (= seats), `CompanyRule`, `CompanyProfile` in `structure.prisma`;
  `CompanyConfig` in `integrations.prisma`; `CompanyCalendar` in `core.prisma` *(from CLK)*; `User` in `auth.prisma`.
- Today: `apps/app/src/app/[company]/(app)/settings/` (three links, an empty Company page, Members in
  `components/settings/MembersView.tsx`, a read-only Routing table). Loop rules are edited in `/admin`
  (`components/admin/LoopRulesAdmin.tsx`); ADM moves them here.
- Text namespaces (ADM/D3): `settingsCompany` (Company, Rules, Calendar), `settingsOrg` (Org), `settings` (shell,
  Members).

---

## Settings shell

- **Route:** `apps/app/src/app/[company]/(app)/settings/layout.tsx` (redesign)
- **Who:** company admins = the company's active managers (ADM/D6); anyone else gets "not found"
- **Phase:** ADM-G1
- **Data:** `SETTINGS_SECTIONS` and `visibleSections(hasUnits)` in `features/settings/sections.ts`
- **Today:** three links in a row (Company, Members, Routing table).

**Purpose:** one place where a company admin finds every setting, in the order they set a company up.

### Layout (desktop, ≥ 900 px)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [NextUp]        ( Dashboard | Inbox | Feed | Projects )        [search] (KS) │  ← existing top bar
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Settings                     │  Members                         [Invite]    │
│                               │  1,482 people · 1,470 active                 │
│  Company                      │                                              │
│    Company                    │  ┌────────────────────────────────────────┐  │
│    Rules                      │  │ the page's section cards               │  │
│    Calendar                   │  └────────────────────────────────────────┘  │
│  Structure                    │                                              │
│    Org                        │                                              │
│    Routing                    │                                              │
│  ▌ Members                    │                                              │
│  Connectors                   │                                              │
│    Connectors        (Error)  │                                              │
│  Data and security            │                                              │
│    …  (later phases)          │                                              │
│                               │                                              │
│  220 px, sticky               │  the rest of --nh-max (1120 px)              │
└──────────────────────────────────────────────────────────────────────────────┘
```

- The column title "Settings" (`--nh-fs-xl` 600) sits above the groups.
- Group labels: `--nh-fs-xs`, 600, `--nh-mute`. 16 px above each group, 4 px below.
- Items: 34 px tall, `--nh-fs-sm`, `--nh-ink-2`, 8 px radius. Hover: grey fill `#f2f2f7`. Current item: grey fill,
  ink text, 600. Connectors shows a small Error `StatusBadge` when a connector is in error.
- While the company has no org unit, a **Setup** item sits first, above the groups, as a black pill
  ("Set up {company}") instead of a plain item, and `/settings` opens it (ADM/D7).
- The column is sticky under the top bar and scrolls on its own when taller than the screen.
- Gap between column and page: 32 px.

### Phone and narrow tablet (< 900 px)

```
┌────────────────────────────────┐
│ Settings: Members           ▾  │  ← full-width button, 44 px
├────────────────────────────────┤
│ Members                        │
│ 1,482 people · 1,470 active    │
│ [ Invite                     ] │
│ …                              │
```

The button opens the same menu as a sheet from the bottom (full height, a close × top right). Picking an item
closes the sheet and opens the page.

### Content

| Element | Rules | EN | DE |
|---|---|---|---|
| Column title | | Settings | Einstellungen |
| Setup pill | only while no org unit exists | Set up {company} | {company} einrichten |
| Groups | visual only; the order is D7's | Company · Structure · Connectors · Notifications · Data and security · Shop floor · Go-live | Firma · Struktur · Anbindungen · Benachrichtigungen · Daten und Sicherheit · Shopfloor · Start |
| Items (ADM) | | Company · Rules · Calendar · Org · Routing · Members · Connectors | Firma · Regeln · Kalender · Organisation · Routing · Mitglieder · Anbindungen |
| Phone button | shows the current page | Settings: {page} | Einstellungen: {page} |

### States

- A leader, a member, a deactivated manager or a manager of another company who opens a settings URL gets the
  not-found page (ADM-G1).
- Sandbox companies show the sandbox banner (plan, "Other surfaces") above the page, not above the menu.

### Done when

- [ ] Desktop and phone frames in German, with and without the Setup pill.
- [ ] Current, hover and error states of a menu item drawn; the phone sheet drawn open.

---

## Company

- **Route:** `/[company]/settings/company` (redesign of the empty page)
- **Who:** company admins
- **Phase:** ADM-A1 (`saveCompanyAction`)
- **Data:** `Company.name`, the company's mark (logo), `CompanyProfile` (vision, mission, principles, business model,
  compliance rules, `updatedAt`, `updatedBy`), the stage (read-only).
  *Later:* default language (`CompanyConfig.defaultLocale` exists; no Bauplan edits it yet) and the feature switches
  for discussion and projects (LOOP).
- **Today:** a heading and the hint "Name, slug, logo, departments."

**Purpose:** the company's name and mark, and the facts NextUp's AI coach and routing read about it.

### Layout (desktop)

```
Company
What NextUp shows and knows about Acme Automotive.

┌ Basics ───────────────────────────────────────────────────────────────┐
│ Company name            [ Acme Automotive GmbH                     ]  │
│ Address in NextUp       nextup.app/acme  (read-only, mono)            │
│ Mark                    [mark 48×48]  [Upload]  [Remove]              │
│                         PNG or SVG, square, up to 1 MB.               │
│ Default language  later ( Deutsch | English )                         │
│                                                            [ Save ]   │
└───────────────────────────────────────────────────────────────────────┘
┌ About the company ────────────────────────────────────────────────────┐
│ The AI coach and the routing read this. Keep it short and factual.    │
│ Vision                  [ textarea, 3 rows                         ]  │
│ Mission                 [ textarea, 3 rows                         ]  │
│ Principles              [chip ×][chip ×][+ Add]                       │
│ Business model          [ textarea, 4 rows                         ]  │
│ Compliance rules        [ textarea, 4 rows                         ]  │
│ Last saved 28 Oct by H. Sander                             [ Save ]   │
└───────────────────────────────────────────────────────────────────────┘
┌ Features  later (LOOP) ───────────────────────────────────────────────┐
│ Discussion before a decision      [on ]                               │
│ Projects                          [on ]                               │
└───────────────────────────────────────────────────────────────────────┘
┌ Stage ────────────────────────────────────────────────────────────────┐
│ [Sandbox]  Nothing is sent to anyone yet.          Go to Go-live →    │
└───────────────────────────────────────────────────────────────────────┘
```

Label column 200 px, fields fill the rest (max 560 px). Draw the *later* parts in a second frame so they can be
dropped without moving the rest.

### Phone

Labels go above their fields; the language control stays one row; Save buttons are full width.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Lead | text | | What NextUp shows and knows about {company}. | Was NextUp über {company} zeigt und weiß. |
| Company name | text input | required, 1-120 characters (ADM-A1) | Company name | Firmenname |
| Address | read-only, mono | the slug never changes | Address in NextUp | Adresse in NextUp |
| Mark | image + Upload / Remove | PNG or SVG, square, ≤ 1 MB; shown on the company login page and next to the NextUp mark in the top bar | Mark · PNG or SVG, square, up to 1 MB. | Logo · PNG oder SVG, quadratisch, bis 1 MB. |
| Default language *(later)* | segmented | default for people who have not picked one | Default language · Everyone can change it in their profile. | Standardsprache · Jede Person kann sie im Profil ändern. |
| About the company | five fields | each ≤ 2,000 characters; principles as chips, ≤ 12 | Vision · Mission · Principles · Business model · Compliance rules | Vision · Mission · Grundsätze · Geschäftsmodell · Compliance-Regeln |
| Hint | under the card title | | The AI coach and the routing read this. Keep it short and factual. | Der KI-Coach und das Routing lesen das. Kurz und sachlich halten. |
| Last saved | meta line | `CompanyProfile.updatedAt/updatedBy` | Last saved {date} by {name} | Zuletzt gespeichert am {date} von {name} |
| Stage | `StatusBadge` + line + link | Sandbox / Pilot / Live | Nothing is sent to anyone yet. · Go to Go-live → | Es wird noch nichts verschickt. · Zu Start → |

### Actions

- *Save* (per card): toast "Saved" / "Gespeichert". An empty name: field error "Enter the company name." /
  "Firmennamen eingeben." A refused value shows the message of the rule that refused it, under its field.
- Mark upload shows the new mark at once; a file that is too big: "The file is 2.4 MB. Use one up to 1 MB." /
  "Die Datei hat 2,4 MB. Bitte eine bis 1 MB verwenden."

### States

- Loading: skeleton bars in each card.
- No mark: a grey square with the company's initials.
- Empty profile: the fields empty, with the hint "Empty fields make the AI coach guess." / "Leere Felder lassen den
  KI-Coach raten."

### Done when

- [ ] Desktop and phone frames in German; the *later* cards in a separate frame; Sandbox and Live variants of Stage.

---

## Rules

- **Route:** `/[company]/settings/rules` (new)
- **Who:** company admins
- **Phase:** ADM-A1 (`saveRulesAction`: `saveCompanyRules` for the company rules, `saveLoopRules` for the loop
  rules)
- **Data:** `CompanyRule` keys `promise_days` (1-60, default 5), `outcome_days` (1-365, default 14), `spend`
  (`limitEur` ≥ 0 and a text of 1-200 characters, or none) (`features/knowledge/rules.ts`); `CompanyConfig` loop
  rules `discussEveryDays`, `discussMaxRounds`, `fastLaneEur`, `measureDays`, `measureTolerancePct`.
  *Later:* company goals (`Goal`, open question Q3) and the idea publish score (`publishThreshold`, today in `/admin`).
- **Today:** the company rules are written once at creation; the loop rules are edited in `/admin`. The reward
  setting stays in `/admin` (reward schemes are outside PILOT).

**Purpose:** the promises NextUp makes to everyone who raises something, and the rules that decide how fast an idea
moves.

### Layout (desktop)

```
Rules
The promises NextUp makes and how fast ideas move at Acme Automotive.

┌ Promises ─────────────────────────────────────────────────────────────┐
│ Answer within               [ 5 ] working days                         │
│                             Everyone who raises something gets a yes,  │
│                             a no or a question within this time.       │
│ Measure the outcome after   [ 14 ] days                                │
│                             A shipped idea is checked against what it  │
│                             promised this long after launch.           │
│                                                            [ Save ]   │
└───────────────────────────────────────────────────────────────────────┘
┌ Spend limit ──────────────────────────────────────────────────────────┐
│ [on ] Decisions above an amount need approval                          │
│ Amount                      [ 25,000 ] €                               │
│ Rule in words               [ Above €25k the plant manager approves. ] │
│                             Shown to people when an idea costs more.   │
│                                                            [ Save ]   │
└───────────────────────────────────────────────────────────────────────┘
┌ How ideas move ───────────────────────────────────────────────────────┐
│ Skip the discussion below          [ 5,000 ] €                        │
│ Check-in every                     [ 3 ] days                         │
│ Rounds before the decision is due  [ 3 ]                              │
│ Measure a project after            [30 ×] [90 ×] [+ ] days            │
│ Counts as unchanged within         [ 2 ] %                            │
│                                                            [ Save ]   │
└───────────────────────────────────────────────────────────────────────┘
┌ Goals  later (Q3) ──────────────────────────────────── [Add goal] ────┐
│ Company-wide                                                          │
│  Scrap rate below 2 %          KPI scrap rate · target < 2 % · 2027   │
│ Werk Süd · Assembly                                                   │
│  OEE 85 %                      KPI OEE · target 85 % · Q4 2026        │
└───────────────────────────────────────────────────────────────────────┘
```

Label column 260 px (German labels are long), the field, then its unit on the same line. The hint line sits under
the field in `nh-hint`. Goal rows open an `EditDrawer` (Title, KPI, Target, Period, Applies to: company-wide or a unit
from Org, Keywords).

### Phone

Label above, field and unit on one row, hint under it. Goal rows become two lines.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Lead | text | | The promises NextUp makes and how fast ideas move at {company}. | Die Versprechen von NextUp und wie schnell Ideen bei {company} vorankommen. |
| Answer within | number + unit | 1-60 | Answer within · working days · Everyone who raises something gets a yes, a no or a question within this time. | Antwort innerhalb von · Arbeitstagen · Wer etwas einbringt, bekommt in dieser Zeit ein Ja, ein Nein oder eine Rückfrage. |
| Measure the outcome after | number + unit | 1-365 | Measure the outcome after · days · A shipped idea is checked against what it promised this long after launch. | Ergebnis messen nach · Tagen · Eine umgesetzte Idee wird so lange nach dem Start an ihrem Versprechen gemessen. |
| Spend limit switch | switch | off = no spend rule | Decisions above an amount need approval | Entscheidungen über einem Betrag brauchen eine Freigabe |
| Amount | number + € | whole euros ≥ 0 | Amount | Betrag |
| Rule in words | text input | 1-200 characters; required when on | Rule in words · Shown to people when an idea costs more. | Regel in Worten · Wird angezeigt, wenn eine Idee mehr kostet. |
| Fast lane | number + € | ≥ 0, default 5,000 | Skip the discussion below · The team's spend authority: a smaller idea can be decided at once. | Diskussion überspringen unter · Die Ausgabenbefugnis des Teams: eine kleinere Idee kann sofort entschieden werden. |
| Check-in | number + days | 1-30, default 3 | Check-in every · days | Check-in alle · Tage |
| Rounds | number | 1-10, default 3 | Rounds before the decision is due · One more round needs a manager. | Runden bis zur Entscheidung · Eine weitere Runde braucht eine Führungskraft. |
| Measure after | number chips + days | 1-3 values, ascending | Measure a project after · days | Projekt messen nach · Tagen |
| Tolerance | number + % | 0-50, default 2 | Counts as unchanged within · A smaller move is neither better nor worse. | Gilt als unverändert innerhalb von · Eine kleinere Änderung ist weder besser noch schlechter. |
| Goals *(later)* | rows → drawer | grouped: company-wide first, then by unit | KPI {kpi} · target {target} · {period} | KPI {kpi} · Ziel {target} · {period} |

### Actions

- *Save* per card; toast "Saved" / "Gespeichert". A refused value (a promise of 0 days, a negative amount) shows the
  rule's message under the field and nothing is saved.

### States

- Loading: skeleton bars. No goals *(later)*: `EmptyState` "No goals yet. Without goals, ideas are scored on impact
  and clarity only." / "Noch keine Ziele. Ohne Ziele werden Ideen nur nach Wirkung und Klarheit bewertet."

### Done when

- [ ] Desktop and phone in German, spend limit on and off, a refused value, the *later* Goals card in its own frame.

---

## Calendar

- **Route:** `/[company]/settings/calendar` (new)
- **Who:** company admins
- **Phase:** ADM-A1 (`saveCalendarAction` → CLK's `saveCalendar`); CLK owns the calendar and the clock
- **Data:** `CompanyCalendar` *(from CLK)*: `region` ("DE" = federal holidays only, or one of the 16 states
  "DE-BW" … "DE-TH"), `workdays` (ISO weekdays, default Mon-Fri), `extraHolidays` and `extraWorkdays` (ISO dates);
  `holidaysOf(year, region)` gives the public holidays as dates. **One calendar per company** (ADM/Q1, CLK/D6).
- **Today:** nothing; deadlines run on the demo day counter.

**Purpose:** tell NextUp on which days the company works, so every deadline counts working days only.

### Layout (desktop)

```
Calendar
Deadlines count working days only. Holidays follow the state you pick.

┌ Working days ─────────────────────────────────────────────────────────┐
│ State for public holidays   [ Bavaria                            ▾]  │
│ Working days                (Mo)(Tu)(We)(Th)(Fr)( Sa)( Su)            │
│                                                            [ Save ]   │
└───────────────────────────────────────────────────────────────────────┘
┌ Public holidays ─────────────────────────────── ( 2026 | 2027 ) ──────┐
│ Thu 1 Jan        Wed 6 Jan        Fri 2 Apr        Mon 5 Apr          │
│ Sat 1 May        Thu 13 May       Mon 24 May       Thu 3 Jun          │
│ …  (from the state's table, read-only)                                │
│ Holidays in only part of a state (Augsburg) are not here; add them    │
│ below as extra days off.                                              │
└───────────────────────────────────────────────────────────────────────┘
┌ Extra days off ───────────────────────────────── [Add a day off] ─────┐
│ Mon 22 Feb 2027                                            [Remove]   │
│ Tue 23 Feb 2027                                            [Remove]   │
└───────────────────────────────────────────────────────────────────────┘
┌ Extra working days ──────────────────────────── [Add a working day] ──┐
│ Sat 13 Mar 2027                                            [Remove]   │
└───────────────────────────────────────────────────────────────────────┘
┌ Next days off ────────────────────────────────────────────────────────┐
│ InfoPanel: the next 5 days without work, holidays and extra days      │
└───────────────────────────────────────────────────────────────────────┘
```

- Public holidays are dates in a 4-column grid (2 on phones). The year switch is a segmented control.
- *Add a day off* / *Add a working day* opens a small popover with one date picker and *Add*; a range of days is
  added as one date per day.
- Holiday names are *later*: `holidaysOf` returns dates only. Draw a name slot under each date in a second frame.
- *Later (Q4):* one calendar per site. Do not draw it now.

### Phone

Cards stack; the holiday grid has 2 columns; the weekday chips wrap after 4.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Lead | text | | Deadlines count working days only. Holidays follow the state you pick. | Fristen zählen nur Arbeitstage. Feiertage richten sich nach dem gewählten Bundesland. |
| State | select | "Germany (federal holidays only)" first, then the 16 states A-Z | State for public holidays · Germany (federal holidays only) | Bundesland für Feiertage · Deutschland (nur bundesweite Feiertage) |
| Working days | 7 toggle chips | at least one day | Working days · Mo Tu We Th Fr Sa Su | Arbeitstage · Mo Di Mi Do Fr Sa So |
| Public holidays | read-only grid + year switch | this and next year | Public holidays · Holidays in only part of a state (Augsburg) are not here; add them below as extra days off. | Gesetzliche Feiertage · Feiertage nur in Teilen eines Landes (Augsburg) fehlen hier; trage sie unten als zusätzliche freie Tage ein. |
| Extra days off | list + add | valid ISO dates, no duplicates | Extra days off · Add a day off | Zusätzliche freie Tage · Freien Tag hinzufügen |
| Extra working days | list + add | valid ISO dates | Extra working days · Add a working day | Zusätzliche Arbeitstage · Arbeitstag hinzufügen |
| Next days off | `InfoPanel` | 5 rows | Next days off · Public holiday · Extra day off · Weekend | Nächste freie Tage · Gesetzlicher Feiertag · Zusätzlicher freier Tag · Wochenende |

### Actions

- *Save* (working days and state) and every add or remove: toast "Calendar saved. Open deadlines use it from now
  on." / "Kalender gespeichert. Offene Fristen nutzen ihn ab jetzt."
- A bad date: "Use a real date, like 22.02.2027." / "Bitte ein echtes Datum eingeben, z. B. 22.02.2027."

### States

- No row yet: the page shows the default (Germany, Mon-Fri) with the hint "Default calendar. Pick your state." /
  "Standardkalender. Wähle dein Bundesland."
- Demo companies: a grey line on top: "This demo company runs on a simulated clock. The calendar is used once it
  is a pilot." / "Diese Demo-Firma läuft mit einer simulierten Uhr. Der Kalender gilt, sobald sie ein Pilot ist."

### Done when

- [ ] Desktop and phone in German, the add popover, the default state, the demo line, the *later* holiday names.

---

## Org

- **Route:** `/[company]/settings/org` (new)
- **Who:** company admins
- **Phase:** ADM-B1 (`OrgEditor`; writes through `lib/db/org-edit.ts`, checked by the rules in
  `features/org-edit/`, ADM/D8)
- **Data:** `OrgUnit` (key, name, kind board / dept / team, parent, headcount, sort), `OrgRole` (title, unit, reports
  to, decides, spend limit, skills), **seats** = `OrgRoleHolder` rows (a role has one or more seats; a seat has a
  label and is linked to one member by user id, or is vacant; IDN `SeatRow`). Units that came from the directory are
  read-only in their synced fields (DIR).
- **Today:** written once at company creation; no editor.

**Purpose:** the company's units, the roles in them and who sits in each seat. Cases go to roles, so this page
decides where every case can land.

### Layout (desktop): the tree on the left, the selected unit on the right

```
Org                                                  [Add unit] [Add role]
12 units · 41 roles · 3 vacant seats

┌ Units ───────────────────┐ ┌ Werk Süd · Quality ────────── [Edit unit] ┐
│ [Search units…]          │ │ Department · in Werk Süd · 86 people · QS  │
│ ▾ Acme Automotive        │ │ [From Entra]                               │
│   ▾ Werk Süd             │ │                                            │
│     ▸ Assembly           │ │ Roles                                      │
│     ▌ Quality       (•)  │ │ ┌ InfoPanel ─────────────────────────────┐ │
│     ▸ Logistics          │ │ │ Quality lead Süd                [Edit] │ │
│   ▸ Werk Nord            │ │ │ Reports to Plant manager Süd           │ │
│   ▸ Board                │ │ │ Decides: scrap rule · supplier claims  │ │
│                          │ │ │ Spend limit €10,000                    │ │
│                          │ │ │ Seats  (HS) H. Sander  (LB) L. Brandt  │ │
│                          │ │ └────────────────────────────────────────┘ │
│                          │ │ ┌ InfoPanel ─────────────────────────────┐ │
│                          │ │ │ Quality engineer                [Edit] │ │
│                          │ │ │ Seats  ( Vacant )  amber               │ │
│                          │ │ └────────────────────────────────────────┘ │
│  300 px                  │ │                          [Add role here]   │
└──────────────────────────┘ └────────────────────────────────────────────┘
```

- Tree rows: 32 px, indent 16 px a level, a chevron for units with children, the unit's kind as a small icon. An amber
  dot `(•)` marks a unit with a vacant seat.
- The unit key (`QS`) is shown in mono at the end of the unit's meta line.
- Role panels are `InfoPanel`s stacked in the unit card. A linked seat is an avatar chip (avatar + short name); a
  vacant seat is an amber "Vacant" pill.

Role drawer (`EditDrawer`):

```
Quality lead Süd                                                ×
────────────────────────────────────────────────────────────────
Title                 [ Quality lead Süd                    ]
Unit                  [ Werk Süd · Quality                 ▾]
Reports to            [ Plant manager Süd                  ▾]
Seats                 (HS) H. Sander        [Unlink] [×]
                      (LB) L. Brandt        [Unlink] [×]
                      ( Vacant )  [ Link a member…   ▾] [×]
                      [+ Add a seat]
Decides               [scrap rule ×] [supplier claims ×] [+]
Spend limit           [ 10,000 ] €     empty = no own budget
What the role needs   [8D method ×] [+]
                      Skills of the role, never of a person.
────────────────────────────────────────────────────────────────
[Delete role]                              [Cancel]  [Save]
```

Unit drawer: Key (A-Z, 0-9, _; 1-32), Name, Kind, Parent unit, Headcount, *Delete unit* at the bottom.

### Phone

The tree is the page. Tapping a unit opens its card full screen with "← Units". Drawers are full-screen sheets.

### Content

| Element | Control | Rules (ADM/D8) | EN | DE |
|---|---|---|---|---|
| Lead | meta | | {units} units · {roles} roles · {vacant} vacant seats | {units} Einheiten · {roles} Rollen · {vacant} freie Plätze |
| Unit kinds | icon + word | | Board · Department · Team | Geschäftsleitung · Abteilung · Team |
| Unit drawer | Key, Name, Kind, Parent, Headcount | key 1-32 of A-Z 0-9 _, unique; name 1-120; not its own parent | Key · Name · Kind · Parent unit · Headcount | Kürzel · Name · Art · Übergeordnete Einheit · Personen |
| Role drawer | as drawn | title 1-120; no reports-to loop | Title · Unit · Reports to · Seats · Add a seat · Link a member · Unlink · Decides · Spend limit · What the role needs · Skills of the role, never of a person. | Titel · Einheit · Berichtet an · Plätze · Platz hinzufügen · Mitglied verknüpfen · Lösen · Entscheidet · Ausgabengrenze · Was die Rolle braucht · Fähigkeiten der Rolle, nie einer Person. |
| Link a member | select of the company's active members, searchable | a member by id, never a typed name (HD10) | Link a member… | Mitglied verknüpfen… |
| Vacant seat | amber pill + line | | Vacant · Cases for this role wait in its other seats, or until someone sits here. | Frei · Fälle für diese Rolle gehen an die anderen Plätze oder warten, bis jemand hier sitzt. |

### Actions

- Every save goes through the D8 rules. A refusal shows its message in the drawer and nothing is saved, for example:
  - "This role owns 3 routes. Change them in Routing first." / "Diese Rolle ist für 3 Routen zuständig. Ändere sie
    zuerst im Routing." (link to Routing)
  - "That would make Plant manager Süd report to itself." / "Dann würde Werkleitung Süd an sich selbst berichten."
  - "The key QS is already used by Werk Nord · Quality." / "Das Kürzel QS nutzt schon Werk Nord · Qualität."
- *Delete role* and *Delete unit* ask first (`ConfirmDialog`): "Delete the role {title}? Its {n} seats go too." /
  "Rolle {title} löschen? Ihre {n} Plätze werden mit gelöscht."
- Link and unlink a seat: toast "{name} now sits in {role}." / "{name} sitzt jetzt in {role}." · "{role}: seat is
  vacant now." / "{role}: Platz ist jetzt frei."

### States

- Empty company: `EmptyState` "No units yet. Add the first one, or let the setup guide you." / "Noch keine
  Einheiten. Lege die erste an oder lass dich durch die Einrichtung führen." with *Add unit* and *Start setup →*.
- A unit without roles: "No roles here yet. Cases reach a unit only through a role." / "Hier gibt es noch keine
  Rollen. Fälle erreichen eine Einheit nur über eine Rolle." + *Add role here*.
- Synced unit: `SourceBadge` "From Entra"; name, parent and headcount are read-only with a lock; roles and seats stay
  editable.

### Done when

- [ ] Desktop with a selected unit (one role with linked seats, one with a vacant seat), phone tree and phone unit
      view, unit drawer, role drawer, three refusals, the delete dialog, the synced variant, both empty states, in
      German.

---

## Members

- **Route:** `/[company]/settings/members` (redesign)
- **Who:** company admins
- **Phase:** DIR-D1 (deactivate, delete, inactive state), ADM-D1 (seats column, invite by mail), GDP *(later:
  export and pseudonymise, dialogs in [05](05-data-protection.md))*
- **Data:** `User` (name, email, role, dept, locale, `entraOid`, login code date, `active`, `deactivatedAt`,
  `directorySyncedAt` *(from DIR)*), the seats each person sits in (`OrgRoleHolder.userId`), the company's directory
  source (DIR `loadDirectoryStatus`). The personnel number (`employeeId`) is stored by DIR and **never shown**.
- **Today:** a list with a role select and "New code", plus an "Add a person" form under it.

**Purpose:** see who is in the company, invite people, set their app role and seats, and switch people off.

### Layout (desktop)

```
Members                                               [Add] [Invite]
1,482 people · 1,470 active

┌ Synced from Entra · last sync 14:05 ──────────── Connectors → ──────┐
│ Name, email and department come from Entra and are read-only here.    │
│ App role and seats stay editable.                                     │
└───────────────────────────────────────────────────────────────────────┘

[ Search name or email…        ]  [App role ▾] [Source ▾] [Status ▾]

┌───────────────────────────────────────────────────────────────────────────────┐
│ Person                    Department   App role    Seats            Sign-in      │
│ (LB) L. Brandt            Quality      [Leader ▾]  Quality lead     Microsoft  ⋯ │
│      l.brandt@acme.de                              Süd                           │
│      [From Entra]                                                                │
│ (HS) H. Sander (you)      Werk Süd     Manager     Plant manager    Code since ⋯ │
│      h.sander@acme.de                              Süd +1           12 Oct       │
│ (MK) M. Keller            Logistics    Member      –                         ⋯   │
│      Deactivated 30 Oct                                                          │
│ …                                                                                │
│ 1-50 of 1,482                                              ( ‹ )  ( › )          │
└───────────────────────────────────────────────────────────────────────────────┘
```

- Avatar: initials on the person's tint (`avatarTone(name)`), 32 px.
- Seats: the first seat's role title plus "+n"; a click opens the seats popover (below).
- Deactivated rows: text in `--nh-mute`, the role select replaced by plain text, "Deactivated {date}" under the name.
- The ⋯ menu: New login code · Seats… · Deactivate… (red) for active people; Reactivate · Delete… (red) for
  deactivated people. *Later (GDP):* Export data · Pseudonymise….
- You cannot change your own app role or deactivate yourself: those controls are disabled on your own row.

Seats popover (from the Seats cell or the ⋯ menu):

```
Seats of L. Brandt
 Quality lead Süd · Werk Süd · Quality          [Unlink]
 ─────────────────────────────────────────────
 Link a vacant seat  [ search vacant seats…  ▾]
```

### Add and Invite (`EditDrawer`)

*Add* keeps today's flow (the code is shown once on screen). *Invite* adds the person the same way and sends them
an email with their personal login code and the company's login address; the code is in the email body, never in a
link (ADM/D11).

```
Invite a person                                                 ×
────────────────────────────────────────────────────────────────
Name                  [                                    ]
Work email            [                                    ]
Department            [                                    ]
App role              ( Member | Leader | Manager )
Language of the email ( Deutsch | English )
────────────────────────────────────────────────────────────────
We send the login code to this address. It is not shown here.
                                    [Cancel]  [Send invitation]
```

The invitation email (one of the "other surfaces"): subject "Your login to NextUp at {company}" / "Dein Zugang zu
NextUp bei {company}"; body: one line who invited them, the code in a mono box, the login address as a link
(without the code), one line "Keep this code to yourself. A manager can issue a new one." / "Behalte den Code für
dich. Eine Führungskraft kann einen neuen ausstellen." Same layout as today's notice mails.

### Phone

Search on top, filters as one scrolling row of chips, each person a card: avatar, name, department, app role as
text, ⋯ menu with every action including *Change app role*.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Lead | meta | | {count} people · {active} active | {count} Personen · {active} aktiv |
| Sync banner | grey panel + link | only with a directory source | Synced from {source} · last sync {time} · Name, email and department come from {source} and are read-only here. App role and seats stay editable. | Synchronisiert aus {source} · letzte Synchronisierung {time} · Name, E-Mail und Abteilung kommen aus {source} und sind hier schreibgeschützt. App-Rolle und Plätze bleiben änderbar. |
| Search | text input | name or email | Search name or email | Name oder E-Mail suchen |
| Filters | chips with menus | App role · Source: manual / Entra · Status: active / deactivated | App role · Source · Status | App-Rolle · Quelle · Status |
| Columns | | | Person · Department · App role · Seats · Sign-in | Person · Abteilung · App-Rolle · Plätze · Anmeldung |
| App role values | select | | Member · Leader · Manager | Mitglied · Leitung · Führungskraft |
| Sign-in | meta | | Microsoft · Code since {date} · No code yet | Microsoft · Code seit {date} · Noch kein Code |
| Invite drawer | as drawn | email unique in the company | Invite a person · Name · Work email · Department · App role · Language of the email · We send the login code to this address. It is not shown here. · Send invitation | Person einladen · Name · Geschäftliche E-Mail · Abteilung · App-Rolle · Sprache der E-Mail · Wir senden den Anmeldecode an diese Adresse. Er wird hier nicht angezeigt. · Einladung senden |

### Actions

- *Send invitation*: toast "Invitation sent to {name}." / "Einladung an {name} gesendet."
- *Deactivate…* (`ConfirmDialog`): "Deactivate {name}? They can no longer sign in. Their seats become vacant and
  their {n} open cases go to the role's other seat." / "{name} deaktivieren? Die Person kann sich nicht mehr
  anmelden. Ihre Plätze werden frei und ihre {n} offenen Fälle gehen an den anderen Platz der Rolle." Buttons:
  Cancel · Deactivate (red). For a synced person the dialog adds: "Entra may switch them on again at the next sync.
  Deactivate them in Entra too." / "Entra kann die Person bei der nächsten Synchronisierung wieder aktivieren.
  Deaktiviere sie auch in Entra."
- *Delete…* (only deactivated people, `ConfirmDialog` with the name typed): "Delete {name} for good? Their cases keep
  the name as a label; the account is gone." / "{name} endgültig löschen? Ihre Fälle behalten den Namen als
  Beschriftung; das Konto ist weg."
- *New login code*: the code appears once in a `SecretOnce` box at the top of the page (as today).

### States

- Loading: 8 skeleton rows.
- No result: "Nobody matches "{query}"." / "Niemand passt zu „{query}“."
- Only you so far: `EmptyState` "Only you so far. Invite people or connect a directory." / "Bisher nur du. Lade
  Personen ein oder verbinde ein Verzeichnis." with *Invite* and *Connectors →*.

### Done when

- [ ] Desktop with manual, synced, your own and deactivated rows; phone; the seats popover; Add and Invite drawers;
      the invitation email; deactivate (manual and synced) and delete dialogs; empty and loading states; in German.
