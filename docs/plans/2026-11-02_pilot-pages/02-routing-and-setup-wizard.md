# 02 · Routing editor and setup wizard

> **Plan · 2026-11-02 · open: page specs for Sam. Part of [the pilot pages plan](../2026-11-02_pilot-pages.md); read its
> ground rules and shared building blocks first.**
> Two pages: the routing editor, which decides which role a new case goes to, and the setup wizard, which takes an
> empty company from nothing to its first route and its first members. Both are ADM. The wizard reuses the forms of
> [01](01-settings-and-structure.md) (Company, Org, Members) and of the routing editor below, one step at a time, so
> design those first.

Context for this file:

- **Bauplan ADM** (plans repo `projects/nextup/ADM/PLAN.md`): D7 settings sections and test ids, D8 org and routing
  rules (`saveRoute`, `removeRoute`, `moveRoute` in `lib/db/org-edit.ts`, checked by `features/org-edit/`), D14 the
  wizard. Tasks: ADM-B1 (`RoutingEditor`, `server/actions/settings/org.ts`), ADM-F1 (`SetupWizard`,
  `setupStep(knowledge, users)` in `server/actions/settings/setup.ts`).
- **Bauplan AIP** D3 and D6: with the AI off, routing falls back to the keyword router (`propose` in
  `features/routing/index.ts`, `ROUTER_VERSION` `keywords-v1`); `aiGate` with purpose `routing` says whether the AI
  proposes. **Bauplan DIR** D12: a route without a deputy role gets the owner's manager's seat as deputy.
- Table: `RoutingRule` in `structure.prisma` (`key`, `type`, `keywords String[]`, `ownerRoleId` required,
  `deputyRoleId?`, `buddyRoleId?`, `wait` display text such as "3 d", `sort`, `updatedAt`, `updatedBy`). The roles come
  from `OrgRole`, the people in them from `OrgRoleHolder` (seats).
- Today: `apps/app/src/app/[company]/(app)/settings/routing/page.tsx` reads `seedFor(slug).routes` and draws a
  read-only table (Request type, Owner, Deputy, Buddy, Typical wait, Keywords) with strings `settings.routing*`.
  No wizard exists; `/settings` redirects to Company.
- **PIL** (no Bauplan yet) uses the wizard as the pilot bootstrap and adds an import (CSV or Graph). That part is
  drawn *later* and may change when the PIL Bauplan is written.
- Text namespaces (ADM/D3): `settingsOrg` (routing editor; the `settings.routing*` keys move there),
  `settingsSetup` (wizard).

---

## Routing

- **Route:** `/[company]/settings/routing` (redesign)
- **Who:** company admins (ADM/D6)
- **Phase:** ADM-B1 (`RoutingEditor`; actions in `server/actions/settings/org.ts` → `saveRoute`, `removeRoute`,
  `moveRoute`)
- **Data:** `RoutingRule` rows of the company in `sort` order; for each owner, deputy and buddy role: `OrgRole.title`,
  its unit's name and its seats (`OrgRoleHolder`, linked member or vacant); the AI routing state from AIP's `aiGate`
  (purpose `routing`) for the note at the top.
- **Today:** a read-only table from the seed, owner shown as a person ("name · role · department"), deputy and buddy
  as plain text, and the hint "The intake box matches typed text against the keywords and proposes the row - it never
  decides."

What stays / what changes:

- Stays: one row per request type, the six columns, the sentence that the router proposes and never decides.
- Changes: rows are editable in an `EditDrawer`; owner, deputy and buddy are **roles** picked from Org, shown role
  first and the person in the seat second (HD5); rows can be reordered, added and deleted; a vacant owner seat is
  flagged.

**Purpose:** the table that sends every new case to the role that owns it: a type of request, the words that
recognise it, the owner role, its deputy and its buddy next door.

### Layout (desktop)

