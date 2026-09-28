# Fluid UI

NextUp works on every screen at 100% browser zoom: phones, tablets, laptops, monitors. This page is
how it does that and the rules that keep it that way. Two checks enforce them: `npm test`
(`tests/unit/fluid.test.ts`, runs in CI) and the screenshot sweep (`tests/e2e/fluid.mjs`, run by hand).

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
7. **Text stays readable.** Nothing below 12px.

## Before you say a change is done

- `npm test` passes (the rules above).
- Your page at 100% browser zoom on four sizes - DevTools device toolbar or Responsively:
  a phone (390×844), a tablet (768×1024), a laptop (1366×657), a monitor (1920×960).
- A new page or a reworked layout: add it to `PAGES` in `tests/e2e/fluid.mjs` and run the sweep
  (`npm run dev` in another terminal, then `node tests/e2e/fluid.mjs --only=<your page>`). It fails on
  sideways scroll, anything past the screen edge, console errors, and a page that must fit one
  screen (the raise page) but scrolls. Screenshots of every size land in your temp folder.
