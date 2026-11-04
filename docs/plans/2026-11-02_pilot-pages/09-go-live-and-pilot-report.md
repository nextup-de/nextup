# 09 · Go-live and pilot report

> **Plan · 2026-11-02 · open: page specs for Sam. Part of [the pilot pages plan](../2026-11-02_pilot-pages.md); read its
> ground rules and shared building blocks first.**
> Two pages and one email: Go-live (the stage, the checklist and the switch-stage dialog), the Pilot report, and the
> weekly report email. They are the last group to design: PIL is the last phase of PILOT, and the report needs MET's
> numbers.

Context for this file:

- **PIL and MET are built.** Both pages follow the PILOT briefs (plans repo `projects/nextup/hauptplaene/PILOT.md`,
  `### PIL` and `### MET`) and the Baupläne written from them. **Where this file and the PIL plan differ on a function,
  field or limit, the plan wins (PIL/D5); PIL-P1 corrected this file on 2026-11-04** to what runs on `main`: no total
  number of pilot weeks; the tile "Cases per 10 people" in place of a weekly count; the weekly email goes to active
  managers only; the Baseline card is a line and a link, not a form; the mail check proves the relay, not a delivered
  mail. The pilot documents are in `docs/pilot/`. The briefs said:
  PIL: "stage switch sandbox → pilot with a checklist test; weekly pilot report from `pilotReport`"; the bootstrap
  "reports every missing setting instead of failing silently". MET: time to first answer and share answered on time
  per unit and role, with a baseline, minimum group size 5, hands PIL `pilotReport(companyId, from, to)`.
  Everything else here is marked *(proposal, not in any plan)*.
- **Stages** (`apps/app/src/features/admin/stages.ts`, `docs/SECURITY.md`, `docs/INTEGRATIONS.md` "Stages"): `demo`,
  `sandbox`, `pilot`, `live`. `policyFor(stage)` gives the demo policy to `demo` only; every other stage gets the
  real-people policy (no demo login, no switching person, no rewriting history, no shared demo codes).
  `canMoveStage`: forward always, back to `demo` never from a real stage, between real stages both ways. Today every stage
  move bumps `Company.sessionEpoch`, which signs everyone of the company out (`server/actions/admin.ts`). **Decided
  for PIL (PILOT, 2026-11-02):** only leaving `demo` or moving back to a lower stage does that; sandbox → pilot →
  live keep everyone signed in. `STAGE_MEANING` reads the company's `promise_days`.
  `STAGE_MEANING` holds today's one-line meanings.
- **What a stage changes in sending** (Bauplan NTF/D8): `sandbox` writes every message as `skipped` (reason
  "sandbox") and sends nothing; raise and discussion mails go out from `pilot` on; reminders and the digest only
  when `CompanyConfig.notifications` is on; webhooks only when `CompanyConfig.n8n` is on.
- **Today:** the stage is moved only in `/admin` (`CompanyList.tsx`: one button "sandbox → pilot", no checks). No
  report exists; the dashboard runs on `dashboardPreview` (MET replaces it).
- Text namespaces *(proposal)*: `settingsGoLive` (both pages); the email's subject and text in `mail` (NTF/D3).

---

## Go-live

- **Route:** `/[company]/settings/go-live` (new)
- **Who:** company admins. Switching to `live` is NextUp's *(Q-09-1)*.
- **Phase:** PIL (built: `src/features/pilot/go-live.ts`, `go-live-view.ts`)
- **Data:** `Company.stage`, `canMoveStage`, `STAGE_MEANING`; the checklist results *(proposal: a pure
  `goLiveChecks(company, target)` in `features/pilot/`, each check reading the tables named below)*; the stage
  history *(proposal: stage moves as audit events, GDP; INTEGRATIONS says a promotion is "logged as an event")*.
- **Today:** nothing in Settings. The Company page (spec 01) shows the stage with a link here; the sandbox banner
  says "Switch to pilot in Go-live."

