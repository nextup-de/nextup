# Pilot pages: what every new and changed screen looks like

Design system: [NextUp Software in Paper](https://app.paper.design/file/01M55ZTX8WWCRJNW7898CQ7ECN)

> **Plan · 2026-11-02 · in progress: the data behind each page comes from the PILOT phase named on it. See "What is built" for who built which page.**
> The Hauptplan PILOT adds **23 new pages**, changes **15 existing pages** and needs **27 other surfaces** (Teams cards,
> emails, printables, dialogs, states). On top of that, **8 existing pages** that work today get a design pass
> (spec 10). The [defensible-offer plan](2026-11-02_defensible-offer.md) adds **9 new pages**, changes **7 pages**,
> removes **2 routes** and needs **5 other surfaces** (spec 11). This file is the map, the shared rules and the shared
> building blocks. The pages themselves are specified in the eleven files in
> [2026-11-02_pilot-pages/](2026-11-02_pilot-pages/), one per area.

## What is built

State on 2026-11-04. Sam built the Pilot 01 to 03 pages from his Paper frames. Plan UIP built the rest from his elements in `components/ui/elements/`, without a frame of their own, so Sam can still change any of them.

| Pages | Built by | Still open |
|---|---|---|
| Settings shell, Company, Rules, Calendar, Org, Members, Routing, Setup, console Connectors | Sam (#378, #381, #411) | The "Not built" lists in those PRs: they need data first |
| Dashboard, Feed, Inbox, Overview, Raise, `/login`, company login | Sam, before these specs | The design pass of spec 04 and 10 |
| Notifications, Teams, Import and export, Webhooks, API tokens, Sign-in, Support access, Privacy, Audit | UIP (#521, #535, #541) | Export and pseudonymise dialogs keep their own look |
| Areas, devices, poster, floor pages | UIP (#532) | |
| Case, My cases, Decision log, Person | UIP (#533) | Answer date, deputy status, score panel: spec 11 |
| Projects and project page | UIP (#530) | Agent tab; project setup: spec 12 |
| Collaboration, Progress, My reports | UIP (#539) | `/ideas` and `/problems` only redirect to the Feed (#515) |
| KPI report, export download, Profile | UIP (#538) | Your roles, Reports to, Same unit: no data yet |
| Forgot code, second factor, `/admin` login | UIP (#544) | |
| Console People, Company data, Decisions, Support, Assistant | UIP (#522) | Console overview |
| People's and departments' colours on Sam's pages | UIP (#542) | A tint follows the written name |
| Go-live, Pilot report | not yet | Plan PIL |
| Spec 11 pages, spec 12 | not yet | No data and no Bauplan yet |

## Start here, Sam

**Who does what.** Kevin builds the infrastructure: tables, server actions, sign-in, connectors, the clock, the
outbox, through the build plans. You design and build the interface on top of it: every page in this plan, designed
in Paper or Figma however you think it works best, then built and opened as pull requests. Kevin reviews and merges.

**What these files give you is what each page needs, not how it must look.** For every page the specs list the data
it shows, what people can do there, every state it has to handle, the rules it must keep and starting copy in English
(plus German for the LLM, see the language rule below). The ASCII layouts, the building-block looks and the pixel values are one way to arrange it, a starting
point you are free to throw away. What is fixed:

- the **content**: every element, field and action in a page's *Content* and *Actions* sections, with its rules and
  limits (they come from the infrastructure, and the server refuses anything outside them);
- the **states**: every case in a page's *States* section and its *Done when* list must have a design;
- the **ground rules** below (room for German, roles not people, too few to show below 5, the AI can be off, no
  personnel number, secrets write-only);
- the **names in code**: routes, test ids (`settings-<section>-<thing>`), message keys in both catalogs, the functions
  and fields a page calls;
- the **layout rules** in [../RESPONSIVE.md](../RESPONSIVE.md) and the house style in
  [../../design-system/README.md](../../design-system/README.md). If you want to change the house style itself,
  change it in one place for every page, not on one page.

**First: the design and elements page.** Before any single page, design one page where every colour, font, size,
spacing, icon and element of NextUp is planned once and reused everywhere. Share it with Kevin and the team for
feedback. Every page after it is built only from those elements. What it holds: the next section.

**Then, per page,** roughly in the order of "The spec files" below:

1. Read the page's spec and the ground rules.
2. Design it in English (desktop and phone, every state), only from the elements of the design and elements page;
   a new element goes onto that page first. Add a line `Design: <link>` under the page's header
   lines in its spec, so the frame can be found from the spec.
3. Build it as [CONTRIBUTING.md](../../CONTRIBUTING.md) describes: a fresh `main`, a branch `feat/<area>-<page>`, one
   page or one small group of pages per PR, with the spec section, the frame link and screenshots in the PR
   description. Before you open it: `npm run lint`, `npm run typecheck`, `npm test` and the checks in RESPONSIVE.md.
4. If the page's data is not on `main` yet (its *Phase* line names the phase that builds it), design it now and build
   it once Kevin's part is merged, or build what the merged code already supports. Never fake data in a real page.
5. Open questions at the end of each spec have a default; build the default unless Kevin says otherwise. If a spec
   and the code disagree, or a page needs data nobody builds, tell Kevin: that is infrastructure.

## First deliverable: the design and elements page

One page (a Paper or Figma file the whole team can open) that plans the look of the whole software, so every screen
reuses the same parts. Start from what exists: [../../design-system/README.md](../../design-system/README.md), the
tokens in `apps/app/src/styles/tokens.css` and the classes in `apps/app/src/app/globals.css`. Change what you want to
change; the page is yours.

It holds:

| Part | What to plan |
|---|---|
| Colours | Every colour with its name, value and job: ink and greys, surfaces and the app ground, the action colour, the state colour (selected, now, progress), success, warning, error, the problem and idea tints, the avatar tints, chart colours. Text on every background passes 4.5:1 contrast. |
| Type | The font(s), the size scale (today 12, 13, 15, 17, 20, 24, 28, 34 px) with the job of each step, weights, line heights, tabular numbers, the mono font for codes. |
| Space and shape | The spacing steps, card and control radii, shadows, page widths and the breakpoints (phone 760 px, narrow tablet 900 px, tablet 1023 px). |
| Icons | The icon set (today the app's own 24 × 24 stroke icons), sizes, stroke width. |
| Motion | The ease and the durations (panels, toasts, the nav thumb), and what happens with reduced motion. |
| Elements | Every shared element with all its states (default, hover, focus, pressed, disabled, loading, error, empty): buttons (primary, secondary, destructive, icon), text field, text area, select, search, switch, checkbox, segmented control, chips and filter chips, status badge, source badge, avatar, card, section card, info panel, table with paging and its phone version, drawer, dialog (with the typed confirm), toast, empty state, *too few to show*, the shown-once secret box, skeleton, tabs, the ⋯ menu, tooltip, banner, top bar and its navigation, the settings menu, page header, connector block. |
| Names | Each element's name in code (`PageHeader`, `StatusBadge` …, see "Shared building blocks"), and each colour's and size's token name, so design and code say the same thing. |

When it is ready: share the link with Kevin and the team, collect their feedback, and add the line
`Design system: <link>` at the top of this file. Then bring it into code in one PR: the tokens in `tokens.css`, the
global classes and the shared components, so every page after it only uses them.

### Words used in these files

| Word | Meaning |
|---|---|
| PILOT, Hauptplan | The master plan for making NextUp pilot-ready: [build-plans/PILOT.md](2026-11-02_pilot-pages/build-plans/PILOT.md). |
| Phase (ADM, VIS, MET …) | One part of PILOT with one result, for example ADM = administration in the app. A page's *Phase* line names the phase that builds its data. |
| Build plan (Bauplan) | The detailed infrastructure plan of one phase: [build-plans/<phase>/PLAN.md](2026-11-02_pilot-pages/build-plans/README.md). Read it for field names, limits and functions, not for design. |
| Task (ADM-A1) | One piece of a build plan, in `build-plans/<phase>/tasks/`. |
| `ADM/D7` | Decision 7 of the build plan ADM. `HD5` = decision 5 of PILOT, which holds for every phase. |
| *later* | Shown in the spec, but no plan builds its data yet. Design it if you like; do not build it. |
| *(proposal, not in any plan)* | An idea without data behind it. Ask Kevin before building it. |

## Read first

| What | Where |
|---|---|
| Master plan (why, phases, audit) | [2026-11-01_pilot-readiness.md](2026-11-01_pilot-readiness.md) |
| The phases: one brief per phase (result, scope, acceptance test, code area) | [build-plans/PILOT.md](2026-11-02_pilot-pages/build-plans/PILOT.md) (copy of the Hauptplan `PILOT` in the private plans repo) |
| The detailed build plans written so far, with decisions and one file per task | [build-plans/](2026-11-02_pilot-pages/build-plans/README.md): ADM, AIP, CLK, CNX, DIR, IDN, NTF, VIS. Where a spec says "plans repo `projects/nextup/<X>/…`", the copy is `build-plans/<X>/…`. |
| Gaps per phase | [../audit/gap-register.md](../audit/gap-register.md) |
| Visual language, components, UI kit | [../../design-system/README.md](../../design-system/README.md), `design-system/ui_kits/app/` |
| Layout rules and the size scale | [../RESPONSIVE.md](../RESPONSIVE.md), `apps/app/src/styles/tokens.css` |
| Every URL and its file | [../ROUTES.md](../ROUTES.md) |
| Tables the settings pages edit | `apps/app/prisma/schema/structure.prisma`, `integrations.prisma`, `auth.prisma`, [../DATA_MODEL.md](../DATA_MODEL.md), [../COMPANY_KNOWLEDGE.md](../COMPANY_KNOWLEDGE.md) |
| Connector interfaces and config-not-code | [../adr/0002-connector-interfaces.md](../adr/0002-connector-interfaces.md), [../adr/0006-config-not-code.md](../adr/0006-config-not-code.md), [../connectors/README.md](../connectors/README.md) |
| Microsoft 365 data block and sign-in | [2026-10-22_sso-and-data-access.md](2026-10-22_sso-and-data-access.md) (PR D), [2026-10-21_company-data-page.md](2026-10-21_company-data-page.md), [../customer/ENTRA_SETUP.md](../customer/ENTRA_SETUP.md) |
| Jira in the app | [2026-10-29_jira-in-app.md](2026-10-29_jira-in-app.md) |
| Translations | `apps/app/src/i18n/` (one typed file per namespace in `messages/`, `t(key)`, lint rule `nextup/no-inline-strings`) |

**Where a Bauplan exists, it wins.** These specs say how a page looks; the phase's Bauplan says what is built, with
which functions and in which task. Where a spec shows more than its Bauplan builds, the extra part is marked
*later* with the phase or open question that would add it. Phases with a Bauplan today: ADM, AIP, CLK, CNX, DIR, IDN,
LNG, NTF, STR, VIS. The others (GDP, LOOP, MET, TMS, FLR, API, EID, SFX, SEC, PIL) only have their PILOT brief, so
their specs follow the brief and may change when their Bauplan is written.

## The spec files

| File | Pages | Phases | Design order |
|---|---|---|---|
| [01-settings-and-structure.md](2026-11-02_pilot-pages/01-settings-and-structure.md) | Settings shell, Company, Rules, Calendar, Members, Org | ADM, CLK, DIR, IDN | **1st** |
| [02-routing-and-setup-wizard.md](2026-11-02_pilot-pages/02-routing-and-setup-wizard.md) | Routing editor, setup wizard | ADM | 1st |
| [03-connectors.md](2026-11-02_pilot-pages/03-connectors.md) | Connectors page: Microsoft 365, Jira, AI provider, Directory; later Teams and SuccessFactors | ADM, CNX, AIP, DIR, SFX, TMS | 2nd |
| [04-everyday-app.md](2026-11-02_pilot-pages/04-everyday-app.md) | Dashboard, Feed, Overview, Person page, Raise publishing step, Case page, Inbox and My cases, Profile, Decision log | MET, LOOP, CLK, VIS, NTF | 3rd |
| [05-data-protection.md](2026-11-02_pilot-pages/05-data-protection.md) | Data and privacy, Audit log, export and pseudonymise dialogs, export-ready email | GDP | 4th |
| [06-notifications-and-teams.md](2026-11-02_pilot-pages/06-notifications-and-teams.md) | Notifications, reminder and digest emails, Teams cards and app icon | NTF, TMS | 5th |
| [07-shop-floor.md](2026-11-02_pilot-pages/07-shop-floor.md) | Areas and QR codes, the four phone pages, QR poster, reference slip, installed app | FLR | 6th |
| [08-enterprise-and-sign-in.md](2026-11-02_pilot-pages/08-enterprise-and-sign-in.md) | API tokens, Webhooks, Import and export, Sign-in and provisioning, Support access, two-factor pages, company login, forgot code, `/admin` login | API, EID, SEC, ADM | 7th |
| [09-go-live-and-pilot-report.md](2026-11-02_pilot-pages/09-go-live-and-pilot-report.md) | Go-live, Pilot report (page and email) | PIL, MET | 8th |
| [10-existing-pages.md](2026-11-02_pilot-pages/10-existing-pages.md) | Existing pages to improve: Projects, Project page, Raise as a whole, Ideas, Problems, Collaboration, Progress, My reports | none (MET touches Progress; TRUTH-A1 removes its ranking) | Projects, Project page and Raise right after 01-03; the other five last |
| [11-defensible-offer-pages.md](2026-11-02_pilot-pages/11-defensible-offer-pages.md) | From the defensible-offer plan: answer date and deputy status, why this score, Gutachter review, committee, premium rules, premium letter, payroll export, ZI KPI report, content translation, measurement from data sources, new Rules settings, works-council pack, oversight, benchmark; removal of the contributor ranking and the person pages | TRUTH, CORE, BVW, PROOF, PACK, BENCH ([Codex plan](2026-11-02_defensible-offer-codex.md)) | The removals and "answer date" and "why this score" with 04; review, committee and premium after 10; the rest last |
| [12-project-setup.md](2026-11-02_pilot-pages/12-project-setup.md) | Project setup from "Yes" to "Start": setup checklist, stage "Set up", team roles and sponsor, asking for someone new, goal, brief, how we work, Start and kickoff, the manager's requests, Rules "Projects" group | none yet ([project setup plan](2026-11-03_project-setup.md), steps 2 to 5) | With the project page from 10 |

The order follows the build order: ADM is the next phase with a lot of UI (after IDN and LNG), so its pages come first.

## How a page spec reads

Every page has the same parts, in this order:

1. **Header lines:** route, who opens it, phase (and Bauplan task where one exists), the data it shows, what exists
   today.
2. **Purpose:** one sentence.
3. **Layout (desktop):** an ASCII wireframe: one way to arrange the content, a starting point for your design, not a
   requirement.
4. **Phone (≤ 760 px):** what changes on a phone in that suggestion.
5. **Content:** a table, one row per element: control, rules, English text, German text (the German is for the LLM
   that fills the German catalog; you do not need to read it).
6. **Actions:** what each button does, what it asks first, what it says afterwards.
7. **States:** loading, empty, error, read-only and the page's own special states.
8. **Done when:** the checklist a design review ticks.

Text: English and German are both given. You design and test in English; the German column is input for the LLM
(Claude) that writes the German catalog entries, and you never need to read or check it. The final strings go into the catalogs
(`apps/app/src/i18n/messages/<namespace>.ts`, both languages, same key; the namespace is named on each page). German
uses *du*, sentence case and a spaced hyphen ` - ` where English uses a dash. Company data (unit names, goal titles,
case titles) is never translated.

Test ids: every form element and step a test needs gets `data-testid="settings-<section>-<thing>"` (wizard:
`setup-step-<key>`), ADM/D7. Put them in the Figma layer names too, so design and code use the same names.

When a Figma or Paper frame exists for a page, add a line `Design: <link>` under its header lines.

## Ground rules for every page

These come from the decisions in PILOT (HD4, HD5, HD7, HD8, HD9, HD10, HD14).

- **English for design, room for German.** Design, build and test every page in English. The pilot runs in German,
  and German labels are about 30 % longer than English ones, so no label, button or column may depend on the English
  length: let text wrap or truncate with a tooltip. The German strings are written into the catalog by an LLM, and
  Kevin checks the German screens; you do not need to.
- **Roles, not people (HD5).** Cases go to roles. Show the role first and the person in its seat second
  ("Qualitätsleitung Werk Süd · H. Sander"). No rankings, no per-person counts, no "top contributors".
- **Small groups stay hidden.** A number broken down by unit or role shows *Too few to show* when fewer than
  5 people are behind it (MET). Use the shared `TooFewToShow` block.
- **The AI can be off (HD7, HD8).** Each company may switch the AI off. Every place that shows an AI suggestion has a
  version without it ("routed by keywords"). Off is a normal state, never an error.
- **No company-specific logic (HD4).** What differs between companies is a setting on one of these pages, never a
  special case in a page.
- **People are ids (HD10).** Never design a free-text name field where a person is meant. Pick people from a list or
  search of the company's active members.
- **The personnel number is never shown (HD14).** Directory sync stores it; no page, export preview or tooltip
  shows it.
- **Secrets are write-only.** A key, token or password is never shown again after it is saved; a form shows only
  "Set" or "Not set" and a *Replace* button (ADM/D10). A new token is shown once (`SecretOnce`).
- **Two kinds of admin.** *Settings* (`/[company]/settings/…`) is for the customer's company admins, who are the
  company's managers (ADM/D6), and gets full design care. `/admin` is the stack's internal console for NextUp's
  team and named stack admins; it only needs to be clear.
- **Sentence case, no emoji, no exclamation marks.** Buttons are short verbs ("Save", "Invite", "Test connection").
  Every sentence names a person, a date or a number where it can (design-system README, "Content fundamentals").

## Visual language

The target is [design-system/README.md](../../design-system/README.md). In short:

- Cool system greys, white cards with a soft shadow on the light app ground (`--nh-app-ground`), 12 px card radius,
  8 px control radius. Never a white card inside a white card: facts inside a card go on a grey panel (`InfoPanel`).
- *Replaced on 4 Nov 2026: buttons and selected states use the blue token, no fill is black (`src/styles/tokens.css`). The old rule read:* **Black is the action colour** (primary pill button). Grey fill for the alternatives. **Blue means state**
  (selected, now, progress, the AI sparkle), not action. Red only for a late number and for errors.
- Type from the fixed scale only (`--nh-fs-xs` 12 … `--nh-fs-4xl` 34); page headings `--nh-fs-2xl` 600 with
  -0.02em tracking; numbers with tabular figures. No serif or display font anywhere.
- Icons: the app's own 24 × 24 stroke set (`components/ideas/raiseIcons.tsx`). No icon library, no logos of other
  companies except the Microsoft logo on the Microsoft sign-in button.
- Layout: settings pages use the content width `--nh-max` (1120 px) with the page gutter `--nh-page-x`.

Today's settings form uses the older global classes (`nh-btn-primary`, a blue button). New pages use the system look
above. Open question Q1 below.

## Shared building blocks

The specs refer to these blocks by name, so each one means the same thing on every page. What each block is for
and which pages use it is what matters; the looks below are suggestions. Build each once and reuse it: settings-only
blocks in `apps/app/src/components/settings/`, shared ones in `apps/app/src/components/ui/`.

| Block | What it looks like | Used by |
|---|---|---|
| `SettingsShell` | Desktop: a 220 px left column with the settings menu (group labels `--nh-fs-xs` 600 `--nh-mute`, items `--nh-fs-sm`, the current item on a grey fill with ink text), the page on the right. Phone: one button at the top ("Settings: Members ▾") that opens the menu as a sheet. See [01](2026-11-02_pilot-pages/01-settings-and-structure.md#settings-shell). | every settings page |
| `PageHeader` | H1 (`--nh-fs-2xl`), one lead line under it (`--nh-fs-md`, `--nh-ink-2`), the page's one primary action on the right (black pill). Phone: the action moves under the lead, full width. | every page |
| `SectionCard` | White card, padding `--nh-pad-card`. Title `--nh-fs-lg` 600, optional hint line `--nh-fs-sm` `--nh-mute`. Its own *Save* button bottom right, disabled until something changed. Cards of one page stack with `--nh-gap`. | settings pages |
| `InfoPanel` | Grey panel (`#f7f7f9`, 8 px radius) inside a card: a two-column label/value grid, label `--nh-fs-sm` `--nh-mute`, value `--nh-fs-md` ink. | connectors, go-live, audit details |
| `StatusBadge` | Pill, `--nh-fs-xs` 600, 22 px tall. Tones: **Off** grey fill `#f2f2f7`, ink-2 text · **Setting up / needs you** amber `#9a5300` on `#fff1dc` · **On** white with a 1 px line and a blue check · **Error** `--nh-danger` on `--nh-danger-tint` · **Synced** grey fill with a small lock. | connectors, members, go-live |
| `SourceBadge` | Same pill size: "Manual" / "From Entra" / "From SuccessFactors". Synced records show a lock; their synced fields are read-only. | members, org |
| `EditDrawer` | Sheet from the right, 480 px wide, slides in 420 ms with the system ease. Title, the fields, a footer with *Cancel* (grey) and *Save* (black). Closes on Esc and on a click outside, but asks first when something changed. Phone: full-screen sheet from the bottom. | org, routing, rules, calendar, webhooks |
| `ConfirmDialog` | Centred modal, max 440 px. Title, one or two sentences that say exactly what happens, *Cancel* (grey) and the action. Destructive actions use a red text button. Actions that cannot be undone (pseudonymise, delete) also ask to type the person's or company's name. | deactivate, delete, pseudonymise, revoke, switch stage |
| `DataTable` | Rows 52 px, a hairline between rows, header `--nh-fs-sm` 600 `--nh-mute` in sentence case. Paging under the table: "1-50 of 1,240" with previous and next buttons. Search field and filters above it. Phone: each row becomes a stacked card (title line, one meta line, actions in a ⋯ menu). | members, audit log, tokens, webhooks, decision log |
| `EmptyState` | Centred in its card: one stroke icon (32 px, `--nh-mute`), one sentence, one action. | every list |
| `TooFewToShow` | Grey panel in place of a number or bar: "Too few to show" + "Fewer than 5 people - hidden to protect individuals." / "Zu wenige zum Anzeigen" + "Weniger als 5 Personen - ausgeblendet, um Einzelne zu schützen." | dashboard, pilot report, overview |
| `SecretOnce` | A boxed value in `--nh-mono` with a *Copy* button and the line "Shown once. Store it now." / "Wird nur einmal angezeigt. Jetzt sichern." The login-code box in `MembersView.tsx` is the model. | API tokens, webhooks, SCIM token, TOTP key |
| `ConnectorBlock` | One card per connector on the Connectors page, always in the same order: header (name, `StatusBadge`, on/off switch), *What NextUp reads* (`InfoPanel`), setup fields, *Test* (where the connector has one; Jira shows its checks), *Sync* (last run, counts), *Recent errors* (the last error and Jira's per-item problems; the connectors keep no error history, open question C2 in 03). Defined exactly in [03](2026-11-02_pilot-pages/03-connectors.md#connectorblock). | connectors |
| `Toast` | The shell's existing toast. After every save: "Saved" / "Gespeichert"; after an action, a sentence naming what happened ("Invitation sent to L. Brandt"). | every action |

## The settings menu

ADM-G1 builds the menu from `SETTINGS_SECTIONS` (`apps/app/src/features/settings/sections.ts`) in the order of
ADM/D7: Setup (until `setupStep` says `done`), Company, Rules, Calendar, Org, Routing, Members, Connectors.
Later phases append their sections. The group labels below are a visual grouping of that order. Routes are relative
to `/[company]`.

| Group (EN / DE) | Section | Route | Phase | Spec |
|---|---|---|---|---|
| – | Setup (until setup is done) | `/settings/setup` | ADM-F1 | 02 |
| Company / Firma | Company | `/settings/company` | ADM-A1 | 01 |
| | Rules | `/settings/rules` | ADM-A1 | 01 |
| | Calendar | `/settings/calendar` | ADM-A1, CLK | 01 |
| Structure / Struktur | Org | `/settings/org` | ADM-B1 | 01 |
| | Routing | `/settings/routing` | ADM-B1 | 02 |
| | Members | `/settings/members` | DIR-D1, ADM-D1 | 01 |
| Connectors / Anbindungen | Connectors | `/settings/connectors` | ADM-C1 (+ TMS, SFX) | 03 |
| Notifications / Benachrichtigungen | Notifications | `/settings/notifications` | ADM-N1 | 06 |
| | Webhooks | `/settings/webhooks` | API | 08 |
| Data and security / Daten und Sicherheit | Data and privacy | `/settings/privacy` | GDP | 05 |
| | Audit log | `/settings/audit` | GDP | 05 |
| | Sign-in and provisioning | `/settings/sign-in` | EID | 08 |
| | API tokens | `/settings/api-tokens` | API | 08 |
| | Import and export | `/settings/import-export` | API, PIL | 08 |
| | Support access | `/settings/support-access` | SEC | 08 |
| Shop floor / Shopfloor | Areas and QR codes | `/settings/areas` | FLR | 07 |
| Go-live / Start | Go-live | `/settings/go-live` | PIL | 09 |
| | Pilot report | `/settings/pilot-report` | PIL | 09 |

A section whose phase is not built is not in `SETTINGS_SECTIONS`, so it does not show. The routes of the later
sections are proposals; their Bauplan fixes them.

## Every page

### New pages (23)

| Page | Route | Phase | Spec |
|---|---|---|---|
| Setup wizard | `/settings/setup` | ADM-F1 | 02 |
| Rules | `/settings/rules` | ADM-A1 | 01 |
| Calendar | `/settings/calendar` | ADM-A1, CLK | 01 |
| Org | `/settings/org` | ADM-B1 | 01 |
| Connectors | `/settings/connectors` | ADM-C1, TMS, SFX | 03 |
| Decision log | `/decisions` | LOOP | 04 |
| Data and privacy | `/settings/privacy` | GDP | 05 |
| Audit log | `/settings/audit` | GDP | 05 |
| Notifications | `/settings/notifications` | ADM-N1 | 06 |
| Areas and QR codes | `/settings/areas` | FLR | 07 |
| Raise from an area | `/[company]/floor/[area]` | FLR | 07 |
| Shared-device sign-in | `/[company]/floor/[area]/sign-in` | FLR | 07 |
| Sent | `/[company]/floor/sent` (the reference never goes into the URL, 07/F3) | FLR | 07 |
| Status by reference | `/[company]/floor/status` | FLR | 07 |
| API tokens | `/settings/api-tokens` | API | 08 |
| Webhooks | `/settings/webhooks` | API, NTF | 08 |
| Import and export | `/settings/import-export` | API, PIL | 08 |
| Sign-in and provisioning | `/settings/sign-in` | EID | 08 |
| Support access | `/settings/support-access` | SEC | 08 |
| Set up the second factor | `/[company]/login` (enrol step) | ADM-E1 | 08 |
| Enter the second-factor code | `/[company]/login` (code step) | ADM-E1 | 08 |
| Go-live | `/settings/go-live` | PIL | 09 |
| Pilot report | `/settings/pilot-report` | PIL, MET | 09 |

The shop-floor paths are proposals; the FLR plan fixes them (its code area is the route group `app/(floor)/`).
GDP's brief names `(app)/admin/audit` for the audit log; this spec puts it in Settings so the company admins find
everything in one place (Q2).

### Pages to redesign (15)

| Page | Route today | Phase | Spec |
|---|---|---|---|
| Settings navigation | `settings/layout.tsx` | ADM-G1 | 01 |
| Company | `/settings/company` | ADM-A1 | 01 |
| Members | `/settings/members` | DIR-D1, ADM-D1, GDP | 01 |
| Routing | `/settings/routing` | ADM-B1 | 02 |
| Dashboard | `/dashboard` | MET | 04 |
| Feed | `/feed` | MET | 04 |
| Overview | `/overview` | MET | 04 |
| Person page | `/people/[name]` (removed by TRUTH-B1; MET may rebuild it as `/people/[userId]`) | MET | 04, 11 |
| Raise: publishing step | `/raise` | LOOP | 04 |
| Case page | `/cases/[caseId]` | LOOP, CLK, VIS | 04 |
| Inbox and My cases | `/leader`, `/team` | VIS | 04 |
| Profile | `/profile` | NTF | 04 |
| Company login | `/[company]/login` | ADM-E1, EID | 08 |
| Forgot code, signup and invite pages | `/forgot-password`, `/signup`, `/invite/[token]` | ADM-D1 | 08 |
| `/admin` login | `/admin/login` | ADM-E1 | 08 |

### Existing pages to improve (8)

Built and working today, and no PILOT phase rebuilds them. They keep what they do and get the design system's look.

| Page | Route | Spec |
|---|---|---|
| Projects | `/projects` | 10 |
| Project page (with the card sheet) | `/projects/[projectId]` | 10 |
| Raise as a whole (the publishing step is in 04) | `/raise` | 10 |
| Ideas | `/ideas` | 10 |
| Problems | `/problems` | 10 |
| Collaboration | `/collaboration` | 10 |
| Progress | `/progress` | 10 |
| My reports | `/reports` | 10 |

Ideas, Problems, Collaboration, Progress and My reports are not in the navigation today; spec 10 asks whether each
stays (10-Q1 to 10-Q5).

### From the defensible-offer plan (spec 11)

The [defensible-offer plan](2026-11-02_defensible-offer.md) and its [Codex tasks](2026-11-02_defensible-offer-codex.md)
add these. Each page's data comes from the task named in spec 11.

| Page | Route | New / changed / removed | Tasks |
|---|---|---|---|
| Reviews | `/reviews` | new | BVW-A1, BVW-B1 |
| Review a case | `/reviews/[caseId]` | new | BVW-A1, BVW-B1 |
| Committee | `/committee` | new | BVW-C1 |
| Premium rules | `/settings/premium` | new | BVW-D1, BVW-E1 |
| Payroll export | `/settings/payroll` | new | BVW-F1 |
| ZI KPI report | `/kpis` | new | BVW-G1 |
| Works council and AI Act | `/settings/works-council` | new | PACK-A1, PACK-B1, PROOF-D1 |
| Oversight | `/oversight` | new | PACK-C1 |
| Benchmark | `/settings/benchmark` | new | BENCH-A1, BENCH-B1 |
| Case page (answer date, why this score, translation) | `/cases/[caseId]` | changed | CORE-S1, CORE-H1, TRUTH-D1, TRUTH-E1, BVW-H1 |
| My cases (answer date) | `/team` | changed | CORE-S1 |
| Raise (suggestions without a gain number) | `/raise` | changed | TRUTH-E1 |
| Project page (reward, measure card) | `/projects/[projectId]` | changed | BVW-E1, PROOF-A1, PROOF-B1, PROOF-C1 |
| Rules (six new cards) | `/settings/rules` | changed | CORE-H1, BVW-B1, BVW-C1, BVW-F1, PROOF-B1, PROOF-C1 |
| Dashboard (benchmark card) | `/dashboard` | changed | BENCH-B1 |
| Progress (ranking removed) | `/progress` | changed | TRUTH-A1 |
| Person page | `/people/[name]`, `/demo/people/[name]` | removed | TRUTH-B1 (MET may add `/people/[userId]` later) |

Other surfaces: the printable premium letter and four dialogs (request a review, decide in committee, confirm a
result, import a KPI file).

### Other surfaces (27)

| Surface | Count | Spec |
|---|---|---|
| Teams: app icon, new-case card, reminder card, answer and hand-over card, raise form, confirmation card | 6 | 06 |
| Emails: invitation with login code, deadline reminder, digest, export ready, weekly pilot report | 5 | 01, 06, 05, 09 |
| Printables: QR poster, reference slip | 2 | 07 |
| Installed web app: home-screen icon and splash | 1 | 07 |
| Dialogs: deactivate member, delete member, pseudonymise, edit route, grant support access, switch stage, revoke token | 7 | 01, 02, 05, 08, 09 |
| States: AI off, connector error, too few to show, new user without a seat, empty company, sandbox banner | 6 | this file, 03, 04 |

The six states, once for every page:

| State | Looks like | EN | DE |
|---|---|---|---|
| AI off | Where an AI suggestion would be: a grey line with the keyword icon | "Routed by keywords - the AI is off for this company." | "Nach Stichwörtern zugeordnet - die KI ist für diese Firma aus." |
| Connector error | `StatusBadge` Error next to the connector's name; in its block, the *Recent errors* list | "Jira: last sync failed at 14:20. Check the connection." | "Jira: letzte Synchronisierung um 14:20 fehlgeschlagen. Verbindung prüfen." |
| Too few to show | `TooFewToShow` | see the block | see the block |
| New user without a seat | The user's home shows an `EmptyState` | "You are signed in, but no role in {company} is yours yet. A manager sets this up." | "Du bist angemeldet, aber dir ist in {company} noch keine Rolle zugewiesen. Das richtet eine Führungskraft ein." |
| Empty company | Every list's `EmptyState` names the setup step; managers land on Setup (ADM/D7) | "{company} is not set up yet. Start the setup." | "{company} ist noch nicht eingerichtet. Einrichtung starten." |
| Sandbox banner | A 36 px amber strip under the top bar, for managers only | "Sandbox: nothing is sent to anyone. Switch to pilot in Go-live." | "Sandbox: Es wird nichts verschickt. Wechsel auf Pilot unter Start." |

## Open questions

Each has a default. These specs follow the default until Kevin decides otherwise.

| # | Question | Default |
|---|---|---|
| Q1 | New pages follow the design system (black action button) while today's settings form uses the blue `nh-btn-primary`. Restyle the global form classes too? | Yes: ADM-G1 restyles `nh-btn-*` in `globals.css` so old and new forms match. |
| Q2 | Does everything the company admins use live in Settings, with `/admin` for the stack's own team? | Yes (GDP's audit view included). |
| Q3 | Company goals (`Goal`) had no editor in any Bauplan. | Decided: a Goals section on the Rules page, task ADM-H1 (spec 01). |
| Q4 | Per-site calendars (PILOT brief) vs one company calendar (ADM/Q1, CLK). | One company calendar; per-site is drawn as *later* only. |
| Q5 | Shop floor: raising without a name allowed per area, or always a short code? | Both, chosen per area. |
| Q6 | Raise publishing step: finish or remove receiver, colleagues and meeting? | Decided in the LOOP plan; spec 04 draws the finished simple form. |
| Q7 | Pilot report: page, email or both? | Both, plus a PDF download (the browser's print view, no new package). |

Each spec file ends with its own open questions (R1-R4 in 02, C1-C4 in 03, 04-Q1 to 04-Q6, G1-G4 in 05, N1-N4 in 06,
F1-F6 in 07, Q-08-1 to Q-08-4, Q-09-1 to Q-09-4, 10-Q1 to 10-Q8, 11-Q1 to 11-Q7), each with a default.

## Gaps the specs found, and their solutions

Writing the specs against the Baupläne and `main` turned up these. Each now has a solution and an owner, written
into the plans repo on 2026-11-02 (PILOT brief lines "From the page specs", HD15, the ADM and VIS Baupläne). NTF is
already running and stays unchanged; what it handed to nobody went to ADM or API.

| Gap | Solution | Owner | Spec |
|---|---|---|---|
| No plan builds the Notifications and Webhooks settings: NTF hands its failed-messages view and subscription editor to ADM, and ADM had no task for them. | ADM builds the company Notifications page with the switch, opt-out counts and failed messages with Retry (ADM/D18, task ADM-N1). API builds the Webhooks page with the subscription editor and deliveries, and the API tokens page. | ADM-N1, API | 06, 08 |
| No plan owned the shop-floor areas table, and a QR image needs a package. | FLR owns `FloorArea` and `FloorDevice` in `structure.prisma` and adds its `areas` section to ADM's settings menu; the QR encoder arrives first as `deps/FLR` (HD12). | FLR | 07 |
| No plan edited company goals (`Goal`). | A Goals section on the Rules page (ADM/D17, task ADM-H1). | ADM-H1 | 01 |
| The receiver picker on the raise page scores people, including their answer track record (`features/ideas/receivers.ts`). That breaks HD5. | Suggestions rank desks (a role and its seats) by route, keywords and spend authority only; the track record (`TRACK_CASES`) goes and no score is shown for a person. | LOOP | 04 |
| The person page is keyed by display name (`/people/[name]`), which HD10 rules out, and returns 404 for anyone with a handle. | Person pages move to `/people/[userId]`; a name URL redirects when exactly one active member has that name; anonymous members have no person page and their handle is not a link. | MET | 04 (04-Q5) |
| `/admin/decisions` already exists and is a different log. | The new log is `/decisions`; the stack's `/admin/decisions` is renamed "Routing review". | LOOP | 04 |
| `metricInputs` had no first-answer day. | `firstAnswerDay` in `CaseView` and `metricInputs` (VIS/D7). | VIS | 04 |
| The connectors keep only their last error. | No history for the pilot: the *Recent errors* slot shows the last error and Jira's per-item problems (03, C2 default). | ADM-C1 | 03 |
| Setup disappeared from the menu once one unit existed, but the wizard has three more steps. | Setup stays in the menu and `/settings` redirects to it until `setupStep` says `done` (ADM/D7, D14; ADM-G1 builds `setupStep`). | ADM-G1, ADM-F1 | 01, 02 |
| No way to reset a lost second factor; unclear whether demo-stage managers enrol. | Another manager of the company (Members) or a stack admin (`/admin` People) resets it, logged; the person enrols again. Demo-stage managers sign in through the demo and never enrol (ADM/D19, task ADM-R1). | ADM-R1 | 01, 08 |
| Every stage move signs the whole company out (`sessionEpoch`); the pilot stage text speaks of a two-day promise while `promise_days` defaults to 5. | Only leaving `demo` or moving back to a lower stage signs everyone out; sandbox → pilot → live keep sessions. `STAGE_MEANING` reads the company's `promise_days`. | PIL | 09 |
| The company login shows fixed numbers ("26 h", "84 %") to real companies. | The side panel with sample numbers shows on demo companies only (ADM/D20, in ADM-E1). | ADM-E1 | 08 |
| Retention covered assistant turns only; drafts, case events and the screenshot policy had no fields. | GDP adds its own rows in `ops.prisma` (retention per kind, screenshot policy), no new columns on Company (HD11). The audit view is `/settings/audit`. | GDP | 05 |
| The rate-limit wait text exists in English only. | The refusal comes from the catalog in German and English (`errors.tooManyAttempts`, VIS/D11, in VIS-D1). | VIS-D1 | 07 |

## Done when

- The design and elements page is shared with the team and in code (tokens, global classes, shared components).
- Every page in the tables above is designed (desktop, phone, English, every state of its *Done when* list) and its
  frame is linked in its spec.
- Every page is built and merged, with its data from Kevin's infrastructure, and passes lint, typecheck, tests and
  the RESPONSIVE.md checks.
- The shared building blocks exist once, as design components and as code components, and every page uses them.
