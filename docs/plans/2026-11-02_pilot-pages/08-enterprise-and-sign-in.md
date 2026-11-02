# 08 · Enterprise settings and sign-in

> **Plan · 2026-11-02 · open: page specs for Sam. Part of [the pilot pages plan](../2026-11-02_pilot-pages.md); read its
> ground rules and shared building blocks first.**
> Ten pages: API tokens, Webhooks, Import and export, Sign-in and provisioning, Support access, the two
> second-factor steps, the company login, the forgot-code page (with the signup and invite redirects) and the
> `/admin` login. They are the seventh group to design. Only the sign-in pages have a Bauplan (ADM-E1, ADM-D1); the
> settings pages follow PILOT briefs and will move when API, EID and SEC are planned.

Context for this file:

- **No Bauplan yet for API, EID and SEC.** Their pages follow the PILOT briefs (plans repo
  `projects/nextup/hauptplaene/PILOT.md`, `### API`, `### EID`, `### SEC`) and may change when their Bauplan is written.
  Anything the briefs do not name is marked *(proposal, not in any plan)*.
- **API:** ADR 0003 (`docs/adr/0003-api-v1.md`: base `/api/v1/[company]`, scopes `cases:read`, `cases:write`,
  `decisions:read`, `projects:read`, `org:read`, cursor paging, `ApiV1` table) and ADR 0004
  (`docs/adr/0004-webhook-and-outbox.md`: `WebhookEnvelope`, `x-nextup-signature`, `x-nextup-delivery`, at least once).
  Today's tokens: `ApiToken` in `auth.prisma` (`name`, `hash`, `scopes`, `expiresAt`, `lastUsedAt`, `createdAt`),
  `lib/db/tokens.ts` (`createToken`, prefix `nxt_`, shown once, only the sha256 stored), issued in `/admin` only
  (`createApiTokenAction`: name "n8n", scopes `events:read`, `events:write`, `knowledge:write`), described in
  `docs/INTEGRATIONS.md` "The two endpoints".
- **Webhooks ride NTF's outbox** (Bauplan NTF): `WebhookSubscription` (`url`, `secrets` sealed, `events` =
  `PublicEventType` values, `on`, `updatedBy`), `OutboxMessage` (`status` pending · sent · failed · skipped,
  `attempt`, `nextAt`, `lastError`), `saveSubscription` and `listOutbox` (NTF-G1, NTF-B1). Retries after 1 min,
  5 min, 30 min, 2 h, 12 h, then `failed` after attempt 6; 4xx except 408 and 429 is not retried; 10 s timeout
  (NTF/D9). Webhooks only leave when `CompanyConfig.n8n` (the automations switch) is on; a sandbox company writes
  `skipped` rows with reason "sandbox" (NTF/D8, Q3). NTF/Q1 hands the editor and the failed-messages view to "ADM's
  connector settings", but ADM's Bauplan has no task for it; this file puts them on the Webhooks page under API.
- **Bauplan ADM** D11 (signup, invite, forgot-password), D12 (TOTP for managers' code logins), D13 (stack admins,
  break-glass), Q2 (no QR image), Q4 (only managers and stack admins). Task ADM-E1 owns `CompanyLoginForm.tsx`,
  `app/[company]/login/**`, `app/admin/login/**`, `AdminLoginForm.tsx` and the namespace `adminAccess`; ADM-D1 owns
  the `(auth)` stub pages and the namespace `auth`.
- **Stages:** `features/admin/stages.ts` (`policyFor`), `docs/SECURITY.md`. Support access matters from `sandbox` on.
- Text namespaces: `adminAccess` (second factor, `/admin` login, ADM/D3), `auth` (company login, forgot code). For
  the settings pages *(proposal, their Bauplan fixes it)*: `settingsApi` (API tokens, Webhooks, Import and export),
  `settingsSignIn`, `settingsSupport`.

---

## API tokens

- **Route:** `/[company]/settings/api-tokens` (new)
- **Who:** company admins
- **Phase:** API (no Bauplan yet)
- **Data:** `ApiToken` rows of the company; the scopes of ADR 0003 plus the three of the old events API; the base
  path `API_V1_BASE`. *(Proposal, not in any plan:)* `ApiToken.createdBy` for the "by" line, and a rate limit per
  token (the brief names rate limits but no number).
- **Today:** one "API token" button per company in `/admin` (`CompanyList.tsx`), fixed name and scopes, the token
  shown once on that page.

**Purpose:** let the company's own systems read and write NextUp through API v1, each with a token that can do only
what it needs.

### Layout (desktop)

```
API tokens                                                    [Create token]
Your systems read and write NextUp through API v1. 2 tokens.

┌ How to connect ─────────────────────────────────────────────────────────┐
│ ┌ InfoPanel ──────────────────────────────────────────────────────────┐ │
│ │ Base URL          https://nextup.app/api/v1/acme          [Copy]    │ │
│ │ Reference         OpenAPI document →                                │ │
│ │ Sign-in           Header  Authorization: Bearer <token>             │ │
│ │ Limit             600 requests a minute per token  (proposal)       │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│ A token acts for the system, never as a person. It sees no per-person   │
│ numbers.                                                                │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ Name              Scopes                         Last used   Expires  ⋯ │
│ SAP PM bridge     cases:read  cases:write        14:02       3 Feb 27 ⋯ │
│ Created 3 Nov by H. Sander                                              │
│ n8n               events:read  events:write      yesterday   never    ⋯ │
│ Created 12 Oct    knowledge:write   [Old events API]                    │
└─────────────────────────────────────────────────────────────────────────┘
```

- Scopes are grey chips in `--nh-mono` `--nh-fs-xs`. Tokens that only carry `events:*` or `knowledge:write` get a
  grey "Old events API" chip: they work on `/api/[company]/events`, not on v1 (ADR 0003, D3).
- "Last used" from `lastUsedAt`: a time today, "yesterday", a date, or "Never".
- An expired token stays in the list in `--nh-mute` with "Expired {date}" until it is revoked.
- ⋯ menu: Revoke… (red). Tokens are never edited: a new scope means a new token.

Create drawer (`EditDrawer`):

```
Create a token                                                  ×
────────────────────────────────────────────────────────────────
Name                  [ SAP PM bridge                       ]
                      Name the system that uses it.
What it may do        Cases          [x] read   [x] write
                      Decisions      [ ] read
                      Projects       [ ] read
                      Org            [ ] read
                      Old events API [ ] events:read  [ ] events:write
                                     [ ] knowledge:write
Expires               ( 30 days | 90 days | 1 year | Never )
────────────────────────────────────────────────────────────────
                                         [Cancel]  [Create token]
```

After *Create token* the drawer body is replaced by a `SecretOnce` box with the token (`nxt_` + 48 characters) and
one button *Done*. Closing it without copying asks first: "Close without copying? The token cannot be shown again." /
"Ohne Kopieren schließen? Der Token kann nicht noch einmal angezeigt werden."

### Phone

The InfoPanel stacks label over value; the URL wraps in mono with *Copy* under it. Each token is a card: name, scopes
as chips, one meta line "Last used 14:02 · expires 3 Feb 2027", ⋯ menu.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Lead | text | count of tokens | Your systems read and write NextUp through API v1. {n} tokens. | Deine Systeme lesen und schreiben NextUp über die API v1. {n} Tokens. |
| How to connect | `InfoPanel` | base URL from `API_V1_BASE` | How to connect · Base URL · Reference · OpenAPI document → · Sign-in · Limit | So verbindest du dich · Basis-URL · Referenz · OpenAPI-Dokument → · Anmeldung · Limit |
| System line | text | | A token acts for the system, never as a person. It sees no per-person numbers. | Ein Token handelt für das System, nie als Person. Es sieht keine Zahlen zu einzelnen Personen. |
| Columns | `DataTable` | | Name · Scopes · Last used · Expires | Name · Berechtigungen · Zuletzt genutzt · Läuft ab |
| Meta | under the name | `createdAt`, by *(proposal)* | Created {date} by {name} | Erstellt am {date} von {name} |
| Old API chip | chip | only `events:*` / `knowledge:write` scopes | Old events API | Alte Events-API |
| Name | text input | 1-60 characters, unique in the company *(proposal)* | Name · Name the system that uses it. | Name · Nenne das System, das ihn nutzt. |
| Scopes | checkboxes | at least one | What it may do · Cases · Decisions · Projects · Org · Old events API · read · write | Was er darf · Fälle · Entscheidungen · Projekte · Organisation · Alte Events-API · lesen · schreiben |
| Expires | segmented | default 90 days | Expires · 30 days · 90 days · 1 year · Never | Läuft ab · 30 Tage · 90 Tage · 1 Jahr · Nie |
| Never warning | hint under Expires | when Never is picked | A token without an end date stays valid until someone revokes it. | Ein Token ohne Ablaufdatum gilt, bis ihn jemand widerruft. |

