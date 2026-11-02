# 07 · Shop floor

> **Plan · 2026-11-02 · open: page specs for Sam. Part of [the pilot pages plan](../2026-11-02_pilot-pages.md); read its
> ground rules and shared building blocks first.**
> One settings page (Areas and QR codes), four phone pages (raise from an area, shared-device sign-in, sent, status
> by reference), two printables (QR poster, reference slip) and the installed web app (icon and splash). They let a
> person without a PC or a work mail raise a case by scanning a QR code at their line, on their own phone or on a
> shared tablet, and read the answer with a reference number.

Context for this file:

- **FLR has no Bauplan yet.** These pages follow the PILOT brief `### FLR` (plans repo
  `projects/nextup/hauptplaene/PILOT.md`): a PWA manifest (`apps/app/public/manifest.webmanifest`), QR codes per
  area, a shared-device mode with a short login or an anonymous raise with a reference number, a status page by
  reference; code area `app/(floor)/`, `features/floor/`; acceptance `tests/e2e/db/shop-floor.spec.ts` › "FLR
  acceptance: QR raise reaches the role and the reference shows the answer". Risk named there: an anonymous raise
  invites abuse → a rate limit per device and area, in VIS's shared store. **The pages may change when the FLR
  Bauplan is written**; every table and field no plan names is marked *(proposal, not in any plan)*.
- **Areas are not built by ADM.** The FLR brief says "QR codes per area from ADM's `areas`", but the ADM Bauplan lists
  "QR areas (FLR)" as out of scope and only hands FLR the settings frame (`SETTINGS_SECTIONS`) to add an Areas
  section. So FLR has to add the area table itself, and the brief's code area names no schema file (open question
  F1).
- **No sites.** ADM has one company calendar and no site model (ADM/Q1, CLK/D6). An area is therefore defined
  against an **org unit** (`OrgUnit`, e.g. "Werk Süd · Montage") and the **role** its cases go to (`OrgRole`). A
  site level ("Werk Süd" as a place with its own calendar) is *later* (plan Q4) and not drawn.
- **Who can raise per area** follows plan Q5 (default: both, chosen per area): an area either allows raising without
  a name (a reference number is the only link back) or asks for a short code.
- **Rate limits** use VIS's shared store (VIS/D11: `RateCounter`, `hitShared(key, rule, now)` in
  `lib/db/rate-limit.ts`; the rules table `RULES` in `server/throttle.ts`). The buckets below are proposals for
  that table.
- **QR images need a package** (ADM/Q2 left the TOTP QR out for that reason; HD12: packages arrive in their own
  `deps/FLR` PR merged by Kevin), or a small QR encoder of FLR's own. The printables below assume one of them.
- **Phone first.** These are the only pages built for gloves and a shared, dirty screen: targets at least 48 px
  (main buttons 64 px), one task per screen, no top bar, no rail, no navigation except *Back*, inputs near the top
  (RESPONSIVE rule 6), 16 px input text, a keypad of its own for digits. Light theme only, high contrast (ink on
  white), no dot grid behind text.
- Today on `main` (f05fc56): no route group `(floor)`, no manifest (only `app/icon.png` and `app/apple-icon.png`, both
  64 × 64), no areas.
- Text namespaces *(proposal)*: `settingsAreas` (settings page, printables), `floor` (phone pages).
- Test ids: `settings-areas-<thing>`; phone pages `floor-<page>-<thing>` *(proposal)*.

---

## Areas and QR codes

- **Route:** `/[company]/settings/areas` (new; group "Shop floor" in the settings menu)
- **Who:** company admins (ADM/D6)
- **Phase:** FLR (no Bauplan yet); the section is added to `SETTINGS_SECTIONS` (ADM-G1 hands it over).
- **Data** *(proposal, not in any plan)*:
  - `FloorArea { id, companyId, key (2-32 of a-z 0-9 -, unique per company, part of the URL), name (1-60),
    unitId → OrgUnit, roleId → OrgRole (where cases go), anonymous Boolean (raise without a name allowed), on
    Boolean (false = paused), updatedAt, updatedBy }`.
  - `FloorDevice { id, companyId, name (1-60), areaIds String[], tokenHash, pairedAt, lastUsedAt }`: a tablet set up
    as a shared device. Pairing gives the device a long-lived token (cookie), stored as a hash.
  - The short code: `User.floorCodeHash` and `floorCodeAt` (6 digits, hashed like `loginCodeHash`), issued in
    Members (spec 01, ⋯ menu, *later FLR*). Only for people who raise on shared devices.
  - From the org: unit names, role titles, and whether the role has a linked seat (IDN `SeatRow`).
  - `CompanyRule` `promise_days` for the "answer within" line.
- **Today:** nothing.

**Purpose:** decide where on the shop floor people can raise a case, where those cases go, and print the QR codes.

### Layout (desktop)

