// The colour rules in one place: stylelint.config.mjs, the codemod and tests/unit/design/colors.test.ts read them.
// "Black" means a fill: dark text stays. A blue is only ever a token, so the blue can be changed in tokens.css.

/** Hex and token values that make a black or near-black fill. */
export const BLACK_FILL_VALUES = ["#000", "#000000", "#111", "#111111", "#141414", "#1a1a17", "#1c1c1e", "#232320", "#2c2c2e"];
export const BLACK_FILL_TOKENS = ["--nh-ink", "--nh-dark", "--nh-dark-2", "--nh-black"];

/** Blues that must be tokens. */
export const BLUE_VALUES = ["#007aff", "#0062cc", "#0b70d1", "#085dae", "#064b8c", "#1286fc", "#2563eb"];
const BLUE_RGB = ["0 122 255", "0, 122, 255", "11 112 209", "11, 112, 209", "37 99 235", "37, 99, 235"];

const alt = (values) => values.map((v) => v.replace(/[#.]/g, "\\$&")).join("|");

/** Stylelint patterns. A hex value ends where the next character is not a hex digit. */
export const BLACK_FILL_PATTERNS = [`/(${alt(BLACK_FILL_VALUES)})(?![0-9a-fA-F])/i`, `/var\\(\\s*(${BLACK_FILL_TOKENS.join("|")})\\s*[,)]/`];
export const BLUE_PATTERNS = [`/(${alt(BLUE_VALUES)})(?![0-9a-fA-F])/i`, `/rgba?\\(\\s*(${BLUE_RGB.join("|")})/`];

/** The same two checks for the codemod and the unit test: one regular expression per kind. */
export const blackFillDeclaration = new RegExp(`background(?:-color)?\\s*:[^;}]*(?:(?:${alt(BLACK_FILL_VALUES)})(?![0-9a-fA-F])|var\\(\\s*(?:${BLACK_FILL_TOKENS.join("|")})\\s*[,)])`, "gi");
export const blueLiteral = new RegExp(`(?:${alt(BLUE_VALUES)})(?![0-9a-fA-F])|rgba?\\(\\s*(?:${BLUE_RGB.join("|")})`, "gi");

/** Exact swaps with one safe answer. Black fills are not here: a person decides those. */
export const LITERAL_TO_TOKEN = [
  ["#007aff", "var(--nh-brand)"],
  ["#0b70d1", "var(--nh-brand)"],
  ["#2563eb", "var(--nh-brand)"],
  ["#085dae", "var(--nh-brand-hover)"],
  ["#064b8c", "var(--nh-brand-active)"],
  ["#0062cc", "var(--nh-brand-ink)"],
  ["#e8f1ff", "var(--nh-brand-tint)"],
  ["#eaf3ff", "var(--nh-brand-tint)"],
  ["#b8d9ff", "var(--nh-brand-line)"],
  ["#1b1d22", "var(--nh-ink)"],
  ["#3a3a3c", "var(--nh-ink-2)"],
  ["#6e6e73", "var(--nh-mute)"],
  ["#8e8e93", "var(--nh-mute-2)"],
  ["#c7c7cc", "var(--nh-ghost)"],
  ["#e5e5ea", "var(--nh-line)"],
  ["#d1d1d6", "var(--nh-line-2)"],
  ["#f0f0f3", "var(--nh-line-soft)"],
  ["#f2f2f7", "var(--nh-fill)"],
  ["#eceef2", "var(--nh-fill-2)"],
  ["#e0e3e8", "var(--nh-fill-3)"],
  ["#f7f7f9", "var(--nh-surface)"],
  ["#1f7a3a", "var(--nh-ok)"],
  ["#eaf8ee", "var(--nh-ok-tint)"],
  ["#d70015", "var(--nh-danger)"],
  ["#fff5f5", "var(--nh-danger-tint)"],
  ["#9a5300", "var(--nh-warn)"],
  ["#fff1dc", "var(--nh-warn-tint)"],
];