### Actions

- *Create token*: the `SecretOnce` box; toast after *Done*: "Token {name} created." / "Token {name} erstellt."
- *Revoke…* (`ConfirmDialog`): "Revoke {name}? Every system that uses it gets "unauthorized" from now on. This cannot
  be undone." / "{name} widerrufen? Jedes System, das ihn nutzt, wird ab jetzt abgewiesen. Das lässt sich nicht
  rückgängig machen." Buttons: Cancel · Revoke (red). Toast: "{name} revoked." / "{name} widerrufen."

### States

- Loading: 3 skeleton rows.
- No token: `EmptyState` "No tokens yet. Create one for each system that talks to NextUp." / "Noch keine Tokens. Lege
  für jedes System, das mit NextUp spricht, einen an." + *Create token*.
- Demo company: a grey line on top: "Demo company: tokens work, but the data is made up." / "Demo-Firma: Tokens
  funktionieren, aber die Daten sind erfunden."

### Done when

- [ ] Desktop and phone in German with a v1 token, an old events-API token and an expired one; the create drawer,
      the `SecretOnce` step and its close warning; the revoke dialog; the empty state.

---

## Webhooks

- **Route:** `/[company]/settings/webhooks` (new)
- **Who:** company admins
- **Phase:** API (the editor, no Bauplan yet) on NTF's tables and delivery (NTF-G1 `saveSubscription`, NTF-B1
  delivery and `listOutbox`)
- **Data:** `WebhookSubscription` (url, sealed `secrets`, `events`, `on`, `updatedAt`, `updatedBy`); the
  company's `OutboxMessage` rows with `channel = "webhook"` (status, attempt, nextAt, lastError, sentAt, the event
  type from `data`); `CompanyConfig.n8n` (webhooks leave only when it is on, NTF/D8); the company's stage.
  The seven `PublicEventType` values: `case.raised`, `case.handed`, `case.answered`, `case.decided`,
  `project.started`, `project.done`, `project.stopped`.
- **Today:** nothing; NTF creates subscriptions only by script (NTF/Q1).

**Purpose:** tell the company's own systems when something happens in NextUp, and show what reached them and what
did not.

### Layout (desktop)

```
Webhooks                                                      [Add webhook]
NextUp tells your systems when something happens. Signed, retried, at least once.

┌ Sending ─────────────────────────────────────────────────────────────────┐
│ [on ] Send webhooks                                     StatusBadge (On) │
│       Off: nothing leaves, deliveries wait as skipped.                   │
└──────────────────────────────────────────────────────────────────────────┘

┌ Subscriptions ───────────────────────────────────────────────────────────┐
│ Address                          Events         Last delivery        ⋯   │
│ https://mes.acme.de/hooks/nextup 3 events       14:20 · delivered    ⋯   │
│ Changed 28 Oct by H. Sander      [On]                                    │
│ https://bi.acme.de/in            all 7 events   14:20 · failed       ⋯   │
│ Changed 30 Oct by L. Brandt      [Error]        HTTP 500                 │
└──────────────────────────────────────────────────────────────────────────┘

┌ Deliveries ──────────────────── [All ▾] [Failed] [Last 7 days ▾] ───────┐
│ Time        Event          Address              Try     Status          │
│ 14:20:03    case.decided   bi.acme.de           6 of 6  (Failed)    ⋯   │
│             HTTP 500 Internal Server Error                              │
│ 14:20:03    case.decided   mes.acme.de          1 of 6  (Delivered)     │
│ 14:12:40    case.raised    bi.acme.de           3 of 6  Retrying 14:42  │
│             Timed out after 10 s                                        │
│ 1-50 of 412                                         ( ‹ )  ( › )        │
└──────────────────────────────────────────────────────────────────────────┘

┌ Check the signature ─────────────────────────────────────────────────────┐
│ InfoPanel: x-nextup-signature: t=<unix seconds>,v1=<hex>                 │
│ HMAC-SHA256 of "<t>.<raw body>" with your secret. Reject anything older  │
│ than 5 minutes. Deduplicate on x-nextup-delivery.   Webhook reference →  │
└──────────────────────────────────────────────────────────────────────────┘
```

- The address shows the full URL in `--nh-mono`, cut in the middle on narrow columns; the Deliveries table shows the
  host only.
- Subscription status: On (from `on` and the last delivery sent), Off (switched off), Error (the last delivery
  `failed`).
- Delivery status pills: Delivered (white, blue check) · Retrying {time} (amber, from `nextAt`) · Failed (red) ·
  Skipped (grey, with the reason: "sandbox" or "switched off") · Waiting (grey, `pending` before the first try).
- A delivery row opens a drawer: the envelope as JSON in `--nh-mono` (ids only, never a name), the two headers, each
  try with its time and result. Never a secret.

Subscription drawer (`EditDrawer`):

```
Add a webhook                                                   ×
────────────────────────────────────────────────────────────────
Address               [ https://mes.acme.de/hooks/nextup       ]
                      https only. Answer with 2xx within 10 s.
Events                [x] A case is raised          case.raised
                      [ ] A case is handed on       case.handed
                      [x] A case is answered        case.answered
                      [x] A case is decided         case.decided
                      [ ] A project starts          project.started
                      [ ] A project is done         project.done
                      [ ] A project is stopped      project.stopped
On                    [on ]
Secret                Set · since 28 Oct          [Rotate secret]
────────────────────────────────────────────────────────────────
[Delete webhook]                          [Cancel]  [Save]
```

On create, after *Save* the drawer shows the new secret once (`SecretOnce`). *Rotate secret* adds a second secret
and shows it once; both sign every delivery (two `v1` values) until *Remove the old secret* is pressed (ADR 0004).

### Phone

The switch card stays on top. Subscriptions and deliveries become cards (`DataTable` phone rule): address host,
status pill, one meta line "case.decided · 14:20 · try 6 of 6"; filters as a scrolling row of chips.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Lead | text | | NextUp tells your systems when something happens. Signed, retried, at least once. | NextUp meldet deinen Systemen, wenn etwas passiert. Signiert, wiederholt, mindestens einmal. |
| Send switch | switch | `CompanyConfig.n8n`; written as an event like every config flip (`docs/INTEGRATIONS.md`) | Send webhooks · Off: nothing leaves, deliveries wait as skipped. | Webhooks senden · Aus: Es geht nichts raus, Zustellungen werden übersprungen. |
| Address | url input | https only, ≤ 2,000 characters *(proposal)* | Address · https only. Answer with 2xx within 10 s. | Adresse · Nur https. Antworte innerhalb von 10 s mit 2xx. |
| Events | checkboxes | at least one; the type name in mono at the end | A case is raised · A case is handed on · A case is answered · A case is decided · A project starts · A project is done · A project is stopped | Ein Fall wird eingebracht · Ein Fall wird weitergegeben · Ein Fall wird beantwortet · Ein Fall wird entschieden · Ein Projekt startet · Ein Projekt ist fertig · Ein Projekt wird gestoppt |
| Secret | status + button | write-only; never shown after the first time | Secret · Set since {date} · Rotate secret · Remove the old secret | Geheimnis · Gesetzt seit {date} · Geheimnis wechseln · Altes Geheimnis entfernen |
| Columns | `DataTable` | | Address · Events · Last delivery · Time · Event · Try · Status | Adresse · Ereignisse · Letzte Zustellung · Zeit · Ereignis · Versuch · Status |
| Status words | pill | from `OutboxMessage.status` | Delivered · Retrying {time} · Failed · Skipped: sandbox · Skipped: switched off · Waiting | Zugestellt · Neuer Versuch {time} · Fehlgeschlagen · Übersprungen: Sandbox · Übersprungen: ausgeschaltet · Wartet |
| Retry rule | hint under the Deliveries title | NTF/D9 | Retried after 1 min, 5 min, 30 min, 2 h and 12 h, then marked failed. Answers 400-499 other than 408 and 429 are not retried. | Neue Versuche nach 1 Min., 5 Min., 30 Min., 2 Std. und 12 Std., danach fehlgeschlagen. Antworten 400-499 außer 408 und 429 werden nicht wiederholt. |
| Signature panel | `InfoPanel` | ADR 0004 | Check the signature · HMAC-SHA256 of "<t>.<raw body>" with your secret. Reject anything older than 5 minutes. Deduplicate on x-nextup-delivery. · Webhook reference → | Signatur prüfen · HMAC-SHA256 von „<t>.<raw body>“ mit deinem Geheimnis. Alles, was älter als 5 Minuten ist, ablehnen. Doppelte über x-nextup-delivery erkennen. · Webhook-Referenz → |