**Purpose:** show where the company stands, check that it is ready for real people, and switch the stage.

### Layout (desktop)

```
Go-live                                                   [Switch to pilot]
Acme Automotive is in Sandbox since 14 Oct 2026.

┌ Stage ───────────────────────────────────────────────────────────────────┐
│   (●)━━━━━━━━━━━━━━━━━━━━━( )━━━━━━━━━━━━━━━━━━━━━( )                   │
│   Sandbox                  Pilot                   Live                  │
│   since 14 Oct             next                    after the pilot       │
│                                                                          │
│ ┌ InfoPanel ───────────────────────────────────────────────────────────┐ │
│ │              Sandbox            Pilot               Live             │ │
│ │ People       real               real                real             │ │
│ │ Messages     none leave         case mails go out   everything       │ │
│ │ Reminders    none               if switched on      if switched on   │ │
│ │ Report       not counted        counted weekly      counted weekly   │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘

┌ Ready for pilot? ─────────────────── Checked today 14:20  [Check again] ─┐
│ Needed                                                    7 of 9 done    │
│ ✓  Units and roles        12 units, 41 roles, every role has a seat      │
│ ▲  Routes                 2 routes have nobody in the owner role:        │
│                           Goods in, Safety                  Routing →    │
│ ✓  Calendar               Bavaria, Mon-Fri                               │
│ ✓  People can sign in     1,470 of 1,470 active people                   │
│ ▲  Managers' second factor  3 of 4 managers who use a code    Members →  │
│ ✓  Mail can leave         The mail relay is set up                       │
│ ✓  AI                     Off (routing by keywords)                      │
│ ✓  Backups                Last off-server backup today 03:10             │
│ ✓  Support access         No access open                                 │
│                                                                          │
│ Recommended                                                              │
│ ✓  Reminders and digest   On                                             │
│ –  Directory sync         Not connected               Connectors →       │
│ ✓  Report recipients      2 people                    Pilot report →     │
│ –  Baseline               No baseline yet             Pilot report →     │
└──────────────────────────────────────────────────────────────────────────┘

┌ History ─────────────────────────────────────────────────────────────────┐
│ 14 Oct 2026   Company created in Sandbox             NextUp              │
│ (later stage moves: date · from → to · by)                               │
└──────────────────────────────────────────────────────────────────────────┘
```

- The stage track: three circles on a line; the current stage is a filled blue circle with its name in ink 600; past
  stages a small blue check; future stages grey. Demo is never on the track.
- Checklist rows (40 px): a status mark, the check's name (`--nh-fs-md` 600, 200 px column), one result line that
  names the gap with numbers or names of units and roles, never of people (HD5), and a link to the page that fixes it.
- Status marks: ✓ blue check (done) · ▲ amber triangle (needs you, blocks) · ✕ red circle (could not check, blocks) ·
  – grey dash (not set up, a recommendation only).
- *Switch to pilot* is the page's one black action. It is disabled while any "Needed" check is not done; the reason
  sits under it on hover and on phones as a line: "2 checks need you first."
- In pilot the header action becomes *Switch back to sandbox* (grey) and the checklist title "Still ready?"; live is
  shown as the next step with the line "NextUp switches to live after the pilot."

Checks (as built, PIL D9; a check that cannot run is `unknown` and blocks like an open one):

