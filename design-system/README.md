# NextUp Design System

NextUp answers one question for a company: **who owns this decision, and what is waiting on whom?** An employee raises an idea or a problem in one field, develops it with an AI coach until it scores high enough to publish, and it lands on a named leader's desk with a clock ("answer within 5 days"). The leader says yes, no and why, hands it over, or asks one question. Managers see the wait ledger. Customers are manufacturing companies (plants, lines, shifts, changeovers, MES).

Tagline: *Who owns this decision?* · Description: *One field to raise it, one inbox with a clock, one wait ledger.*

## Sources
- **GitHub:** https://github.com/nextup-de/nextup (branch `main`) - Next.js 16 app in `apps/app/`, no CSS framework, tokens + CSS Modules. Key files: `apps/app/src/styles/tokens.css`, `apps/app/src/app/globals.css`, `apps/app/src/components/**`, `docs/RESPONSIVE.md`. Explore the repo further to design more faithfully - especially `components/dashboard/**`, `components/ideas/**` and `components/projects/**`.
- **Uploaded handoffs** (`uploads/`): earlier Claude Design files the code was converted from - `Raise.dc.html`, `Inbox App.dc.html`, `Idea Feed.dc.html`, `Overview.dc.html`, `Dashboard*.dc.html`, `Idea Detail*.dc.html`, LinkedIn covers, `AI Cover Prompt Blueprint.md` (how feed cover images are generated). Treat the repo as ground truth where they differ.

## Products / surfaces
One product: the **NextUp web app** (multi-tenant, `/[company]/…`). Three roles, one home each:
- **Team member → Ideas** (the Raise page: gold-ring composer, AI coach chat, drafts sidebar), Feed, Overview/Projects, "What I sent".
- **Team leader → Inbox** ("Fresh ideas": oldest first, promise clock per row), plus the member places.
- **Manager → Dashboard** (decision speed, where the waiting goes).
- Plus login (find company → company login code / Microsoft), and an `/admin` console (not covered).

UI kit: `ui_kits/app/` (Login, Ideas/Raise + coach chat, Inbox + opened idea, Feed, Projects idea view, What I sent).

---

## CONTENT FUNDAMENTALS
- **Plain, concrete, accountable.** Every sentence names a person, a date or a number: "Sent to T. Vogel. They owe you a yes, a no or a question by 15 Oct." "19 days waiting — 14 days past the promise. Escalated one level up."
- **Second person to the user, names for everyone else.** "You raised this 10 Oct", "Raise it, J. Schmidt". The product rarely says "we"; when it does it's the company/system making a promise ("We will take you to your company's login").
- **Employee words, not system words.** Steps are *Sent → Read → Answered → Live* (not "Decided / Shipped"); status "Waiting for an answer", "Being built", "Answered: yes".
- **Sentence case everywhere** - titles, buttons, nav. Buttons are short verbs: "Log in", "Continue", "Co-sign this idea", "Ask a question", "Answer D. Ferraro", "Support". Arrow links: "Full history →", "What I sent →".
- **Short people format:** initial + surname ("H. Sander", "L. Brandt"), anonymous handles "Anonymous #4471". Meta joined with " · ": "Quality · Plant Süd · 1 w".
- **Numbers carry the story:** "€120k expected upside / yr", "3 people · 10 wks", "−96 h / month reconciling", "5 weeks → 11 days". Compact units (d, wks, h, min, €4k).
- **Dry, a little wry headline copy:** "Nineteen working days. Three of them are work." / LinkedIn: "Startup speed. Enterprise scale."
- **Honest empty/unfinished states:** "Nothing yet. Your ideas and drafts land here." "Coming with the first pilot."
- Em dashes and the middle dot are the house punctuation. **No emoji. No exclamation marks.** English UI with German context (Berlin, plant names, umlauts).

## VISUAL FOUNDATIONS
> NextUp has moved from its first look (Manrope, warm greige, blue-filled buttons, orange for time) to the system below. Every surface - login included - now uses it. The `--nh-*` token and `nh-*` class names are kept from the repo but their values are the new system's; `--nu-*` / `nu-*` are the new names. Use either.

