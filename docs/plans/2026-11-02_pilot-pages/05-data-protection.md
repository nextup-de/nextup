# 05 · Data protection

> **Plan · 2026-11-02 · open: page specs for Sam. Part of [the pilot pages plan](../2026-11-02_pilot-pages.md); read its
> ground rules and shared building blocks first.**
> Two settings pages (Data and privacy, Audit log), two dialogs opened from Members (export a person's data,
> pseudonymise a person) and one email ("your export is ready"). They answer what an IT department, a data
> protection officer and a works council ask before a pilot: how long is what kept, who changed what, and how does a
> person get or lose their data.

Context for this file:

- **GDP has no Bauplan yet.** These pages follow the PILOT brief `### GDP` (plans repo
  `projects/nextup/hauptplaene/PILOT.md`): audit events for admin actions (create, stage, codes, tokens, delete), an
  audit view, company and person export as JSON, person deletion or pseudonymisation, retention rules for events,
  drafts and assistant turns, a screenshot policy per company. Risk named there: the log is append-only, so
  pseudonymisation replaces names *in projections and display; ids stay*. **The pages may change when the GDP
  Bauplan is written**; every field no plan names is marked *(proposal, not in any plan)*.
- Code area of the brief: `features/privacy/`, `server/audit/`, `ops.prisma` (GDP is the only phase that changes
  it, HD11). GDP takes `visibleTo` and the projections from VIS; it hands the `audit.*` events to EID (log export)
  and the export and deletion functions to SEC (TOMs).
- The brief puts the audit view at `(app)/admin/audit`. This spec puts it under Settings so company admins find
  everything in one place (plan Q2, default yes). The stack's `/admin` may show the same list per company.
- Decisions: **HD5** (roles, not people: no per-person counts, the audit log lists actions, never a ranking of who
  did most), **HD14** (the personnel number is never shown, never in an export preview and not in any export file),
  **HD10** (people are picked by id).
- What exists on `main` today (f05fc56):
  - `CompanyConfig.retentionDays` (Int, default 90) and `CompanyConfig.redactPatterns` (String[]) in
    `integrations.prisma`. `retentionDays` deletes assistant turns (`purgeAssistTurns` in `lib/db/assist.ts`, run
    after each assistant question); both are edited in `/admin` (`components/admin/AssistSettingsForm.tsx`, 1-365
    days). `CompanyConfig.dpaSignedAt` holds the date the data-processing agreement was signed.
  - `/admin/company-data` (`components/admin/DataOverview.tsx`) shows the same facts read-only for the NextUp team.
  - `AssistTurn` (redacted text only), `IdeaDraft` and `IdeaTurn` (private to the author until published; nobody,
    no admin, reads a draft) in `core.prisma`; `Ticket.screenshot` in `ops.prisma` (the bug report's screenshot; a
    copy of the ticket, screenshot included, goes to the NextUp team at admin.sellux.ch). Screenshots attached when
    raising a case stay in the raiser's browser (`lib/shots`); only their count is stored (`attachments`).
  - No audit table, no export, no pseudonymisation.
- Text namespaces *(proposal)*: `settingsPrivacy` (Data and privacy, both dialogs), `settingsAudit` (Audit log),
  `mail` (the export email, keys `export*`).
- Test ids: `settings-privacy-<thing>`, `settings-audit-<thing>`, `member-export-<thing>`,
  `member-pseudonymise-<thing>`.

---

## Data and privacy

- **Route:** `/[company]/settings/privacy` (new)
- **Who:** company admins (ADM/D6). Read-only for nobody else; everyone else gets "not found".
- **Phase:** GDP (no Bauplan yet). The settings frame and the section entry come from ADM-G1 (`SETTINGS_SECTIONS`,
  group "Data and security").
- **Data:**
  - Retention: `CompanyConfig.retentionDays` (assistant conversations, exists). *(proposal, not in any plan)*
    `CompanyConfig.draftRetentionDays Int @default(180)` (unpublished idea drafts) and
    `CompanyConfig.caseRetentionMonths Int?` (closed cases; null = keep). The audit log's own retention is fixed at
    24 months *(proposal)*.
  - Masking: `CompanyConfig.redactPatterns` (exists; regex sources, applied by `features/assist/redact.ts` before
    anything reaches a model). The built-in masks (names, emails, phone numbers, IBANs, card numbers, vehicle ids,
    secrets) are fixed.
  - Screenshots *(proposal, not in any plan)*: `CompanyConfig.reportScreenshots Boolean @default(true)` (bug reports
    may carry a screenshot) and `CompanyConfig.caseScreenshots Boolean @default(true)` (people may attach
    screenshots when raising; they stay in their browser).
  - Exports *(proposal)*: one `DataExport` row per request in `ops.prisma` (kind company or person, subject user id,
    requested by user id, deliver to `person` or `admin`, status preparing / ready / expired / failed, size,
    `expiresAt`). The file is deleted when it expires.
  - The data-processing agreement date `CompanyConfig.dpaSignedAt` (read-only here; set by the NextUp team).