| Check | Done when | Reads | Link |
|---|---|---|---|
| Units and roles | at least one unit; every role has at least one seat | `OrgUnit`, `OrgRole`, `OrgRoleHolder` | Org |
| Routes | at least one route; every route's owner role has someone in a seat | routing table, `OrgRoleHolder.userId` | Routing |
| Calendar | the company saved its calendar (a `CompanyCalendar` row exists) | CLK | Calendar |
| People can sign in | every active member has a login code or Microsoft | `User.loginCodeAt`, `entraOid`, Microsoft on | Members |
| Managers' second factor | every manager who signs in by code has `totpEnabledAt` | ADM-E1 fields | Members |
| Mail can leave | `SMTP_URL` is set and the relay answers (a delivered mail is not proven; see `docs/pilot/RUNBOOK.md`) | `SMTP_URL`, `mailStatus` | Notifications |
| AI | provider off, or on with a data-processing agreement date; a test model never passes | AIP settings, `CompanyConfig.dpaSignedAt` | Sign-in |
| Backups | the last **successful** backup is off the server and less than 26 hours old; a failed attempt is not shown | the status file the backup script writes (`readBackupStatus`) | – (NextUp) |
| Support access | no grant open | SEC | Support access |
| Reminders and digest *(recommended)* | `CompanyConfig.notifications` on | NTF | Notifications |
| Directory sync *(recommended)* | the last run under 24 h ago and without error | DIR `loadDirectoryStatus` | Connectors |
| Report recipients *(recommended)* | at least one recipient of the weekly email | `NotifyPreference` `pilot.report` | Pilot report |
| Baseline *(recommended)* | a baseline is set | MET `loadBaseline` | Pilot report |

No check reads signed agreements, the works council, the restore test, open findings or residual access. Those are checked
by hand in the joint setup session (PIL D17, D19); a green list does not authorise a pilot.

*Later (PIL):* a "Ready for live?" list (for example: the pilot ran at least 4 weeks; the signed agreements; the
external pentest), shown when the company is in pilot. Draw one frame with two example rows only.

### Switch-stage dialog (`ConfirmDialog`)

```
Switch Acme Automotive to pilot?
────────────────────────────────────────────────────
From now on:
• Mails about a case go to the people it concerns.
• Reminders and the daily digest go out (they are on).
• The pilot report counts from week 46 (from 9 Nov).
You can switch back to sandbox at any time.
                           [Cancel]  [Switch to pilot]
```

Back to sandbox:

```
Switch Acme Automotive back to sandbox?
────────────────────────────────────────────────────
• Messages stop at once; waiting ones are skipped.
• The pilot report pauses after week 47.
• Everyone is signed out once and signs in again.
                     [Cancel]  [Switch to sandbox]  (red text)
```

The reminder bullet follows `CompanyConfig.notifications`: "Reminders and the daily digest stay off. Switch them on
in Notifications." when it is off.

### Phone