- **Colour:** neutral, cool system greys. Ink `#1c1c1e`, titles `#1b1d22`, secondary `#3a3a3c`, meta `#6e6e73`, placeholder `#8e8e93`. Fills `#f2f2f7` (grey buttons, chips, segmented track), panels `#f7f7f9`, hairlines `#e5e5ea`, dividers `#f0f0f3`. **Black `#111` is the action colour**: Sort, Support, the "on" segment, close buttons, the chosen decision. **Blue `#007aff` means state**: what's happening now (current step, gauges, progress), what's selected (inbox row `#0a84ff`), time left, the AI sparkle. Red `#ff3b30` is only for a late number. Amber `#9a5300` on `#fff1dc` is for review / needs info. No orange, no greige, and no blue-filled buttons.
- **Type:** Inter only (400/500/600/700). Titles 600 with −0.02em tracking (page 24, opened item 28); numbers 700 with tabular figures; body 15, ledes 17 at 1.55; meta 13 `#6e6e73`. Use the fixed scale 12/13/15/17/20/24/28/34 and nothing below 12px. IBM Plex Mono is kept for codes and the DEV badge only.
- **Backgrounds:** the blue **Ground** is unchanged: `#f9fcfc`, four drifting blurred blue blobs, grain, and a **visible dot grid** (rgb(60 100 170) at about 20%, 42px). White cards float on it. Feed covers sit on `#eef4fd`, with a top and bottom-left scrim so the overlay text reads.
- **Cards:** white, no border, 12px radius, bluish soft shadow `0 6px 20px rgb(40 60 100/.06)`. Feed cards use `0 1px 3px …/.08, 0 10px 30px …/.12` and lift 2px on hover. Inside a card, facts go in a grey `#f7f7f9` panel (label/value grid, bars, stat boxes) and sections split on a `#f0f0f3` hairline. Never nest a white card.
- **Controls:** pill buttons with 8px corners, 36px tall (32 small, 44 for decision rows), Inter 13/600. Dark = the action; fill grey = the alternatives; white with a soft shadow on the Ground; outline + blue check = done ("Published", "Supported"). Round 32/40px icon buttons (the black ×, grey chevrons). Segmented tabs have two looks: a grey track with a white thumb (Idea / AI), or a white track with a black thumb (Open / Archive). Filter chips are white and turn black when on.
- **Inputs:** white, 1px `#e5e5ea`, 6px radius, 34px tall (44 large), with a blue focus ring. The Raise composer keeps its **gold ring** - that is the only gradient in the product.
- **Signature widgets:** the five **score gauges** (270° arc, 10px round stroke, `#e3eaf7` track, `#007aff` fill, a black chevron that opens the reasoning); the **five-step track** (5px bars: ink done, blue now, grey to come); the **desk strip** ("On the desk of … · 1 d of the 5-day promise"); the **decision list** (44px grey rows, the picked one black, a "+ AI suggests" tag); **tinted badges**; the **avatar rail** for a docked inbox; the coach chat's **turn rail**.
- **Chat:** your messages are a black bubble on the right, 10px corners with a 3px tail corner. The AI's are plain text on the left, with no bubble. A person's messages are a grey `#f2f2f7` bubble with their tinted avatar.
- **Avatars:** initials on one of five tints picked by name (blue / green / amber / violet / teal), so a person keeps their colour everywhere. Anonymous is grey `#e5e5ea`; "me" is ink `#1c1c1e`. On a selected blue row the avatar gets a 2px white ring.
- **Problem vs idea:** neutral too - told apart by icon (bolt / bulb) and label, never by colour.
- **Motion:** one ease, `cubic-bezier(.2,.8,.2,1)`. Press is scale(.94–.97). Panels slide 420ms. The nav thumb slides 320ms. Gauge chevrons spring (`cubic-bezier(.34,1.56,.64,1)`). Everything respects reduced motion.
- **Layout:** a sticky 46px frosted bar (wordmark / search + nav pill / black avatar). Detail screens use main + 300–340px side column with 16px gaps; work surfaces go up to the full width. Card padding is 24 (18 for side cards).
- **Imagery:** soft 3D studio dioramas. Grey/white objects with one blue or navy accent, on pale blue, cool and clean, with no people and no text. The number and the hook are overlaid in Inter, bottom-left.