### Actions

- *Save*: toast "Webhook saved." / "Webhook gespeichert." A non-https address: "Use an https address." / "Bitte eine
  https-Adresse verwenden."
- *Send a test* (⋯ menu) *(proposal, not in any plan)*: sends one `case.raised` envelope with made-up ids through the
  outbox; result line in the drawer "Delivered in 340 ms, HTTP 200." / "Zugestellt in 340 ms, HTTP 200." or the
  error.
- *Retry now* (⋯ on a failed delivery) *(proposal: NTF has no resend for webhooks)*: puts the row back to pending
  with attempt 0; toast "Queued again." / "Erneut eingereiht."
- *Delete webhook* (`ConfirmDialog`): "Delete the webhook to {host}? Deliveries still waiting are dropped." /
  "Webhook an {host} löschen? Wartende Zustellungen werden verworfen."
- *Remove the old secret* (`ConfirmDialog`): "Remove the old secret? Receivers that still check with it reject every
  delivery from now on." / "Altes Geheimnis entfernen? Empfänger, die noch damit prüfen, lehnen ab jetzt jede
  Zustellung ab."

### States

- Switch off: amber line above Subscriptions "Webhooks are off. Deliveries are written as skipped and nothing leaves."
  / "Webhooks sind aus. Zustellungen werden als übersprungen vermerkt, es geht nichts raus."
- Sandbox: the plan's sandbox banner, and every new delivery shows "Skipped: sandbox".
- No subscription: `EmptyState` "No webhooks yet. Add the address of a system that should hear about cases and
  projects." / "Noch keine Webhooks. Füge die Adresse eines Systems hinzu, das von Fällen und Projekten erfahren
  soll." + *Add webhook*.
- No deliveries in the filter: "No deliveries in the last 7 days." / "Keine Zustellungen in den letzten 7 Tagen."
- Loading: skeleton rows in both tables.

### Done when

- [ ] Desktop and phone in German: switch on and off, one healthy and one failing subscription, deliveries with
      each status, the delivery drawer, the subscription drawer (create with `SecretOnce`, edit, rotate with two
      secrets), the delete and remove-secret dialogs, sandbox and empty states.

---

## Import and export

- **Route:** `/[company]/settings/import-export` (new)
- **Who:** company admins
- **Phase:** API (CSV import and export of structure), PIL (uses it for the pilot bootstrap); no Bauplan yet
- **Data:** STR's structure tables (`OrgUnit`, `OrgRole`, `OrgRoleHolder`, the routing table) and `User`. Every
  imported row is checked by ADM's org-edit rules (ADM/D8: key 1-32 of A-Z 0-9 _, unique; title 1-120; no
  reports-to loop; a route needs an owner role; keywords 1-30 of 1-40 characters) and written through
  `lib/db/org-edit.ts`, so import and editor never disagree. The four file layouts below are a *(proposal, not in
  any plan)*.
- **Today:** nothing; structure comes from the seed or the editors.

**Purpose:** bring a company's structure in from spreadsheets in three steps (upload, check, apply), and take it out
the same way.

### Layout (desktop): import, step 2 "Check"

```
Import and export
Bring your structure in from spreadsheets, or take it out.

┌ Import ──────────────────────────────────────────────────────────────────┐
│  ① Upload  ──  ② Check  ──  ③ Apply                                      │
│                                                                          │
│  members.csv · 1,214 rows                                                │
│  1,198 ready (1,150 new · 48 changed) · 16 with errors · 0 unchanged     │
│                                                                          │
│  [All] [Errors (16)] [New] [Changed]                                     │
│  Row  Name         Work email          App role  Seat           Result   │
│  12   L. Brandt    l.brandt@acme.de    leader    QS / Quality…  Changed  │
│  37   M. Keller    m.keller@acme       member    –              Error    │
│       Work email: "m.keller@acme" is not an email address.               │
│  58   T. Roth      t.roth@acme.de      chef      –              Error    │
│       App role: use member, leader or manager.                           │
│  …                                                                       │
│                                                                          │
│  [Upload a fixed file]                       [Apply 1,198 rows]  (off)   │
│  Fix the 16 rows with errors first. Nothing is written until you apply.  │
└──────────────────────────────────────────────────────────────────────────┘

┌ Export ──────────────────────────────────────────────────────────────────┐
│ Units          units.csv     12 rows       [Download]                    │
│ Roles          roles.csv     41 rows       [Download]                    │
│ Members        members.csv   1,482 rows    [Download]                    │
│ Routes         routes.csv    23 rows       [Download]                    │
│ Never in an export: login codes, tokens, secrets, personnel numbers.     │
└──────────────────────────────────────────────────────────────────────────┘
```

Step 1 "Upload":

```
│  ① Upload  ──  ② Check  ──  ③ Apply                                      │
│  What do you import?   ( Units | Roles | Members | Routes )              │
│  ┌ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ┐  │
│  │      Drop a CSV file here or [choose a file]                      │  │
│  │      UTF-8, comma or semicolon, up to 5 MB and 5,000 rows.        │  │
│  └ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ┘  │
│  Download the template for members →                                     │
│  Import units first, then roles, then members and routes.                │
```

Step 3 "Apply" result: a line with a blue check "Imported members.csv: 1,150 added, 48 changed." and links "Open
Members →", "Import the next file".

- The stepper is three labels with a line between them; the current step is ink 600, done steps carry a blue check.
- The preview table is a `DataTable` with the file's own columns (up to 6, the rest in the row drawer), a row number
  column and a Result column (New, Changed, Unchanged, Error). An error row shows the rule's message on a second line
  in `--nh-danger`, naming the column.
- *Apply* stays disabled while any row has an error: an import is all or nothing *(proposal)*.
- An import adds and changes, never deletes. Rows that exist but are missing from the file stay as they are.

File layouts *(proposal; the API Bauplan fixes them)*. Lists inside a cell are separated by `;`.

| File | Columns | Matched on |
|---|---|---|
| `units.csv` | `key`, `name`, `kind` (board, dept, team), `parent_key`, `headcount` | `key` |
| `roles.csv` | `unit_key`, `title`, `reports_to_unit_key`, `reports_to_title`, `seats`, `spend_limit_eur`, `decides`, `needs` | `unit_key` + `title` |
| `members.csv` | `name`, `email`, `department`, `app_role` (member, leader, manager), `language` (de, en), `seat_unit_key`, `seat_role_title` | `email` |
| `routes.csv` | `keywords`, `owner_unit_key`, `owner_role_title` | `keywords` |

### Phone