```
Areas and QR codes                                            [Add area]
Places on the shop floor where people raise a case by scanning a code.
6 areas · 2 shared devices

┌ Areas ────────────────────────────────────────────────────────────────┐
│ Area          Unit                Goes to             Raise           │
│ Linie 3       Werk Süd · Montage  Schichtleitung      Without   [QR] ⋯│
│ mon-l3                            Montage Süd         a name          │
│ Linie 4       Werk Süd · Montage  Schichtleitung      Without   [QR] ⋯│
│ mon-l4                            Montage Süd         a name          │
│ Wareneingang  Werk Süd · Logistik Lagerleitung Süd    Code      [QR] ⋯│
│ we-sued                                                               │
│ Lackiererei   Werk Nord · Lack    Meister Lack Nord   Code  (Paused) ⋯│
│ lack-nord                         (Vacant) amber                      │
└───────────────────────────────────────────────────────────────────────┘
┌ Shared devices ───────────────────────────────────── [Add device] ────┐
│ Tablet Pausenraum Montage   Linie 3, Linie 4   used today 06:12   ⋯   │
│ Tablet Wareneingang Tor 2   Wareneingang       used 30 Oct        ⋯   │
│ A shared device stays signed out. People raise without a name or sign │
│ in with their short code, and are signed out after sending.           │
└───────────────────────────────────────────────────────────────────────┘
┌ Short codes ──────────────────────────────────────────────────────────┐
│ People without a PC sign in on a shared device with a 6-digit short   │
│ code. Issue it in Members, in the person's ⋯ menu.     Members →      │
│ 214 people have a short code.                                         │
└───────────────────────────────────────────────────────────────────────┘
┌ Limits ───────────────────────────────────────────────────────────────┐
│ InfoPanel                                                             │
│ Cases per device and area     5 in 10 minutes                         │
│ Cases per area                60 in an hour                           │
│ Wrong short codes per device  5 in 15 minutes                         │
│ Status checks per device      20 in 10 minutes                        │
└───────────────────────────────────────────────────────────────────────┘
```

- Areas is a `DataTable`. The area's key is a second line in `--nh-mono` `--nh-mute`. "Goes to" shows the role
  title; when the role has no linked seat, an amber "Vacant" pill under it (as in Org, spec 01). *Paused* areas show
  a grey "Paused" `StatusBadge` instead of the QR button and their row text in `--nh-mute`.
- *QR* is a grey small pill; it opens the print dialog below. The ⋯ menu: Edit · Pause / Resume · Copy link ·
  Delete… (red).
- Rows sort by unit, then name. No counts of cases per area on this page (a count per small area can point at a
  person, HD5); the dashboard shows areas only with `TooFewToShow` rules (MET).
- The limits panel is read-only: the numbers live in `RULES` (`server/throttle.ts`), not in the database.

Area drawer (`EditDrawer`):

```
Linie 3                                                         ×
────────────────────────────────────────────────────────────────
Name                  [ Linie 3                             ]
Address               nextup.app/acme/floor/[ mon-l3       ]
                      Changing it makes printed codes invalid.
Unit                  [ Werk Süd · Montage                 ▾]
Cases go to           [ Schichtleitung Montage Süd         ▾]
                      Roles of this unit first, then all roles.
Who can raise         ( Anyone, without a name | Only with a short code )
                      Without a name, people get a reference
                      number to read the answer.
On                    [on ]  Off pauses the code; the poster stays.
────────────────────────────────────────────────────────────────
[Delete area]                              [Cancel]  [Save]
```

Device drawer (`EditDrawer`): Name, Areas (multi-select of areas), then on save the pairing step:

```
Set up Tablet Pausenraum Montage                                ×
────────────────────────────────────────────────────────────────
On the tablet, open this address and enter the code:

  nextup.app/acme/floor/pair

  ┌ SecretOnce ──────────────────────────────┐
  │  K7P-4QX                        [Copy]   │
  │  Shown once. Store it now.               │
  └──────────────────────────────────────────┘
The code works for 30 minutes and once.
────────────────────────────────────────────────────────────────
                                                      [Done]
```

QR dialog (centred modal, 720 px; phone: full-screen sheet):

```
QR code for Linie 3                                             ×
────────────────────────────────────────────────────────────────
┌ poster preview (A4 scaled) ┐   Size       ( A4 | A5 )
│                            │   Language   ( Deutsch | English | Both )
│                            │   Link       nextup.app/acme/floor/mon-l3
│                            │              [Copy link]
│                            │
└────────────────────────────┘   [Download QR only (PNG)]  [Print]
```

### Phone