- **Logo:** the four-point star mark + "NextUp" in a heavy grotesque. Logo blue `#1286fc` (sampled from the files) is for the logo only, never a button fill. Use the supplied files as they are - horizontal for bars and headers, stacked for splash/empty pages, the mark alone for small spots. Use blue (blue mark + black name) on light, blue-white or white on dark.

## ICONOGRAPHY
- The product draws its **own small stroke set** (`components/ideas/raiseIcons.tsx`): 24×24 viewBox, round caps/joins, stroke 1.9 (heavier, 2.2–3, at tiny sizes). Copied verbatim into `components/icons/Icon.jsx` (`IconPaths`), plus the inline sort/filter/pin/comment/search/mic paths used by list tools and the shell.
- Filled glyphs only for the **bolt** (actions button) and the four-point **sparkle** (AI).
- No icon font, no icon library, no PNG icons. **No emoji.** Unicode used as glyphs: `→` in links, `←` Back, `✓` in menus, `×` to remove chips, `·` as separator.
- Microsoft sign-in uses the Microsoft logo inline (not copied).

## Assets
- `assets/brand/` - the logo set from the team (trimmed, transparent): `nextup-horizontal-{blue,black,white,blue-white}.png`, `nextup-stacked-{blue,black,white,blue-white}.png`, `nextup-mark-{blue,black,white}.png`, `nextup-icon-{blue,black,white}.svg`; plus `app-icon.png`, `login-hand.png`.
- `assets/feed/library/*.webp` - the ten generic feed covers; `sample-reporting-screen.webp`.
- `fonts/` - Inter var, IBM Plex Mono 400/500/600 (woff2, OFL). Manrope (the first system's face) was dropped. No substitutions needed.

---

## Index
- `styles.css` - entry; imports only.
- `tokens/` - `system.css` (**new system**, `--nu-*` + semantic aliases), `colors.css` (`--nh-*` names from the repo, values aligned to the new system; avatars, problem/idea, benchmarks, logo blue), `typography.css`, `spacing.css` (scale, radii, shadows, motion), `fonts.css`.
- `styles/` - `system.css` (**new** `nu-*` classes: pills, badges, segmented, cards, panels, gauges, steps, decision list, chat), `primitives.css` (global `nh-*` form classes, restyled), `dashboard.css` (`nh-ui-*` from ui.module.css), `shell.css` (Ground, bar, nav, toggles, toast, menu), `composer.css` (Raise composer).
- `guidelines/` - foundation specimen cards (Colors, Type, Spacing, Brand).
- `components/` - React primitives (below), each with `.d.ts` + `.prompt.md` and one card per folder.
- `ui_kits/app/` - the app click-through (see its README).
- `SKILL.md`, `github.md`, `thumbnail.html`.

### Components
- **system/** (new system - use these) - `PillButton`, `IconButton`, `Badge`, `Segmented`, `InfoPanel`, `BarsPanel`, `ScoreGauge`, `ScoreRow`, `StepTrack`, `DeskStrip`, `DecisionList`, `FeedPanel`, `ChatMessage`, `ProgressRail`
- **core/** (forms) - `Button`, `Field`, `Input`, `Divider`, `Skeleton`
- **dashboard/** - `Pill` (+`StatusTone`), `Avatar` (+`AvatarTone`, `Initials`), `Tile`, `Stats`, `Steps`, `Quote`, `Bars`, `Btn`, `Empty`
- **icons/** - `Icon` (+`IconPaths`)
- **shell/** - `Ground`, `ShellBar`, `NavPill`, `Wordmark`, `FilterChip`, `Toggle` (superseded by `PillButton`)
- **ideas/** - `RaiseComposer`

### Intentional additions
- `Input` - the source styles inputs with the global `nh-input` class rather than a component; wrapped for convenience.
- `Stats`, `Steps` - source has these as CSS patterns (`ui.stats`, SentView steps) inside views, not exported components.
- `Toggle`, `FilterChip` - the dark/white pill controls repeated across Feed, Inbox and Overview CSS.
- `NavPill`, `ShellBar`, `Wordmark` - split out of `SimpleShell.tsx`.
- `components/system/*` - lifted from the view CSS of IdeaDetail, OverviewIdea/OverviewChats, Feed and Raise (the repo keeps them inside views). The Segmented track and the turn rail were read from screenshots, not code.
