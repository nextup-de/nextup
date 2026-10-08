# Fluid UI

> **Updated 2026-10-08** · reference: layout rules, the size scale, and the checks that enforce them.

NextUp works on every screen at 100% browser zoom: phones, tablets, laptops, monitors. This page is
how it does that and the rules that keep it that way. Four checks enforce them: `npm run lint`
(Stylelint, runs in CI), `npm test` (`tests/unit/fluid.test.ts`, runs in CI), the screenshot sweep
(`tests/e2e/fluid.mjs`, run by hand) and the visual comparison (`npm run e2e:visual`, run by hand).

## Sizes: real sizes, one scale for every page

Text has fixed sizes, the same on every screen: nothing is multiplied by a page factor and nothing
grows with the window. A wider screen gets more room around the page, not bigger text or bigger boxes.
Pages pick a step from the scale in `src/styles/tokens.css`; they never invent a size. That keeps pages
consistent with each other: before the scale each page scaled its own way, and one of them (px × 0.75
with a 12px floor) put labels, body text and buttons all on 12px.

| Token | Size | For |
|---|---|---|
| `--nh-fs-xs` | 12px | meta, tags, badges, timestamps - the floor |
| `--nh-fs-sm` | 13px | labels, secondary lines, small buttons |
| `--nh-fs-md` | 15px | body text, buttons, list titles |
| `--nh-fs-lg` | 17px | ledes, card headings |
| `--nh-fs-xl` | 20px | section headings, big numbers |
| `--nh-fs-2xl` | 24px | page headings, score numbers |
| `--nh-fs-3xl` | 28px | the opened case's title |
| `--nh-fs-4xl` | 34px | display: sign-in, empty pages |
| `--nh-fs-input` | 16px | text fields on phones (rule 6) |

Spacing is fixed too: `--nh-gap` (16px, between cards and columns), `--nh-pad-card` (24px, inside a
main card), `--nh-pad-card-sm` (18px, side cards). The page gutter `--nh-page-x` is 56px, 32px on
tablets and 16px on phones - a step per kind of screen, never a share of the window. Small gaps inside a
component (4px between an icon and its label) are plain px.

- **Change a size in `tokens.css`.** `npm test` fails when a step is not plain px, dips under 12px, or
  comes within 1px of its neighbour (the hierarchy collapsing).
- **A design handed off in px** (the overview and raise pages): use its px as they are, on every screen.
  No multiplier (`calc(12 * var(--u))`), no `clamp()` on `vw`: *checked by `npm test`*. Map each font
  size to the nearest step.
- **Something sized by its container** (a score tile's ring) may use container units for the graphic;
  its text still uses a step.

## How it works

- **Real pixels, no page scale.** Every size is what it says, on every browser. There is no CSS
  `zoom` anywhere: Safari computes zoomed lengths differently from Chrome and Firefox, which pushed
  layouts off screen (the open inbox) and shrank text. *Checked by `npm test`.*
- **Layouts adapt per breakpoint** in each `*.module.css` (`760px` = phone, `900px` = narrow tablet,
  `480px` = small phone), with fluid widths (`min()`, `clamp()`, `minmax(0, 1fr)`) in between.

## Rules

1. **Full-screen sizes: `var(--nh-screen-h)` / `var(--nh-screen-w)`, never `100vh`, `100dvh`, `100vw`.**
   One place defines the viewport (`src/styles/tokens.css`), so it can change in one place.
   *Checked by `npm test`.* An image's `sizes="…100vw"` is a download hint, not layout - that is fine.
2. **Mouse and rect maths use the numbers as they come.** `clientX` and `getBoundingClientRect()` are in
   the same pixels as widths and `translate()` - no conversion.
3. **No fixed widths on containers.** `max-width`, `min(420px, 100%)`, `minmax(0, 1fr)`. Flex and
   grid children that hold text get `min-width: 0`, so a long word wraps instead of pushing the page wider.
4. **Choose column counts on purpose.** 4 → 2 → 1 at breakpoints. `repeat(auto-fit, minmax(…))`
   is fine for a list of equal cards; for a fixed set (four steps, three tiers) it leaves an orphan
   row (3 + 1) at some width.
5. **Nothing past the screen edge.** Glows, shadows and absolutely placed decorations must stay
   inside the page (the shell clips sideways overflow in its content; a glow at the bottom of a
   phone screen still makes the page taller - see `.aura` on the raise page).
6. **Phones: thumb and keyboard.** Keep inputs near the top - the on-screen keyboard covers the
   bottom half. Inputs use 16px text (smaller makes iOS zoom in on focus). Popovers open where
   there is room.
7. **Text stays readable.** Nothing below 12px. *Checked by `npm test`.*
8. **Font sizes come from the scale.** `font-size: var(--nh-fs-…)` in CSS, `fontSize: "var(--nh-fs-…)"`
   inline - never a raw px, rem or calc. *Checked by `npm run lint` (Stylelint) and `npm test`.*
9. **A narrow container decides its own layout.** When a block's width depends on something other
   than the screen (a sidebar that opens, a column that shares the row), switch its layout with a
   container query on the block (`container-type: inline-size` + `@container`), not a screen
   breakpoint - see `.how` on the raise page.
10. **Nothing scales with the screen.** No page multiplier (`--u`, `--ux`), no padding, gap or text in
    `vw`, `vh` or `cqmin`, no `clamp()` on the window. Use the design's px; give phones and tablets
    their own px in a breakpoint when they need it. *Checked by `npm test`.*

## Before you say a change is done

- `npm run lint` and `npm test` pass (the rules above).
- Your page at 100% browser zoom on four sizes - DevTools device toolbar or Responsively:
  a phone (390×844), a tablet (768×1024), a laptop (1366×657), a monitor (1920×960).
- A new page or a reworked layout: add it to `PAGES` in `tests/e2e/fluid.mjs` and run the sweep
  (`npm run dev` in another terminal, then `node tests/e2e/fluid.mjs --only=<your page>`). It fails on
  sideways scroll, anything past the screen edge, console errors, and a page that must fit one
  screen (the raise page) but scrolls. Screenshots of every size land in your temp folder.
- A change to one of the main pages: before you start, record the approved screenshots with
  `npm run e2e:visual -- --update-snapshots` (`npm run dev` in another terminal); after the change, run
  `npm run e2e:visual`. It fails on every page × size that moved; look at the diffs in the report, and
  when they are what you wanted, approve them with the same `--update-snapshots`. The screenshots stay on
  your machine (git-ignored): fonts render differently per operating system.
