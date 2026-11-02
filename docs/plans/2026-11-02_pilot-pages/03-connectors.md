# 03 · Connectors

> **Plan · 2026-11-02 · open: page specs for Sam. Part of [the pilot pages plan](../2026-11-02_pilot-pages.md); read its
> ground rules and shared building blocks first.**
> One page, `/settings/connectors`, with one `ConnectorBlock` per system NextUp talks to: Microsoft 365, Jira, the AI
> provider and the directory, and *later* Microsoft Teams and SAP SuccessFactors. This file also defines the
> `ConnectorBlock` itself and the *connector error* state that the plan file refers to.

Context for this file:

- **Bauplan ADM** (plans repo `projects/nextup/ADM/PLAN.md`): D10 the connectors page, D6 company admins, D7 test
  ids. Task ADM-C1 (`components/settings/connectors/**`, `server/actions/settings/connectors.ts`). The `/admin`
  screens stay as they are; this page calls the same lib functions after `companyAdminOf`.
- **Microsoft 365:** `CompanyConfig.m365Search`, `setM365SearchAction` (`server/actions/m365.ts`), `m365AdminView`
  (`server/m365-admin.ts`: `on`, `connected`, `microsoft`, `vault`), the `Connection` table (`lastUsedAt`). The data
  block is step 2.7 / PR D of `docs/plans/2026-10-22_sso-and-data-access.md` ("how many people are connected and the
  last search, never content"); PR D is not on `main` yet, ADM-C1 builds its block here.
- **Jira:** `components/admin/JiraAdmin.tsx` and `docs/plans/2026-10-29_jira-in-app.md` (the screen this block
  mirrors), `JiraSettings` and `JiraStatusView` (`features/integrations/jira/types.ts`), `parseJiraSettings`, the
  actions in `server/actions/jira-admin.ts`, the connection test `server/jira/test.ts`. **Bauplan CNX** D10 (Data
  Center client `server/jira/dc.ts`: base URL, Bearer personal access token, no email) and Q3 (ADM switches the Data
  Center option on).
- **AI provider:** **Bauplan AIP** D5 (`Integration` row "ai", `loadAiSettings(companyId, stage)`,
  `saveAiSettings(companyId, settings, key | null, by)`, `AiSettings` with `choice`, `region`, `model`, `endpoint`,
  `deployment`), D6 (`aiGate`, the DPA gate on `CompanyConfig.dpaSignedAt`), D7 (adapters). Today's switches:
  `components/admin/AssistSettingsForm.tsx` (assistant on/off, DPA date).
- **Directory:** **Bauplan DIR** D7 (`DirectoryRun`), DIR-G1 (`loadDirectoryStatus(companyId): DirectoryStatus` =
  `{ on, source, lastRunAt, lastOkAt, lastError, counts }`, never the cursor), DIR-C1 (on/off and *Run now* live in
  `/admin`), D5 and HD14 (the personnel number is never shown).
- **Later blocks:** Microsoft Teams (TMS) and SAP SuccessFactors (SFX) have no Bauplan; their blocks follow the PILOT
  briefs and may change when the Bauplan is written.
- Text namespace (ADM/D3): `settingsConnectors`.

---

## ConnectorBlock

The shared block of this page (plan file, "Shared building blocks"). One `SectionCard`-sized white card per
connector, in `apps/app/src/components/settings/connectors/ConnectorBlock.tsx`. Every connector fills the same
slots in the same order; a slot a connector does not have is left out, never drawn empty.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ (icon) Jira                                  [Error]          [ on ●]   │ 1 Header
│        Approved projects go to Jira as an epic and issues.              │
│        Last sync failed at 14:20. Check the connection.                 │
│                                                                          │
│ What NextUp reads                                                        │ 2 Reads
│ ┌ InfoPanel ───────────────────────────────────────────────────────────┐ │
│ │ Reads        status and summary changes, new issues, comments        │ │
│ │ Never reads  author names, other projects                            │ │
│ │ Site         https://acme.atlassian.net · project NUP                │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│ Connection                                                               │ 3 Setup
│ Label           [ field                                   ]             │
│ API token       Set · saved 28 Oct                    [Replace]          │
│                                         [Test connection]  [ Save ]      │
│ ✓ All checks passed as NextUp Integration.                               │ 4 Test
│                                                                          │
│ Sync                                                                     │ 5 Sync
│ Last round 14:20 · last good round 13:59 · 3 projects, 21 steps          │
│                                                            [Sync now]    │
│                                                                          │
│ Recent errors                                                            │ 6 Errors
│ 14:20  Jira refused the token - it has expired or was revoked.           │
│        401 Unauthorized                                     (mono, grey) │
│ NUP-14 Step “Order gauges” has no issue type.                           │
│ … and 3 more                                                             │
└──────────────────────────────────────────────────────────────────────────┘
```

### Slots

| # | Slot | Looks like | Rules |
|---|---|---|---|
| 1 | **Header** | 24 px stroke icon from the app's set (no other company's logo), name `--nh-fs-lg` 600, `StatusBadge` after the name, the on/off switch right-aligned. Under the name one description line (`--nh-fs-sm`, `--nh-ink-2`) and, when there is one, the status line (`--nh-fs-sm`; red text only in the Error tone). | Always present. The switch is left out when the connector has none (AI provider: its choice includes *Off*; Directory: switched in `/admin`). A disabled switch says why in a tooltip and in the status line. |
| 2 | **What NextUp reads** | Slot title `--nh-fs-sm` 600, then an `InfoPanel`. First two rows are always *Reads* and *Never reads*, then the connector's facts (site, counts, source, dates). | Always present. This is the slot a works council reads; it lists data kinds, never data. |
| 3 | **Setup** | Slot title, then fields in the label/field grid of the settings pages (label column 200 px). Secrets use the *secret field* below. The slot's footer holds *Test connection* (grey) and *Save* (black), right-aligned. | Left out for read-only connectors. *Save* is disabled until a field changed (`SectionCard` rule). |
| 4 | **Test** | One result line under the footer: a check or a cross icon and one sentence. A connector with several checks (Jira) shows them as a list of rows (icon, check name 600, detail `--nh-mute`) under the line. | Only where a test action exists. The result is not stored; it disappears on reload. While running: the button says "Testing…" and is disabled. |
| 5 | **Sync** | Slot title, one meta line (last run, last good run, counts in tabular figures), *Sync now* (grey) on the right. | Only for connectors that copy or send on a schedule (Jira, Directory). Counts are of items or of people changed, never a list of names. |
| 6 | **Recent errors** | Slot title, then up to 5 rows: time (tabular) or item key in the left column (64 px), one plain sentence, and under it the raw message in `--nh-mono` `--nh-fs-xs` `--nh-mute`. "… and {n} more" after the fifth row. | Only when there is something to show; never an empty "No errors" box. Today's data holds the *last* error per connector (`lastError`) and Jira's per-item problems; there is no error history (open question C2). |

The block sits in a column of max 760 px; blocks stack with `--nh-gap`. Each block is an anchor (`#m365`, `#jira`,
`#ai`, `#directory`) for links from the shell menu, the go-live checklist and error toasts.