Import works on a phone but is meant for a desktop. The stepper becomes "Step 2 of 3 · Check"; the preview becomes
cards (row number, name, result pill, the error line); the export list is one row per file with *Download* on the
right.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Lead | text | | Bring your structure in from spreadsheets, or take it out. | Bring deine Struktur aus Tabellen herein oder exportiere sie. |
| Steps | stepper | | Upload · Check · Apply | Hochladen · Prüfen · Übernehmen |
| Kind | segmented | | What do you import? · Units · Roles · Members · Routes | Was importierst du? · Einheiten · Rollen · Mitglieder · Routen |
| Drop zone | file input | `.csv`, UTF-8, `,` or `;`, ≤ 5 MB, ≤ 5,000 rows *(proposal)* | Drop a CSV file here or choose a file · UTF-8, comma or semicolon, up to 5 MB and 5,000 rows. | CSV-Datei hier ablegen oder Datei auswählen · UTF-8, Komma oder Semikolon, bis 5 MB und 5.000 Zeilen. |
| Template | link | one per kind | Download the template for {kind} → | Vorlage für {kind} herunterladen → |
| Order hint | hint | | Import units first, then roles, then members and routes. | Importiere zuerst Einheiten, dann Rollen, dann Mitglieder und Routen. |
| Summary | meta | | {rows} rows · {ready} ready ({new} new · {changed} changed) · {errors} with errors · {same} unchanged | {rows} Zeilen · {ready} bereit ({new} neu · {changed} geändert) · {errors} mit Fehlern · {same} unverändert |
| Result words | pill | | New · Changed · Unchanged · Error | Neu · Geändert · Unverändert · Fehler |
| Unknown column | grey line above the table | the column is ignored and never shown | Ignored columns: {names}. | Ignorierte Spalten: {names}. |
| Apply | black button | disabled while errors > 0 | Apply {n} rows · Fix the {n} rows with errors first. Nothing is written until you apply. | {n} Zeilen übernehmen · Behebe zuerst die {n} Zeilen mit Fehlern. Es wird nichts geschrieben, bis du übernimmst. |
| Invite option | checkbox, members only | off by default; sends ADM's invite mail (ADM/D11) | Send each new member an invitation with their login code | Jedem neuen Mitglied eine Einladung mit Anmeldecode senden |
| Export | list + buttons | | Units · Roles · Members · Routes · Download · Never in an export: login codes, tokens, secrets, personnel numbers. | Einheiten · Rollen · Mitglieder · Routen · Herunterladen · Nie in einem Export: Anmeldecodes, Tokens, Geheimnisse, Personalnummern. |

Example error messages (each names the column):

| Case | EN | DE |
|---|---|---|
| Bad email | Work email: "{value}" is not an email address. | Geschäftliche E-Mail: „{value}“ ist keine E-Mail-Adresse. |
| Bad role | App role: use member, leader or manager. | App-Rolle: member, leader oder manager verwenden. |
| Unknown parent | parent_key: no unit with the key {key}, in the file or in NextUp. | parent_key: Es gibt keine Einheit mit dem Kürzel {key}, weder in der Datei noch in NextUp. |
| Synced record | This person comes from Entra. Change name, email and department there. | Diese Person kommt aus Entra. Name, E-Mail und Abteilung dort ändern. |
| Same key twice | key: {key} appears in rows {a} and {b}. | key: {key} steht in den Zeilen {a} und {b}. |

### Actions

- *Choose a file* / drop: the file is read on the server and checked; the page moves to Check. A file that is not
  CSV or too big: "This is not a CSV file up to 5 MB." / "Das ist keine CSV-Datei bis 5 MB."
- *Apply*: one transaction; toast "Imported {file}: {new} added, {changed} changed." / "{file} importiert: {new}
  hinzugefügt, {changed} geändert."
- *Upload a fixed file*: back to Upload with the same kind picked.
- *Download*: the CSV in UTF-8 with a header row, file name `{slug}-{kind}-{date}.csv`. Every member export is
  written to the audit log *(GDP)*.

### States

- Empty company: a grey line above Import "Starting from nothing? The setup guides you step by step, or import your
  units here." / "Fängst du bei null an? Die Einrichtung führt dich Schritt für Schritt, oder importiere hier deine
  Einheiten." with *Start setup →*.
- Checking a large file: the Check step shows a progress line "Checking row 600 of 1,214…" / "Prüfe Zeile 600 von
  1.214…".
- Applied with a sync source on: units and members from Entra are refused row by row (the synced-record message).

### Done when

- [ ] Desktop in German: Upload (each kind), Check with errors, Check clean, the Apply result, the export card;
      phone Check view; the empty-company line; the progress line.

---

## Sign-in and provisioning

- **Route:** `/[company]/settings/sign-in` (new)
- **Who:** company admins
- **Phase:** EID (no Bauplan yet); the second-factor card reads ADM-E1's fields
- **Data:** `Company.entraTenantId` (Microsoft sign-in, today set in `/admin`); for OIDC, SAML, SCIM and the log
  export, rows EID will add behind `IdentityProvider`, `DirectorySource` and `LogSink`
  (`packages/contracts/src/public/connectors/`). The URLs NextUp shows for OIDC, SAML and SCIM are *(proposals; EID
  fixes the paths; the brief names `/scim/v2/Users` and `/Groups`)*. Second factor: `User.totpEnabledAt` of the
  company's managers (ADM/D13).
- **Today:** Microsoft sign-in is switched on per company in `/admin`; no other provider, no SCIM, audit lines only
  in the server log.

**Purpose:** choose how people sign in, how accounts are created and closed, and where the audit log goes.

### Layout (desktop)

```
Sign-in and provisioning
How people at Acme Automotive sign in, how their accounts arrive and where
the audit log goes.

┌ Personal codes ─────────────────────────────────────────── (On) ────────┐
│ Everyone can sign in with their personal code. Managers also enter a    │
│ code from an authenticator app.                                         │
│ InfoPanel: Second factor   3 of 4 managers who use a code have set it up│
└─────────────────────────────────────────────────────────────────────────┘
┌ Microsoft Entra ID ───────────────────────────────── (On)   [on ] ──────┐
│ Tenant ID          [ 00000000-0000-0000-0000-000000000000 ]             │
│ Only accounts from this tenant get in. Entra asks for its own MFA.      │
│                                                             [ Save ]    │
└─────────────────────────────────────────────────────────────────────────┘
┌ Another OpenID Connect provider ─────────────────────── (Off) [off] ────┐
│ Button text        [ Acme login                          ]              │
│ Issuer URL         [ https://login.acme.de/realms/acme   ]              │
│ Client ID          [ nextup                              ]              │
│ Client secret      Not set                     [Replace]                │
│ Scopes             [ openid email profile                ]              │
│ Redirect URL       https://nextup.app/acme/login/oidc/callback  [Copy]  │
│ Test   [Test sign-in]   Signed in as h.sander@acme.de: matched to       │
│                         H. Sander.                                      │
│                                                             [ Save ]    │
└─────────────────────────────────────────────────────────────────────────┘
┌ SAML 2.0 ──────────────────────────────────── (Needs you) [on ] ────────┐
│ Button text        [ Acme SSO                            ]              │
│ IdP metadata       ( URL | File )  [ https://adfs.acme.de/…/metadata ]  │
│ Our details        Entity ID  https://nextup.app/acme/saml      [Copy]  │
│                    Reply URL  https://nextup.app/acme/login/saml/acs    │
│                    Metadata   Download SP metadata →                    │
│ Certificate        IdP signing certificate expires 21 Nov 2026          │
│                    (in 19 days)                [Refresh metadata]       │
│ Test   [Test sign-in]   Last test 1 Nov 09:12: ok                       │
│                                                             [ Save ]    │
└─────────────────────────────────────────────────────────────────────────┘
┌ Provisioning (SCIM 2.0) ───────────────────────────── (On) [on ] ───────┐
│ Endpoint           https://nextup.app/api/scim/v2              [Copy]   │
│ Token              Set · created 14 Oct          [Replace token]        │
│ Last request       14:05 from your identity provider                    │
│ Last 7 days        12 created · 31 changed · 2 deactivated              │
│ Recent errors      none                                                 │
└─────────────────────────────────────────────────────────────────────────┘
┌ Audit log export ───────────────────────────────── (On) ────────────────┐
│ Send to            ( Off | Syslog | JSON file )                         │
│ Host               [ siem.acme.local   ]   Port [ 6514 ]                │
│ Transport          ( TLS | TCP | UDP )                                  │
│ Format             RFC 5424, one audit record per message               │
│ Test   [Send a test record]   Sent audit.test at 14:22: accepted        │
│ Last sent          14:31 · 1,204 records today                          │
│                                                             [ Save ]    │
└─────────────────────────────────────────────────────────────────────────┘
```

- Each card header: title, `StatusBadge`, and the on/off switch on the right (the Personal codes card has no switch:
  codes are always on).
- The SAML badge is "Needs you" (amber) when the IdP certificate expires within 30 days, "Error" when it has expired
  or metadata cannot be read.
- Test results are one line next to the button: blue check and text on success, `--nh-danger` text on failure.
- JSON file target: one field "File on the server" `[ /var/log/nextup/audit.jsonl ]` and the line "One JSON record
  per line. The file rotates daily." in place of host, port and transport *(proposal)*.

### Phone