- **Today:** retention and masking are edited by the NextUp team in `/admin`; the company sees none of it.

**Purpose:** decide how long NextUp keeps what, what is masked before the AI reads it, whether screenshots are
allowed, and get a copy of all of the company's data.

### Layout (desktop)

```
Data and privacy
How long NextUp keeps what at Acme Automotive, and how data leaves it.

┌ InfoPanel ────────────────────────────────────────────────────────────┐
│ Data-processing agreement   signed 14 Oct 2026                        │
│ Where the data is           this company's own server                 │
│ Personnel numbers           stored for directory sync, never shown    │
│                             and never exported                        │
└───────────────────────────────────────────────────────────────────────┘
┌ How long data is kept ────────────────────────────────────────────────┐
│ Assistant conversations     [ 90 ] days                               │
│                             Questions and answers on the raise page,  │
│                             stored masked.                            │
│ Unpublished idea drafts     [ 180 ] days after the last change        │
│                             Published ideas stay: they are cases.     │
│ Closed cases                ( Keep | Remove after ) [ 24 ] months     │
│                             Removing also takes them out of the       │
│                             dashboards' history.                      │
│ Audit log                   24 months (fixed)                         │
│ ───────────────────────────────────────────────────────────────────── │
│ Last run today 03:00 · removed 412 conversation turns, 9 drafts       │
│                                                            [ Save ]   │
└───────────────────────────────────────────────────────────────────────┘
┌ Masked before the AI reads it ────────────────────────────────────────┐
│ Always masked: names (replaced by roles), email addresses, phone      │
│ numbers, IBANs, card numbers, vehicle ids, passwords and keys.        │
│ Company patterns            [PT-\d{4} ×] [Projekt Falke ×] [+ Add]    │
│ Try it                      [ Prototyp PT-4711 klemmt an Linie 3   ]  │
│                             → Prototyp [restricted] klemmt an Linie 3 │
│                                                            [ Save ]   │
└───────────────────────────────────────────────────────────────────────┘
┌ Screenshots ──────────────────────────────────────────────────────────┐
│ [on ] Bug reports may include a screenshot                            │
│       The report and its screenshot go to the NextUp support team.    │
│ [on ] People may attach screenshots when they raise something         │
│       They stay in that person's browser; NextUp stores only the      │
│       count.                                                          │
│                                                            [ Save ]   │
└───────────────────────────────────────────────────────────────────────┘
┌ Exports ─────────────────────────────────────── [Export company data] ┐
│ What                      Requested           Status        Expires   │
│ All company data          H. Sander, 2 Nov    Ready  [Download] 9 Nov │
│ L. Brandt (to the person) H. Sander, 1 Nov    Sent          8 Nov     │
│ M. Keller (to you)        H. Sander, 28 Oct   Expired       –         │
│ Exports of one person start in Members, in the person's ⋯ menu.       │
└───────────────────────────────────────────────────────────────────────┘
```