```
Routing                                                          [Add route]
8 routes · 1 owner seat vacant · 2 without a deputy role

┌ InfoPanel ────────────────────────────────────────────────────────────────┐
│ (✦) The AI proposes a route from the text. Keywords are the fallback.      │
│     A person always sees the proposal and can change it.                   │
└────────────────────────────────────────────────────────────────────────────┘

┌ Where would this case go?   proposal ─────────────────────────────────────┐
│ [ Torque values on station 4 drift since the new nutrunner_           ]   │
│ → Quality data, measurements, tolerances · 2 keywords · 83 %              │
│   Quality lead Süd · H. Sander                                            │
└────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────────┐
│    Request type            Owner               Deputy         Buddy   Wait │
│ ⋮⋮ Spend under €5k         Team lead           Plant manager  –       2 d ⋯│
│    (parts, tools)          assembly Süd        Süd                         │
│    [parts][tools][order]   L. Brandt           (manager chain)             │
│ ⋮⋮ Quality data,           Quality lead Süd    Quality lead   Logistics 3 d⋯│
│    measurements            H. Sander           Nord           lead Nord    │
│    [torque][gauge][+5]                         M. Keller      M. Keller    │
│ ⋮⋮ Shift plan, staffing,   Shift lead Nord     –              –       1 d ⋯│
│    overtime                ( Vacant ) amber                                │
│    [shift][overtime][+2]                                                   │
│ …                                                                          │
└───────────────────────────────────────────────────────────────────────────┘
When two routes match equally, the higher one wins. Drag ⋮⋮ to change the order.
```

- Table: `DataTable` look without paging (a company has about 15 routes), rows grow with their content (min 52 px).
- Column widths: handle 24 px, Request type 28 %, Owner 22 %, Deputy 18 %, Buddy 16 %, Wait 64 px, ⋯ 40 px.
- **Request type** cell: the type (`--nh-fs-md` 600), under it the first three keywords as small grey chips and
  "+n" for the rest.
- **Role cells:** role title (`--nh-fs-sm` ink), the seat holder under it (`--nh-fs-sm` `--nh-mute`; two holders:
  "H. Sander +1"). A vacant owner seat shows the amber "Vacant" pill; a role with no seat at all also shows it.
  An empty deputy shows "–" and, under it, "(manager chain)" in `--nh-mute` when DIR's manager chain fills it
  (DIR/D12); otherwise only "–".
- **Wait:** the `wait` text in tabular figures, as stored ("3 d").
- **Order:** the ⋮⋮ handle drags a row; the ⋯ menu has *Move up* and *Move down* for keyboard and touch. Each move
  calls `moveRoute` once.