Cards stack; labels above fields; the copyable URLs wrap in mono with *Copy* under them; the test result moves under
its button.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Lead | text | | How people at {company} sign in, how their accounts arrive and where the audit log goes. | Wie sich Personen bei {company} anmelden, wie ihre Konten ankommen und wohin das Audit-Log geht. |
| Personal codes | text + `InfoPanel` | count of managers with a code login and `totpEnabledAt` *(proposal)* | Personal codes · Everyone can sign in with their personal code. Managers also enter a code from an authenticator app. · Second factor · {n} of {m} managers who use a code have set it up | Persönliche Codes · Alle können sich mit ihrem persönlichen Code anmelden. Führungskräfte geben zusätzlich einen Code aus einer Authenticator-App ein. · Zweiter Faktor · {n} von {m} Führungskräften mit Code haben ihn eingerichtet |
| Entra tenant | text input | a GUID; edited here *(proposal, not in any plan: today `/admin`)* | Tenant ID · Only accounts from this tenant get in. Entra asks for its own MFA. | Mandanten-ID · Nur Konten aus diesem Mandanten kommen hinein. Entra fragt nach seiner eigenen MFA. |
| OIDC fields | inputs | issuer https; client secret write-only (ADM/D10 rule) | Another OpenID Connect provider · Button text · Issuer URL · Client ID · Client secret · Scopes · Redirect URL | Weiterer OpenID-Connect-Anbieter · Text auf der Schaltfläche · Issuer-URL · Client-ID · Client-Secret · Scopes · Weiterleitungs-URL |
| SAML fields | inputs | metadata by URL or file (XML ≤ 1 MB) | SAML 2.0 · Button text · IdP metadata · URL · File · Our details · Entity ID · Reply URL · Download SP metadata → | SAML 2.0 · Text auf der Schaltfläche · IdP-Metadaten · URL · Datei · Unsere Angaben · Entity-ID · Antwort-URL · SP-Metadaten herunterladen → |
| Certificate | meta + button | amber ≤ 30 days, red when expired | IdP signing certificate expires {date} (in {n} days) · Expired on {date}. Sign-in with SAML stops working. · Refresh metadata | IdP-Signaturzertifikat läuft am {date} ab (in {n} Tagen) · Am {date} abgelaufen. Die Anmeldung mit SAML funktioniert nicht mehr. · Metadaten aktualisieren |
| SCIM | read-only + token | token shown once (`SecretOnce`) | Provisioning (SCIM 2.0) · Endpoint · Token · Set · created {date} · Replace token · Last request · Last 7 days · {a} created · {b} changed · {c} deactivated · Recent errors | Bereitstellung (SCIM 2.0) · Endpunkt · Token · Gesetzt · erstellt am {date} · Token ersetzen · Letzte Anfrage · Letzte 7 Tage · {a} angelegt · {b} geändert · {c} deaktiviert · Letzte Fehler |
| Log export | segmented + fields | port 1-65535; only `audit.*` records (`LogRecord`) | Audit log export · Send to · Off · Syslog · JSON file · Host · Port · Transport · Format · Send a test record · Last sent · {n} records today | Audit-Log-Export · Senden an · Aus · Syslog · JSON-Datei · Host · Port · Transport · Format · Testeintrag senden · Zuletzt gesendet · {n} Einträge heute |
| Test results | line | | Signed in as {email}: matched to {name}. · Signed in as {email}, but nobody at {company} has this email. · Sent audit.test at {time}: accepted. · Could not reach {host}:{port}. | Angemeldet als {email}: {name} zugeordnet. · Angemeldet als {email}, aber bei {company} hat niemand diese E-Mail. · audit.test um {time} gesendet: angenommen. · {host}:{port} nicht erreichbar. |

### Actions

- *Save* per card: toast "Saved" / "Gespeichert".
- Switching OIDC or SAML on asks first (`ConfirmDialog`): "Show "{button text}" on the login page of {company}? People
  who sign in this way are matched to their account by email the first time." / "„{button text}“ auf der
  Anmeldeseite von {company} zeigen? Wer sich so anmeldet, wird beim ersten Mal über die E-Mail seinem Konto
  zugeordnet."
- *Test sign-in* opens the provider in a new window; the result line appears when it comes back. It never signs the
  admin in or out.
- *Replace token* (SCIM, `ConfirmDialog`): "Replace the SCIM token? The old one stops at once. Put the new one into
  your identity provider right after." / "SCIM-Token ersetzen? Der alte gilt sofort nicht mehr. Trage den neuen
  gleich danach in deinem Identitätsanbieter ein." Then `SecretOnce`.
- Switching SCIM on while Entra directory sync (DIR) is on: the dialog adds "Entra sync is on too. Use one source,
  or both will change the same people." / "Die Entra-Synchronisierung ist auch an. Nutze eine Quelle, sonst ändern
  beide dieselben Personen." *(proposal)*

### States

- Loading: skeleton bars per card.
- A card in error: Error badge, and a *Recent errors* list (up to 5 rows: time, one line) at the bottom of the card,
  as in `ConnectorBlock`.
- Demo company: OIDC, SAML and SCIM cards read-only with the line "Not for demo companies." / "Nicht für
  Demo-Firmen."

### Done when

- [ ] Desktop and phone in German with every card; OIDC test success and no-match; SAML with a certificate that
      expires soon and one that has expired; the SCIM token `SecretOnce`; syslog and JSON-file variants of the log
      export with a failed test; the switch-on and replace-token dialogs.

---

## Support access

- **Route:** `/[company]/settings/support-access` (new)
- **Who:** company admins
- **Phase:** SEC (no Bauplan yet): "customer-granted, time-limited, logged break-glass"
- **Data:** *(proposal, not in any plan:)* a grant row (granted by user id, from, until, reason, ended early by),
  and the audit events of the grant and of every NextUp sign-in during it (`audit.*`, GDP). The company's stage.
- **Today:** NextUp's team reaches every stack through `/admin` and the box agent's copy of the stack secrets; there
  is nothing to grant.

**Purpose:** NextUp's team gets into the company's NextUp only when a company admin lets them, for a set time, and
every step is on record.

### Layout (desktop)

```
Support access                                               [Grant access]
NextUp's team has no access to Acme Automotive unless you grant it. Every
grant ends by itself and is logged.

┌ Now ─────────────────────────────────────────────────────────────────────┐
│ (Open until 14:30)  NextUp support may sign in to this server's admin.   │
│ ┌ InfoPanel ───────────────────────────────────────────────────────────┐ │
│ │ Granted by      H. Sander, today 10:30                               │ │
│ │ For             4 hours                                              │ │
│ │ Reason          Ticket 1042: a route sends cases to the wrong unit   │ │
│ │ Used            Signed in 10:41 (NextUp support · A. Roth)           │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
│                                                          [End now]  red  │
└──────────────────────────────────────────────────────────────────────────┘

┌ Log ─────────────────────────────────────────────────────────────────────┐
│ When              What                                    Who            │
│ today 10:41       Signed in to admin                      NextUp · A. Roth │
│ today 10:30       Granted for 4 hours                     H. Sander      │
│ 21 Oct 16:00      Ended by itself                         –              │
│ 21 Oct 08:00      Granted for 8 hours                     L. Brandt      │
│ 1-20 of 34                                         ( ‹ )  ( › )          │
└──────────────────────────────────────────────────────────────────────────┘
```

- Without an open grant the Now card shows a grey "No access" badge and "NextUp's team cannot sign in. Grant access
  when you ask them for help." The header button *Grant access* is the page's one action; while a grant is open it
  becomes *Extend…*.
- The open grant badge is amber ("needs you" tone): someone outside the company can get in.
- NextUp staff are named in the log by the name of their admin account; they are not members of the company and
  are never picked in a form.

Grant dialog (`ConfirmDialog`, wider: 480 px):

```
Grant NextUp support access
────────────────────────────────────────────────
For          ( 1 hour | 4 hours | 1 day | 3 days )
Reason       [ Ticket 1042: a route sends cases…      ]
             NextUp sees this reason.
────────────────────────────────────────────────
NextUp support can sign in to the admin of this
server until 14:30 today and see Acme Automotive's
data. You can end it any time.
                              [Cancel]  [Grant access]
```

### Phone