Settings on a phone is for checking, not printing: the areas table becomes stacked cards (name, unit, "Goes to",
the raise mode as text, ⋯ menu); *Print* in the QR dialog becomes *Download PDF*. Drawers are full-screen sheets.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Lead | text + meta | | Places on the shop floor where people raise a case by scanning a code. · {areas} areas · {devices} shared devices | Orte in der Fertigung, an denen Personen per Code einen Fall einreichen. · {areas} Bereiche · {devices} geteilte Geräte |
| Add area | black pill | | Add area | Bereich hinzufügen |
| Columns | | | Area · Unit · Goes to · Raise | Bereich · Einheit · Geht an · Einreichen |
| Raise values | text | | Without a name · Code | Ohne Namen · Code |
| Paused | `StatusBadge` Off | `on` false | Paused | Pausiert |
| Row menu | ⋯ | | Edit · Pause · Resume · Copy link · Delete… | Bearbeiten · Pausieren · Fortsetzen · Link kopieren · Löschen… |
| Name | text input | 1-60, unique per unit | Name | Name |
| Address | prefix + text input | 2-32 of a-z 0-9 -, unique | Address · Changing it makes printed codes invalid. | Adresse · Wenn du sie änderst, gelten gedruckte Codes nicht mehr. |
| Unit | select (Org units) | required | Unit | Einheit |
| Cases go to | select (roles), searchable | required; HD5: a role, never a person | Cases go to · Roles of this unit first, then all roles. | Fälle gehen an · Zuerst Rollen dieser Einheit, dann alle Rollen. |
| Who can raise | segmented | plan Q5 | Who can raise · Anyone, without a name · Only with a short code · Without a name, people get a reference number to read the answer. | Wer einreichen darf · Alle, ohne Namen · Nur mit Kurzcode · Ohne Namen bekommen Personen eine Referenznummer, mit der sie die Antwort lesen. |
| On | switch | | On · Off pauses the code; the poster stays. | Aktiv · Aus pausiert den Code; das Plakat bleibt hängen. |
| Devices card | | | Shared devices · Add device · used {date} {time} · never used · A shared device stays signed out. People raise without a name or sign in with their short code, and are signed out after sending. | Geteilte Geräte · Gerät hinzufügen · genutzt {date} {time} · noch nie genutzt · Ein geteiltes Gerät bleibt abgemeldet. Personen reichen ohne Namen ein oder melden sich mit ihrem Kurzcode an und werden nach dem Senden abgemeldet. |
| Device menu | ⋯ | | Edit · Set up again · Remove… | Bearbeiten · Neu einrichten · Entfernen… |
| Pairing | `SecretOnce` | 6 characters without 0 O 1 I, 30 minutes, once | Set up {device} · On the tablet, open this address and enter the code: · The code works for 30 minutes and once. · Done | {device} einrichten · Öffne auf dem Tablet diese Adresse und gib den Code ein: · Der Code gilt 30 Minuten und nur einmal. · Fertig |
| Short codes card | text + link + meta | count is company-wide | Short codes · People without a PC sign in on a shared device with a 6-digit short code. Issue it in Members, in the person's ⋯ menu. · Members → · {n} people have a short code. | Kurzcodes · Personen ohne PC melden sich an einem geteilten Gerät mit einem 6-stelligen Kurzcode an. Du stellst ihn unter Mitglieder im ⋯-Menü der Person aus. · Mitglieder → · {n} Personen haben einen Kurzcode. |
| Limits | `InfoPanel` | from `RULES` | Limits · Cases per device and area · Cases per area · Wrong short codes per device · Status checks per device · {n} in {minutes} minutes · {n} in an hour | Grenzen · Fälle pro Gerät und Bereich · Fälle pro Bereich · Falsche Kurzcodes pro Gerät · Statusabfragen pro Gerät · {n} in {minutes} Minuten · {n} pro Stunde |
| QR dialog | | | QR code for {area} · Size · Language · Deutsch · English · Both · Link · Copy link · Download QR only (PNG) · Print | QR-Code für {area} · Größe · Sprache · Deutsch · English · Beide · Link · Link kopieren · Nur QR herunterladen (PNG) · Drucken |

### Actions

- *Save* (area): toast "Saved" / "Gespeichert". Changing the address of an area that was printed asks first
  (`ConfirmDialog`): "Change the address of Linie 3? The printed codes for it stop working. Print new ones." /
  "Adresse von Linie 3 ändern? Die gedruckten Codes dafür funktionieren dann nicht mehr. Druck neue."
- *Pause* / *Resume*: toast "Linie 3 is paused. Scanning its code shows a notice." / "Linie 3 ist pausiert. Wer den
  Code scannt, sieht einen Hinweis." · "Linie 3 is active again." / "Linie 3 ist wieder aktiv."
- *Delete…* (`ConfirmDialog`): "Delete the area Linie 3? Its printed codes stop working. Cases raised there stay." /
  "Bereich Linie 3 löschen? Seine gedruckten Codes funktionieren nicht mehr. Dort eingereichte Fälle bleiben."
- *Remove…* (device): "Remove Tablet Pausenraum Montage? It is signed out at once and must be set up again." /
  "Tablet Pausenraum Montage entfernen? Es wird sofort abgemeldet und muss neu eingerichtet werden."
- A role without a linked seat on save: the drawer shows (not blocking) "Nobody sits in this role yet. Cases wait
  until someone does." / "Diese Rolle ist noch nicht besetzt. Fälle warten, bis jemand dort sitzt."
- *Print* opens the browser print dialog with the poster (print CSS, `@page` size A4 or A5).

### States

- Loading: 4 skeleton rows per card.
- No areas: `EmptyState` "No areas yet. Add one for each line, hall or gate where people should raise things." /
  "Noch keine Bereiche. Leg einen für jede Linie, Halle oder jedes Tor an, wo Personen etwas einreichen sollen." with
  *Add area*.
- No units in Org: the drawer's unit select is empty with "Add units in Org first." / "Leg zuerst Einheiten unter
  Organisation an." and a link.
- No devices: one line "No shared devices. People can still scan with their own phone." / "Keine geteilten Geräte.
  Personen können trotzdem mit dem eigenen Handy scannen."
- Sandbox: the sandbox banner (plan) above the page; QR codes work and cases are saved, but nobody is told (NTF/D8).

### Done when

- [ ] Desktop and phone in German with an anonymous area, a code area, a paused area with a vacant role.
- [ ] Area drawer (both raise modes, the address warning), device drawer and the pairing step, QR dialog (A4 and A5).
- [ ] Empty states, delete and remove dialogs.

---

## Shared shell of the phone pages

All four phone pages share one frame (no app shell, no top bar, no rail):

```
┌────────────────────────────────┐  360 × 740 (draw also 320 × 640)
│ [mark] Acme Automotive  [DE|EN]│  56 px bar, white, hairline below
├────────────────────────────────┤
│                                │
│  page content, 16 px gutter    │
│                                │
│                                │
└────────────────────────────────┘
```