The stage track becomes a vertical list of three rows; the meaning panel turns into one block per stage under the
track (only the current and the next stage shown, a "Show all" link for the third); checklist rows put the result
line under the name and the link on its own line. The switch button sits full width under the lead.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Lead | text | stage and the date of the last move | {company} is in {stage} since {date}. | {company} ist seit {date} in {stage}. |
| Stage names | track | | Sandbox · Pilot · Live · since {date} · next · after the pilot | Sandbox · Pilot · Live · seit {date} · als Nächstes · nach dem Pilot |
| Meaning rows | `InfoPanel` | from `policyFor` and NTF/D8 | People · Messages · Reminders · Report · real · none leave · case mails go out · everything · none · if switched on · not counted · counted weekly | Personen · Nachrichten · Erinnerungen · Bericht · echt · es geht nichts raus · Fallmails gehen raus · alles · keine · wenn eingeschaltet · wird nicht gezählt · wird wöchentlich gezählt |
| Checklist head | title + meta + button | | Ready for pilot? · Still ready? · Checked {time} · Check again · Needed · Recommended · {n} of {m} done | Bereit für den Pilot? · Noch bereit? · Geprüft um {time} · Erneut prüfen · Nötig · Empfohlen · {n} von {m} erledigt |
| Check names | text | | Units and roles · Routes · Calendar · People can sign in · Managers' second factor · Mail can leave · AI · Backups · Support access · Reminders and digest · Directory sync · Report recipients · Baseline | Einheiten und Rollen · Routen · Kalender · Alle können sich anmelden · Zweiter Faktor der Führungskräfte · Mails kommen raus · KI · Datensicherung · Support-Zugang · Erinnerungen und Zusammenfassung · Verzeichnis-Synchronisierung · Empfänger des Berichts · Ausgangswert |
| Example results | line | numbers and names of units and roles only | {n} routes have nobody in the owner role: {routes} · {n} of {m} managers who use a code · The mail relay is set up · The mail relay could not be reached. · Off (routing by keywords) · Last off-server backup {time} | {n} Routen haben niemanden in der zuständigen Rolle: {routes} · {n} von {m} Führungskräften mit Code · Der Mailserver ist eingerichtet · Der Mailserver ist nicht erreichbar. · Aus (Zuordnung nach Stichwörtern) · Letzte Sicherung außerhalb des Servers {time} |
| Blocked hint | under the button | | {n} checks need you first. | Zuerst brauchen {n} Prüfungen dich. |
| Switch to pilot | black pill | all "Needed" done | Switch to pilot | Auf Pilot umstellen |
| Switch back | grey pill | in pilot | Switch back to sandbox | Zurück auf Sandbox |
| Live line | text | in pilot | NextUp switches to live after the pilot. | NextUp stellt nach dem Pilot auf Live um. |
| Dialog (to pilot) | `ConfirmDialog` | week from `pilotReport`'s calendar | Switch {company} to pilot? · From now on: · Mails about a case go to the people it concerns. · Reminders and the daily digest go out (they are on). · Reminders and the daily digest stay off. Switch them on in Notifications. · The pilot report counts from week {week} (from {date}). · You can switch back to sandbox at any time. | {company} auf Pilot umstellen? · Ab jetzt: · Mails zu einem Fall gehen an die Personen, die er betrifft. · Erinnerungen und die tägliche Zusammenfassung gehen raus (sie sind an). · Erinnerungen und die tägliche Zusammenfassung bleiben aus. Schalte sie unter Benachrichtigungen ein. · Der Pilotbericht zählt ab KW {week} (ab {date}). · Du kannst jederzeit zurück auf Sandbox. |
| Dialog (to sandbox) | `ConfirmDialog` | | Switch {company} back to sandbox? · Messages stop at once; waiting ones are skipped. · The pilot report pauses after week {week}. · Everyone is signed out once and signs in again. | {company} zurück auf Sandbox stellen? · Nachrichten stoppen sofort; wartende werden übersprungen. · Der Pilotbericht pausiert nach KW {week}. · Alle werden einmal abgemeldet und melden sich neu an. |
| History | list | newest first | History · {from} → {to} · by {name} | Verlauf · {from} → {to} · von {name} |

### Actions

- *Check again*: runs every check; the rows show a spinner in place of the mark while running; meta "Checked
  {time}". The page also checks on load.
- *Switch to pilot*: the server runs the checks again and refuses if one "Needed" check fails ("Routes changed since
  the last check. Check again." / "Die Routen haben sich seit der letzten Prüfung geändert. Erneut prüfen."). On
  success the admin stays signed in and gets a toast on Go-live: "{company} is in pilot." / "{company} ist im
  Pilot."
- *Switch back to sandbox*: no checks; a move back to a lower stage signs everyone out once (the dialog says so), so
  the admin lands on the login afterwards.

### States

- Loading: the track and skeleton rows.
- Demo company: no track, no checklist; one `InfoPanel`: "Demo company: made-up people and cases. It never goes to
  pilot. NextUp creates a separate company for real people." / "Demo-Firma: erfundene Personen und Fälle. Sie geht
  nie in den Pilot. NextUp legt für echte Personen eine eigene Firma an."
- Live: the track with Live current; the checklist titled "Still ready?"; no switch button for company admins
  *(Q-09-1)*.
- A check that cannot run (the relay does not answer): ✕ with the line "The mail relay could not be reached.", and it
  blocks. The page does not show the relay's error text.

### Done when

- [ ] Desktop and phone in English: sandbox with two blocking checks, sandbox all green, pilot ("Still ready?", switch
      back), live, demo; both dialogs (reminders on and off variants); the refused switch; the *later* live list in its
      own frame.

---

## Pilot report

- **Route:** `/[company]/settings/pilot-report` (new)
- **Who:** company admins; the weekly email also goes to the recipients picked here
- **Phase:** PIL (page, downloads, email) on MET's pilot metrics (both built: `src/features/pilot/weeks.ts`,
  `report-mail.ts`, `report-csv.ts`, `src/lib/db/pilot-report.ts`)
