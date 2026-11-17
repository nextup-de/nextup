# Design rules

> **Updated 2026-11-16.** The fixed rules every screen follows. Kevin decides them; a PR that breaks one changes, not
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
| One row of controls per list: at most two levels of "where am I" (the bar's pills, the pages in the side view); everything else is a filter in that row; empty departments go behind "More". | not tested |

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
| **An area's pages sit in its side view** on a laptop or monitor: the same side view in every area, on the left, hidden at the start and opened by the button at the top left; open in one area, it is open in all. No strip of tabs repeats it there. A phone has no side view and keeps the strip. Either appears only with two or more pages; a strip never shows a vertical scrollbar. Kevin, 16 Nov 2026: every area. Projects, Dashboard and Profile have it; Inbox and Ideas keep the strip until their own lists sit in the side view (`SIDE_VIEW_SECTIONS` in `config/nav.ts`). | `tests/unit/design/side-view.test.tsx`; `tests/unit/design/section-tabs.test.ts`; `tests/e2e/demo/design-guard.spec.ts`; `tests/e2e/db/design-guard.spec.ts` |
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

## 8. Ideas and projects are separate

Decided by Kevin and Sam on 16 Nov 2026 (`nextup-context/decisions/2026-11-16_ideen-projekte-getrennt.md`). The line
between them is the **last yes**: before it the thing is an idea, after it a project. Nothing on screen blurs that line.

**The way from idea to project**

1. **Idea.** Raised on the Ideas tab. It has exactly one page, where its approval and its discussion happen. The raiser
   follows it under Ideas › Mine; whoever must decide finds it in the Inbox; the Feed shows it to everyone.
2. **Approval.** The desk says yes first, then up to 3 named approvers vote at once. One no goes back to the raiser with
   its reason; the raiser may change the idea and send it again.
3. **Setup (project draft).** Only after the last yes. The lead takes it, invites people and takes the baseline. From
   here on it lives under Projects.
4. **Project.** The team works on it: steps, plan, results, files.

| Rule | Enforced by |
|---|---|
| **Four places, one job each:** Ideas = raise and follow, Inbox = decide, Feed = social, Projects = do. | this file; not tested as a whole |
| **No idea under Projects.** Projects lists projects only, in every list, tab, filter, pill and sidebar, for every role and behind every flag. A waiting idea never sits next to a project. | `tests/unit/projects-area/no-ideas.test.tsx`; e2e `the Projects page lists projects only…` (`tests/e2e/demo/projects.spec.ts`) |
| **One page per idea: `/idea?id=<id>`.** It carries the card, the approval line, the moves and the history. Every link in the app goes there; `/cases/<id>` only moves on to it. An idea has the pages Idea, Files and Chats, never "Add page". | `tests/unit/inb/items.test.ts`, `tests/unit/inb/notice-view.test.ts` (the links) |
| **An idea's page belongs to the Inbox.** On `/cases/<id>` and `/idea?id=` the bar marks the Inbox; the sidebar shows that idea's own pages and the way back to the Inbox, never the projects list or the Projects tabs. Closing an idea goes to the Inbox. | `tests/unit/design/section-tabs.test.ts`; e2e `an idea opened from the ideas table…` (`tests/e2e/demo/projects.spec.ts`) |
| **Decisions (every yes and no) is a tab of the Inbox,** not of Projects. | `tests/unit/loop/decisions-nav.test.ts` |
| **A project draft appears under Projects only after the last yes,** never at the first. | GAT tests (`tests/unit/gat/parallel.test.ts`) |
| **A project's Idea page is its origin, read only:** who raised it, why, who said yes, what was discussed. It carries no project actions (Start, Manage, Mark done) and the project's own head (title, status, "Your move") stays above it. The project's moves live in its head and on its Overview. | `tests/unit/projects-area/idea-page.test.tsx` |
| **Where a design wants ideas and projects on one screen** ("everything I have going on"), that screen is the Inbox (what needs me) or Ideas › Mine (what I raised), never Projects. | not tested |

## 9. One fact once, folded by default

Decided by Kevin on 16 Nov 2026, after a project's Measure section named one date three times and "not confirmed"
twice. A screen answers two questions: what is the state, and what do I press. Everything else waits behind a fold.
The screen-by-screen findings and the target per screen are in `docs/plans/2026-11-16_quiet-screens/`.

| Rule | Enforced by |
|---|---|
| **One name per place.** The bar's pill names the area, the side view (or, on a phone, the strip) names the page; an area's first page may carry the area's name there. No heading repeats either of them, and no two headings on a screen are the same. A project's or an idea's title is shown once. | e2e `quiet screens: one filled button and one name per page…` (`tests/e2e/demo/quiet.spec.ts`), on the main pages as Employee, Team leader and Manager |
| **One fact, once per screen.** A date, a person, a status or a count appears in one place. A status has one carrier: a chip, a colour or a sentence, never two of them. | not tested |
| **No grey text that explains.** Muted text carries a fact the reader needs to act: who, when, how much. A line that says how NextUp works, or repeats the heading in other words, goes. | not tested |
| **Folded by default.** A section shows one line with its answer; the rest opens on demand (`Fold` in `components/ui/elements`). A form appears after its button was pressed. Open without asking is only the one thing the viewer has to do now. | `tests/unit/design/fold.test.tsx` for the element; screens not tested |
| **One filled button per screen.** The one filled blue button is the viewer's next move. Every other action is a quiet button, a link or sits in the "⋯" menu. Without a next move there is no filled button. A button that does nothing yet is not drawn. A selected state may be blue too (a chosen filter, the current row): it carries `aria-pressed`, `aria-current`, `aria-selected` or `aria-checked`. | same e2e (`tests/e2e/demo/quiet.spec.ts`) |
| **Status colours are the status tokens.** Good is `--nh-ok`, needs you is `--nh-warn`, late or worse is `--nh-danger`. Blue is for actions and selection, never for a status. No screen keeps a palette of its own. | not tested |

## 7. Never

- Tailwind, CSS frameworks, UI kits or styled-components; styles live in `tokens.css`, `globals.css` and `*.module.css`.
- An icon font, icon library, PNG icons or emoji.
- Analytics or third-party scripts.
- Changing a guarding test so that a PR which breaks a rule goes green.
