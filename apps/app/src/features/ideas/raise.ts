// What the raise page (components/ideas/Raise.tsx) reads off the benchmark: the progress rail's
// segments, the five analysis dials, the advice line, the note under the coach's latest reply and
// the sidebar's "when" labels. Every value comes from the benchmark's own facts (benchmarks.ts) -
// the two dials it has no facts for yet (Cost, Risk) say so. Pure.
import { weakest, type BenchmarkId, type BenchmarkPart } from "./benchmarks";

// ── The rail: one segment per point the benchmark checks ──────────────────────────────────────
export type GapStatus = "clear" | "open" | "active" | "unknown";
export type Gap = { id: string; bench: BenchmarkId; label: string; status: GapStatus; ask: string | null };

// Found points are clear; missing ones are questions still open. The point the coach asks about next
// (the first question of the weakest bar) is active. `unknown`: questions the author answered "not sure" to.
export function gapsOf(parts: readonly BenchmarkPart[], unknown: readonly string[] = []): Gap[] {
  const open = parts.filter((p) => p.missing.some((m) => !unknown.includes(m)));
  const next = weakest({ overall: 0, parts: open.map((p) => ({ ...p, missing: p.missing.filter((m) => !unknown.includes(m)) })), sameAs: null });
  const nextAsk = next?.missing.find((m) => !unknown.includes(m)) ?? null;
  return parts.flatMap((p) => [
    ...p.found.map((f, i): Gap => ({ id: p.id + ":f" + i, bench: p.id, label: f, status: "clear", ask: null })),
    ...p.missing.map((m): Gap => ({ id: p.id + ":" + m, bench: p.id, label: m, ask: m, status: m === nextAsk ? "active" : unknown.includes(m) ? "unknown" : "open" })),
  ]);
}

// An answer that says "I don't know": the active question becomes unknown, the coach moves on.
export const isUnsure = (text: string) => /\b(not sure|don.?t know|no idea|dunno|unknown|later)\b/i.test(text);

// ── The analysis dials ────────────────────────────────────────────────────────────────────────
export type DialKey = "value" | "feas" | "cost" | "fit" | "risk";
export type Dial = { key: DialKey; label: string; value: number; note: string; basis: string; scored: boolean };

const part = (parts: readonly BenchmarkPart[], id: BenchmarkId) => parts.find((p) => p.id === id);
const sentence = (xs: readonly string[]) => xs.map((x) => x.replace(/[.?]$/, "")).join(". ") + (xs.length ? "." : "");

function fromPart(key: DialKey, label: string, p: BenchmarkPart | undefined): Dial {
  if (!p) return { key, label, value: 0, note: "Not scored yet.", basis: "", scored: false };
  return {
    key, label, value: p.value, scored: true,
    note: p.found.length ? sentence(p.found) : "Nothing found for this yet.",
    basis: p.missing.length ? "Still open: " + sentence(p.missing) : "Every point this checks is covered.",
  };
}

// Cost reads the spend rule of Feasibility: no spend, within the team's authority, above it, or unknown.
function costDial(p: BenchmarkPart | undefined): Dial {
  const facts = p ? [...p.found, ...p.missing] : [];
  const has = (re: RegExp) => facts.some((f) => re.test(f));
  const [value, note] = has(/^No spend/) ? [85, "No spend needed."]
    : has(/^Within team authority/) ? [70, facts.find((f) => /^Within team authority/.test(f)) + "."]
    : has(/^Above team authority/) ? [40, "Above the team's spending authority - it needs a sign-off."]
    : [45, "The cost is not stated yet."];
  return { key: "cost", label: "Cost", value, note, basis: "Read from what the idea says it would spend, against the team's authority.", scored: true };
}

export function dialsOf(parts: readonly BenchmarkPart[]): Dial[] {
  return [
    fromPart("value", "Value", part(parts, "impact")),
    fromPart("feas", "Feasibility", part(parts, "feasibility")),
    costDial(part(parts, "feasibility")),
    fromPart("fit", "Fit", part(parts, "fit")),
    { key: "risk", label: "Risk", value: 50, scored: false, note: "Risk is not scored yet.", basis: "Safety and quality checks are not part of the benchmark yet - talk to your team lead if it changes a shift routine." },
  ];
}

// ── Advice, and the note under the coach's reply ──────────────────────────────────────────────
export type Advice = { name: "Approve" | "Pilot" | "Needs info"; why: string };
export function adviceOf(overall: number, threshold: number, team: string): Advice {
  if (overall >= threshold) return { name: "Approve", why: "Strong enough to publish. The person who decides can act on it without more detail." };
  if (overall >= threshold - 15) return { name: "Pilot", why: "Try it for a few weeks with " + team + " and measure the result before rolling it out." };
  return { name: "Needs info", why: "Answer the open questions on the right. The scores move as soon as you do." };
}

export function deltaNote(delta: Partial<Record<BenchmarkId, number>> | null, parts: readonly BenchmarkPart[]): string | null {
  if (!delta) return null;
  const up = parts.filter((p) => (delta[p.id] ?? 0) > 0).map((p) => p.label + " +" + delta[p.id]);
  return up.length ? up.join(" · ") : null;
}

// ── Labels ────────────────────────────────────────────────────────────────────────────────────
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const clock = (d: Date) => d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");

// "Now", "14:02" today, "Yesterday", "Mon" this week, "3 Oct" before.
export function whenLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (now.getTime() - d.getTime() < 60_000) return "Now";
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 86_400_000);
  if (days <= 0) return clock(d);
  if (days === 1) return "Yesterday";
  if (days < 7) return DAYS[d.getDay()];
  return d.getDate() + " " + MONTHS[d.getMonth()];
}
export const clockLabel = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : clock(d); };

// "Raise it, Sam": the first name when there is one, the whole name when it starts with an initial.
export const greetName = (name: string) => { const first = name.trim().split(/\s+/)[0] ?? ""; return first.endsWith(".") || !first ? name : first; };

export const initials = (name: string) => {
  const t = name.replace(/[^A-Za-zÀ-ÿ ]/g, " ").trim().split(/\s+/).filter(Boolean);
  return t.length ? (t[0][0] + (t.length > 1 ? t[t.length - 1][0] : "")).toUpperCase() : "?";
};

// The idea as the author wrote it: the first message is the description, what follows a blank line is context.
export function splitIdea(first: string): { description: string; context: string } {
  const [description = "", ...rest] = first.split("\n\n");
  return { description, context: rest.join("\n\n") };
}