- **Data:** the pilot metrics per week: cases per 10 people; median time to first reasoned answer in working days;
  share answered within `promise_days`; share of people in scope who raised a case; the same per unit, with units of
  fewer than 5 people withheld; the baseline's numbers; the company's units in tree order; `CompanyRule.promise_days`;
  the stage history (pilot week 1 = the week of the first move to pilot; there is no stored length). Recipients and the
  email switch: a `NotifyPreference` row with template `pilot.report` per active manager.
- **Today:** the page, the print view, the CSV download and the Monday mail run for a non-demo company. The login page's
  side panel shows fixed numbers.

**Purpose:** one page, one PDF and one email a week that tell the company and NextUp whether the pilot works, in
numbers against the time before.

### Layout (desktop)

```
Pilot report                                      [Download CSV] [Download PDF]
Week 46 · 9-15 Nov 2026 · pilot week 2                ( ‹ )  Week 46  ( › )

┌ Cases per 10 ────┐ ┌ First answer ────┐ ┌ Answered on time ┐ ┌ Using NextUp ───┐
│ people           │ │ 1.6 working days │ │ 84 %             │ │ 61 %            │
│ 2.8              │ │ median           │ │ within 5 working │ │ baseline 38 %   │
│ baseline 1.2     │ │ baseline 6.5     │ │ days             │ │ 23 points more  │
│ 1.6 more than    │ │ 4.9 days faster  │ │ baseline 41 %    │ │ than the        │
│ the baseline     │ │ than the baseline│ │ 43 points more … │ │ baseline        │
└──────────────────┘ └──────────────────┘ └──────────────────┘ └─────────────────┘

┌ More numbers ────────────────────────────────────────────────────────────┐
│ Handed to a deputy (%) · Decided projects done (%) · Verified savings …  │
└──────────────────────────────────────────────────────────────────────────┘

┌ Week by week ────────────────────────────────────────────────────────────┐
│ Week            Cases per 10 people  First answer  On time  Using NextUp │
│ 45 · 2-8 Nov           2.4              2.1         77 %       54 %      │
│ 46 · 9-15 Nov          2.8              1.6         84 %       61 %      │
└──────────────────────────────────────────────────────────────────────────┘

┌ By unit ─────────────────────────────────────────────────────────────────┐
│ Units of fewer than 5 people are hidden to protect individuals.          │
│ Unit                      People   Using NextUp   Cases per 10 people    │
│ Werk Süd                    640       58 %            2.9                │
│   Assembly                  410       55 %            2.8                │
│   Quality                    86       71 %            3.1                │
│   Plant safety                3    Too few to show                       │
│ Werk Nord                   790       63 %            2.4                │
│ Board                         4    Too few to show                       │
└──────────────────────────────────────────────────────────────────────────┘

┌ Baseline ────────────────────────────────────────────────────────────────┐
│ Compared with: 26 Oct - 8 Nov 2026                      Baseline →       │
└──────────────────────────────────────────────────────────────────────────┘

┌ Weekly email ──────────────────────────────────────────── [on ] ─────────┐
│ Every Monday at 07:00 to                                                 │
│ (HS) H. Sander  ×   (LB) L. Brandt  ×   [ Add a manager…         ▾]      │
│ [Send me this week's email]                                [ Save ]      │
└──────────────────────────────────────────────────────────────────────────┘
```