- The bar: the company's mark (32 px) and name (`--nh-fs-md` 600), a language switch on the right (segmented,
  48 × 40 px per segment). No other link: a shared device must not lead into the app.
- On a shared device and signed in: a second 48 px bar under it, grey fill: "Signed in as M. Keller" and *Sign out*
  (48 px target).
- Buttons: main action black, 64 px tall, full width, `--nh-fs-lg` 600; second action grey, 56 px. Gap 12 px.
- Text: page heading `--nh-fs-3xl` 600, body `--nh-fs-lg`, hints `--nh-fs-md` `--nh-ink-2`. Nothing below 15 px.
- Inputs: 56 px, 16 px text (`--nh-fs-input`), 2 px border when focused.
- `FloorKeypad` *(proposal)*: a keypad of its own for codes and references (the phone keyboard is too small for
  gloves and covers the page): 3 × 4 keys, 72 px tall, digits 1-9, ⌫, 0, and the page's action key. Keys grey fill,
  `--nh-fs-2xl` 600. The digits typed show above in boxes (one per digit, 56 px).
- Shared device idle: after 90 s without a touch, a dialog "Still there?" / "Noch da?" with *Yes* (64 px) and a 10 s
  count; then the page clears and returns to the area's start *(proposal)*.
- Language: the device's language if German or English, else the company's default; the switch keeps the choice
  for this device.

---

## Raise from an area

- **Route:** `/[company]/floor/[area]` (proposal from the plan file; FLR fixes it), `app/(floor)/`
- **Who:** anyone who scanned the code, in an area that allows raising without a name; else a person signed in with
  their short code (otherwise the page sends them to the sign-in page).
- **Phase:** FLR (no Bauplan yet)
- **Data:** the `FloorArea` (name, unit, role, mode, on); the role's title; `promise_days`. On send *(proposal)*: a
  `case.raised` event with `title`, `body`, `kind`, `fromDept` = the area's unit name, `routeId` null and
  `assigneeRoleHolderId` = a seat of the area's role (IDN), `visibility` "everyone"; actor = the signed-in person
  (`actorUserId`) or, without a name, the system actor `system:floor` with `actorUserId` null. Without a name a
  `FloorReference { hash, caseId, companyId, createdAt }` row is written and the reference is shown once.
- **Today:** nothing. The raise page `/raise` is the idea studio, built for a desk.

**Purpose:** raise one problem or idea at this place in under a minute, with gloves.

### Layout (phone, two screens)

```
Screen 1: what                        Screen 2: say it
┌────────────────────────────────┐   ┌────────────────────────────────┐
│ [mark] Acme Automotive  [DE|EN]│   │ [mark] Acme Automotive  [DE|EN]│
├────────────────────────────────┤   ├────────────────────────────────┤
│ Werk Süd · Montage             │   │ [←  Back                    ]  │ 56 px
│ Linie 3                        │   │                                │
│                                │   │ Something is wrong             │
│ What do you want to raise?     │   │ at Linie 3                     │
│ ┌────────────────────────────┐ │   │                                │
│ │ [bolt]                     │ │   │ In a few words                 │
│ │ Something is wrong         │ │   │ [                            ] │ 56 px
│ └────────────────────────────┘ │   │                                │
│ ┌────────────────────────────┐ │   │ More detail (optional)         │
│ │ [bulb]                     │ │   │ [                            ] │
│ │ I have an idea             │ │   │ [                            ] │ 4 rows
│ └────────────────────────────┘ │   │                                │
│                                │   │ [          Send             ]  │ 64 px black
│ Goes to Schichtleitung Montage │   │                                │
│ Süd. Answer within 5 working   │   │ Goes to Schichtleitung Montage │
│ days.                          │   │ Süd. Without your name.        │
│                                │   └────────────────────────────────┘
│ Without your name. You get a   │
│ reference number to read the   │
│ answer.                        │
│ [ Sign in with your code     ] │ 56 px grey
└────────────────────────────────┘
```

- The two tiles are 112 px tall, white with a 2 px `#e5e5ea` border, 12 px radius, the stroke icon (bolt, bulb from
  `raiseIcons.tsx`, 32 px) above the label (`--nh-fs-xl` 600). Problem and idea are told apart by icon and label,
  never by colour (design system). A tap goes straight to screen 2.
- Screen 2 keeps the inputs at the top and *Send* right under them, not pinned to the bottom (the keyboard covers
  it). *Send* is disabled until "In a few words" has 3 characters.
- Signed in on a shared device: the grey "Signed in as M. Keller · Sign out" bar shows; the "Without your name" lines
  become "Raised as M. Keller." and the sign-in button goes away.
- Code-only area without a sign-in: the page redirects to the sign-in page.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Place | text | unit · area name (company data, never translated) | {unit} · {area} | {unit} · {area} |
| Question | heading | | What do you want to raise? | Was möchtest du einreichen? |
| Problem tile | tile | kind `problem` | Something is wrong | Etwas stimmt nicht |
| Idea tile | tile | kind `idea` | I have an idea | Ich habe eine Idee |
| Goes to | text | role title | Goes to {role}. Answer within {days} working days. | Geht an {role}. Antwort innerhalb von {days} Arbeitstagen. |
| Without a name | text | anonymous area | Without your name. You get a reference number to read the answer. | Ohne deinen Namen. Du bekommst eine Referenznummer, mit der du die Antwort liest. |
| Sign in | grey button | anonymous area | Sign in with your code | Mit deinem Code anmelden |
| Back | grey button | | Back | Zurück |
| Screen 2 heading | heading | | Something is wrong at {area} · An idea for {area} | Etwas stimmt nicht an {area} · Eine Idee für {area} |
| Title | text input | 3-120 characters, required | In a few words | In wenigen Worten |
| Body | textarea | ≤ 2,000, optional | More detail (optional) | Mehr Details (optional) |
| Send | black button | | Send | Senden |
| Signed in | grey bar | | Signed in as {name} · Sign out · Raised as {name}. | Angemeldet als {name} · Abmelden · Eingereicht als {name}. |