The Now panel stacks; *End now* is full width under it. Log rows become cards: what, when, who.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Lead | text | | NextUp's team has no access to {company} unless you grant it. Every grant ends by itself and is logged. | Das NextUp-Team hat keinen Zugang zu {company}, außer du gewährst ihn. Jede Freigabe endet von selbst und wird protokolliert. |
| Now: none | badge + line | | No access · NextUp's team cannot sign in. Grant access when you ask them for help. | Kein Zugang · Das NextUp-Team kann sich nicht anmelden. Gewähre Zugang, wenn du um Hilfe bittest. |
| Now: open | badge + `InfoPanel` | | Open until {time} · NextUp support may sign in to this server's admin. · Granted by · For · Reason · Used · Not used yet | Offen bis {time} · Der NextUp-Support darf sich in der Verwaltung dieses Servers anmelden. · Gewährt von · Für · Grund · Genutzt · Noch nicht genutzt |
| Duration | segmented | 1 h, 4 h, 1 day, 3 days *(proposal)*; default 4 h | For · 1 hour · 4 hours · 1 day · 3 days | Für · 1 Stunde · 4 Stunden · 1 Tag · 3 Tage |
| Reason | text input | required, 1-200 characters | Reason · NextUp sees this reason. | Grund · NextUp sieht diesen Grund. |
| Dialog text | text | names the end time | NextUp support can sign in to the admin of this server until {time} and see {company}'s data. You can end it any time. | Der NextUp-Support kann sich bis {time} in der Verwaltung dieses Servers anmelden und die Daten von {company} sehen. Du kannst das jederzeit beenden. |
| Log events | `DataTable` | newest first | Granted for {duration} · Extended until {time} · Ended by {name} · Ended by itself · Signed in to admin · Signed out | Für {duration} gewährt · Verlängert bis {time} · Beendet von {name} · Von selbst beendet · In der Verwaltung angemeldet · Abgemeldet |
| Columns | | | When · What · Who | Wann · Was · Wer |

### Actions

- *Grant access*: toast "NextUp support has access until {time}." / "Der NextUp-Support hat Zugang bis {time}."
- *Extend…*: the same dialog with "Extend by"; the end moves, a log line is written.
- *End now* (`ConfirmDialog`): "End NextUp's access now? Anyone of them signed in is signed out." / "Zugang für
  NextUp jetzt beenden? Wer von ihnen angemeldet ist, wird abgemeldet." Toast "Access ended." / "Zugang beendet."

### States

- Demo company: the page shows only the line "Demo company: NextUp's team works in it directly." / "Demo-Firma: Das
  NextUp-Team arbeitet direkt darin."
- Empty log: "No grants yet." / "Noch keine Freigaben."
- Loading: skeleton panel and rows.

### Done when

- [ ] Desktop and phone in German: no access, an open grant (used and not used), the grant dialog, the extend
      dialog, the end dialog, the log, the demo line.

---

## Set up the second factor (enrol step)

- **Route:** `/[company]/login`, step after the code (new step in the redesigned page)
- **Who:** a **manager** who signed in with a personal code and has no `totpEnabledAt` yet (ADM/D12). Members,
  leaders and anyone signing in with Microsoft never see it (ADM/Q4).
- **Phase:** ADM-E1 (`codeLogin` returns the enrol step; `features/auth/totp.ts`: `otpauthUrl`, `verifyTotp`; the
  secret is stored sealed only after the first right code)
- **Data:** a fresh secret (base32, 32 characters), the `otpauth:` link built by `otpauthUrl(issuer, account,
  secret)`. No QR image (ADM/Q2).
- **Today:** nothing; a manager's code alone opens the company.

**Purpose:** a manager links an authenticator app to their account once, without a QR code, and is signed in.

### Layout (desktop): inside the login card of `AuthShell`

```
                              ┌ login card ─────────────────────────────┐
  (side panel as on the       │ [A] Acme Automotive                     │
   login page)                │                                         │
                              │ Set up your second factor               │
                              │ Managers sign in with their code and a  │
                              │ code from an app. This takes 2 minutes. │
                              │                                         │
                              │ 1  Open an authenticator app on your    │
                              │    phone and add an account by key.     │
                              │                                         │
                              │ 2  Key                                  │
                              │    ┌ SecretOnce ───────────────────────┐│
                              │    │ XXXX XXXX XXXX XXXX        [Copy] ││
                              │    │ XXXX XXXX XXXX XXXX               ││
                              │    │ Shown once. Store it now.         ││
                              │    └───────────────────────────────────┘│
                              │    On this phone: open the app link →   │
                              │    [Copy link]                          │
                              │                                         │
                              │ 3  Code from the app                    │
                              │    [ 123 456 ]                          │
                              │    [ Confirm and sign in              ] │
                              │                                         │
                              │ Back to the login                       │
                              └─────────────────────────────────────────┘
```

- The three steps are numbered circles (24 px, grey fill, ink number), not a stepper: all three show at once.
- The key is grouped in fours, `--nh-mono` `--nh-fs-lg`, so it can be typed by hand. *Copy* copies it without
  spaces.
- "Open the app link" is the `otpauth:` link as an `<a>` (a phone with an authenticator opens it); *Copy link* copies
  the link text. On desktop the link line is shown but muted, with the hint "Works on the phone you use for the app."
- The code field is one input, 6 digits, `inputmode="numeric"`, `autocomplete="one-time-code"`, shown as "123 456"
  with a gap after 3 digits, letter-spacing 0.08em, `--nh-fs-xl`.
- The account the app shows: issuer "NextUp", account "{company}: {email}" *(proposal; ADM-E1 picks the label)*.

### Phone