- Label column 260 px (the German labels are long), the field, then its unit on the same line, the hint under it
  in `nh-hint`. Same grid as Rules ([01](01-settings-and-structure.md#rules)).
- "Closed cases" is a segmented control; the months field shows only with *Remove after* and is disabled otherwise.
- The "Last run" line is a meta line (`--nh-fs-sm`, `--nh-mute`) with company totals only, never per person.
- The masking test field runs the same function as the server (`redact`) on what is typed, in the browser, with the
  saved and the unsaved patterns; nothing is sent or stored. Masked parts show on a grey fill.
- Exports is a `DataTable` (5 rows, then "Show all"). *Download* shows only on rows delivered to the admin.

### Phone

Cards stack. Labels above their fields; field and unit on one row. The Exports table becomes stacked cards (what,
status badge, requested line, *Download* full width). *Export company data* moves under the card title, full width.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Lead | text | | How long NextUp keeps what at {company}, and how data leaves it. | Wie lange NextUp was bei {company} aufbewahrt und wie Daten NextUp verlassen. |
| Agreement | `InfoPanel` row | `dpaSignedAt`; none: amber text | Data-processing agreement · signed {date} · not signed yet - the AI stays off | Auftragsverarbeitungsvertrag · unterschrieben am {date} · noch nicht unterschrieben - die KI bleibt aus |
| Where | `InfoPanel` row | fixed text | Where the data is · this company's own server | Wo die Daten liegen · auf dem eigenen Server dieser Firma |
| Personnel numbers | `InfoPanel` row | HD14 | Personnel numbers · stored for directory sync, never shown and never exported | Personalnummern · für den Verzeichnisabgleich gespeichert, nie angezeigt und nie exportiert |
| Card title | | | How long data is kept | Wie lange Daten aufbewahrt werden |
| Assistant conversations | number + days | 7-730, default 90 (`retentionDays`) | Assistant conversations · days · Questions and answers on the raise page, stored masked. | Gespräche mit dem Assistenten · Tage · Fragen und Antworten auf der Seite zum Einreichen, maskiert gespeichert. |
| Drafts *(proposal)* | number + days | 30-730, default 180 | Unpublished idea drafts · days after the last change · Published ideas stay: they are cases. | Nicht veröffentlichte Ideenentwürfe · Tage nach der letzten Änderung · Veröffentlichte Ideen bleiben: Sie sind Fälle. |
| Closed cases *(proposal)* | segmented + number | Keep (default) or 12-120 months | Closed cases · Keep · Remove after · months · Removing also takes them out of the dashboards' history. | Abgeschlossene Fälle · Behalten · Entfernen nach · Monaten · Entfernte Fälle fehlen auch im Verlauf der Dashboards. |
| Audit log | read-only | 24 months | Audit log · 24 months (fixed) | Protokoll · 24 Monate (fest) |
| Last run *(proposal)* | meta | company totals | Last run {date} {time} · removed {turns} conversation turns, {drafts} drafts, {cases} cases | Letzter Lauf {date} {time} · {turns} Gesprächsbeiträge, {drafts} Entwürfe, {cases} Fälle entfernt |
| Card title | | | Masked before the AI reads it | Maskiert, bevor die KI es liest |
| Always masked | text | fixed list | Always masked: names (replaced by roles), email addresses, phone numbers, IBANs, card numbers, vehicle ids, passwords and keys. | Immer maskiert: Namen (durch Rollen ersetzt), E-Mail-Adressen, Telefonnummern, IBANs, Kartennummern, Fahrzeug-Identnummern, Passwörter und Schlüssel. |
| Company patterns | chips + add | each a valid regex, 1-100 characters, ≤ 30; or plain words | Company patterns · Add · A word or a pattern, for example project code names. | Firmeneigene Muster · Hinzufügen · Ein Wort oder ein Muster, zum Beispiel Projekt-Codenamen. |
| Try it | text input + result line | browser only | Try it · Type a sentence to see what the AI would get. | Ausprobieren · Gib einen Satz ein und sieh, was die KI bekäme. |
| Card title | | | Screenshots | Screenshots |
| Report screenshots *(proposal)* | switch | | Bug reports may include a screenshot · The report and its screenshot go to the NextUp support team. | Fehlermeldungen dürfen einen Screenshot enthalten · Die Meldung und ihr Screenshot gehen an das NextUp-Supportteam. |
| Case screenshots *(proposal)* | switch | | People may attach screenshots when they raise something · They stay in that person's browser; NextUp stores only the count. | Beim Einreichen dürfen Screenshots angehängt werden · Sie bleiben im Browser der Person; NextUp speichert nur die Anzahl. |
| Card title | | | Exports | Exporte |
| Company export button | grey pill | | Export company data | Firmendaten exportieren |
| Columns | | | What · Requested · Status · Expires | Was · Angefordert · Status · Läuft ab |
| What values | | | All company data · {name} (to the person) · {name} (to you) | Alle Firmendaten · {name} (an die Person) · {name} (an dich) |
| Status values | `StatusBadge` | Preparing = amber, Ready = On, Sent = On, Expired = Off, Failed = Error | Preparing · Ready · Sent · Expired · Failed | Wird erstellt · Bereit · Verschickt · Abgelaufen · Fehlgeschlagen |
| Footnote | hint | | Exports of one person start in Members, in the person's ⋯ menu. | Exporte einer einzelnen Person startest du unter Mitglieder im ⋯-Menü der Person. |

### Actions

- *Save* (per card): toast "Saved" / "Gespeichert". The retention card adds: "Saved. The next run at 03:00 uses the
  new rules." / "Gespeichert. Der nächste Lauf um 03:00 nutzt die neuen Regeln."
- Shortening a period asks first (`ConfirmDialog`): "Shorten assistant conversations to 30 days? At 03:00 NextUp
  deletes about 1,240 conversation turns older than that. This cannot be undone." / "Gespräche mit dem Assistenten
  auf 30 Tage kürzen? Um 03:00 löscht NextUp etwa 1.240 Gesprächsbeiträge, die älter sind. Das lässt sich nicht
  rückgängig machen." Buttons: Cancel · Shorten (red). The count is the company total.
- Switching *Closed cases* to *Remove after* asks the same way and names the number of closed cases older than the
  period.
- A pattern that is not a valid expression: field error "This pattern does not work: {reason}. Use a plain word if
  in doubt." / "Dieses Muster funktioniert nicht: {reason}. Nimm im Zweifel ein einfaches Wort."
- *Export company data* (`ConfirmDialog`): "Export all data of Acme Automotive? The file holds structure, rules,
  members, every case and project with its history, and masked assistant conversations. It leaves out idea drafts
  (private to their authors), sign-in codes, keys and personnel numbers. It is ready in a few minutes and can be
  downloaded for 7 days." / "Alle Daten von Acme Automotive exportieren? Die Datei enthält Struktur, Regeln,
  Mitglieder, alle Fälle und Projekte mit ihrem Verlauf und die maskierten Gespräche mit dem Assistenten. Sie enthält
  keine Ideenentwürfe (die gehören ihren Autorinnen und Autoren), keine Anmeldecodes, Schlüssel und Personalnummern.
  Sie ist in wenigen Minuten fertig und 7 Tage lang abrufbar." Buttons: Cancel · Export. Toast "Export started. We
  email you when it is ready." / "Export gestartet. Wir schicken dir eine E-Mail, sobald er fertig ist." Writes the
  audit event *Company data exported*.
- *Download*: a JSON file `acme-export-2026-11-02.json` (one object per table, ids kept, dates in ISO). Writes the
  audit event *Export downloaded*.

### States

- Loading: skeleton bars in each card.
- No agreement: the agreement row in amber, and the assistant row's hint adds "The assistant stays off until the
  agreement is signed." / "Der Assistent bleibt aus, bis der Vertrag unterschrieben ist."
- No exports yet: the table's `EmptyState` "No exports yet." / "Noch keine Exporte." with *Export company data*.
- Export failed: `StatusBadge` Error and the line "The export stopped: {reason}. Start it again." / "Der Export ist
  abgebrochen: {reason}. Starte ihn neu."
- Sandbox: the export works; its email is not sent (NTF/D8). The row says "Ready" and the admin downloads it here.

### Done when

- [ ] Desktop and phone frames in German; closed cases *Keep* and *Remove after*; agreement signed and not signed.
- [ ] The shorten dialog, the export dialog, a pattern error, the masking test with a masked part.
- [ ] Exports table with every status, and its empty state.

---

## Audit log

- **Route:** `/[company]/settings/audit` (new; the brief's `(app)/admin/audit`, moved to Settings by plan Q2)
- **Who:** company admins. The stack's `/admin` may list the same rows for the NextUp team.
- **Phase:** GDP (no Bauplan yet)
- **Data** *(proposal, not in any plan; GDP names the table)*: `AuditEvent` in `ops.prisma`: `id`, `companyId`,
  `at`, `actorUserId` (null for system and break-glass), `actorKind` (`admin` · `stack-admin` · `break-glass` ·
  `system` · `api-token` · `directory`), `action` (the event type, `audit.<area>.<verb>`), `targetKind`, `targetId`,
  `changes` (Json: field names with before and after; secrets only as "set" or "replaced", never a value),
  `source` (`settings` · `admin` · `api` · `directory` · `scheduler`). Append-only like `CaseEvent`. The same
  events go to EID's log export as `audit.*`.
- **Today:** nothing. ADM-E1 writes one log line per break-glass use (`[admin] break-glass <ISO time>`), not a row.

**Purpose:** see every change an admin, the NextUp team or the system made to this company, and what exactly
changed.

### What is recorded

The five kinds the brief names come first; the rest is *(proposal)*.

| Area | Action (EN / DE) | Event | Source |
|---|---|---|---|
| Company | Company created / Firma angelegt | `audit.company.created` | brief |
| Company | Stage changed / Phase geändert | `audit.company.stage` | brief |
| Sign-in | Login code issued / Anmeldecode ausgestellt | `audit.member.code` | brief |
| API | Token created / Token erstellt · Token revoked / Token widerrufen | `audit.token.created`, `audit.token.revoked` | brief |
| Members | Member deleted / Mitglied gelöscht | `audit.member.deleted` | brief |
| Members | Invited / Eingeladen · App role changed / App-Rolle geändert · Deactivated / Deaktiviert · Reactivated / Reaktiviert · Seat linked / Platz verknüpft · Seat unlinked / Platz gelöst | `audit.member.*` | proposal |
| Privacy | Company data exported / Firmendaten exportiert · Person's data exported / Daten einer Person exportiert · Export downloaded / Export heruntergeladen · Person pseudonymised / Person pseudonymisiert · Retention changed / Aufbewahrung geändert · Retention run / Aufbewahrungslauf | `audit.privacy.*` | proposal |
| Settings | Company, Rules, Calendar, Org, Routing, Notifications, Areas saved / … gespeichert | `audit.settings.<section>` | proposal |
| Connectors | Connector switched on / eingeschaltet · off / ausgeschaltet · Key replaced / Schlüssel ersetzt | `audit.connector.*` | proposal |
| Access | Admin opened with the shared code / Admin mit dem gemeinsamen Code geöffnet · Support access granted / Supportzugang gewährt (SEC) | `audit.access.*` | proposal |

### Layout (desktop)

```
Audit log                                                    [Export CSV]
Every change made to Acme Automotive's setup. Entries cannot be edited
and are kept for 24 months.

[Last 30 days ▾] [Action ▾] [By ▾] [ Search target…             ]

┌──────────────────────────────────────────────────────────────────────┐
│ When            By                         Action           Target    │
│ 2 Nov 14:20     H. Sander · Company admin  Seat linked      Quality   │
│                                                             lead Süd  │
│ 2 Nov 11:02     NextUp team · K. Schmid    Stage changed    Acme      │
│                                            Sandbox → Pilot  Automotive│
│ 1 Nov 03:00     System                     Retention run    412 turns │
│ 31 Oct 16:45    Shared admin code          Admin opened     –         │
│ 31 Oct 09:12    H. Sander · Company admin  Token revoked    n8n sync  │
│ 30 Oct 17:30    Entra sync                 Deactivated      M. Keller │
│ …                                                                     │
│ 1-50 of 312                                         ( ‹ )  ( › )      │
└──────────────────────────────────────────────────────────────────────┘
```

- `DataTable`, newest first, 50 rows a page. A second line under the action holds a short change summary when it
  fits ("Sandbox → Pilot", "Member → Leader").
- *By* shows the person and their kind: "H. Sander · Company admin", "NextUp team · {name}" (stack admin),
  "Shared admin code" (break-glass, no person), "System" (scheduler), "Entra sync" (directory), "API token {name}".
- Break-glass rows carry a small amber `StatusBadge` "Shared code".
- No counts per person anywhere on the page, no sort by person (HD5).

Detail drawer (`EditDrawer`, read-only: no *Save*, only *Close*), opened by a row click:

```
Stage changed                                                   ×
────────────────────────────────────────────────────────────────
┌ InfoPanel ────────────────────────────────────────────────────┐
│ When          Mon 2 Nov 2026, 11:02:14                        │
│ By            NextUp team · K. Schmid (stack admin)           │
│ Where         /admin                                          │
│ Target        Company · Acme Automotive                       │
└───────────────────────────────────────────────────────────────┘
Changes
  Field         Before        After
  Stage         Sandbox       Pilot
  Key           set           replaced          (secrets never shown)
────────────────────────────────────────────────────────────────
Entry  au_8f3k2m (mono)                     [Copy entry id] [Close]
```

### Phone

Filters become one scrolling row of chips under the search. Each entry is a card: action (600) and time on the
first line, *By* on the second, target on the third. The drawer is a full-screen sheet.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Lead | text | | Every change made to {company}'s setup. Entries cannot be edited and are kept for 24 months. | Jede Änderung an der Einrichtung von {company}. Einträge lassen sich nicht ändern und bleiben 24 Monate erhalten. |
| Export CSV *(later EID)* | grey pill | the current filter as CSV; EID adds the live log export | Export CSV | Als CSV exportieren |
| Period | select | Today · Last 7 days · Last 30 days (default) · Last 12 months · Custom range | Last 30 days | Letzte 30 Tage |
| Action filter | multi-select, grouped by area | the table above | Action · Company · Members · Privacy · Settings · Connectors · Access | Aktion · Firma · Mitglieder · Datenschutz · Einstellungen · Anbindungen · Zugang |
| By filter | person picker (company admins and stack admins by id) + fixed entries | HD10 | By · System · Directory sync · Shared admin code · API tokens | Von · System · Verzeichnisabgleich · Gemeinsamer Admin-Code · API-Tokens |
| Search | text input | target names and ids | Search target | Ziel suchen |
| Columns | | | When · By · Action · Target | Wann · Von · Aktion · Ziel |
| Actor kinds | text after the name | | Company admin · NextUp team · Shared admin code · System · Entra sync · API token {name} | Firmen-Admin · NextUp-Team · Gemeinsamer Admin-Code · System · Entra-Abgleich · API-Token {name} |
| Drawer labels | `InfoPanel` | | When · By · Where · Target · Changes · Field · Before · After · Entry · Copy entry id · Close | Wann · Von · Wo · Ziel · Änderungen · Feld · Vorher · Nachher · Eintrag · Eintrags-ID kopieren · Schließen |
| Secret values | text | never a value | set · replaced · removed | gesetzt · ersetzt · entfernt |
| Pseudonymised person | text | the pseudonym replaces the name in old rows too | Former member #{n} | Ehemaliges Mitglied #{n} |

### Actions

- Row click opens the drawer. *Copy entry id*: toast "Entry id copied." / "Eintrags-ID kopiert."
- *Export CSV* downloads `acme-audit-2026-11-02.csv` with the filtered rows; it writes its own audit event.

### States

- Loading: 8 skeleton rows.
- Empty company log: `EmptyState` "No changes recorded yet. Every admin action from now on shows here." / "Noch
  keine Änderungen erfasst. Jede Admin-Aktion erscheint ab jetzt hier."
- No match: "No entries match these filters." / "Keine Einträge passen zu diesen Filtern." with *Clear filters*.
- Older than 24 months: the period picker stops at 24 months; the line "Older entries are deleted." / "Ältere
  Einträge werden gelöscht." under the table.
- Error: the table's area shows "The log could not be loaded. Try again." / "Das Protokoll konnte nicht geladen
  werden. Versuch es noch einmal." with *Try again*.

### Done when

- [ ] Desktop and phone frames in German with rows of every actor kind (admin, NextUp team, shared code, system,
      directory, API token).
- [ ] Filters open (action menu, person picker), the detail drawer with a changes table and a secret row.
- [ ] Empty, no-match, loading and error states.

---

## Dialog: export a person's data

- **Opened from:** Members, the person's ⋯ menu, *Export data…* ([01](01-settings-and-structure.md#members), marked
  *later (GDP)* there)
- **Who:** company admins
- **Phase:** GDP (no Bauplan yet)
- **Data** *(proposal, not in any plan)*: a `DataExport` row (kind person). The file holds the person's `User` row
  (name, email, app role, department, language, sign-in kind and dates), their seats, every case they raised or
  decided and every event they wrote (`actorUserId`), their comments, their assistant turns (masked text, as
  stored), their idea drafts and idea turns, their bug reports with screenshots, their notification preferences
  (`NotifyPreference`, NTF), and the audit events about them. It leaves out the personnel number (HD14), login code
  hashes, TOTP secrets, other people's names in cases they did not write, and any other person's drafts.

**Purpose:** answer a person's request for a copy of their data (GDPR art. 15 and 20) without the admin reading
what is private to the person.

### Who gets the file

- **Active person:** the file goes to the person. They get the email below and download it after signing in; the
  admin cannot download it. This keeps their private idea drafts private.
- **Deactivated person** (cannot sign in): the file goes to the admin who asked, to pass on. The dialog says so.

### Layout

`ConfirmDialog`, max 480 px:

```
Export the data of L. Brandt                                     ×
──────────────────────────────────────────────────────────────────
In the file: profile, seats, cases raised and decided, comments,
questions to the assistant (masked), idea drafts, bug reports,
mail settings, admin actions about them.
Not in it: the personnel number, sign-in codes, other people's data.

Send to   (•) L. Brandt - they sign in to download it
          ( ) Me - to pass on
Format    JSON, machine-readable

The link works for 7 days. Then the file is deleted.
──────────────────────────────────────────────────────────────────
                                        [Cancel]  [Prepare export]
```

For a deactivated person the *Send to* choice is replaced by one line: "M. Keller cannot sign in (deactivated
30 Oct). The export goes to you, to pass on." The *Me* option is shown for active people too, but with the hint
"Leaves out their idea drafts and assistant questions, which are private." *(proposal)*

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Title | | | Export the data of {name} | Daten von {name} exportieren |
| In the file | text | | In the file: profile, seats, cases raised and decided, comments, questions to the assistant (masked), idea drafts, bug reports, mail settings, admin actions about them. | In der Datei: Profil, Plätze, eingebrachte und entschiedene Fälle, Kommentare, Fragen an den Assistenten (maskiert), Ideenentwürfe, Fehlermeldungen, Mail-Einstellungen, Admin-Aktionen zur Person. |
| Not in it | text | HD14 | Not in it: the personnel number, sign-in codes, other people's data. | Nicht enthalten: die Personalnummer, Anmeldecodes, Daten anderer Personen. |
| Send to | radio | default the person | Send to · {name} - they sign in to download it · Me - to pass on | Senden an · {name} - meldet sich zum Herunterladen an · Mich - zum Weitergeben |
| Me hint | hint | active person only | Leaves out their idea drafts and assistant questions, which are private. | Ohne Ideenentwürfe und Fragen an den Assistenten, die privat sind. |
| Deactivated line | text | replaces the radio | {name} cannot sign in (deactivated {date}). The export goes to you, to pass on. | {name} kann sich nicht anmelden (deaktiviert am {date}). Der Export geht an dich, zum Weitergeben. |
| Format | read-only | | Format · JSON, machine-readable | Format · JSON, maschinenlesbar |
| Expiry | hint | | The link works for 7 days. Then the file is deleted. | Der Link gilt 7 Tage. Danach wird die Datei gelöscht. |
| Buttons | | | Cancel · Prepare export | Abbrechen · Export erstellen |

### Actions

- *Prepare export*: the dialog closes; toast "Export for L. Brandt started. They get an email when it is ready." /
  "Export für L. Brandt gestartet. L. Brandt bekommt eine E-Mail, sobald er fertig ist." (to you: "… You get an
  email when it is ready." / "… Du bekommst eine E-Mail, sobald er fertig ist."). The row appears in Data and privacy
  › Exports. Audit event *Person's data exported*.
- A person without an email address: the person option is disabled with "No email address. Choose Me." / "Keine
  E-Mail-Adresse. Wähle „Mich“."

### Done when

- [ ] Dialog for an active person (both options), for a deactivated person, and without an email address; the toast.

---

## Dialog: pseudonymise a person

- **Opened from:** Members, the ⋯ menu of a **deactivated** person, *Pseudonymise…* (red), next to *Delete…*
- **Who:** company admins
- **Phase:** GDP (no Bauplan yet)
- **Data:** the person's display name is replaced by a pseudonym in every projection (VIS `CaseView`, inbox) and
  wherever NextUp displays a name: cases, projects, comments, discussions, the decision log, the audit log, the
  Members list. The log keeps its ids (`actorUserId`, seat ids), so cases, deadlines and numbers stay correct (brief
  risk). Their email, department and sign-in data are cleared; the `User` row stays deactivated under the pseudonym
  *(proposal)*. Pseudonym format *(proposal)*: "Former member #4821", a random 4-digit number unique in the company.
- **Difference to Delete** (DIR-D1, spec 01): Delete removes the account, and the person's cases keep the name as a
  label. Pseudonymise also removes the name from every place it is shown.

**Purpose:** remove a person who left from everything NextUp shows, while the history of the cases stays intact.

### Layout

`ConfirmDialog` with the name typed (plan: actions that cannot be undone ask for the name):

```
Pseudonymise L. Brandt?                                          ×
──────────────────────────────────────────────────────────────────
This cannot be undone.

• Everywhere NextUp shows L. Brandt, it shows "Former member #4821"
  instead: cases, projects, comments, the decision log, the audit log.
• Email, department and sign-in data are removed.
• Cases, decisions and numbers stay as they are.
• Copies outside NextUp are not changed: mails already sent, Jira
  issues, Teams messages, earlier exports.

Type the name to confirm   [                                    ]
                           L. Brandt
──────────────────────────────────────────────────────────────────
                                       [Cancel]  [Pseudonymise]
```

- *Pseudonymise* is a red text button, disabled until the typed text equals the display name (case and spaces
  ignored).
- The four points are a plain list with round bullets, text in `--nh-ink-2`; "This cannot be undone." is 600 ink.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Title | | | Pseudonymise {name}? | {name} pseudonymisieren? |
| Warning | text, 600 | | This cannot be undone. | Das lässt sich nicht rückgängig machen. |
| Bullet 1 | text | | Everywhere NextUp shows {name}, it shows "{pseudonym}" instead: cases, projects, comments, the decision log, the audit log. | Überall, wo NextUp {name} anzeigt, steht stattdessen „{pseudonym}“: in Fällen, Projekten, Kommentaren, im Entscheidungslog und im Protokoll. |
| Bullet 2 | text | | Email, department and sign-in data are removed. | E-Mail, Abteilung und Anmeldedaten werden entfernt. |
| Bullet 3 | text | | Cases, decisions and numbers stay as they are. | Fälle, Entscheidungen und Zahlen bleiben, wie sie sind. |
| Bullet 4 | text | | Copies outside NextUp are not changed: mails already sent, Jira issues, Teams messages, earlier exports. | Kopien außerhalb von NextUp bleiben unverändert: bereits verschickte Mails, Jira-Vorgänge, Teams-Nachrichten, frühere Exporte. |
| Confirm field | text input | must equal the name | Type the name to confirm | Gib zur Bestätigung den Namen ein |
| Buttons | | | Cancel · Pseudonymise | Abbrechen · Pseudonymisieren |
| Pseudonym | text | | Former member #{n} | Ehemaliges Mitglied #{n} |
| Menu item hint (active person) | disabled menu item + tooltip | only deactivated people | Deactivate {name} first. | Deaktiviere {name} zuerst. |

### Actions

- *Pseudonymise*: toast "L. Brandt is now Former member #4821." / "L. Brandt ist jetzt Ehemaliges Mitglied #4821."
  The Members row shows the pseudonym, "Pseudonymised {date}" in `--nh-mute` and only *Delete…* in its ⋯ menu.
  Audit event *Person pseudonymised*; its own row shows the pseudonym, never the old name.
- A person who still holds a seat (cannot happen after deactivation, DIR-D1) or who leads an open project: the dialog
  shows the blocking line instead of the field: "Former member #4821 would still lead 2 open projects. Hand them over
  first." / "Ehemaliges Mitglied #4821 würde noch 2 offene Projekte leiten. Übergib sie zuerst." *(proposal)*

### Done when

- [ ] The dialog empty, half-typed (button disabled) and matched; the blocked variant; the Members row after it; the
      disabled menu item for an active person.

---

## Email: your export is ready

- **Template** *(proposal)*: `privacy.export`, through NTF's outbox (`OutboxMessage`, channel `mail`), in the
  recipient's language (LNG/D7, `localeForEmail`). In a sandbox company it is written as `skipped` (NTF/D8) and the
  admin downloads the file from Data and privacy instead.
- **Layout:** plain text, the layout of today's notice mails (`features/cases/notice.ts`, `features/loop/notice.ts`):
  the name and a comma, a blank line, one intro line, a blank line, what it is about indented by two spaces, a
  blank line, one link per line with its label. No HTML, no logo, no tracking.
- **Who:** the person (export to the person) or the admin who asked (export to the admin, and company exports).

### To the person

```
Subject: Your data from NextUp at Acme Automotive is ready

L. Brandt,

a company admin of Acme Automotive prepared a copy of your data in NextUp.

  Your data export · JSON · 2.4 MB

Download it after signing in: https://nextup.app/acme/exports/ex_7k2m
The link works until Mon 9 Nov 2026. Then the file is deleted.

If you did not ask for this, tell your manager or the data protection officer.
```

### To the admin

```
Subject: The export of M. Keller is ready

H. Sander,

the data export you asked for is ready.

  M. Keller · JSON · 1.1 MB

Download it: https://nextup.app/acme/settings/privacy
The link works until Mon 9 Nov 2026. Then the file is deleted.
Pass it on to the person only, and delete your copy afterwards.
```

The company export uses the admin variant with "All data of Acme Automotive" as the indented line and without the
last line.

### Content

| Line | EN | DE |
|---|---|---|
| Subject (person) | Your data from NextUp at {company} is ready | Deine Daten aus NextUp bei {company} liegen bereit |
| Intro (person) | a company admin of {company} prepared a copy of your data in NextUp. | eine Admin-Person von {company} hat eine Kopie deiner Daten in NextUp erstellt. |
| What | Your data export · JSON · {size} | Dein Datenexport · JSON · {size} |
| Link (person) | Download it after signing in: {url} | Nach der Anmeldung herunterladen: {url} |
| Expiry | The link works until {date}. Then the file is deleted. | Der Link gilt bis {date}. Danach wird die Datei gelöscht. |
| Not you | If you did not ask for this, tell your manager or the data protection officer. | Wenn du das nicht angefordert hast, sag deiner Führungskraft oder der bzw. dem Datenschutzbeauftragten Bescheid. |
| Subject (admin) | The export of {name} is ready · Your export of {company} is ready | Der Export von {name} liegt bereit · Dein Export von {company} liegt bereit |
| Intro (admin) | the data export you asked for is ready. | der Datenexport, den du angefordert hast, liegt bereit. |
| Link (admin) | Download it: {url} | Herunterladen: {url} |
| Pass on | Pass it on to the person only, and delete your copy afterwards. | Gib ihn nur an die Person weiter und lösche danach deine Kopie. |

The link never carries a token or the file: it opens a NextUp page that asks for sign-in (the person) or the
settings page (the admin).

### Done when

- [ ] Both variants and the company variant as text frames, in German, at 72 characters a line.

---

## Open questions added by this file

| # | Question | Default here |
|---|---|---|
| G1 | May the admin download a person's export when the person is active, drafts included? | No: active people get it themselves; the admin's copy leaves out drafts and assistant questions. |
| G2 | What does a retention run do to closed cases: delete their events or pseudonymise them? | Delete the case's events after the period (off by default: *Keep*); MET loses them from its history and says so. |
| G3 | Screenshot policy: two switches (bug reports, raise) as drawn, or one? | Two switches, both on. |
| G4 | Pseudonymise free text: are exact mentions of the name in other people's comments replaced too? | Yes, exact matches of the display name, in display only. |
