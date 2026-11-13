# Design rules

> **Updated 2026-11-12.** The fixed rules every screen follows. Kevin decides them; a PR that breaks one changes, not
> the rule. Each rule names where it is enforced. "Not tested" means no check guards it yet, so reviewers must.

NextUp is a quiet product: one question per screen, nothing drawn that has nothing to say. When a design choice is
open, pick the calmer option. Details of the visual system (tokens, components, assets) are in
`design-system/README.md`; layout and type scale in [RESPONSIVE.md](RESPONSIVE.md). Where `design-system/README.md`
still calls black the action colour (Visual Foundations), this file and its own 4 Nov banner win: no black fills.

## How a rule changes

1. Only Kevin adds, changes or drops a rule. The PR that does it updates this file in the same commit.
2. A PR that conflicts with a rule changes the PR, never the test that guards the rule. Example: #773 opened the
   raise sidebar by default; on 12 Nov Kevin kept the calm start, so the PR changed.
3. A new rule gets a test where it can have one. Until then it is listed here as "not tested".

## 1. Calm and quiet screens

| Rule | Enforced by |
|---|---|
| **The raise page opens calm:** only the greeting and the composer; side panel closed, details tray folded. Fixed rule (Kevin, 12 Nov 2026). | e2e `the page opens calm…` (`tests/e2e/demo/ideas.spec.ts:12`) |
| The gold ring around the raise composer is the only gradient in the product; everything else that acts is blue. | same test; `styles/tokens.css` |
| Nothing empty is drawn: no empty card, section, inbox group or dashboard row. With nothing at all, the page says so in one sentence. | INB acceptance (`tests/e2e/db/inb.spec.ts`) for the inbox; elsewhere not tested |
| The ideas sidebar is one quiet line per idea: no date, no preview, no Draft badge (a dashed circle marks a draft). | `tests/unit/design/ideas-sidebar.test.ts` |
| Detail views use one structure: sections are a grey heading separated by space, not by lines; key/value blocks and lists share one grouped-list style. | not tested |
| One row of controls per list: at most two levels of "where am I" (top pills, page tabs); everything else is a filter in that row; empty departments go behind "More". | not tested |

## 2. Numbers and data

| Rule | Enforced by |
|---|---|
| A number that is 0 or missing is not shown: no "0", no dash (`shows()` in `lib/utils/quiet.ts`). | `tests/unit/quiet.test.ts` |
| Exception: on the dashboard, a 0 against a baseline that was not 0 stays, because it is the result. | not tested |
| A list longer than 7 shows its 5 most relevant, then "Show all N". The inbox is never capped. | `tests/unit/quiet.test.ts` |
| A stats strip is not drawn when it would repeat what the page already says. | not tested |
| Units or roles under 5 active people show "too few", never a count. | MET acceptance; [METRICS.md](METRICS.md) |
| Problem and idea are told apart by icon and label, never by colour. | partly: `tests/unit/design/kind-colour.test.ts` (no colour by kind without a different icon) |

## 3. People, privacy and visibility

| Rule | Enforced by |
|---|---|
| No screen counts or ranks people: no per-person numbers, no contributor ranking, no person route by name. | `tests/unit/met/no-person-metrics.test.ts` |
| People are matched by id, never by display name. | no-person-metrics test; [VISIBILITY.md](VISIBILITY.md) |
| The browser gets only the cases its viewer may open. | VIS acceptance (`tests/e2e/db/visibility.spec.ts`) |
| A person card shows name, role and unit only. A case never shows a handle and a name side by side. | `tests/unit/design/people.test.ts` (the raise card still shows location and email: listed there) |
| Shop-floor pages never show a name, handle, comment or raiser, and never count cases per area or device. | partly (`shop-floor.spec.ts`); [SHOP_FLOOR.md](SHOP_FLOOR.md) |

## 4. Navigation and layout

| Rule | Enforced by |
|---|---|
| One inbox, `/<company>/inbox`, for every role; a member sees it in the nav only while something waits. Order: pinned, late, due soon, the rest. The badge never adds overlapping counts. | INB acceptance; [INBOX.md](INBOX.md) |
| The shell is chosen per role (members: simple bar; leaders and managers: rail and top bar). Roles, homes and nav are config (`ROLE_HOME`, `NAV`), never hard-coded in a page. | `tests/unit/design/roles-config.test.ts` (leaders and managers still have the simple shell: listed there) |
| A section-tab strip appears only with two or more tabs. Tab strips never show a vertical scrollbar. | `tests/unit/design/section-tabs.test.ts`; `tests/e2e/demo/design-guard.spec.ts` |
| Everything works below 760px; nothing scrolls sideways; nothing scales with the window (no `zoom`, no vw/vh). | `mobile.spec.ts`; checkDesign; `fluid.test.ts`; [RESPONSIVE.md](RESPONSIVE.md) |
| Floor pages: no app shell, light theme, touch targets at least 48px (main buttons 64px), a DE / EN switch. | `tests/unit/design/floor.test.ts` (the DE / EN buttons are 40px: listed there) |

## 5. Language and copy

| Rule | Enforced by |
|---|---|
| Every user-facing string is in the en and de catalog with the same keys; no inline strings in components. | `tests/unit/i18n/*` |
| German uses the formal "Sie" everywhere: app, mails, Teams, floor pages, the AI coach. | `tests/unit/design/copy.test.ts` for the catalog; mails, Teams and the AI coach not tested |
| Dates and numbers are formatted per locale in Europe/Berlin; mails name real dates. | `tests/unit/i18n/core.test.ts` |
| Plain and concrete: a person, a date or a number; employee words, not system words; sentence case; short verb buttons; " · " as separator; no emoji, no exclamation marks. | partly: `tests/unit/design/copy.test.ts` (no emoji, no exclamation marks) |
| Store facts, build sentences at render; never store display text as state. | not tested |

## 6. Colour, type and accessibility

| Rule | Enforced by |
|---|---|
| No black fills, anywhere. Actions and selected states are blue (`--nh-brand`); the logo blue is never a button fill. | `design-guard.spec.ts` (`no black fill…`); `colors.test.ts`; Stylelint |
| No blue outside `tokens.css`: changing `--nh-brand` changes it everywhere. The colour allowlist can only shrink. | `design-guard.spec.ts`; `colors.test.ts` |
| Font sizes only from the scale 12/13/15/17/20/24/28/34 (16 for inputs); nothing under 12px; no raw px, rem or calc font sizes. | `fluid.test.ts`; Stylelint |
| Motion respects reduced motion. Focused fields get the blue focus ring (`--nh-brand-focus`). | `tests/unit/design/motion-focus.test.ts` (eleven style files still animate without a reduced-motion rule: listed there) |

## 7. Never

- Tailwind, CSS frameworks, UI kits or styled-components; styles live in `tokens.css`, `globals.css` and `*.module.css`.
- An icon font, icon library, PNG icons or emoji.
- Analytics or third-party scripts.
- Changing a guarding test so that a PR which breaks a rule goes green.