### Actions

- *Send*: the button shows a spinner and "Sending…" / "Wird gesendet…"; then the Sent page. On a shared device a
  signed-in person is signed out in the same step.
- *Sign in with your code*: the sign-in page of this area.
- *Back*: screen 1; the typed text stays.

### States

- **Rate limit** (bucket `floorRaise` per device and area, `floorRaiseAll` per area, VIS store, *proposal*): screen 2
  keeps the text and shows a grey panel above *Send*: "Too many cases from this device in a short time. Try again in
  8 minutes. Your text stays here." / "Zu viele Fälle von diesem Gerät in kurzer Zeit. Versuch es in 8 Minuten wieder.
  Dein Text bleibt hier." *Send* is disabled with the count-down. (`waitText` in `features/security/rate-limit.ts` is
  English only today; it needs a German twin, LNG.)
- **Paused area:** the whole page is one message: "This code is paused. Ask your shift lead." / "Dieser Code ist
  pausiert. Frag deine Schichtleitung." No form.
- **Unknown area** (deleted or changed address): "This code is no longer valid. Ask your shift lead for the new
  one." / "Dieser Code gilt nicht mehr. Frag deine Schichtleitung nach dem neuen."
- **Vacant role:** the page works; the "Goes to" line adds "Nobody is in this role right now; it waits for them." /
  "Diese Rolle ist gerade nicht besetzt; der Fall wartet auf sie."
- **No connection:** a grey panel "No connection. Your text stays here. Send it when the connection is back." /
  "Keine Verbindung. Dein Text bleibt hier. Sende ihn, wenn die Verbindung wieder da ist." The text is kept in the
  page's memory only (never stored on a shared device).
- **Sandbox:** works; the case is saved and the Sent page shows the sandbox line.
- Loading: the bar and two grey tile skeletons.

### Done when

- [ ] Both screens at 360 and 320 px wide, in German, anonymous and signed-in; the keyboard open on screen 2.
- [ ] Rate limit, paused, unknown area, vacant role, no connection, sending.

---

## Shared-device sign-in

- **Route:** `/[company]/floor/[area]/sign-in` (proposal from the plan file)
- **Who:** a person with a short code, on a shared device or their own phone, in any area
- **Phase:** FLR (no Bauplan yet)
- **Data** *(proposal)*: `User.floorCodeHash` of an **active** member of this company (DIR: a deactivated member cannot
  sign in); the session is a floor session only: it opens the floor pages, nothing else, and ends after one send or
  2 minutes without a touch.
- **Today:** nothing; the company login (`/[company]/login`) takes the long personal code (`acme-1a2b-3c4d`).

**Purpose:** let a person raise under their name on a shared device with six digits and gloves.

### Layout (phone)

```
┌────────────────────────────────┐
│ [mark] Acme Automotive  [DE|EN]│
├────────────────────────────────┤
│ [←  Back                    ]  │
│                                │
│ Sign in with your code         │
│ Linie 3                        │
│                                │
│ ┌──┐┌──┐┌──┐ ┌──┐┌──┐┌──┐      │  6 boxes, 56 px
│ │4 ││8 ││2 │ │• ││  ││  │      │
│ └──┘└──┘└──┘ └──┘└──┘└──┘      │
│                                │
│ ┌────────┬────────┬────────┐   │
│ │   1    │   2    │   3    │   │  FloorKeypad, 72 px keys
│ ├────────┼────────┼────────┤   │
│ │   4    │   5    │   6    │   │
│ ├────────┼────────┼────────┤   │
│ │   7    │   8    │   9    │   │
│ ├────────┼────────┼────────┤   │
│ │   ⌫    │   0    │ Sign in│   │  Sign in = black key
│ └────────┴────────┴────────┘   │
│                                │
│ No code? Ask your shift lead.  │
│ [ Raise without a name       ] │  only in anonymous areas
└────────────────────────────────┘
```

- Digits show as dots after 1 s (a neighbour may look); the last typed digit stays visible for that second.
- The *Sign in* key is enabled at 6 digits; the sixth digit does not sign in by itself (a slip of a glove).

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Heading | | | Sign in with your code | Mit deinem Code anmelden |
| Area | meta | | {area} | {area} |
| Code | 6 boxes + `FloorKeypad` | digits only | Your 6-digit code | Dein 6-stelliger Code |
| Action key | black key | 6 digits | Sign in | Anmelden |
| Help | text | | No code? Ask your shift lead. | Kein Code? Frag deine Schichtleitung. |
| Without a name | grey button | anonymous area | Raise without a name | Ohne Namen einreichen |
| Wrong code | red line under the boxes, boxes cleared | | That code is not right. Try again. | Der Code stimmt nicht. Versuch es noch einmal. |
| Signed in | toast-free, goes to raise | | Signed in as {name} | Angemeldet als {name} |

### States

- **Too many wrong codes** (bucket `floorCode` per device, *proposal*: 5 in 15 minutes): the keypad is disabled,
  "Too many wrong codes on this device. Try again in 12 minutes." / "Zu viele falsche Codes auf diesem Gerät. Versuch
  es in 12 Minuten wieder."