- The whole row opens the edit drawer on click; the ⋯ menu has Edit, Move up, Move down, Delete… (red).
- **AI note** (top `InfoPanel`): the sparkle icon in blue when the AI proposes routes, the keyword icon in grey when
  it does not (the plan's *AI off* state). The note's text follows `aiGate` for purpose `routing` (see Content).
- **Where would this case go?** *(proposal, not in any plan; open question below)*: a one-line text field that
  runs the keyword router `propose(text, routes)` on the rows as saved and shows the matched route, the number of
  keyword hits, the confidence figure and the owner role with its seat holder. It never calls the AI, so it shows
  the keyword answer even when the AI is on, and says so. Nothing is stored. If ADM does not take it, drop the card;
  nothing else depends on it.

Edit route drawer (`EditDrawer`, 480 px):

```
Quality data, measurements, tolerances                          ×
────────────────────────────────────────────────────────────────
Request type          [ Quality data, measurements, tolerances ]
Keywords              [torque ×][gauge ×][tolerance ×][CMM ×]
                      [measurement ×][drift ×][ add a word…   ]
                      1-30 words, each up to 40 characters.
                      A case matches when its text contains them.
Owner role            [ Quality lead Süd · Werk Süd · Quality ▾]
                      Seats: H. Sander, L. Brandt
Deputy role           [ Quality lead Nord · Werk Nord · Qual. ▾]
                      Empty: the owner's manager stands in.
Buddy role            [ Logistics lead Nord · Werk Nord · Lo. ▾]
                      A role next door who can help when both are away.
Typical wait          [ 3 d          ]
                      Shown to people when they raise a case.
                      Deadlines follow the promise under Rules.
────────────────────────────────────────────────────────────────
Key r3 · last changed 28 Oct by H. Sander
[Delete route]                               [Cancel]  [Save]
```

- Role selects: searchable, list every `OrgRole` of the company as "{title} · {unit path}", the seat holders as a
  second grey line in the list ("H. Sander, L. Brandt" or "Vacant"). Deputy and buddy have a first option "None".
- Under the chosen owner: its seats in one line; a vacant owner shows the amber line from Content and a link
  "Link a member in Org →".
- Keywords: chip input; Enter or comma adds a chip; a chip over 40 characters or a 31st chip is refused inline.
  Chips are stored as typed, matched case-insensitively.
- The key (`RoutingRule.key`, "r3") is shown read-only in the footer meta in `--nh-mono`: cases and events point at
  it. For a new route the key is made by the server *(ADM-B1 does not say how; default: the next free `r<n>`)*.
- *Add route* opens the same drawer empty, titled "New route", without *Delete route*. A new route goes to the end
  of the table.

### Phone

The AI note and the test card stay on top. The table becomes one card per route: type (600), keyword chips, then
three lines "Owner · Quality lead Süd · H. Sander", "Deputy · …", "Buddy · …", and the wait on the right of the
title line. No drag handle: order changes through *Move up* / *Move down* in the ⋯ menu. The drawer is a full-screen
sheet; *Add route* is full width under the lead.

### Content

| Element | Control | Rules (ADM/D8) | EN | DE |
|---|---|---|---|---|
| Title | H1 | | Routing | Routing |
| Lead | meta | counts from the rows | {n} routes · {vacant} owner seats vacant · {nodeputy} without a deputy role | {n} Routen · {vacant} zuständige Plätze frei · {nodeputy} ohne Vertretungsrolle |
| AI note, AI on | `InfoPanel` + sparkle | `aiGate` routing on | The AI proposes a route from the text. Keywords are the fallback. A person always sees the proposal and can change it. | Die KI schlägt anhand des Textes eine Route vor. Stichwörter sind der Rückfall. Die Person sieht den Vorschlag immer und kann ihn ändern. |
| AI note, AI off | `InfoPanel` + keyword icon | `aiGate` routing off (any reason) | Routed by keywords - the AI is off for this company. A person always sees the proposal and can change it. | Nach Stichwörtern zugeordnet - die KI ist für diese Firma aus. Die Person sieht den Vorschlag immer und kann ihn ändern. |
| Test card *(proposal)* | text input + result | `propose(text, routes)`; nothing under 8 characters | Where would this case go? · Type what someone might write. · Uses the keywords only. · No route matches. Add keywords or a route. · {n} keywords · {pct} % | Wohin würde dieser Fall gehen? · Schreib, was jemand eingeben könnte. · Nutzt nur die Stichwörter. · Keine Route passt. Ergänze Stichwörter oder eine Route. · {n} Stichwörter · {pct} % |
| Columns | table header | | Request type · Owner · Deputy · Buddy · Wait | Anfrageart · Zuständig · Vertretung · Buddy · Wartezeit |
| Manager-chain hint | grey line | deputy empty and DIR on | (manager chain) | (Führungslinie) |
| Order hint | under the table | | When two routes match equally, the higher one wins. Drag ⋮⋮ to change the order. | Passen zwei Routen gleich gut, gewinnt die obere. Zieh ⋮⋮, um die Reihenfolge zu ändern. |
| Row menu | ⋯ | | Edit · Move up · Move down · Delete… | Bearbeiten · Nach oben · Nach unten · Löschen… |
| Request type | text input | required; 1-120 characters *(limit proposed; D8 names none)* | Request type | Anfrageart |
| Keywords | chip input | 1-30 words, each 1-40 characters | Keywords · 1-30 words, each up to 40 characters. A case matches when its text contains them. | Stichwörter · 1-30 Wörter, je bis 40 Zeichen. Ein Fall passt, wenn sein Text sie enthält. |
| Owner role | role select | required (a route needs an owner role) | Owner role · Seats: {names} | Zuständige Rolle · Plätze: {names} |
| Vacant owner | amber line + link | owner role has no linked seat | Nobody sits in {role}. Cases on this route wait until someone does. · Link a member in Org → | In {role} sitzt niemand. Fälle dieser Route warten, bis jemand dort sitzt. · Mitglied in Organisation verknüpfen → |
| Deputy role | role select, "None" first | optional | Deputy role · Empty: the owner's manager stands in. | Vertretungsrolle · Leer: die Führungskraft der zuständigen Person springt ein. |
| Buddy role | role select, "None" first | optional | Buddy role · A role next door who can help when both are away. | Buddy-Rolle · Eine Rolle nebenan, die hilft, wenn beide fehlen. |
| Typical wait | text input, short | free text as stored, e.g. "3 d"; up to 12 characters *(proposed)* | Typical wait · Shown to people when they raise a case. Deadlines follow the promise under Rules. | Übliche Wartezeit · Wird beim Einbringen angezeigt. Fristen folgen dem Versprechen unter Regeln. |
| Footer meta | meta | `key`, `updatedAt`, `updatedBy` | Key {key} · last changed {date} by {name} | Schlüssel {key} · zuletzt geändert am {date} von {name} |
| Drawer titles | | | New route · {type} | Neue Route · {type} |
| None option | | | None | Keine |

### Actions

- *Save* (drawer) → `saveRoute`; toast "Route saved." / "Route gespeichert." The drawer closes and the row flashes
  its grey hover fill once.
- A refusal (D8 rule) keeps the drawer open and shows the rule's message under its field; nothing is saved:
  - no owner: "Pick the role that owns this route." / "Wähle die Rolle, die für diese Route zuständig ist."
  - no keyword: "Add at least one keyword." / "Füge mindestens ein Stichwort hinzu."
  - 31st keyword: "Up to 30 keywords. Remove one first." / "Höchstens 30 Stichwörter. Entferne zuerst eins."
  - keyword too long: "“{word}” has {n} characters. Use up to 40." / "„{word}“ hat {n} Zeichen. Erlaubt sind 40."
- *Move up* / *Move down* / drag → `moveRoute`; no toast, the row moves. A failed move puts the row back and shows
  the toast "Order not saved. Try again." / "Reihenfolge nicht gespeichert. Bitte erneut versuchen."
- *Delete route…* (`ConfirmDialog`): "Delete the route {type}? New cases no longer match its keywords. Cases already
  raised on it stay with their role." / "Route {type} löschen? Neue Fälle passen dann nicht mehr auf ihre
  Stichwörter. Bereits eingebrachte Fälle bleiben bei ihrer Rolle." Buttons: Cancel · Delete route (red).
  → `removeRoute`; toast "Route {type} deleted." / "Route {type} gelöscht."
- Leaving the drawer with changes asks first (`EditDrawer` rule): "Discard your changes?" / "Änderungen verwerfen?"

### States

- Loading: skeleton rows (5).
- Empty: `EmptyState` "No routes yet. A route sends one type of request to the role that owns it." / "Noch keine
  Routen. Eine Route schickt eine Art von Anfrage an die zuständige Rolle." with *Add route*; when the company has no
  role yet, the action is *Add roles in Org →* instead, and while setup is not done also *Start setup →*.
- No roles: the drawer's owner select is empty and says "No roles yet. Add one in Org first." / "Noch keine Rollen.
  Lege zuerst eine in Organisation an."
- AI off: the AI note in its off variant (the plan's *AI off* state). Off is never shown as an error.
- Test card, no match: the no-match line; under 8 characters: nothing.

### Done when

- [ ] Desktop in German with eight routes: one with two seat holders, one with a vacant owner, one with an empty
      deputy filled by the manager chain; AI note on and off; the test card with a match and with no match (in a
      frame marked *proposal*).
- [ ] Phone list and the phone drawer sheet.
- [ ] Edit route drawer, new route drawer, the four refusals, the owner-vacant line, the delete dialog, the
      drag state of a row.
- [ ] Empty states with and without roles; loading.

---

## Setup wizard

- **Route:** `/[company]/settings/setup` (new)
- **Who:** company admins. `/settings` redirects here while the company has no org unit (ADM/D7).
- **Phase:** ADM-F1 (`SetupWizard.tsx`, `setupStep(knowledge, users)` in `server/actions/settings/setup.ts`); each
  step calls the action of its page: `saveCompanyAction` (ADM-A1), the org and route actions (ADM-B1), the add and
  invite actions of Members (ADM-D1). No second write path (D14). *Later (PIL):* an import step for a whole company.
- **Data:** what the company has: its name and profile, its `OrgUnit` rows, `OrgRole` rows with seats, `RoutingRule`
  rows, its users. The current step is **derived, not stored**: `setupStep` returns the first step not done, on every
  page load.
- **Today:** nothing. A new company is filled by the seed or by hand in `/admin`.

**Purpose:** take an empty company to a working one in one sitting: name, units, roles, a route and the first
people, so the first raised case reaches the right inbox.

### Steps and when each is done (ADM/D14, ADM-F1)

| # | Key | Done when | The form it shows | Test id |
|---|---|---|---|---|
| 1 | `company` | the company has a name | Company: name and the five profile fields (01, Company) | `setup-step-company` |
| 2 | `units` | at least one `OrgUnit` | Org: the unit form and the list of units added (01, Org) | `setup-step-units` |
| 3 | `roles` | at least one role with a seat (linked or vacant) | Org: the role form with its seats (01, Org) | `setup-step-roles` |
| 4 | `routes` | at least one route with an owner role | Routing: the route form (this file) | `setup-step-routes` |
| 5 | `members` | at least one member besides the admin | Members: Add and Invite (01, Members) | `setup-step-members` |
| 6 | `done` | – | the summary and the way into the app | `setup-step-done` |

The progress line counts steps 1-5; `done` is the finish screen.

### Layout (desktop)

The wizard sits in the `SettingsShell` like any section. While the company has no unit the menu shows the Setup pill
(01, Settings shell). The wizard's own column is narrower than other settings pages: max 720 px, left-aligned with the
page header, so the forms read as one step and not as an editor.

```
Set up Acme Automotive
Five steps. You can stop at any time and continue later.

 Company ── Units ── Roles ── Routes ── Members
 ━━━━━━━━━  ━━━━━━━  ───────  ───────  ───────
 ✓          ● now
 Step 2 of 5 · Units

┌ Units ─────────────────────────────────────────────────────────────┐
│ The plants, departments and teams the pilot covers. People are     │
│ placed in a unit by their department name.                         │
│                                                                    │
│ Added so far                                                       │
│ ┌ InfoPanel ─────────────────────────────────────────────────────┐ │
│ │ Acme Automotive          Board                          [Edit] │ │
│ │   Werk Süd               Department · WS                [Edit] │ │
│ │     Quality              Team · QS                      [Edit] │ │
│ └────────────────────────────────────────────────────────────────┘ │
│                                                                    │
│ Add a unit                                                         │
│ Name          [ Assembly                                ]          │
│ Key           [ MONT    ]   A-Z, 0-9 and _, up to 32.              │
│ Kind          ( Board | Department | Team )                        │
│ Parent unit   [ Werk Süd                               ▾]          │
│ Headcount     [ 240     ]                                          │
│                                                    [Add unit]      │
└────────────────────────────────────────────────────────────────────┘

[← Back]                                                     [Next →]
                                  3 units added. Next saves nothing more.
```

- **Progress line:** five labelled segments, 4 px bars, 8 px gap. Done segments: ink bar and a check before the
  label; the current one: blue bar (blue = state), label 600; later ones: grey bar `#e5e5ea`, label `--nh-mute`.
  Under it "Step {n} of 5 · {name}" in `--nh-fs-sm`. A done segment's label is a link back to that step; a later
  one is not clickable.
- **Step card:** one `SectionCard` with the step's title, a two-line explanation (`--nh-fs-md`, `--nh-ink-2`), then
  the reused form. Steps that collect several things (units, roles, members) show *Added so far* as an `InfoPanel`
  above the form, so the admin sees the list grow.
- **Footer:** outside the card. *Back* (grey pill) on the left, *Next* (black pill) on the right. *Next* is disabled
  until the step's done-condition holds; then a one-line hint under it says what is there. On step 1 there is no
  *Back*. Each form keeps its own submit button (*Save*, *Add unit*, *Add role*, *Save route*, *Add* / *Send
  invitation*); *Next* never saves a half-filled form. When a form has unsaved input, *Next* asks first: "Add
  {thing} first, or discard it?" with *Discard* and *Add*.
- **Back** opens the step before, with its form filled from what exists. Leaving and coming back always lands on the
  first step not done (derived). *(ADM-F1 does not say how Back addresses an earlier step; default: the URL
  `?step=<key>`, accepted only for a step that is done or current.)*

The five step cards:

```
1 Company                                   3 Roles
┌──────────────────────────────────┐        ┌──────────────────────────────────┐
│ Company name [ Acme Automotive ] │        │ Added so far                     │
│ About the company (optional)     │        │  Quality lead Süd · Werk Süd ·   │
│ Vision       [               ]   │        │  Quality · seat: ( Vacant )      │
│ Mission      [               ]   │        │                                  │
│ Principles   [chip][+ Add]       │        │ Add a role                       │
│ Business model [             ]   │        │ Title        [ Quality lead Süd ]│
│ Compliance rules [           ]   │        │ Unit         [ Werk Süd · Qual ▾]│
│ The AI coach and the routing     │        │ Reports to   [ None           ▾] │
│ read this.              [Save]   │        │ Seats        ( Vacant ) [Link ▾] │
└──────────────────────────────────┘        │              [+ Add a seat]      │
                                            │ A seat can stay vacant. You add  │
                                            │ people in step 5.    [Add role]  │
                                            └──────────────────────────────────┘
4 Routes                                    5 Members
┌──────────────────────────────────┐        ┌──────────────────────────────────┐
│ InfoPanel: AI note (on or off)   │        │ Added so far                     │
│ Request type [ Quality data…   ] │        │  (HS) H. Sander  you   Manager   │
│ Keywords     [torque ×][gauge ×] │        │  (LB) L. Brandt  invited Leader  │
│ Owner role   [ Quality lead Süd▾]│        │                                  │
│ Deputy role  [ None           ▾] │        │ ( Add | Invite )                 │
│ Buddy role   [ None           ▾] │        │ Name, Work email, Department,    │
│ Typical wait [ 3 d ]             │        │ App role, Language of the email  │
│ Example: "Spend under €5k" with  │        │                                  │
│ parts, tools, order.             │        │ Vacant seats                     │
│                    [Save route]  │        │  Quality lead Süd [Link a member▾]│
└──────────────────────────────────┘        │       [Add] / [Send invitation]  │
                                            └──────────────────────────────────┘
```

- **Company:** the Basics and About cards of the Company page (01) merged into one card, without the mark upload,
  the stage and the *later* parts. Only the name is required.
- **Units:** the unit drawer's fields (01, Org) as an inline form. The first unit has no parent; the hint under
  *Name* says "Use the department names your directory uses, so people land in the right unit." *Edit* in the list
  opens the Org unit drawer.
- **Roles:** the role drawer's fields (01, Org) inline, reduced to Title, Unit, Reports to and Seats; *Decides*,
  *Spend limit* and *What the role needs* are left to the Org page. A seat can stay vacant; usually only the admin
  exists yet, so *Link* offers the admin and the hint says people come in step 5.
- **Routes:** the route drawer of this file inline, with the AI note on top and one example line. The owner select
  lists the roles from step 3.
- **Members:** the Add / Invite drawer of Members (01) inline with a segmented switch; the invitation mail is the
  same. Under it, *Vacant seats* lists the seats from step 3 with a *Link a member* select (`linkSeat`, the seats
  popover of Members), so the first people can sit in their roles before the admin leaves. With a directory on, an
  extra line: "People also arrive from {source} at the next sync." *Later (PIL):* "Import from a CSV file" as a
  third option in the switch.

Finish screen (`done`):

```
Acme Automotive is set up                       setup-step-done
┌ InfoPanel ───────────────────────────────────────────────────────┐
│ Units 4 · Roles 6 · Seats 9, 3 vacant · Routes 5 · Members 3     │
└──────────────────────────────────────────────────────────────────┘
A case raised now goes to the role its route names.

Worth checking next
  Rules        Answer within 5 working days (default)          →
  Calendar     Germany, Mon-Fri (default)                       →
  Connectors   Microsoft 365, Jira, AI provider, directory      →

[Raise a test case]                                  [Go to the inbox]
```

- *Go to the inbox* (black) opens `/[company]/leader`. *Raise a test case* (grey) opens `/[company]/raise`.
- The three rows link to the Rules, Calendar and Connectors pages and show their current value (the defaults until
  someone saves them).
- The finish screen stays reachable at `/settings/setup` after setup; the Setup pill is gone from the menu by then.

### Phone

The title and lead stay; the progress line becomes "Step 2 of 5 · Units" with one bar of five segments and no
labels. Forms are one column, labels above fields. *Back* and *Next* sit in a sticky bottom bar (64 px, white, a
hairline on top), *Next* wider. The finish screen's three rows stack; both buttons full width, *Go to the inbox*
first.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Title | H1 | `done` uses its own title | Set up {company} | {company} einrichten |
| Lead | text | | Five steps. You can stop at any time and continue later. | Fünf Schritte. Du kannst jederzeit aufhören und später weitermachen. |
| Progress labels | segments | | Company · Units · Roles · Routes · Members | Firma · Einheiten · Rollen · Routen · Mitglieder |
| Progress line | meta | | Step {n} of 5 · {name} | Schritt {n} von 5 · {name} |
| Resume line | grey line under the progress, only when the admin returns to a started setup | | Welcome back. You are at step {n}. | Willkommen zurück. Du bist bei Schritt {n}. |
| Company step | card | name required, 1-120 | Your company · The name people see, and a few facts the AI coach and the routing read. Only the name is required. | Deine Firma · Der Name, den alle sehen, und ein paar Fakten für den KI-Coach und das Routing. Nur der Name ist Pflicht. |
| Units step | card | ≥ 1 unit; D8 key rule | Units · The plants, departments and teams the pilot covers. People are placed in a unit by their department name. · Use the department names your directory uses, so people land in the right unit. | Einheiten · Die Werke, Abteilungen und Teams, die der Pilot abdeckt. Personen werden über ihren Abteilungsnamen einer Einheit zugeordnet. · Nutze die Abteilungsnamen aus eurem Verzeichnis, damit Personen in der richtigen Einheit landen. |
| Roles step | card | ≥ 1 role with a seat | Roles · Cases go to roles, not to people. Add the roles that answer cases and give each a seat. · A seat can stay vacant. You add people in step 5. | Rollen · Fälle gehen an Rollen, nicht an Personen. Lege die Rollen an, die Fälle beantworten, und gib jeder einen Platz. · Ein Platz kann frei bleiben. Personen fügst du in Schritt 5 hinzu. |
| Routes step | card | ≥ 1 route with an owner role | Routes · A route sends one type of request to the role that owns it. One is enough to start. · Example: “Spend under €5k” with the words parts, tools, order. | Routen · Eine Route schickt eine Art von Anfrage an die zuständige Rolle. Eine reicht für den Anfang. · Beispiel: „Ausgaben unter 5.000 €“ mit den Wörtern Teile, Werkzeug, Bestellung. |
| Members step | card | ≥ 1 member besides the admin | Members · Add the first people, or invite them by email. Then link them to the vacant seats. · Vacant seats · People also arrive from {source} at the next sync. | Mitglieder · Füge die ersten Personen hinzu oder lade sie per E-Mail ein. Verknüpfe sie dann mit den freien Plätzen. · Freie Plätze · Personen kommen auch bei der nächsten Synchronisierung aus {source}. |
| Added so far | `InfoPanel` title | | Added so far | Bisher angelegt |
| Back / Next | grey / black pill | Next disabled until done-condition | Back · Next | Zurück · Weiter |
| Next hint, not yet | under Next | per step | Add at least one unit. · Add a role with a seat. · Save a route with an owner role. · Add one more person. | Lege mindestens eine Einheit an. · Lege eine Rolle mit einem Platz an. · Speichere eine Route mit zuständiger Rolle. · Füge noch eine Person hinzu. |
| Next hint, ready | under Next | counts | {n} units added. · {n} roles added. · {n} routes saved. · {n} people added. | {n} Einheiten angelegt. · {n} Rollen angelegt. · {n} Routen gespeichert. · {n} Personen hinzugefügt. |
| Unsaved input | small dialog | | Add {thing} first, or discard it? · Discard · Add | {thing} zuerst hinzufügen oder verwerfen? · Verwerfen · Hinzufügen |
| Finish title | H1 | | {company} is set up | {company} ist eingerichtet |
| Finish summary | `InfoPanel` | counts | Units {u} · Roles {r} · Seats {s}, {v} vacant · Routes {n} · Members {m} · A case raised now goes to the role its route names. | Einheiten {u} · Rollen {r} · Plätze {s}, davon {v} frei · Routen {n} · Mitglieder {m} · Ein jetzt eingebrachter Fall geht an die Rolle, die seine Route nennt. |
| Worth checking next | link rows | current values | Worth checking next · Rules · Answer within {n} working days · Calendar · {region}, {days} · Connectors · Microsoft 365, Jira, AI provider, directory · (default) | Als Nächstes prüfen · Regeln · Antwort innerhalb von {n} Arbeitstagen · Kalender · {region}, {days} · Anbindungen · Microsoft 365, Jira, KI-Anbieter, Verzeichnis · (Standard) |
| Finish buttons | grey / black pill | | Raise a test case · Go to the inbox | Testfall einbringen · Zum Posteingang |

The strings of the reused forms come from their own namespaces (`settingsCompany`, `settingsOrg`, `settings`); only
the wizard's frame text is in `settingsSetup`.

### Actions

- Each form's own button saves through its page's action and shows that page's toast ("Saved", "{name} now sits in
  {role}.", "Invitation sent to {name}."). The *Added so far* list updates at once.
- A refusal from a D8 rule shows under its field, exactly as on the Org and Routing pages.
- *Next* moves to the next step; it writes nothing. When `setupStep` on reload is still the same step (for example a
  second admin deleted the only unit), the step stays and the hint says what is missing.
- *Back* opens the previous step; nothing is undone.
- *Go to the inbox* / *Raise a test case*: plain links.

### States

- Loading: the progress line and one skeleton card.
- Resume: an admin who leaves at step 3 and comes back days later lands on step 3 with the resume line.
- Two admins at once: both see the step derived from the database; a step done by the other moves on at the next
  load.
- Directory already on (DIR): the members step shows the sync line; units still come from the admin (DIR/D8: the
  sync places people by department and creates no unit).
- Setup reached after `done`: the finish screen with today's counts.
- Leader or member opening the URL: not found (ADM-G1).

### Done when

- [ ] Desktop in German: each of the five steps with an empty form and with *Added so far* filled, *Next* disabled
      and enabled, the resume line, the unsaved-input dialog, a refusal inside a step.
- [ ] The finish screen with defaults and with saved values.
- [ ] Phone: progress bar, one step with the sticky Back/Next bar, the finish screen.
- [ ] The progress line's three segment states (done, current, later) as a Figma component.
- [ ] Every step frame named with its test id (`setup-step-company` … `setup-step-done`).
- [ ] *Later (PIL):* the import option in the members step, in its own frame.

---

## Open questions added by this file

| # | Question | Default |
|---|---|---|
| R1 | The "Where would this case go?" test card on Routing is in no plan. Add it to ADM-B1? It only calls the pure `propose` on the saved rows. | Yes, keyword router only, no model call; drop the card if ADM-B1 runs over budget. |
| R2 | D7 hides Setup in the menu once one unit exists, but the wizard has three more steps after units. How does an admin who leaves at step 3 find it again? | `/settings` still redirects to Setup until `setupStep` is `done` *(changes D7's redirect rule)*; the menu pill stays hidden as D7 says. |
| R3 | `RoutingRule.wait` is display text ("3 d") while deadlines use the company promise (Rules). Keep a free text field? | Yes, until the promise clock is per rule; the hint says deadlines follow Rules. |
| R4 | How is a new route's `key` made, and how long may `type` be? D8 sets neither. | Server makes the next free `r<n>`; `type` 1-120 characters like a role title. |
