# One scale for Paper and the app

> **Decided 2026-11-27 (Kevin).** Paper and the app use the same sizes, spacing, colours and font, under the same
> token names. `apps/app/src/styles/tokens.css` is the source; Paper's tokens are copied from it. Every Paper frame
> is checked before it is built.

## Why

Designs looked right in Paper and wrong once built. Measured on 27 Nov 2026 over 70 Paper screens and the app's CSS:

- **Two type scales.** Paper's screens used 14px for 15% of all text, plus 11, 10 and 9px. The app allowed none of
  them, so every lane rounded on its own, and rows, line heights and alignment drifted.
- **No spacing scale.** 4,350 paddings, margins and gaps in the app, 5% on a token, 64 different px values
  (4.5, 7.5, 10.5 left over from the old ×0.75 page scale).
- **Another font.** Most text in Paper was `system-ui` (San Francisco on a Mac); the app is Inter.
- **Other colours under the same names.** Paper's `--nh-ink`, `--nh-ink-2`, `--nh-mute`, `--nh-line` and others
  still held the old warm greys; `--nh-font` was Manrope.
- **No check against Paper.** The visual test compares the app with its own last screenshot, never with the frame.

## The scale

**Type.** Inter (IBM Plex Mono for codes). Each size has a line height for a line of UI (rows, buttons, labels) and
a looser one for running text that wraps.

| Token | Size | UI line | Text line | For |
|---|---|---|---|---|
| `--nh-fs-xs` | 12 | 16 | 18 | meta, tags, badges, timestamps (the floor) |
| `--nh-fs-sm` | 13 | 16 | 20 | labels, secondary lines, small buttons |
| `--nh-fs-ui` | 14 | 18 | 20 | dense UI: list rows, menus, nav, side panels |
| `--nh-fs-md` | 15 | 18 | 22 | body text, buttons, list titles |
| `--nh-fs-input` | 16 | 20 | 24 | text fields on phones |
| `--nh-fs-lg` | 17 | 22 | 24 | ledes, card headings |
| `--nh-fs-xl` | 20 | 24 | 28 | section headings, big numbers |
| `--nh-fs-2xl` | 24 | 30 | | list card titles |
| `--nh-fs-3xl` | 28 | 34 | | page titles |
| `--nh-fs-4xl` | 34 | 40 | | display: sign-in, empty pages |

Line heights are `--nh-lh-<size>` and `--nh-lh-<size>-text` (`--nh-lh-ui: 18px`, `--nh-lh-ui-text: 20px`).

**Spacing.** padding, margin and gap use only these, named by their size: `var(--nh-sp-12)` is 12px.

`2 · 4 · 6 · 8 · 10 · 12 · 14 · 16 · 18 · 20 · 24 · 28 · 32 · 40 · 48 · 56 · 64 · 80 · 96 · 128`

Also allowed: `0`, and `1px` for a hairline nudge next to a border. A length over 160px in a padding or margin is a
layout width (a centred column), not a space, and is left alone. Named spaces stay and point at a step:
`--nh-gap` (16), `--nh-pad-card` (24), `--nh-pad-card-sm` (18), `--nh-page-x` (56 / 32 / 16).
The scale hits 81% of Paper's spacing values and 86% of the app's exactly, 98% within 1px. A pure 4px grid would
have hit about half.

**Between steps:** nearest step, a tie goes up (13 → 14, 7.5 → 8, 4.5 → 4). Every tool below uses that one rule
(`scripts/design/scale.mjs`).

**Radius:** `--radius-xs` 6, `--radius-sm` 8, `--radius-md` 12, `--radius-full`. **Colour:** only tokens.

## Where it is enforced

| What | Check |
|---|---|
| Font sizes in CSS are steps | Stylelint (`scale-unlimited/declaration-strict-value`) |
| padding, margin, gap in CSS are steps | Stylelint `nextup/spacing-scale` (`scripts/design/stylelint-spacing.mjs`): the error names the step to use |
| Inline styles in components, the scale itself, every `--nh-sp-N` exists | `tests/unit/design/spacing.test.ts` |
| A Paper frame is on the scale | `npm run paper:check -- <nodeId>` (needs the Paper app open; not in CI) |
| Paper's tokens equal tokens.css | `npm run paper:sync-tokens -- --dry` prints any difference |

Fix CSS that the lint rejects in one go: `npm run design:spacing-fix -w @nextup/app` (all of `src/`) or
`... -- path/a.module.css` (some files). `-- --check` lists what it would change.

## From Paper to code, every time

1. **Check the frame.** `npm run paper:check -w @nextup/app -- <nodeId>` for each frame the task names. It lists
   what is off the scale (with the value to use instead) and raw values that equal a token.
2. **Off the scale?** The lane builds with the value on the right of each line, never its own rounding, and goes on.
   A designer (or Kevin) runs `npm run paper:fix -- <nodeId>` to write the same fixes into the frame; lanes never
   write to Paper. Radius and unknown colours need a person: the check says which.
3. **Build with tokens only.** Every size, line height, space, radius and colour is a `var(--…)` from tokens.css,
   the one the check named.
4. **Paste the check's summary into the PR** (the first line and the "Off the scale" block), with a screenshot of
   the built page next to the Paper frame at the frame's width (docs/DESIGN_RULES.md §6).
5. **A token changed in tokens.css?** Run `npm run paper:sync-tokens` in the same PR, so Paper shows it too.

Paper-only tokens (`--nh-dark*`, `--nh-serif`, `--nh-inter`, the landing's `--lp-*`) are left alone by the sync; an
app frame that uses one fails the check.