- **Deactivated member:** the same "That code is not right." (never say whose code it was).
- Checking: the action key shows a spinner.

### Done when

- [ ] The page empty, with 3 digits, with 6 digits, wrong code, locked by the limit; anonymous and code-only areas.

---

## Sent

- **Route:** `/[company]/floor/sent/[reference]` (proposal from the plan file; see question F3)
- **Who:** whoever just sent
- **Phase:** FLR (no Bauplan yet)
- **Data:** the reference *(proposal: 8 digits, shown in two groups of 4, random, unique per company; only its hash is
  stored)*, the role and the answer-by date (CLK working days). Shown once; reloading the page does not show it
  again.
- **Today:** nothing.

**Purpose:** confirm the case arrived and hand over the one thing the person needs to read the answer.

### Layout (phone)

```
Without a name                        Signed in
┌────────────────────────────────┐   ┌────────────────────────────────┐
│ [mark] Acme Automotive  [DE|EN]│   │ [mark] Acme Automotive  [DE|EN]│
├────────────────────────────────┤   ├────────────────────────────────┤
│ (✓)                            │   │ (✓)                            │
│ Sent                           │   │ Sent                           │
│                                │   │                                │
│ Your reference                 │   │ On the desk of Schichtleitung  │
│ ┌────────────────────────────┐ │   │ Montage Süd. Answer by         │
│ │      4821  7305            │ │   │ Mon 9 Nov.                     │
│ └────────────────────────────┘ │   │                                │
│ Write it down or take a photo. │   │ You get the answer in NextUp   │
│ It is the only way to read the │   │ and by mail, if you have one.  │
│ answer.                        │   │                                │
│                                │   │ You were signed out.           │
│ On the desk of Schichtleitung  │   │                                │
│ Montage Süd. Answer by         │   │ [          Done             ]  │
│ Mon 9 Nov.                     │   │ [ Raise something else      ]  │
│                                │   └────────────────────────────────┘
│ [ Print slip                 ] │  shared device with a printer
│ [          Done             ]  │
│ [ Raise something else      ]  │
│ This screen clears in 60 s.    │  shared device only
└────────────────────────────────┘
```

- The check is a 48 px black circle with a white ✓ (the menu glyph, design system), not an emoji.
- The reference sits in an `InfoPanel`-grey box, `--nh-mono`, `--nh-fs-4xl`, tabular, a gap between the groups.
- *Done* returns to the area's start (screen 1) and forgets the reference. On a shared device the count-down does
  the same after 60 s.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Heading | | | Sent | Gesendet |
| Reference label | | | Your reference | Deine Referenznummer |
| Keep it | text | | Write it down or take a photo. It is the only way to read the answer. | Schreib sie auf oder mach ein Foto. Nur damit kannst du die Antwort lesen. |
| Where | text | role, CLK date | On the desk of {role}. Answer by {date}. | Liegt auf dem Tisch von {role}. Antwort bis {date}. |
| Signed in | text | | You get the answer in NextUp and by mail, if you have one. · You were signed out. | Du bekommst die Antwort in NextUp und per Mail, falls du eine hast. · Du wurdest abgemeldet. |
| Print slip | grey button | paired devices only | Print slip | Beleg drucken |
| Done | black button | | Done | Fertig |
| Again | grey button | | Raise something else | Noch etwas einreichen |
| Count-down | meta | shared device | This screen clears in {n} s. | Diese Anzeige wird in {n} s gelöscht. |
| Sandbox | grey line | | Sandbox: saved, but nobody is told yet. | Sandbox: gespeichert, aber noch wird niemand benachrichtigt. |

### Done when

- [ ] Both variants at 360 and 320 px, with the count-down and the sandbox line.

---

## Status by reference

- **Route:** `/[company]/floor/status` (proposal from the plan file). The slip's QR opens it with the reference after a
  `#` (`/acme/floor/status#48217305`), so the number never reaches a server log; the page reads it and fills the
  boxes *(proposal)*.
- **Who:** anyone with a reference; no sign-in
- **Phase:** FLR (no Bauplan yet)
- **Data:** the case behind the `FloorReference`, read through VIS's case projection (`caseView`), and only these
  fields: title, area, raised date, the step, the role it sits with, and the answer: `case.decided` (yes or no and the
  reason), `case.asked` (the question), `case.handed` (to which role). Never a person's name, never comments, never
  other cases.
- **Today:** nothing.

**Purpose:** read the answer to a case raised without a name.

### Layout (phone)

```
Enter                                 Answer
┌────────────────────────────────┐   ┌────────────────────────────────┐
│ [mark] Acme Automotive  [DE|EN]│   │ [mark] Acme Automotive  [DE|EN]│
├────────────────────────────────┤   ├────────────────────────────────┤
│ Read an answer                 │   │ Kühlmittel-Leck an Linie 3     │
│                                │   │ Linie 3 · raised Mon 2 Nov     │
│ [4][8][2][1]  [7][3][0][5]     │   │                                │
│ 8 boxes, 40 px wide, 56 px tall│   │ ▬▬▬▬▬▬ ▬▬▬▬▬▬ ▬▬▬▬▬▬           │
│                                │   │ Received  On the desk Answered │
│                                │   │                                │
│ FloorKeypad                    │   │ ┌ Answer · 4 Nov ────────────┐ │
│ (action key: Show)             │   │ │ Yes.                       │ │
│                                │   │ │ Die Dichtung an Station 4  │ │
│                                │   │ │ wird in der Frühschicht    │ │
│                                │   │ │ getauscht.                 │ │
│                                │   │ │ Qualitätsleitung Werk Süd  │ │
│                                │   │ └────────────────────────────┘ │
│                                │   │                                │
│                                │   │ [ Read another answer       ]  │
└────────────────────────────────┘   └────────────────────────────────┘
```

