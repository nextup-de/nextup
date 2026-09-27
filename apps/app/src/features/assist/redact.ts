// What leaves the app for the model, and what the audit table keeps: the text with personal data
// and secrets replaced, and a verdict on classification markers. Pure. docs/ASSISTANT.md.
//
// Runs twice per turn: on the question before it is sent, and on the answer before it is shown
// or stored (check.ts). Patterns err towards redacting - a masked part number costs a re-read,
// a leaked IBAN costs a finding in the audit.
import { rank, type Level } from "./classify";

export type HitKind = "secret" | "email" | "iban" | "card" | "vin" | "phone" | "custom" | "name";
export type Hits = Partial<Record<HitKind, number>>;

export type RedactOptions = {
  /** People the company knows, each replaced by their role - the model sees roles, not names. */
  people?: readonly { name: string; role: string }[];
  /** Company-specific patterns (regex source), e.g. prototype codes "PT-\\d{4}". Bad ones are skipped. */
  patterns?: readonly string[];
};

export type Redaction = {
  text: string;
  hits: Hits;
  /** The highest classification marker found in the text, if any. */
  marker: Level | null;
};

const MASK: Record<HitKind, string> = {
  secret: "[secret]", email: "[email]", iban: "[iban]", card: "[card number]",
  vin: "[vehicle id]", phone: "[phone]", custom: "[restricted]", name: "",
};

const digits = (s: string) => s.replace(/\D/g, "").length;

function luhn(num: string): boolean {
  const d = num.replace(/\D/g, "");
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return d.length >= 13 && sum % 10 === 0;
}

// Order matters: secrets and emails first, so a token inside an email-looking string goes as one.
const RULES: { kind: HitKind; re: RegExp; keep?: (m: string) => boolean }[] = [
  { kind: "secret", re: /\b(?:sk-(?:ant-)?|nxt_|AKIA|ASIA|ghp_|gho_|xox[abp]-)[A-Za-z0-9_-]{10,}/g },
  { kind: "secret", re: /\b(?:password|passwort|kennwort|pwd|pin)\s*[:=]\s*\S+/gi },
  { kind: "secret", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g },
  { kind: "email", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { kind: "iban", re: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/g },
  { kind: "card", re: /\b(?:\d[ -]?){12,18}\d\b/g, keep: luhn },
  // A VIN: 17 characters, no I/O/Q, letters AND digits (a 17-digit order number is not one).
  { kind: "vin", re: /\b[A-HJ-NPR-Z0-9]{17}\b/g, keep: (m) => /[A-Z]/.test(m) && /\d/.test(m) },
  { kind: "phone", re: /(?:\+|\b00|\b0)\d[\d ()/.-]{5,}\d\b/g, keep: (m) => digits(m) >= 8 && digits(m) <= 15 && !/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(m.trim()) },
];

// Strongest first: "streng vertraulich" must not be read as plain "vertraulich".
const MARKERS: { level: Level; re: RegExp }[] = [
  { level: "strictly_confidential", re: /\b(?:streng\s+vertraulich|strictly\s+confidential|streng\s+geheim|top\s+secret|geheim)\b/i },
  { level: "confidential", re: /\b(?:vertraulich|confidential)\b/i },
];

export function markerOf(text: string): Level | null {
  return MARKERS.find((m) => m.re.test(text))?.level ?? null;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compile(source: string): RegExp | null {
  try { return new RegExp(source, "gi"); } catch { return null; }
}

export function redact(input: string, opts: RedactOptions = {}): Redaction {
  const hits: Hits = {};
  const count = (k: HitKind) => { hits[k] = (hits[k] ?? 0) + 1; };
  let text = input;

  const apply = (kind: HitKind, re: RegExp, to: (m: string) => string, keep?: (m: string) => boolean) => {
    text = text.replace(re, (m) => {
      if (keep && !keep(m)) return m;
      count(kind);
      return to(m);
    });
  };

  for (const r of RULES) apply(r.kind, r.re, () => MASK[r.kind], r.keep);
  for (const p of opts.patterns ?? []) {
    const re = compile(p);
    if (re) apply("custom", re, () => MASK.custom);
  }
  // Longest names first, so "Tom Vogel-Berg" is not half-replaced by "Tom Vogel".
  const people = [...(opts.people ?? [])].filter((p) => p.name.trim().length > 2).sort((a, b) => b.name.length - a.name.length);
  for (const p of people) {
    apply("name", new RegExp(`(?<![\\p{L}])${escape(p.name)}(?![\\p{L}])`, "giu"), () => `[${p.role || "a colleague"}]`);
  }

  return { text, hits, marker: markerOf(input) };
}

/** True when the text says it is more sensitive than the company lets the assistant see. */
export function isAboveCeiling(r: Redaction, ceiling: Level): boolean {
  return r.marker !== null && rank(r.marker) > rank(ceiling);
}

export function hitCount(h: Hits): number {
  return Object.values(h).reduce((a, b) => a + (b ?? 0), 0);
}