### Status

`StatusBadge` tones as in the plan file. Which tone each connector shows:

| Connector | Off (grey) | Needs you (amber) | On (white, blue check) | Error (red) |
|---|---|---|---|---|
| Microsoft 365 | switch off | switch off and the stack lacks Microsoft sign-in or the vault key, so it cannot be turned on | switch on | – (no company-level error is stored) |
| Jira | not configured, or configured and off | token expired (`tokenExpired`); configured, off, and the last test failed | on, no `lastError` | on and `lastError` set |
| AI provider | choice *Off* | a choice other than *Off* but no DPA date, or an API key missing for Azure OpenAI / OpenAI-compatible | the gate is open for at least one purpose | – (model failures are not stored; the keyword router takes over) |
| Directory | `on` false | – | `on` and no `lastError` | `on` and `lastError` set |

Badge labels: Off · Needs you · On · Error / Aus · Braucht dich · An · Fehler.

When any block is in Error, the Connectors item in the settings menu carries the small Error badge (01, Settings
shell).

### Secret field

Keys and tokens are write-only (ADM/D10). The browser never receives a stored value, not even masked.

```
Not set:   API token     [ ••••••••••••                    ]  Not set
Set:       API token     Set · saved 28 Oct 2026                 [Replace]
Replacing: API token     [                                  ]  [Cancel]
                         The saved token stays until you save a new one.
```

- *Set* shows the date of the connector row's last save (`updatedAt`); the name of who saved it is not stored per
  secret, so it is not shown.
- *Replace* turns the line into an empty password input; *Cancel* turns it back. Saving with the input empty keeps
  the stored secret (AIP's `key: null`; the Jira form's empty token).
- Without the stack's vault key no secret can be stored: the field is disabled with the amber line "Keys cannot be
  stored on this server yet. Ask NextUp's team to set up the vault." / "Schlüssel können auf diesem Server noch nicht
  gespeichert werden. Bitte das NextUp-Team, den Tresor einzurichten."

### Connector error (one of the six shared states)

What a company admin sees when a connector fails:

1. The badge in the block header turns red ("Error"), and the settings menu item shows the Error badge.
2. The header's status line names the connector, the time and one step: "Jira: last sync failed at 14:20. Check the
   connection." / "Jira: letzte Synchronisierung um 14:20 fehlgeschlagen. Verbindung prüfen." For a day other than
   today: "on 28 Oct at 14:20" / "am 28. Okt. um 14:20".
3. *Recent errors* shows the error first, with the plain sentence and the raw message.
4. One more line under the status line, always: "Cases keep working. Only the sync with {connector} waits." / "Fälle
   laufen weiter. Nur die Synchronisierung mit {connector} wartet." (HD7: the core loop never depends on a
   connector.)

Special sentences:

| Case | EN | DE |
|---|---|---|
| Jira token refused (`tokenExpired`) | Jira refused the token - it has expired or was revoked. Enter a new one and save. | Jira hat den Token abgelehnt - er ist abgelaufen oder wurde widerrufen. Gib einen neuen ein und speichere. |
| Directory run failed | Directory: last sync failed at {time}. The previous state stays until the next good run. | Verzeichnis: letzte Synchronisierung um {time} fehlgeschlagen. Der bisherige Stand bleibt bis zum nächsten erfolgreichen Lauf. |
| Teams *(later)* | Teams: cards could not be delivered since {time}. Notices go by email meanwhile. | Teams: Karten konnten seit {time} nicht zugestellt werden. Hinweise gehen solange per E-Mail. |

The AI provider has no error state: when a model does not answer, routing falls back to keywords (AIP/D9) and
nothing is shown as broken.

### Test ids

`settings-connectors-<connector>-<thing>` (ADM/D7), connector = `m365`, `jira`, `ai`, `directory`, *later*
`teams`, `successfactors`. Things: `block`, `status`, `switch`, `save`, `test`, `test-result`, `sync-now`,
`errors`, and each field by its name (`settings-connectors-jira-flavor`, `-site`, `-email`, `-token`,
`-token-replace`, `-project-key`; `settings-connectors-ai-choice`, `-region`, `-endpoint`, `-deployment`, `-model`,
`-key`, `-key-replace`).

---

## Connectors

- **Route:** `/[company]/settings/connectors` (new)
- **Who:** company admins (ADM/D6)
- **Phase:** ADM-C1 (*later:* TMS adds the Teams block, SFX the SuccessFactors block and the second directory source)
- **Data:** per block, see each block below. All views are built on the server by pure view builders that never
  include a key or token value (ADM-C1 proof B1).