- The track is three 5 px bars (the design system's step track): ink = done, blue = now, grey = to come. Steps:
  Received · On the desk · Answered.
- The answer is an `InfoPanel`: "Yes." or "No." in 600 on its own line, then the reason; or the question; the role
  that answered last, never the person.
- Eight boxes for the reference (two groups of 4) and the `FloorKeypad` with the action key "Show".

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Heading | | | Read an answer | Antwort lesen |
| Reference | 8 boxes + keypad | 8 digits | Your reference | Deine Referenznummer |
| Action key | black key | | Show | Anzeigen |
| Meta | text | | {area} · raised {date} | {area} · eingereicht am {date} |
| Steps | step track | | Received · On the desk · Answered | Eingegangen · Auf dem Tisch · Beantwortet |
| Waiting | text | no answer yet | On the desk of {role}. Answer by {date}. | Liegt auf dem Tisch von {role}. Antwort bis {date}. |
| Late | text, `--nh-danger` for the number | past the promise | The answer is {n} days late. {role} sees it too now. | Die Antwort ist {n} Tage überfällig. Jetzt sieht ihn auch {role}. |
| Handed | text | `case.handed` | Handed to {role} on {date}. | Am {date} an {role} weitergegeben. |
| Yes / No | `InfoPanel` | `case.decided` | Answer · {date} · Yes. · No. · {role} | Antwort · {date} · Ja. · Nein. · {role} |
| Question | `InfoPanel` | `case.asked` | {role} has a question: | {role} hat eine Frage: |
| Reply *(proposal)* | textarea + black button | one reply per question; appends `case.answered` as `system:floor` | Your answer · Send answer | Deine Antwort · Antwort senden |
| Again | grey button | | Read another answer | Andere Antwort lesen |

### States

- **Unknown reference:** "No case with this number. Check the digits." / "Kein Fall mit dieser Nummer. Prüf die
  Ziffern." The boxes stay filled for correction.
- **Rate limit** (bucket `floorStatus` per device, *proposal*: 20 in 10 minutes): "Too many tries on this device. Try
  again in 6 minutes." / "Zu viele Versuche auf diesem Gerät. Versuch es in 6 Minuten wieder."
- **Removed case** (retention, spec 05): "This case was closed and removed after {n} months." / "Dieser Fall wurde
  abgeschlossen und nach {n} Monaten entfernt."
- Loading: the track and panel as skeletons.

### Done when

- [ ] Enter (empty, filled), waiting, late, handed, yes, no, question with the reply box, unknown, rate limit, at
      360 and 320 px.

---

## Printable: QR poster

- **Made from:** the QR dialog on Areas and QR codes; printed by the browser (print CSS, `@page size: A4 portrait`
  or `A5 portrait`), one area per page. *Later:* print all areas of a unit at once.
- **Print rules:** black on white, so a cheap office printer and a laminator do it. The only colour is the NextUp mark
  (logo blue); the company's mark as uploaded. Inter only. Margins 15 mm. The QR has a quiet zone of 4 modules,
  error correction level M, no logo inside it. QR size: 120 mm on A4, 85 mm on A5 (scans from about 1.5 m and 1 m).
  Text size: headline 72 pt (A4) / 48 pt (A5); everything else at least 16 pt.
- **Language:** German, English, or both (German large, English in `--nh-ink-2` under each line).

```
A4 portrait (210 × 297 mm)
┌──────────────────────────────────────────────────┐
│ [company mark]  Acme Automotive          [NextUp]│  15 mm margin
│                                                  │
│ Problem? Idee?                                   │  72 pt, 700
│ Sag es hier - in zwei Minuten.                   │  28 pt
│                                                  │
│              ┌──────────────────┐                │
│              │                  │                │
│              │    QR 120 mm     │                │
│              │                  │                │
│              └──────────────────┘                │
│          nextup.app/acme/floor/mon-l3            │  16 pt mono
│                                                  │
│  (1) [camera]      (2) [pen]          (3) [#]      │  stroke icons
│  Code scannen      Kurz beschreiben   Nummer       │
│                                       aufheben     │
│                                                  │
│ ──────────────────────────────────────────────── │
│ Werk Süd · Montage · Linie 3                     │  20 pt 600
│ Geht an: Schichtleitung Montage Süd              │
│ Antwort innerhalb von 5 Arbeitstagen.            │
│ Ohne Namen möglich.                              │
│ Antwort lesen: nextup.app/acme/floor/status      │
└──────────────────────────────────────────────────┘
```

- The three steps use the app's stroke icons at 40 px (no new icon set) with the step number in a 32 px black
  circle.
- A code-only area replaces "Ohne Namen möglich." with "Anmeldung mit deinem Kurzcode." and drops the status line.
- A5 is the same layout scaled, with the three steps in one row of short words.

| Line | EN | DE |
|---|---|---|
| Headline | Problem? Idea? | Problem? Idee? |
| Sub | Say it here - in two minutes. | Sag es hier - in zwei Minuten. |
| Steps | Scan the code · Describe it briefly · Keep the number | Code scannen · Kurz beschreiben · Nummer aufheben |
| Goes to | Goes to: {role} | Geht an: {role} |
| Promise | Answer within {days} working days. | Antwort innerhalb von {days} Arbeitstagen. |
| Mode | No name needed. · Sign in with your short code. | Ohne Namen möglich. · Anmeldung mit deinem Kurzcode. |
| Status | Read the answer: {url} | Antwort lesen: {url} |

### Done when

- [ ] A4 and A5 in German, German and English together, and the code-only variant, as print frames at real size.

---

## Printable: reference slip

- **Made from:** *Print slip* on the Sent page, on a shared device with a printer (a small receipt printer at the
  line, or the office printer). Print CSS for an 80 mm receipt roll, and A7 (74 × 105 mm) as the fallback.
- **Content:** the reference, area, date and time, the answer-by date, a QR to the status page with the reference
  after `#`, and the keep-it line. Black only, Inter, mono for the number.

```
80 mm receipt
┌──────────────────────────────┐
│ Acme Automotive · NextUp     │  10 pt
│ Linie 3 · Mo. 2. Nov. 06:14  │
│                              │
│ Deine Referenznummer         │
│  4821 7305                   │  28 pt mono
│                              │
│ Antwort bis Mo. 9. Nov.      │
│ ┌────────┐ Antwort lesen:    │
│ │ QR     │ Code scannen oder │
│ │ 30 mm  │ nextup.app/acme/  │
│ └────────┘ floor/status      │
│                              │
│ Heb diesen Beleg auf. Nur    │
│ damit liest du die Antwort.  │
└──────────────────────────────┘
```

| Line | EN | DE |
|---|---|---|
| Label | Your reference | Deine Referenznummer |
| Due | Answer by {date} | Antwort bis {date} |
| Read | Read the answer: scan the code or {url} | Antwort lesen: Code scannen oder {url} |
| Keep | Keep this slip. It is the only way to read the answer. | Heb diesen Beleg auf. Nur damit liest du die Antwort. |

### Done when

- [ ] The slip at 80 mm and at A7, in German and English.

---

## Installed web app

- **Files:** `apps/app/public/manifest.webmanifest` (FLR brief) and its icons in `apps/app/public/brand/`
  *(proposal: `app-192.png`, `app-512.png`, `app-512-maskable.png`)*, linked from the `(floor)` layout. The existing
  `apps/app/src/app/icon.png` and `apple-icon.png` are 64 × 64 and too small: render the new sizes from
  `design-system/assets/brand/nextup-icon-blue.svg`, not from the PNG.
- **Manifest** *(proposal)*: `name` "NextUp", `short_name` "NextUp", `start_url` "/" (on a paired shared device, `/`
  opens its area), `scope` "/", `display` "standalone", `orientation` "portrait", `background_color` "#ffffff",
  `theme_color` "#ffffff", `lang` "de". A manifest per company (the company's name under the icon, `start_url` its
  floor) needs a route instead of a static file (question F2).
- **Icons:**
  - 192 and 512 px: the blue star (`nextup-icon-blue.svg`) centred on white, the star 70 % of the side, square
    corners in the file (the system rounds them).
  - 512 px maskable: the same star at 56 % of the side, so it stays inside the 80 % safe circle when Android cuts it
    to a circle or a squircle.
  - Apple touch icon 180 px: the 192 px icon scaled; it replaces `apple-icon.png`.
- **Splash:** Android builds it from `background_color`, the 512 px icon and `name`: white ground, the icon at about
  128 px in the middle, "NextUp" under it in the system font. iOS shows the white `background_color` only. Nothing
  else to make; draw the frame so the result is known.

```
Home screen                    Android splash (360 × 740)
┌──────────┐                   ┌────────────────────────────────┐
│ ┌──────┐ │                   │                                │
│ │  ✦   │ │  blue star on     │                                │
│ └──────┘ │  white, rounded   │            ┌──────┐            │
│  NextUp  │  by the system    │            │  ✦   │  128 px    │
└──────────┘                   │            └──────┘            │
                               │             NextUp             │
                               │                                │
                               └────────────────────────────────┘
```

In these frames `✦` stands for the star image.

### Done when

- [ ] Icons at 192, 512, 512 maskable (with the safe circle shown) and 180; a home-screen frame on Android and iOS;
      the Android splash frame.

---

## Open questions added by this file

| # | Question | Default here |
|---|---|---|
| F1 | ADM does not build `areas`, though the FLR brief takes them from ADM. Where do `FloorArea`, `FloorDevice` and `FloorReference` live, and who owns the schema file? | FLR adds them to `structure.prisma` (areas belong to the org) with its own migration, and names the file in its Bauplan. |
| F2 | One static manifest, or one per company (name and start page)? | Static for the pilot; a paired device opens its area from `/`. |
| F3 | The plan's route `/floor/sent/[reference]` puts the reference in the address bar and the history of a shared device. Keep it? | No: `/[company]/floor/sent` shows the reference from the send response once; the reference never goes into a URL path or query. |
| F4 | The person's short code: a new 6-digit code per person (`User.floorCodeHash`), or reuse the login code? | A new short code, issued in Members, valid only on floor pages. |
| F5 | QR codes need a package or an encoder of FLR's own (ADM/Q2, HD12). | A `deps/FLR` PR with a small QR package, merged by Kevin before FLR starts. |
| F6 | May an anonymous raiser reply to a question on the status page? | Yes, one reply per question, as `case.answered` from `system:floor`. |