- Tiles: four equal white cards in one row, `--nh-pad-card-sm`: cases per 10 people, first answer, answered on time,
  using NextUp. Label `--nh-fs-sm` 600 `--nh-mute`; value `--nh-fs-2xl` 600 with tabular figures; the baseline line
  `--nh-fs-sm` `--nh-ink-2`. There is no sparkline and no head count in a tile ("Using NextUp" is a percentage only, or
  "Too few to show" below 5 people). No green or red for better or worse: the words carry it. The other numbers
  (handed to a deputy, decided projects done, verified results, overruled proposals, raised again after a No) sit in a
  card "More numbers" under the tiles.
- The delta is written, not coloured: under the value "4.9 days faster than the baseline" / "24 more than the
  baseline" *(only when a baseline exists)*.
- Week by week: a `DataTable` of the pilot weeks, oldest first, without a baseline row (the tiles carry the baseline). A
  running week is marked "so far" in `--nh-mute`. The pilot has no stored length, so no page, print view or mail shows
  a total number of weeks or counts weeks to an end.
- By unit: the units in their tree order (indent 16 px a level), **never sorted by a number** and no sort control
  (HD5: no rankings). A unit with fewer than 5 people shows the inline `TooFewToShow` ("Too few to show") across its
  number cells, with the block's full sentence once in the card's hint line.
- Baseline: a line and a link, not a form. With a baseline it reads "Compared with: {from} - {to}" and links to the
  Dashboard, where the baseline is set (MET); without one it is an amber hint "Pick a baseline so the report can
  compare." with the same link. The segmented choice and the three entered numbers are not on this page.
- Weekly email: the people picker lists the company's **active managers** only (by id, HD10); anybody else is refused
  ("Only active managers can get this email."). When the company enters pilot and no recipient was ever chosen, every
  active manager is switched on. The send happens only for a manager who is still active at send time.

### Phone