The side panel is hidden (as on today's login). The card is full width; the key box wraps in two lines of two
groups; "Open the app link" becomes a full-width grey button, because this is where it works.

### Content (namespace `adminAccess`)

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Title | h1 | | Set up your second factor | Richte deinen zweiten Faktor ein |
| Sub | text | | Managers sign in with their code and a code from an app. This takes 2 minutes. | Führungskräfte melden sich mit ihrem Code und einem Code aus einer App an. Das dauert 2 Minuten. |
| Step 1 | text | | Open an authenticator app on your phone and add an account by key. | Öffne eine Authenticator-App auf deinem Handy und füge ein Konto per Schlüssel hinzu. |
| Step 2 | `SecretOnce` + link | key never sent again after this page | Key · Copy · Shown once. Store it now. · On this phone: open the app link → · Copy link · Works on the phone you use for the app. | Schlüssel · Kopieren · Wird nur einmal angezeigt. Jetzt sichern. · Auf diesem Handy: App-Link öffnen → · Link kopieren · Funktioniert auf dem Handy mit der App. |
| Step 3 | code input + black button | exactly 6 digits | Code from the app · Confirm and sign in | Code aus der App · Bestätigen und anmelden |
| Back | text link | ends the step, no session | Back to the login | Zurück zur Anmeldung |
| Wrong code | field error | `verifyTotp` false | That code does not match. Check the time on your phone and enter the code the app shows now. | Der Code passt nicht. Prüfe die Uhrzeit auf deinem Handy und gib den Code ein, den die App jetzt zeigt. |
| Not 6 digits | field error | before submit | Enter the 6 digits from the app. | Gib die 6 Ziffern aus der App ein. |
| Step expired | error on the code page | after leaving the step for 10 minutes *(proposal)* | That took too long. Enter your login code again. | Das hat zu lange gedauert. Gib deinen Anmeldecode noch einmal ein. |

### Actions

- *Confirm and sign in*: the secret is stored sealed, `totpEnabledAt` set, the session issued, the manager lands on
  their home (or `next`). Toast on the home: "Second factor set up." / "Zweiter Faktor eingerichtet."
- *Back to the login* or leaving the page: nothing is stored; the next code login shows a new key.
- Too many wrong codes: the login brake's message (`server/throttle.ts`, as for wrong login codes).

### States

- Pending: the button reads "One moment…" / "Einen Moment…" and is disabled.
- The `next` path is kept through both steps.

### Done when

- [ ] Desktop and phone in German: the enrol step, wrong code, not six digits, expired step, pending.

---

## Enter the second-factor code (code step)

- **Route:** `/[company]/login`, step after the code
- **Who:** a manager with `totpEnabledAt` who signed in with their personal code (ADM/D12)
- **Phase:** ADM-E1 (`codeLogin` issues the session only after `verifyTotp`: 6 digits, 30 s, one step of drift)
- **Data:** none shown; the company's name and mark.
- **Today:** nothing.

**Purpose:** the second step of a manager's code login, done in a few seconds.

### Layout (desktop): inside the login card

```
┌ login card ─────────────────────────────┐
│ [A] Acme Automotive                     │
│                                         │
│ One more step                           │
│ Enter the code from your authenticator  │
│ app.                                    │
│                                         │
│ Code from the app                       │
│ [ 123 456 ]                             │
│ [ Sign in                             ] │
│                                         │
│ Use another login code                  │
│                                         │
│ Lost your phone? Another manager of     │
│ Acme Automotive can reset your second   │
│ factor in Settings → Members. (Q-08-1)  │
└─────────────────────────────────────────┘
```

- The code field as in the enrol step, focused on load. Six digits submit the form by themselves *(proposal)*; the
  button stays for people who paste.
- "Use another login code" goes back to the first step (another manager on the same shared PC).

### Phone

Card full width; the numeric keyboard opens on load.

### Content (namespace `adminAccess`)

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Title | h1 | | One more step | Noch ein Schritt |
| Sub | text | | Enter the code from your authenticator app. | Gib den Code aus deiner Authenticator-App ein. |
| Field | code input | 6 digits | Code from the app | Code aus der App |
| Button | black, full width | | Sign in | Anmelden |
| Back | text link | | Use another login code | Anderen Anmeldecode verwenden |
| Lost phone | foot | depends on Q-08-1 | Lost your phone? Another manager of {company} can reset your second factor in Settings → Members. | Handy verloren? Eine andere Führungskraft von {company} kann deinen zweiten Faktor unter Einstellungen → Mitglieder zurücksetzen. |
| Wrong code | field error | | That code does not match. Enter the code the app shows now. | Der Code passt nicht. Gib den Code ein, den die App jetzt zeigt. |

### Actions

- *Sign in*: session issued, redirect to the home or `next`.
- Wrong code: the field keeps the digits selected for retyping; the brake applies as for login codes.

### States

- Pending ("One moment…"), wrong code, expired step (same text as the enrol step), braked.

### Done when

- [ ] Desktop and phone in German: the step, wrong code, braked, expired.

---

## Company login (redesign)

- **Route:** `/[company]/login` (`app/[company]/login/page.tsx`, `components/auth/CompanyLoginForm.tsx`)
- **Who:** everyone of the company; not signed in
- **Phase:** ADM-E1 (the two second-factor steps), EID *(later: one button per OIDC or SAML provider)*
- **Data:** the tenant (`name`, `mark`), whether Microsoft is on (`microsoftEnabledFor`), the demo person
  (`demoPersonFor`, demo stage only); *later (EID)* the button texts of the company's OIDC and SAML providers.
- **Today:** `AuthShell` with the hand picture and a side panel "This week at Acme" with three fixed numbers
  ("26 h", "84 %", "3") from the code, not from the company; the card has the company mark and name, "Not your
  company?", "Welcome back", one code field, *Log in* (blue `nh-btn-primary`), a divider, *Continue with Microsoft*
  with the Microsoft logo, "With your Acme work account.", the demo button on demo boxes, and the foot "No code yet,
  or lost it? Ask your team leader". The code login's error texts are inline English in `server/actions/auth.ts`.

**Purpose:** everyone gets in with the one way their company set up for them, and managers with a second step.

What stays:

- `AuthShell` with the hand art, the step transition, *← Back* to the company finder, "Not your company?" (hidden
  in single-company mode), the demo button on demo boxes.
- Code first, then a divider, then the providers. The code field's behaviour (`noValidate`, own empty-field message,
  the value kept after a wrong code, `autocomplete="one-time-code"`).
- The Microsoft logo on the Microsoft button, nowhere else.

What changes:

- *Log in* becomes the black primary pill (Q1); provider buttons are grey pills.
- The side panel numbers: shown only for demo-stage companies. From sandbox on, the side panel shows the company's
  mark large and one line "Raise it once. NextUp makes sure someone answers." / "Einmal einbringen. NextUp sorgt
  dafür, dass jemand antwortet." *(proposal; real numbers come later from MET, company-wide only)*.
- "Ask your team leader" becomes "ask a manager": managers issue codes in Settings → Members (ADM/D6, D11).
- The two second-factor steps replace the card's content in place (same card, same transition).
- *Later (EID):* one grey button per OIDC or SAML provider, text = the admin's "Button text", with the app's key icon.

### Layout (desktop)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [NextUp]                                                                     │
│ ┌ side (hand art) ───────────────────┐   ← Back                              │
│ │                                    │   ┌ card ───────────────────────────┐ │
│ │  [A]                               │   │ [A] Acme Automotive             │ │
│ │  Raise it once. NextUp makes sure  │   │                Not your company?│ │
│ │  someone answers.                  │   │ Welcome back                    │ │
│ │                                    │   │ Sign in with your personal code │ │
│ │                                    │   │ or your work account.           │ │
│ │                                    │   │ Your login code                 │ │
│ │                                    │   │ [ acme-xxxx-xxxx-xxxx         ] │ │
│ │                                    │   │ [ Log in                      ] │ │
│ │                                    │   │ ───────────── or ───────────── │ │
│ │                                    │   │ [ ⊞ Continue with Microsoft   ] │ │
│ │                                    │   │ [ ⚿ Continue with Acme SSO    ] │ │ (EID)
│ │                                    │   │ With your Acme work account.    │ │
│ │                                    │   │                                 │ │
│ │                                    │   │ No code yet, or lost it? Ask a  │ │
│ │                                    │   │ manager for a new one.          │ │
│ └────────────────────────────────────┘   └─────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Phone

As today: the side panel is hidden, the card fills the width with the page gutter; buttons full width; the code
field uses `--nh-fs-input` (16 px) so the phone does not zoom.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Title / sub | h1 + text | sub depends on the ways that are on | Welcome back · Log in with your personal code. · Log in with your personal code or your Microsoft work account. · *(EID)* Log in with your personal code or your work account. | Willkommen zurück · Melde dich mit deinem persönlichen Code an. · Melde dich mit deinem persönlichen Code oder deinem Microsoft-Arbeitskonto an. · Melde dich mit deinem persönlichen Code oder deinem Arbeitskonto an. |
| Code field | text input | as today | Your login code · {slug}-xxxx-xxxx-xxxx | Dein Anmeldecode · {slug}-xxxx-xxxx-xxxx |
| Primary | black pill | | Log in | Anmelden |
| Divider | | | or | oder |
| Microsoft | grey pill + logo | only with `entraTenantId` | Continue with Microsoft · With your {short} work account. | Weiter mit Microsoft · Mit deinem {short}-Arbeitskonto. |
| Other providers *(EID)* | grey pill + key icon | one per provider that is on | Continue with {button text} | Weiter mit {button text} |
| Foot | text | | No code yet, or lost it? Ask a manager for a new one. | Noch kein Code oder verloren? Frag eine Führungskraft nach einem neuen. |
| Wrong code | field error | moves into the `auth` catalog | That code does not open this company. Check for a typo, or ask a manager for a new one. | Dieser Code öffnet diese Firma nicht. Prüfe ihn auf Tippfehler oder frag eine Führungskraft nach einem neuen. |
| Old shared code | field error | | That is the old shared company code. Everyone has their own code now. Ask a manager for yours. | Das ist der alte gemeinsame Firmencode. Alle haben jetzt einen eigenen Code. Frag eine Führungskraft nach deinem. |
| Deactivated | field error | DIR-G1 refuses inactive users | This account is switched off. Ask a manager if that is a mistake. | Dieses Konto ist abgeschaltet. Frag eine Führungskraft, falls das ein Fehler ist. |
| Side line | text | sandbox, pilot, live *(proposal)* | Raise it once. NextUp makes sure someone answers. | Einmal einbringen. NextUp sorgt dafür, dass jemand antwortet. |

### Actions

- *Log in*: a member or leader goes to their home; a manager goes to the code step or the enrol step.
- Provider buttons start the provider's sign-in; an error that comes back shows above the code field (as
  `microsoftError` today).

### States

- Pending: "One moment…" / "Einen Moment…".
- No database (laptop): the demo-mode card as today.
- Demo stage on a demo box: the demo button under the form, as today.

### Done when

- [ ] Desktop and phone in German: code only; code and Microsoft; code, Microsoft and one SSO button *(later)*;
      the demo-stage side panel with numbers and the real-stage side panel without; wrong code, old shared code,
      deactivated, Microsoft error, pending; the transitions into both second-factor steps.

---

## Forgot code, signup and invite pages

