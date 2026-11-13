// A company's own prices for the models it calls (decision Q7.5), in euros per million tokens. Pure. They live in the
// AI settings (Integration "ai", settings.prices) and are typed on /admin/connectors as one line per model:
//
//   gpt-4.1-mini 0.42 1.68        name, then the price of a million input tokens, then of a million output tokens
//
// The name is the one the provider reports and the usage rows carry (Azure: the model version, not the deployment).
// A name covers every recorded name that contains it, so "gpt-4.1-mini" prices "gpt-4.1-mini-2025-04-14"; where two
// names fit, the longer one wins.

export type ModelPrice = { in: number; out: number };
/** Name (lower case) to EUR per million input and output tokens. */
export type ModelPrices = Record<string, ModelPrice>;

export const MAX_PRICES = 20;
export const MAX_PRICE_NAME = 200;
export const MAX_PRICE_EUR = 10_000;

// Any name without whitespace: providers report paths ("/models/mistral-nemo"), "@cf/..." ids, ARNs, tags.
const NAME = /^\S+$/;
const AMOUNT = /^\d{1,5}([.,]\d{1,4})?$/;
// "1.000" or "1,000" is a thousand to one reader and one to another: refused rather than guessed.
const THOUSANDS = /^[1-9]\d{0,2}[.,]\d{3}$/;

const norm = (name: string): string => name.trim().toLowerCase();

const amountOf = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && AMOUNT.test(v.trim()) && !THOUSANDS.test(v.trim()) ? Number(v.trim().replace(",", ".")) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= MAX_PRICE_EUR ? Math.round(n * 10_000) / 10_000 : null;
};

const nameOf = (v: unknown): string | null => {
  const n = typeof v === "string" ? norm(v) : "";
  return n && n.length <= MAX_PRICE_NAME && NAME.test(n) ? n : null;
};

/** The stored map as it may be trusted: bad entries dropped, at most MAX_PRICES, names lower case. Never throws. */
export function pricesOf(raw: unknown): ModelPrices {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ModelPrices = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_PRICES) break;
    const name = nameOf(k);
    const p = v && typeof v === "object" ? (v as Record<string, unknown>) : null;
    const i = amountOf(p?.in);
    const o = amountOf(p?.out);
    if (name && i !== null && o !== null) out[name] = { in: i, out: o };
  }
  return out;
}

export type ParsedPrices = { ok: true; prices: ModelPrices } | { ok: false; line: number };

/**
 * The form's text: one model per line, "name in out", spaces or tabs between, a decimal point or comma. Empty lines
 * are skipped; a name typed twice keeps the last line. The first line that does not read is refused by its number.
 */
export function parsePriceLines(text: string): ParsedPrices {
  const prices: ModelPrices = {};
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;
    const name = parts.length === 3 ? nameOf(parts[0]) : null;
    const pin = parts.length === 3 ? amountOf(parts[1]) : null;
    const pout = parts.length === 3 ? amountOf(parts[2]) : null;
    if (name === null || pin === null || pout === null) return { ok: false, line: i + 1 };
    prices[name] = { in: pin, out: pout };
    if (Object.keys(prices).length > MAX_PRICES) return { ok: false, line: i + 1 };
  }
  return { ok: true, prices };
}

/** The map back as the form's text, sorted by name. */
export function priceLines(prices: ModelPrices | undefined): string {
  return Object.keys(prices ?? {})
    .sort()
    .map((name) => `${name} ${prices![name].in} ${prices![name].out}`)
    .join("\n");
}

/** The company's price for a recorded model name: the longest name that the recorded one contains, or null. */
export function priceFor(model: string, prices: ModelPrices | undefined): ModelPrice | null {
  const m = norm(model);
  if (!m || !prices) return null;
  let best: string | null = null;
  for (const name of Object.keys(prices)) {
    if (m.includes(name) && (best === null || name.length > best.length)) best = name;
  }
  return best === null ? null : prices[best];
}

/** EUR for these tokens at this price, rounded to 4 decimals. */
export const costAt = (p: ModelPrice, tokensIn: number, tokensOut: number): number =>
  Math.round(((tokensIn * p.in + tokensOut * p.out) / 1_000_000) * 10_000) / 10_000;