The header actions move under the lead as two grey buttons side by side; the week switch below them. Tiles stack
2 × 2. Week by week shows Week, Cases per 10 people and On time; the rest in a row tap. By unit becomes a list: unit
name, "58 % using · 2.9 cases per 10 people", or "Too few to show". Baseline and Weekly email stack.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Lead | text | ISO weeks, Mon-Sun; no total (D5) | Week {week} · {from}-{to} · pilot week {n} | KW {week} · {from}-{to} · Pilotwoche {n} |
| Week switch | prev / next | from pilot week 1 to the current week | Previous week · Next week | Vorherige Woche · Nächste Woche |
| Tile: cases | number | `case.raised` in the week per 10 active people in scope (`casesPer10`); "Too few to show" below 5 people | Cases per 10 people · baseline {n} · {n} more than the baseline · {n} fewer than the baseline | Fälle pro 10 Personen · Ausgangswert {n} · {n} mehr als der Ausgangswert · {n} weniger als der Ausgangswert |
| Tile: first answer | number | median, working days, 1 decimal | First answer · {n} working days · median · baseline {n} · {n} days faster than the baseline · {n} days slower than the baseline | Erste Antwort · {n} Arbeitstage · Median · Ausgangswert {n} · {n} Tage schneller als der Ausgangswert · {n} Tage langsamer als der Ausgangswert |
| Tile: on time | percent | first answer within `promise_days` | Answered on time · within {days} working days · baseline {n} % | Rechtzeitig beantwortet · innerhalb von {days} Arbeitstagen · Ausgangswert {n} % |
| Tile: using | percent only | people who raised a case in the week / active people in scope (`participationPct`); "Too few to show" below 5 raisers; no head count | Using NextUp · {n} points more than the baseline · {n} points fewer than the baseline · Too few to show | Nutzen NextUp · {n} Punkte mehr als der Ausgangswert · {n} Punkte weniger als der Ausgangswert · Zu wenige zum Anzeigen |
| More numbers | list | the other pilot metrics, "Not recorded" where nothing is recorded | More numbers · Handed over to a deputy (%) · Decided projects done (%) · Proposals changed by a person (%) · Not recorded | Weitere Zahlen · An eine Vertretung übergeben (%) · Entschiedene Projekte umgesetzt (%) · Vorschläge, die eine Person geändert hat (%) · Nicht erfasst |
| Week table | `DataTable` | pilot weeks only | Week by week · Week · Cases per 10 people · First answer · On time · Using NextUp · so far | Woche für Woche · Woche · Fälle pro 10 Personen · Erste Antwort · Rechtzeitig · Nutzen NextUp · bisher |
| Unit table | tree list | < 5 people → `TooFewToShow` | By unit · Units of fewer than 5 people are hidden to protect individuals. · Unit · People · Using NextUp · Cases per 10 people | Nach Einheit · Einheiten mit weniger als 5 Personen sind ausgeblendet, um Einzelne zu schützen. · Einheit · Personen · Nutzen NextUp · Fälle pro 10 Personen |
| Baseline | line + link | set on the Dashboard (MET); no form here | Baseline · Compared with · Baseline → · Pick a baseline so the report can compare. | Ausgangswert · Verglichen mit · Ausgangswert → · Wähle einen Ausgangswert, damit der Bericht vergleichen kann. |
| Weekly email | switch + picker | active managers by id | Weekly email · Every Monday at 07:00 to · Add a person… · Send me this week's email · Only active managers can get this email. | Wöchentliche E-Mail · Jeden Montag um 07:00 an · Person hinzufügen… · Mir die E-Mail dieser Woche senden · Nur aktive Managerinnen und Manager können diese E-Mail bekommen. |
| Downloads | buttons | | Download CSV · Download PDF | CSV herunterladen · PDF herunterladen |

### Actions

- *Download PDF*: opens the print view `/[company]/settings/pilot-report/print?week={week}` *(proposal: the browser
  saves it as PDF, so no PDF package is needed, HD12)*. A4 portrait: NextUp mark and the company's mark, the lead, the
  four tiles, Week by week, By unit, the baseline source, a footer "Units of fewer than 5 people are hidden. Made by
  NextUp on {date}." / "Einheiten mit weniger als 5 Personen sind ausgeblendet. Erstellt von NextUp am {date}."
- *Download CSV*: `{slug}-pilot-report-{from}-{to}.csv`, UTF-8, one row per week and one per unit and week; a hidden
  unit's numbers are empty and its column `hidden` says "fewer than 5 people".
- *Save* (Baseline, Weekly email): toast "Saved" / "Gespeichert".
- *Send me this week's email*: toast "Sent to {email}." / "An {email} gesendet." In sandbox: "Sandbox: nothing is
  sent. Switch to pilot in Go-live." / "Sandbox: Es wird nichts verschickt. Wechsel auf Pilot unter Start."

### States

- Before the pilot (sandbox): `EmptyState` "The report starts when {company} switches to pilot." / "Der Bericht
  beginnt, wenn {company} auf Pilot umstellt." + *Go to Go-live →*. The Baseline and Weekly email cards are shown
  under it, so they can be set up first.
- Demo company: the page with the demo's made-up numbers and a grey line "Demo company: made-up numbers." /
  "Demo-Firma: erfundene Zahlen."
- No baseline yet: tiles show "No baseline yet" / "Noch kein Ausgangswert" in place of the baseline line; the
  Baseline card gets an amber hint "Pick a baseline so the report can compare." / "Wähle einen Ausgangswert, damit
  der Bericht vergleichen kann."