- **Today:** nothing in Settings. Jira is in `/admin/integrations` (`JiraAdmin`, Cloud only, Data Center "later"),
  the Microsoft 365 switch in `/admin/assistant` (`M365Admin`), the assistant's switches and the DPA date in
  `/admin/company-data` (`AssistSettingsForm`), the AI provider is read from the environment (`LLM_PROVIDER`), the
  directory has no screen yet (DIR-C1 adds one in `/admin`).

What stays / what changes (Jira, the screen with the most today):

- Stays: the order connection → test → what goes where → save, the five checks of *Test connection*, issue types
  filled by the test, the three switches, the status per column, "never shown again" for the token, the headline
  that says how the sync is doing.
- Changes: Data Center is a real choice (base URL and personal access token, no email); the status table becomes the
  *What NextUp reads* panel and the *Sync* slot; switch on/off moves into the header; the webhook and *Remove* stay in
  `/admin` for now (*later*: not in ADM-C1's actions).

**Purpose:** connect NextUp to the company's Microsoft 365, Jira, AI provider and directory, and show exactly what
each one reads.

### Layout (desktop)

```
Connectors
What NextUp reads from your systems, and what it never reads.

 Microsoft 365 [On]   Jira [Error]   AI provider [Needs you]   Directory [On]
 ─────────────────────────────────────────────────────────────────────────────

┌ (people) Microsoft 365 ─────────────────────────────── [On]    [ on ●] ┐
│ …                                                                     │
└───────────────────────────────────────────────────────────────────────┘
┌ (link) Jira ───────────────────────────────────────── [Error]  [ on ●] ┐
│ …                                                                     │
└───────────────────────────────────────────────────────────────────────┘
┌ (sparkle) AI provider ──────────────────────────────── [Needs you]     ┐
│ …                                                                     │
└───────────────────────────────────────────────────────────────────────┘
┌ (tree) Directory ─────────────────────────────────────── [On]          ┐
│ …                                                                     │
└───────────────────────────────────────────────────────────────────────┘

Coming later                                                  (second frame)
┌ (chat) Microsoft Teams ─────────────────────────────── [Off]  [ off ○] ┐
┌ (tree) SAP SuccessFactors ──────────────────────────── [Off]           ┐
```

- No primary action in the `PageHeader`: each block saves itself.
- The overview row under the header: one text link per connector with its `StatusBadge`, `--nh-fs-sm`; a click
  scrolls to the block. Phone: a horizontal scrolling row.
- Block order: Microsoft 365, Jira, AI provider, Directory (ADM/D10), then the *later* blocks in a separate frame.

### Phone

Blocks stack full width. Header: icon and name on the first line, badge and switch on the second. `InfoPanel` rows
become label above value. *Test connection* and *Save* are full width, *Save* first. The Jira check list keeps one
row per check.

---

### Microsoft 365 block

- **Data:** `m365AdminView` (`on` = `CompanyConfig.m365Search`, `connected` = number of `Connection` rows of the
  company with provider Microsoft, `microsoft` = the stack has Microsoft sign-in, `vault` = the vault key is set);
  the last search = the newest `Connection.lastUsedAt` of the company (PR D; not on `main` yet).
- **Actions:** the switch → `setM365SearchAction`. No setup fields (the Entra app is set up per stack), no test, no
  sync (nothing is copied).

```
┌ (people) Microsoft 365 ──────────────────────────────── [On]    [ on ●] ┐
│ Search in SharePoint and OneDrive, as the person who asks.              │
│                                                                         │
│ What NextUp reads                                                       │
│ ┌ InfoPanel ──────────────────────────────────────────────────────────┐ │
│ │ Reads          Files a connected person can already open, searched  │ │
│ │                live when they ask the assistant. Nothing is copied. │ │
│ │ Never reads    Mail, chats, calendars, SharePoint lists. Answers    │ │
│ │                keep the title and link of a file, not its content.  │ │
│ │ Connected      212 people                                           │ │
│ │ Last search    today                                                │ │
│ │ Sign-in        Microsoft sign-in is set up                          │ │
│ │ Permission     Files.Read.All, approved once by your IT             │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│ Each person connects their own account on their profile. Turning the   │
│ search off stops new connections.                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Name, description | header | | Microsoft 365 · Search in SharePoint and OneDrive, as the person who asks. | Microsoft 365 · Suche in SharePoint und OneDrive, als die Person, die fragt. |
| Switch | switch | disabled unless `microsoft` and `vault`; turning off is always possible | Company search | Firmenweite Suche |
| Disabled reason | status line, amber | | Microsoft sign-in is not set up for this company yet. Ask NextUp's team. · Keys cannot be stored on this server yet. Ask NextUp's team to set up the vault. | Die Microsoft-Anmeldung ist für diese Firma noch nicht eingerichtet. Frag das NextUp-Team. · Schlüssel können auf diesem Server noch nicht gespeichert werden. Bitte das NextUp-Team, den Tresor einzurichten. |
| Reads | `InfoPanel` row | | Files a connected person can already open, searched live when they ask the assistant. Nothing is copied. | Dateien, die eine verbundene Person ohnehin öffnen kann, live durchsucht, wenn sie den Assistenten fragt. Es wird nichts kopiert. |
| Never reads | `InfoPanel` row | from the plan's decisions 2 and 4 | Mail, chats, calendars, SharePoint lists. Answers keep the title and link of a file, not its content. | E-Mails, Chats, Kalender, SharePoint-Listen. Antworten behalten Titel und Link einer Datei, nicht ihren Inhalt. |
| Connected | `InfoPanel` row | a count only, never who (BetrVG §87) | Connected · {n} people · Nobody yet | Verbunden · {n} Personen · Noch niemand |
| Last search | `InfoPanel` row | the date only ("today", "yesterday", "28 Oct"), never a time; `TooFewToShow` below 5 connected people, because one person's search time would show *(rule of this spec, from the MET threshold)* | Last search · today · yesterday · {date} · No search yet | Letzte Suche · heute · gestern · {date} · Noch keine Suche |
| Sign-in | `InfoPanel` row | | Sign-in · Microsoft sign-in is set up · not set up | Anmeldung · Microsoft-Anmeldung ist eingerichtet · nicht eingerichtet |
| Permission | `InfoPanel` row | | Permission · Files.Read.All, approved once by your IT | Berechtigung · Files.Read.All, einmal von eurer IT freigegeben |
| Footer hint | text | | Each person connects their own account on their profile. Turning the search off stops new connections. | Jede Person verbindet ihr eigenes Konto im Profil. Ausschalten verhindert neue Verbindungen. |

- Switching on: toast "Microsoft 365 search is on. People can connect on their profile." / "Microsoft-365-Suche ist
  an. Personen können sich im Profil verbinden." Switching off asks first (`ConfirmDialog`): "Turn off Microsoft 365
  search? {n} people stay connected but the assistant stops searching their files." / "Microsoft-365-Suche
  ausschalten? {n} Personen bleiben verbunden, aber der Assistent durchsucht ihre Dateien nicht mehr." Buttons:
  Cancel · Turn off.
- *Later:* "Disconnect everyone ({n})" stays in `/admin/assistant` (not in ADM-C1).

---

### Jira block

- **Data:** `JiraStatusView` (`configured`, `on`, `enabledAt`, `siteUrl`, `projectKey`, `hasToken`, `account`,
  `lastRunAt`, `lastOkAt`, `lastError`, `tokenExpired`, `linked`, `problems`), the form's `JiraSettings` without the
  token, the headline from `jiraHeadline`.
- **Actions:** the actions behind `testJiraAction`, `saveJiraAction`, `setJiraOnAction`, `syncJiraNowAction`, called
  from `server/actions/settings/connectors.ts` after `companyAdminOf`. The form for `dc` passes `parseJiraSettings`
  with an empty email (ADM-C1 proof B1).

```
┌ (link) Jira ─────────────────────────────────────────── [On]    [ on ●] ┐
│ Approved projects go to Jira as an epic and issues; progress comes back.│
│ Syncing. Last good round 2 minutes ago.                                 │
│                                                                         │
│ What NextUp reads                                                       │
│ ┌ InfoPanel ──────────────────────────────────────────────────────────┐ │
│ │ Writes         An epic per approved project, an issue per step,     │ │
│ │                status moves and summary changes                     │ │
│ │ Reads          Status and summary changes in the project, new       │ │
│ │                issues under an epic, comments (no author)           │ │
│ │ Never reads    Other projects, author names, attachments            │ │
│ │ Site           https://jira.acme-automotive.de · project NUP        │ │
│ │ Account        NextUp Integration · learned from the first round    │ │
│ │ On since       12 Oct 2026 · only ideas decided after this get an   │ │
│ │                epic by themselves                                   │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ Connection                                                              │
│ Jira            ( Cloud (atlassian.net) | Data Center )                 │
│ Base URL        [ https://jira.acme-automotive.de             ]         │
│ Personal access Set · saved 28 Oct 2026                    [Replace]    │
│ token                                                                   │
│ Project key     [ NUP   ]                                               │
│                                                                         │
│ What goes where                                                         │
│ Epic type       [ Epic             ▾]   Step type  [ Task          ▾]   │
│ [✓] Create the epic by itself when an idea is decided “Yes, do it”      │
│ [ ] New issues under the epic in Jira become steps on the board         │
│ [✓] Jira comments become project comments (cut to 2,000 characters,     │
│     no author)                                                          │
│ ▸ Status for each column (optional)                                     │
│                                         [Test connection]  [ Save ]     │
│ ✓ All checks passed as NextUp Integration. Pick the issue types, save.  │
│   ✓ Sign in   ✓ Project   ✓ Issue types   ✓ Permissions   ✓ Labels      │
│                                                                         │
│ Sync                                                                    │
│ Last round 14:20 · last good round 14:20 · 3 projects, 21 steps linked  │
│                                                          [Sync now]     │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Jira kind** is a segmented control. *Cloud*: the fields Site address, Integration account email, API token.
  *Data Center*: Base URL and Personal access token, no email (CNX/D10). Switching kind keeps the URL and the project
  key and clears the email; a stored token stays set until replaced.
- **Status for each column** is a disclosure, closed by default: the table Column | By category | Or this status id
  from today's screen (To do → To Do, Doing → In Progress, Blocked → In Progress, Done → Done).
- Issue type selects are empty until a test lists the types ("Run Test connection to list the types."); a saved type
  that the test did not list shows as "Saved type {id}".
- *Sync now* only while on. The header switch is disabled until `configured`, with the reason as status line.
- *Later (in `/admin` until a task moves them):* the webhook address and its secret (shown once, `SecretOnce`) and
  *Remove the integration*.

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Name, description | header | | Jira · Approved projects go to Jira as an epic and issues; progress comes back. | Jira · Freigegebene Projekte gehen als Epic und Vorgänge nach Jira; der Fortschritt kommt zurück. |
| Status line | header | the five states of `jiraHeadline` (`features/admin/jira-admin.ts`), translated; on error the connector-error sentences above replace it | Not set up yet. · Set up, switched off. · Switched on. The first round runs within a minute. · Syncing. Last good round {ago}. · Last round failed: {error} | Noch nicht eingerichtet. · Eingerichtet, ausgeschaltet. · Eingeschaltet. Der erste Lauf startet innerhalb einer Minute. · Synchronisiert. Letzter erfolgreicher Lauf {ago}. · Letzter Lauf fehlgeschlagen: {error} |
| Switch | switch | disabled until `configured` | Sync with Jira · Save the settings and a token first. | Mit Jira synchronisieren · Speichere zuerst die Einstellungen und einen Token. |
| Writes / Reads / Never reads | `InfoPanel` rows | | Writes · An epic per approved project, an issue per step, status moves and summary changes · Reads · Status and summary changes in the project, new issues under an epic, comments (no author) · Never reads · Other projects, author names, attachments | Schreibt · Ein Epic je freigegebenem Projekt, ein Vorgang je Schritt, Statuswechsel und Titeländerungen · Liest · Status- und Titeländerungen im Projekt, neue Vorgänge unter einem Epic, Kommentare (ohne Autor) · Liest nie · Andere Projekte, Namen von Autoren, Anhänge |
| Facts | `InfoPanel` rows | | Site · project {key} · Account · learned from the first good round · On since {date} · only ideas decided after this get an epic by themselves | Site · Projekt {key} · Konto · aus dem ersten erfolgreichen Lauf übernommen · An seit {date} · nur danach entschiedene Ideen bekommen automatisch ein Epic |
| Jira kind | segmented | `cloud` / `dc` | Jira · Cloud (atlassian.net) · Data Center | Jira · Cloud (atlassian.net) · Data Center |
| Site address *(cloud)* | URL input | `https://…`, no trailing slash | Site address · For example https://acme.atlassian.net | Site-Adresse · Zum Beispiel https://acme.atlassian.net |
| Base URL *(dc)* | URL input | `https://host[:port][/context]` | Base URL · The address of your Jira server, for example https://jira.example.com | Basis-URL · Die Adresse eures Jira-Servers, zum Beispiel https://jira.example.com |
| Email *(cloud)* | email input | | Integration account email · Use an account for NextUp, not a person: its changes are not copied back. | E-Mail des Integrationskontos · Nimm ein Konto für NextUp, keine Person: dessen Änderungen werden nicht zurückkopiert. |
| API token *(cloud)* | secret field | | API token · Create it as the integration account: id.atlassian.com → Security → API tokens. Tokens expire within a year. | API-Token · Lege ihn als Integrationskonto an: id.atlassian.com → Sicherheit → API-Token. Tokens laufen spätestens nach einem Jahr ab. |
| Personal access token *(dc)* | secret field | | Personal access token · Create it as the integration account in Jira: Profile → Personal access tokens. | Persönliches Zugriffstoken · Lege es als Integrationskonto in Jira an: Profil → Persönliche Zugriffstoken. |
| Project key | text, upper case | | Project key · The Jira project the epics and issues go into, for example NUP. | Projektschlüssel · Das Jira-Projekt für Epics und Vorgänge, zum Beispiel NUP. |
| Issue types | two selects | ids, filled by the test | Epic type · Step type · What each step becomes under the epic. · Run Test connection to list the types. · Saved type {id} | Epic-Typ · Schritt-Typ · Was jeder Schritt unter dem Epic wird. · Führe „Verbindung testen“ aus, um die Typen zu laden. · Gespeicherter Typ {id} |
| Switches | three checkboxes | `autoEpic`, `pullNewIssues`, `pullComments` | Create the epic by itself when an idea is decided “Yes, do it” · New issues under the epic in Jira become steps on the board · Jira comments become project comments (cut to 2,000 characters, no author) | Epic automatisch anlegen, wenn eine Idee mit „Ja, machen“ entschieden wird · Neue Vorgänge unter dem Epic werden Schritte auf dem Board · Jira-Kommentare werden Projektkommentare (gekürzt auf 2.000 Zeichen, ohne Autor) |
| Status per column | disclosure + table | digits or empty | Status for each column (optional) · Column · By category · Or this status id · Blocked has no twin in Jira and shows as In Progress. | Status je Spalte (optional) · Spalte · Nach Kategorie · Oder diese Status-ID · Blockiert gibt es in Jira nicht; es erscheint als In Arbeit. |
| Test checks | result rows | the five checks of `server/jira/test.ts` | Sign in · Project · Issue types · Permissions · Labels · All checks passed as {account}. Pick the issue types and save. · Fix what failed, then test again. | Anmeldung · Projekt · Vorgangstypen · Berechtigungen · Labels · Alle Prüfungen bestanden als {account}. Wähle die Vorgangstypen und speichere. · Behebe, was fehlgeschlagen ist, und teste erneut. |
| Sync line | meta | | Last round {ago} · last good round {ago} · {p} projects, {s} steps linked | Letzter Lauf {ago} · letzter erfolgreicher Lauf {ago} · {p} Projekte, {s} Schritte verknüpft |
| Problems | *Recent errors* rows | `problems`, first 5 | Waiting for the sync · … and {n} more | Wartet auf die Synchronisierung · … und {n} weitere |

- *Save*: toast "Jira settings saved." / "Jira-Einstellungen gespeichert." The token input empties and turns into
  "Set · saved {date}". A refused field shows `parseJiraSettings`'s reason under it ("Enter the address of the Jira
  site, https://…" / "Gib die Adresse der Jira-Site ein, https://…").
- Switch on: toast "Jira sync is on. Ideas decided from now on get an epic." / "Jira-Synchronisierung ist an. Ab
  jetzt entschiedene Ideen bekommen ein Epic." Switch off asks first: "Stop syncing with Jira? Nothing in Jira is
  deleted; changes stop flowing both ways." / "Synchronisierung mit Jira stoppen? In Jira wird nichts gelöscht;
  Änderungen fließen in keine Richtung mehr." Buttons: Cancel · Stop syncing.
- *Sync now*: toast "Sync started." / "Synchronisierung gestartet." The sync line updates on the next load.

---

### AI provider block

- **Data:** `loadAiSettings(companyId, stage)` → `AiSettings` (`choice`, `region`, `model`, `endpoint`,
  `deployment`; the key only as "set" or "not set"); `CompanyConfig.dpaSignedAt`, `assistant`, `aiRouting`; for the
  *What the AI does now* rows, `aiGate` once per purpose (`routing`, `assist`, `coach`, `brain`) with its `why`.
- **Actions:** *Save* → `saveAiSettings(companyId, settings, key | null, by)` (key `null` keeps the stored one).
  No switch: the choice *Off* is the off state (HD8). No test in any plan (open question C3).

```
┌ (sparkle) AI provider ─────────────────────────────────── [Needs you]   ┐
│ The model behind routing proposals, the assistant and the idea coach.   │
│ No data-processing agreement yet: no model is called for real people.  │
│                                                                         │
│ What NextUp reads                                                       │
│ ┌ InfoPanel ──────────────────────────────────────────────────────────┐ │
│ │ Sends          The text people type when they raise a case, ask the │ │
│ │                assistant or work on an idea, and the routing table  │ │
│ │ Never sends    Personnel numbers, login codes, keys                 │ │
│ │ Agreement      Data-processing agreement: not signed                │ │
│ │ What it does   Routing proposals      Off · no agreement            │ │
│ │ now            Raise assistant        Off · switched off            │ │
│ │                Idea coach             Off · no agreement            │ │
│ │                Project check-ins      Off · no agreement            │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ Provider                                                                │
│ (●) Amazon Bedrock · Frankfurt   ( ) Azure OpenAI                       │
│ ( ) OpenAI-compatible endpoint   ( ) Off - keywords only                │
│ Region          [ eu-central-1 (Frankfurt)            ▾]                │
│ Model           [ model id                               ]              │
│                                                          [ Save ]       │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Provider** is four radio cards in a 2 × 2 grid (one column on phones), the chosen one with the blue state ring.
  Fields under them depend on the choice:

| Choice | Fields | Key |
|---|---|---|
| `bedrock` | Region (select, default `eu-central-1`), Model | none (the stack's access) |
| `azure-openai` | Endpoint (the resource host), Deployment | API key (secret field) |
| `openai-compatible` | Endpoint (base URL), Model | API key (secret field) |
| `off` | none; the line "Raise and routing work by keywords. The assistant and the coach are off." | – |

- **What it does now:** one row per purpose with *On* or *Off* and the gate's reason in plain words. These rows are
  read-only. The assistant and AI-routing switches and the DPA date are set in `/admin` today; editing them here is
  *later* (open question C1). Each *Off* row names who can change it: "Off · no agreement - NextUp's team records
  it" / "Aus · keine Vereinbarung - das NextUp-Team trägt sie ein".
- **Demo companies:** a grey line under the description: "Demo company: without a saved choice, the stack's model
  answers." / "Demo-Firma: Ohne gespeicherte Wahl antwortet das Modell des Servers." (AIP/D5).

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Name, description | header | | AI provider · The model behind routing proposals, the assistant and the idea coach. | KI-Anbieter · Das Modell hinter Routing-Vorschlägen, dem Assistenten und dem Ideen-Coach. |
| No-DPA line | status line, amber | choice not off, `dpaSignedAt` null, real stage | No data-processing agreement yet: no model is called for real people. | Noch keine Auftragsverarbeitungsvereinbarung: Für echte Personen wird kein Modell aufgerufen. |
| Sends / Never sends | `InfoPanel` rows | HD14: the personnel number never goes to the AI | Sends · The text people type when they raise a case, ask the assistant or work on an idea, and the routing table · Never sends · Personnel numbers, login codes, keys | Sendet · Den Text, den Personen beim Einbringen, im Assistenten oder an einer Idee schreiben, und die Routing-Tabelle · Sendet nie · Personalnummern, Anmeldecodes, Schlüssel |
| Agreement | `InfoPanel` row | read-only | Agreement · Data-processing agreement signed on {date} · not signed | Vereinbarung · Auftragsverarbeitungsvereinbarung unterschrieben am {date} · nicht unterschrieben |
| Purposes | `InfoPanel` rows | `aiGate` per purpose | What it does now · Routing proposals · Raise assistant · Idea coach · Project check-ins · On · Off · no agreement · switched off · keywords only | Was sie gerade tut · Routing-Vorschläge · Assistent beim Einbringen · Ideen-Coach · Projekt-Check-ins · An · Aus · keine Vereinbarung · ausgeschaltet · nur Stichwörter |
| Provider | radio cards | `AI_PROVIDER_CHOICES` | Amazon Bedrock · Frankfurt · Azure OpenAI · OpenAI-compatible endpoint · Off - keywords only | Amazon Bedrock · Frankfurt · Azure OpenAI · OpenAI-kompatibler Endpunkt · Aus - nur Stichwörter |
| Region | select | default `eu-central-1` | Region · eu-central-1 (Frankfurt) | Region · eu-central-1 (Frankfurt) |
| Endpoint *(azure)* | text | host only | Endpoint · Your Azure OpenAI resource, for example acme-ai.openai.azure.com | Endpunkt · Eure Azure-OpenAI-Ressource, zum Beispiel acme-ai.openai.azure.com |
| Deployment *(azure)* | text | | Deployment · The name of the model deployment in Azure. | Deployment · Der Name des Modell-Deployments in Azure. |
| Endpoint *(openai-compatible)* | URL | `https://…` | Endpoint · The base address, for example https://ai.example.com/v1 | Endpunkt · Die Basisadresse, zum Beispiel https://ai.example.com/v1 |
| Model | text | | Model · The model id your provider gives you. | Modell · Die Modell-ID eures Anbieters. |
| API key | secret field | write-only | API key | API-Schlüssel |
| Off line | text | choice `off` | Raise and routing work by keywords. The assistant and the coach are off. | Einbringen und Routing laufen über Stichwörter. Assistent und Coach sind aus. |

- *Save*: toast "AI provider saved." / "KI-Anbieter gespeichert." Choosing *Off* and saving asks first: "Switch the
  AI off? Routing then works by keywords, and the assistant and the coach stop answering." / "KI ausschalten? Das
  Routing läuft dann über Stichwörter, Assistent und Coach antworten nicht mehr." Buttons: Cancel · Switch off.
- Choosing Azure OpenAI or OpenAI-compatible without a stored key: *Save* is allowed, the badge turns *Needs you*
  and the status line says "Add the API key to use this provider." / "Füge den API-Schlüssel hinzu, um diesen
  Anbieter zu nutzen."

---

### Directory block

- **Data:** `loadDirectoryStatus(companyId)` → `{ on, source, lastRunAt, lastOkAt, lastError, counts: { added,
  updated, deactivated, handed } }` (the counts of the last run). Never the cursor, never a name, never the personnel
  number.
- **Actions:** none here (read-only, ADM/D10). Switching on, the source and *Run now* are in `/admin` (DIR-C1).

```
┌ (tree) Directory ──────────────────────────────────────────── [On]      ┐
│ People, departments and managers from Microsoft Entra.                  │
│ Switched on by NextUp's team. Runs about every 15 minutes.              │
│                                                                         │
│ What NextUp reads                                                       │
│ ┌ InfoPanel ──────────────────────────────────────────────────────────┐ │
│ │ Reads          Name, work email, department, job title, manager,    │ │
│ │                active or not; the personnel number to match people, │ │
│ │                never shown                                          │ │
│ │ Never reads    Absences, working times, pay, performance, groups    │ │
│ │ Source         Microsoft Entra                                      │ │
│ │ Placement      By department name. A department that matches no     │ │
│ │                unit is skipped: add the unit in Org →               │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ Sync                                                                    │
│ Last run 14:05 · last good run 14:05                                    │
│ 3 added · 12 updated · 1 deactivated · 2 cases handed over              │
│ Synced people are read-only in Members →                                │
└─────────────────────────────────────────────────────────────────────────┘
```

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Name, description | header | `source` | Directory · People, departments and managers from {source}. | Verzeichnis · Personen, Abteilungen und Führungskräfte aus {source}. |
| Source names | | `graph` / `successfactors` | Microsoft Entra · SAP SuccessFactors | Microsoft Entra · SAP SuccessFactors |
| Who switches it | status line | | Switched on by NextUp's team. Runs about every 15 minutes. · Off. NextUp's team switches it on when your IT has approved access. | Vom NextUp-Team eingeschaltet. Läuft etwa alle 15 Minuten. · Aus. Das NextUp-Team schaltet es ein, sobald eure IT den Zugriff freigegeben hat. |
| Reads | `InfoPanel` row | HD14 allow-list | Name, work email, department, job title, manager, active or not; the personnel number to match people, never shown | Name, geschäftliche E-Mail, Abteilung, Stellenbezeichnung, Führungskraft, aktiv oder nicht; die Personalnummer zum Zuordnen, nie angezeigt |
| Never reads | `InfoPanel` row | HD14 | Absences, working times, pay, performance, groups | Abwesenheiten, Arbeitszeiten, Gehalt, Leistung, Gruppen |
| Placement | `InfoPanel` row + link | DIR/D8, Q1 | By department name. A department that matches no unit is skipped: add the unit in Org → | Nach Abteilungsname. Eine Abteilung ohne passende Einheit wird übersprungen: lege die Einheit in Organisation an → |
| Sync line | meta | | Last run {time} · last good run {time} · {a} added · {u} updated · {d} deactivated · {h} cases handed over · Not run yet | Letzter Lauf {time} · letzter erfolgreicher Lauf {time} · {a} hinzugefügt · {u} aktualisiert · {d} deaktiviert · {h} Fälle übergeben · Noch nicht gelaufen |
| Members link | link | | Synced people are read-only in Members → | Synchronisierte Personen sind in Mitglieder schreibgeschützt → |

---

### Microsoft Teams block *(later: TMS, no Bauplan yet)*

Drawn from the TMS brief (Teams app, bot endpoint, `NotifyChannel` adapter `teams`, raise from a message extension,
answer and hand-over from adaptive cards). Every field below may change when the TMS Bauplan is written.

```
┌ (chat) Microsoft Teams ──────────────────────────────── [Off]   [ off ○] ┐
│ Notices as cards in Teams, answers from the card, raise from Teams.     │
│ What NextUp reads                                                       │
│ ┌ InfoPanel ──────────────────────────────────────────────────────────┐ │
│ │ Sends          New-case, reminder and answer cards to the people a  │ │
│ │                case is for                                          │ │
│ │ Reads          Answers and hand-overs given on a card, cases raised │ │
│ │                from the message extension                           │ │
│ │ Never reads    Chats, channel messages, files, presence             │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│ Teams app       [Download the app package]  Your Teams admin uploads    │
│                 it once.                                                │
│                                     [Send me a test card]               │
│ Sync            Last card delivered 14:12                               │
└─────────────────────────────────────────────────────────────────────────┘
```

| Element | EN | DE |
|---|---|---|
| Name, description | Microsoft Teams · Notices as cards in Teams, answers from the card, raise from Teams. | Microsoft Teams · Hinweise als Karten in Teams, Antworten direkt auf der Karte, Einbringen aus Teams. |
| Sends / Reads / Never reads | Sends · New-case, reminder and answer cards to the people a case is for · Reads · Answers and hand-overs given on a card, cases raised from the message extension · Never reads · Chats, channel messages, files, presence | Sendet · Karten zu neuen Fällen, Erinnerungen und Antworten an die Personen, für die ein Fall ist · Liest · Antworten und Übergaben auf einer Karte, aus der Nachrichtenerweiterung eingebrachte Fälle · Liest nie · Chats, Kanalnachrichten, Dateien, Anwesenheit |
| App package | Teams app · Download the app package · Your Teams admin uploads it once. | Teams-App · App-Paket herunterladen · Eure Teams-Administration lädt es einmal hoch. |
| Test | Send me a test card · A test card is on its way to you in Teams. | Testkarte an mich senden · Eine Testkarte ist in Teams unterwegs zu dir. |
| Sync line | Last card delivered {time} | Letzte Karte zugestellt {time} |

---

### SAP SuccessFactors block *(later: SFX, no Bauplan yet)*

A second directory source (SFX brief, HD14). Its credentials live here; its runs show in the Directory block, whose
source then reads "SAP SuccessFactors". The source choice between Entra and SuccessFactors is *later* too (SFX hands
`successfactors` to ADM as a choice).

```
┌ (tree) SAP SuccessFactors ──────────────────────────────── [Off]         ┐
│ Units, managers, joiners and leavers from Employee Central, read-only.  │
│ What NextUp reads (fixed, cannot be changed)                            │
│ ┌ InfoPanel ──────────────────────────────────────────────────────────┐ │
│ │ Reads          Personnel number (to match people, never shown),     │ │
│ │                name, work email, unit, job title, manager, start    │ │
│ │                and end date, active                                 │ │
│ │ Never reads    Absences and time data, payroll, compensation,       │ │
│ │                performance, talent, business partners               │ │
│ │ Writes         Nothing. NextUp never writes into SAP.               │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│ Connection                                                              │
│ API server      [ https://api-example.successfactors.eu       ]         │
│ Company ID      [ ACMEAUTO ]                                            │
│ API user        [ NEXTUP_READ ]   a read-only technical user            │
│ OAuth client ID [ ………………………… ]                                         │
│ Private key     Not set                              [ paste key… ]     │
│                                     [Test connection]  [ Save ]         │
│ The API user and your works agreement come first; the source stays off  │
│ until then.                                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

- The field list is read-only text, not checkboxes: HD14 fixes it and no company can widen it.
- No switch in the block: the directory source is switched where the Directory block is switched.

| Element | EN | DE |
|---|---|---|
| Name, description | SAP SuccessFactors · Units, managers, joiners and leavers from Employee Central, read-only. | SAP SuccessFactors · Einheiten, Führungskräfte, Ein- und Austritte aus Employee Central, nur lesend. |
| Reads | Personnel number (to match people, never shown), name, work email, unit, job title, manager, start and end date, active | Personalnummer (zum Zuordnen, nie angezeigt), Name, geschäftliche E-Mail, Einheit, Stellenbezeichnung, Führungskraft, Ein- und Austrittsdatum, aktiv |
| Never reads | Absences and time data, payroll, compensation, performance, talent, business partners | Abwesenheiten und Zeitdaten, Gehaltsabrechnung, Vergütung, Leistung, Talent, Geschäftspartner |
| Writes | Nothing. NextUp never writes into SAP. | Nichts. NextUp schreibt nie in SAP. |
| Fields | API server · Company ID · API user · a read-only technical user · OAuth client ID · Private key | API-Server · Firmen-ID · API-Benutzer · ein technischer Benutzer, nur lesend · OAuth-Client-ID · Privater Schlüssel |
| Hint | The API user and your works agreement come first; the source stays off until then. | Zuerst kommen der API-Benutzer und eure Betriebsvereinbarung; bis dahin bleibt die Quelle aus. |

---

### Actions (page)

Each block's actions are listed with the block. Common rules:

- Every save and switch goes through `companyAdminOf` and names the company from the guard, never from the form
  (ADM/D6).
- Every secret leaves the browser once, on *Save*, and never comes back.
- A save that fails for a reason other than a field rule: toast "Not saved. Try again." / "Nicht gespeichert. Bitte
  erneut versuchen." and the form keeps what was typed.

### States

- Loading: the overview row and four skeleton blocks (header line and three bars each).
- Nothing set up: every badge *Off*; Jira shows the connection form with empty fields; AI shows *Off - keywords
  only* chosen; Directory shows "Off. NextUp's team switches it on …" and no sync line.
- Connector error: as defined under *ConnectorBlock* (Jira and Directory frames).
- No vault key on the stack: secret fields disabled with the vault line; the Microsoft 365 switch disabled.
- Demo company: the AI demo line; everything else as for a real company.
- Leader or member opening the URL: not found (ADM-G1).

### Done when

- [ ] `ConnectorBlock` as a Figma component with its six slots and the four badge tones; the secret field in its
      three states (not set, set, replacing) and disabled without a vault.
- [ ] Desktop in German: the whole page with Microsoft 365 on, Jira on, AI *Needs you* (no agreement), Directory on.
- [ ] Microsoft 365: on, off, disabled (no sign-in), `TooFewToShow` for the last search, the turn-off dialog.
- [ ] Jira: Cloud and Data Center forms, test running, test passed (five checks), test failed (two crosses), the
      issue-type selects before and after a test, the column disclosure open, switch disabled, the error state with
      the token refused, problems with "… and n more", the stop-syncing dialog.
- [ ] AI provider: each of the four choices with its fields, the key missing, the agreement signed and not signed,
      the switch-off dialog, the demo line.
- [ ] Directory: off, on with counts, error.
- [ ] *Later* frame: Teams and SuccessFactors blocks.
- [ ] Phone: the page with the overview row and one block of each kind.

---

## Open questions added by this file

| # | Question | Default |
|---|---|---|
| C1 | ADM/D10 moves the AI choice into Settings, but the DPA date, the assistant switch and `aiRouting` stay in `/admin` (`AssistSettingsForm`; `aiRouting` has no screen). Should the company admin set them here? | No for the DPA date (NextUp records a signed contract); the assistant and AI-routing switches move here in a follow-up task. Until then the block shows them read-only. |
| C2 | The plan file's `ConnectorBlock` has *Recent errors (up to 5 rows)*, but `Integration` and `DirectoryRun` keep only the last error. Store an error history? | No: show the last error plus Jira's per-item problems; a history is a later task. |
| C3 | No plan has a *Test* for the AI provider. Add one (one short call, only with an agreement)? | Not in ADM; draw no test button. |
| C4 | Microsoft 365's "last search" can reveal one person's activity when few people are connected. | Show the date only, and `TooFewToShow` below 5 connected people. |
