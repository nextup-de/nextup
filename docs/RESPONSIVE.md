# Fluid UI

> **Updated 2026-10-08** · reference: layout rules, the fluid size scale, and the checks that enforce them.

NextUp works on every screen at 100% browser zoom: phones, tablets, laptops, monitors. This page is
how it does that and the rules that keep it that way. Four checks enforce them: `npm run lint`
(Stylelint, runs in CI), `npm test` (`tests/unit/fluid.test.ts`, runs in CI), the screenshot sweep
(`tests/e2e/fluid.mjs`, run by hand) and the visual comparison (`npm run e2e:visual`, run by hand).

## Sizes: one fluid scale for every page

Text and layout spacing come from one scale, `src/styles/fluid.css`, generated with
[Utopia](https://utopia.fyi) by `scripts/fluid-tokens.mjs`. Every token is a `clamp()` that grows in a
straight line from a 360px phone to a 1920px monitor and stops at both ends - no jump at a breakpoint.
Pages pick a step; they never invent a size. That is what keeps pages consistent with each other: before
the scale each page scaled its own way, and one of them (px × 0.75 with a 12px floor) put labels, body
text and buttons all on 12px.

| Token | Phone → monitor | For |
|---|---|---|
| `--nh-fs-xs` | 12px | meta, tags, badges, timestamps - the floor |
| `--nh-fs-sm` | 12.5 → 13.5px | labels, secondary lines, small buttons |
| `--nh-fs-md` | 14 → 15px | body text, buttons, list titles |
| `--nh-fs-lg` | 15.5 → 17px | ledes, card headings |
| `--nh-fs-xl` | 18 → 21px | section headings, big numbers |
| `--nh-fs-2xl` | 21 → 26px | page headings |
| `--nh-fs-3xl` | 24 → 32px | the opened case's title |
| `--nh-fs-4xl` | 28 → 40px | display: sign-in, empty pages |
| `--nh-fs-input` | 16px | text fields on phones (rule 6) |

Spacing: `--nh-gap` (12 → 18px, between cards and columns), `--nh-pad-card` (16 → 27px, inside a main
card), `--nh-pad-card-sm` (16 → 18px, side cards), and Utopia's raw steps `--nh-sp-*` (`3xs` … `xl`, and
the fluid pairs `xs-s`, `s-m`, …). Small fixed gaps inside a component (4px between an icon and its
label) stay plain px.

- **Change the scale in the generator, never in `fluid.css`:** edit `scripts/fluid-tokens.mjs`, run
  `npm run fluid:tokens`. `npm test` fails when the file is stale, when a step dips under 12px, or when
  two neighbouring steps come within 0.5px of each other at any width (the hierarchy collapsing).
- **A design handed off at its own scale** (the overview and raise pages): keep the design's px for
  layout and multiply by a length, `calc(12 * var(--ux))`, where the page sets `--ux` once as a
  `clamp()` (see `team/Overview.module.css`, `ideas/Raise.module.css`). Its font sizes still come from
  the scale - map each one to the nearest step by the size it renders at on a laptop.
- **Something sized by its container** (a score tile) may use container units, floored at the scale:
  `clamp(var(--nh-fs-xs), 10cqmin, 15px)`.

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