- A week without cases: 0, "–" for first answer and on time, with the line "No cases this week." / "Keine Fälle in
  dieser Woche."
- The running week: "so far" / "bisher" next to the week and the time of the numbers: "Numbers until today 14:00." /
  "Zahlen bis heute 14:00."
- Back in sandbox after a pilot: the pilot weeks stay; a grey line "Paused since {date}: {company} is in sandbox." /
  "Pausiert seit {date}: {company} ist in der Sandbox."
- Loading: skeleton tiles and rows.

### The weekly report email

Sent Monday 07:00 Europe/Berlin for the week before; when Monday is not a working day (CLK `isWorkday`), on the next
working day (built). Through NTF's outbox, template `pilot.report`, key `pilot:<isoWeek>:<userId>`; only to active
managers who were chosen as recipients; in
sandbox it is written as skipped like every message (NTF/D8). Same layout as today's notice mails (the invitation
email in spec 01 follows it too).

```
Subject: NextUp pilot report, week 46: Acme Automotive

Week 46 · 9-15 Nov 2026 · pilot week 2

Cases per 10 people: 2.8 (Baseline: 1.2)
First answer (median): 1.6 working days (Baseline: 6.5 working days)
Answered on time: 84 % (Baseline: 41 %)
Using NextUp: 61 % (Baseline: 38 %)

By unit: 12 units shown, 2 hidden (fewer than 5 people).

[ Open the report ]

You get this as a recipient of Acme Automotive's pilot report.
Stop these emails →
```

| Element | Rules | EN | DE |
|---|---|---|---|
| Subject | | NextUp pilot report, week {week}: {company} | NextUp-Pilotbericht, KW {week}: {company} |
| Lead line | no total (D5) | Week {week} · {from}-{to} · pilot week {n} | KW {week} · {from}-{to} · Pilotwoche {n} |
| Lines | the four numbers, each with its baseline in brackets, as plain text lines (not a table); no per-unit numbers in the mail | Cases per 10 people · First answer (median) · Answered on time · Using NextUp · Baseline | Fälle pro 10 Personen · Erste Antwort (Median) · Rechtzeitig beantwortet · Nutzen NextUp · Ausgangswert |
| Units line | counts only | By unit: {shown} units shown, {hidden} hidden (fewer than 5 people). | Nach Einheit: {shown} Einheiten gezeigt, {hidden} ausgeblendet (weniger als 5 Personen). |
| Button | link to the page, nothing else in the URL | Open the report | Bericht öffnen |
| Foot | link to the page's Weekly email card | You get this as a recipient of {company}'s pilot report. · Stop these emails → | Du bekommst diese E-Mail, weil du den Pilotbericht von {company} erhältst. · Diese E-Mails abbestellen → |

### Done when

- [ ] Desktop and phone in English: a pilot week with a baseline, the unit table with two hidden units, the running
      week, no baseline yet, a week without cases, before the pilot, paused, demo; the Baseline card (line and link,
      with and without a baseline); the print view (A4); the email in German and English.

---

## Open questions added by this file

| # | Question | Default |
|---|---|---|
| Q-09-1 | Who switches the stage? `live` means a paying customer. | Company admins switch sandbox ⇄ pilot on Go-live; pilot → live stays NextUp's in `/admin`, after the contract. |
| Q-09-2 | Every stage move signs the whole company out (`sessionEpoch`). Keep that for moves between real stages? | Decided (PILOT, PIL): only leaving `demo` or moving back signs everyone out; sandbox → pilot → live keep sessions. |
| Q-09-3 | What is the baseline: a period of NextUp data (MET brief) or numbers from before NextUp (the demo seed's "baseline survey")? | Decided (PIL D5): the baseline is set on the Dashboard (MET), which may use the two weeks before the pilot or imported numbers; the report page only shows it and links there. |
| Q-09-4 | Is the PDF a print view saved by the browser, or a server-made file (needs a package, HD12)? | Print view. |