- **Routes:** `/forgot-password`, `/signup`, `/invite/[token]` (`app/(auth)/…`, redesign of the stubs)
- **Who:** anyone, not signed in
- **Phase:** ADM-D1 (ADM/D11)
- **Data:** none; for the redirects the company slug of a single-company stack (`singleCompany()`), else none.
- **Today:** three stubs in `AuthShell` (dark side panel): "Reset your password · Coming with real accounts in
  Phase 2", "Create your workspace · Coming with the first pilot", "You have been invited · Invite {token} -
  accepting invites arrives in Phase 2".

**Purpose:** no dead ends: people who arrive here are sent to the way in that exists.

- `/signup` and `/invite/[token]` have **no page to draw**: they redirect to the company login on a single-company
  stack, else to the company finder `/login` (ADM-D1). The token in an old invite link is ignored.
- `/forgot-password` keeps its URL (old links) and becomes one short page.

### Layout (desktop): `/forgot-password`

```
┌ side (dark) ──────────────┐   ┌ card ───────────────────────────────────┐
│ [NextUp]                  │   │ Lost your login code?                   │
│                           │   │ NextUp has no passwords. Each person    │
│ No passwords to forget.   │   │ has a personal code, and a manager of   │
│                           │   │ your company gives you a new one in a   │
│                           │   │ minute.                                 │
│                           │   │                                         │
│                           │   │ Sign in with Microsoft? Then your       │
│                           │   │ company's Microsoft password reset      │
│                           │   │ applies.                                │
│                           │   │                                         │
│                           │   │ [ Go to your company's login          ] │
│ Berlin · 2026             │   │                                         │
└───────────────────────────┘   └─────────────────────────────────────────┘
```

### Phone

The side panel collapses to the logo bar as on the other `(auth)` pages; the card fills the width.

### Content (namespace `auth`)

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Meta title | | replaces "Reset password" | Lost login code | Anmeldecode verloren |
| Side | h2 | | No passwords to forget. | Keine Passwörter zum Vergessen. |
| Title | h1 | | Lost your login code? | Anmeldecode verloren? |
| Body | text | | NextUp has no passwords. Each person has a personal code, and a manager of your company gives you a new one in a minute. | NextUp hat keine Passwörter. Jede Person hat einen persönlichen Code, und eine Führungskraft deiner Firma gibt dir in einer Minute einen neuen. |
| Microsoft line | text | | Sign in with Microsoft? Then your company's Microsoft password reset applies. | Du meldest dich mit Microsoft an? Dann gilt das Zurücksetzen über Microsoft in deiner Firma. |
| Button | black pill | company login or `/login` | Go to your company's login | Zur Anmeldung deiner Firma |
| Removed keys | | `forgotSub`, `inviteSide`, `inviteTitle`, `inviteSub`, `signupSide`, `signupTitle`, `signupSub`, `metaInvited`, `metaSignup` go | – | – |

### Done when

- [ ] Desktop and phone frames of `/forgot-password` in German; a note on the frame that `/signup` and
      `/invite/[token]` redirect.

---

## `/admin` login (redesign)

- **Route:** `/admin/login` (`app/admin/login/page.tsx`, `components/admin/AdminLoginForm.tsx`); the banner in
  `app/admin/layout.tsx`
- **Who:** NextUp's team and the stack's named admins. Not a company page: keep it plain (plan, "Two kinds of admin").
- **Phase:** ADM-E1 (ADM/D13)
- **Data:** whether Microsoft admin sign-in is on (`microsoftAdminEnabled`); `User.isStackAdmin`,
  `User.totpEnabledAt`; the break-glass flag in the admin cookie.
- **Today:** a card "Admin", one line about the scope, *Continue with Microsoft* (blue) when set up, "Or use the
  admin code, kept for when Microsoft is not available.", one password field "Admin code", *Unlock*; a "Demo code"
  fill button with `ADMIN_DEMO_FILL`. English only.

**Purpose:** named admins sign in as themselves; the shared code still works, but only as a visible, logged
emergency door.

What stays: the plain admin card on the admin ground, the scope line, Microsoft first, the "Demo code" fill on demo
boxes, the brake (5 tries / 15 min).

What changes:

- A second way for named people: personal code, then the TOTP code step (same component as the company login's code
  step).
- The shared code moves behind a disclosure "Use the shared admin code" with a warning.
- Strings move into `adminAccess` (German and English; today they are inline English).
- After a break-glass sign-in, every `/admin` page shows a banner.

### Layout (desktop)

```
┌ Admin ───────────────────────────────────────────────┐
│ Admin                                                │
│ Hand out your people's login codes, switch on        │
│ Microsoft sign-in, and set what the assistant reads. │
│                                                      │
│ [ ⊞ Continue with Microsoft                        ] │
│ ──────────────────── or ──────────────────────────── │
│ Your personal login code                             │
│ [ acme-xxxx-xxxx-xxxx                              ] │
│ [ Continue                                         ] │
│                                                      │
│ ▸ Use the shared admin code                          │
│   ┌ amber panel ───────────────────────────────────┐ │
│   │ For emergencies only. Every use is logged and  │ │
│   │ marked in the admin until you sign out.        │ │
│   │ Admin code   [ ••••••••••          ] [Unlock]  │ │
│   └────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

Banner on every `/admin` page after a break-glass sign-in (36 px, amber, under the admin bar):

```
┌ amber strip ─────────────────────────────────────────────────────────────┐
│ Opened with the shared admin code. This session is logged as             │
│ break-glass. Sign in with your own account when you can.                 │
└──────────────────────────────────────────────────────────────────────────┘
```

On a wide screen the text is one line; it wraps only when it must.

### Phone

One column at full width; the disclosure works the same.

### Content (namespace `adminAccess`)

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Personal code | text input + button | only users with `isStackAdmin` get further | Your personal login code · Continue | Dein persönlicher Anmeldecode · Weiter |
| Not a stack admin | error | | This account may not open the admin. Ask a stack admin to switch it on in People. | Dieses Konto darf die Verwaltung nicht öffnen. Bitte einen Stack-Admin, es unter Personen freizuschalten. |
| Code step | as the company login's code step | | One more step · Code from the app · Sign in | Noch ein Schritt · Code aus der App · Anmelden |
| Disclosure | toggle | closed by default | Use the shared admin code | Gemeinsamen Admin-Code verwenden |
| Warning | amber panel | | For emergencies only. Every use is logged and marked in the admin until you sign out. | Nur für Notfälle. Jede Nutzung wird protokolliert und in der Verwaltung markiert, bis du dich abmeldest. |
| Admin code | password input + button | | Admin code · Unlock | Admin-Code · Entsperren |
| Wrong admin code | error | | That is not the admin code. | Das ist nicht der Admin-Code. |
| Banner | amber strip | break-glass flag in the cookie | Opened with the shared admin code. This session is logged as break-glass. Sign in with your own account when you can. | Mit dem gemeinsamen Admin-Code geöffnet. Diese Sitzung wird als Notfallzugang protokolliert. Melde dich mit deinem eigenen Konto an, sobald du kannst. |
| People switch | switch per person in `/admin/people` | set by an admin, never by the user | Stack admin | Stack-Admin |

### States

- A stack admin without a second factor: the enrol step (same component as the company login) *(D12 names managers
  only; confirm in ADM-E1)*.
- Pending, wrong code, braked (the brake's message).

### Done when

- [ ] Desktop frames: Microsoft on and off, the personal-code path into the code step, the disclosure open, the
      wrong-code errors, the banner on an `/admin` page, the Stack admin switch in People; one phone frame.

---

## Open questions added by this file

| # | Question | Default |
|---|---|---|
| Q-08-1 | A manager who loses their phone cannot sign in by code (ADM-E1 has no reset). Who resets a second factor? | Another manager in Members (⋯ → "Reset second factor", clears `totpEnabledAt` and the secret, logged), and a stack admin in `/admin/people`. Decided: ADM/D19, task ADM-R1. |
| Q-08-2 | Does ADM/D12 apply to managers of demo-stage companies, who sign in by code on demo boxes? | Decided (ADM/D19): no, demo-stage managers sign in through the demo and never enrol. |
| Q-08-3 | Is an import all or nothing, or may rows with errors be skipped? | All or nothing: *Apply* waits until every row is clean. |
| Q-08-4 | API tokens: system tokens only, or also tokens that act as one user (ADR 0003 mentions user tokens)? | System tokens only for the pilot; user tokens need `ApiToken.userId` and come with the API Bauplan if a customer asks. |
