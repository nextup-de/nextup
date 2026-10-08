// What the raise page (components/ideas/Raise.tsx) reads off the benchmark: the rail's five points,
// the five analysis dials (the same five, in the chat and in the analysis), the advice line, the note
// under the coach's latest reply and the sidebar's "when" labels. Every value comes from the benchmark's
// own facts (benchmarks.ts) - the two dials it has no facts for yet (Cost, Risk) say so. Pure.
import { stripTags } from "@/features/assist/check";
import type { Turn } from "@/features/assist/draft";
import type { Benchmark, BenchmarkId, BenchmarkPart } from "./benchmarks";
import { isGibberish } from "./coach";

// ── The rail: what the person who decides needs before it is published ──────────────────────
// The same five points as the analysis dials, each with the one fact a decision cannot do without -
// not every question the benchmark asks: a photo, who else it helps or how far a number moves make an
// idea stronger, but none of them stops it from being published. A point is clear once the benchmark
// finds its fact, unknown when the author said they do not know yet; the first open one is next.
export type GapStatus = "clear" | "open" | "active" | "unknown";
// `id` is the benchmark's question (what a "not sure" skips), `need` the fact in a few words, `answer`
// the fact the benchmark found.
export type Gap = { id: string; key: DialKey; label: string; status: GapStatus; ask: string; need: string; answer: string | null };

export const RAIL: readonly { key: DialKey; label: string; ask: string; need: string; found: RegExp }[] = [
  { key: "value", label: "Value", ask: "Put a number on the upside (minutes, €, %).", need: "A number on what it saves", found: /^Upside has a number/ },
  { key: "feas", label: "Feasibility", ask: "Who would decide this?", need: "Who can decide it", found: /^Decided by / },
  { key: "cost", label: "Cost", ask: "Roughly what would it cost?", need: "A rough cost", found: /^(No spend|Within team authority|Above team authority)/ },
  { key: "fit", label: "Fit", ask: "Which company goal does it serve?", need: "The company goal it serves", found: /^Serves / },
  { key: "risk", label: "Risk", ask: "What is the smallest first step - a pilot, a one-week trial?", need: "A small first step to try it", found: /^Names a first step/ },
];

// A topic is keyed by its question; the "already raised" question names a case, so it keys on its start.
export const topicKey = (q: string) => (q.startsWith("Already raised") ? "Already raised" : q);

// Where each of the five stands now. Clear: the benchmark found its fact. Unknown: the author said they
// do not know yet. Active: the first one still open - the one to answer next.
export function railOf(parts: readonly BenchmarkPart[], unknown: readonly string[] = []): Gap[] {
  const found = parts.flatMap((p) => p.found);
  let next = true;
  return RAIL.map((r) => {
    const answer = found.find((f) => r.found.test(f)) ?? null;
    const status: GapStatus = answer ? "clear" : unknown.includes(r.ask) ? "unknown" : next ? "active" : "open";
    if (status === "active") next = false;
    return { id: r.ask, key: r.key, label: r.label, status, ask: r.ask, need: r.need, answer };
  });
}

// The benchmark as the coach should ask from it: the questions the author answered "not sure" to are
// left out, so the coach moves on instead of asking them again. The scores stay as they are.
export function withoutSkipped(b: Benchmark, skip: readonly string[]): Benchmark {
  if (!skip.length) return b;
  return { ...b, parts: b.parts.map((p) => ({ ...p, missing: p.missing.filter((m) => !skip.includes(topicKey(m))) })) };
}

// Edits made in the Idea view travel with the next message after this marker (components/ideas/Raise.tsx).
export const IDEA_UPDATE = "\n\nUpdated idea:\n";
export function splitUpdate(text: string): { said: string; updated: boolean } {
  const i = text.indexOf(IDEA_UPDATE);
  return i < 0 ? { said: text, updated: false } : { said: text.slice(0, i), updated: true };
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

// Cost reads the spend rule of Feasibility: no spend, within the team's authority, above it - or spend
// without an amount, which scores low until a rough figure is given.
function costDial(p: BenchmarkPart | undefined): Dial {
  const facts = p ? [...p.found, ...p.missing] : [];
  const has = (re: RegExp) => facts.some((f) => re.test(f));
  const [value, note] = has(/^No spend/) ? [85, "No spend needed."]
    : has(/^Within team authority/) ? [70, facts.find((f) => /^Within team authority/.test(f)) + "."]
    : has(/^Above team authority/) ? [40, "Above the team's spending authority - it needs a sign-off."]
    : [35, "It needs spending, but the amount is not stated yet - a rough figure moves this."];
  return { key: "cost", label: "Cost", value, note, basis: "Read from what the idea says it would spend, against the team's authority.", scored: !!p };
}

// Risk, where higher is safer like every other dial: read from facts the benchmark already has - a small
// first step and no spend lower it, spend above the team's authority and a wide reach raise it.
// Safety and quality checks are not part of it yet, and the basis says so.
export function riskDial(parts: readonly BenchmarkPart[]): Dial {
  const found = parts.flatMap((p) => p.found);
  const has = (re: RegExp) => found.some((f) => re.test(f));
  const people = Number(found.find((f) => / affected$/.test(f))?.match(/^\d+/)?.[0] ?? 0);
  const facts: [boolean, number, string][] = [
    [has(/^Names a first step/), 20, "starts small with a first step"],
    [has(/^No spend/), 10, "needs no spend"],
    [has(/^Above team authority/), -15, "spends above the team's authority"],
    [people >= 3, -10, "touches " + people + " people besides you"],
    [has(/^Reaches beyond one person/), -5, "reaches beyond one person"],
  ];
  const hit = facts.filter(([on]) => on);
  const value = Math.max(10, Math.min(95, 60 + hit.reduce((n, [, d]) => n + d, 0)));
  const level = value >= 70 ? "Low risk" : value >= 50 ? "Some risk" : "Higher risk";
  const lower = hit.filter(([, d]) => d > 0).map(([, , w]) => w), higher = hit.filter(([, d]) => d < 0).map(([, , w]) => w);
  const why = [lower.length ? "it " + lower.join(" and ") : "", higher.length ? (lower.length ? "but " : "it ") + higher.join(" and ") : ""].filter(Boolean).join(", ");
  return {
    key: "risk", label: "Risk", value, scored: true,
    note: level + (why ? ": " + why + "." : " - nothing in the idea raises or lowers it yet."),
    basis: "Read from the idea's first step, what it spends and how far it reaches. Safety and quality checks are not part of it yet - talk to your team lead if it changes a shift routine.",
  };
}

export function dialsOf(parts: readonly BenchmarkPart[]): Dial[] {
  return [
    fromPart("value", "Value", part(parts, "impact")),
    fromPart("feas", "Feasibility", part(parts, "feasibility")),
    costDial(part(parts, "feasibility")),
    fromPart("fit", "Fit", part(parts, "fit")),
    riskDial(parts),
  ];
}

// A dial in one word, for the chat's card - no numbers there, those stay in the analysis. Higher is
// better on every dial, so for Cost and Risk the word is the cost or the risk itself: high value, low cost.
export function levelOf(d: Dial): string {
  if (!d.scored) return "Not yet";
  const band = d.value >= 70 ? 2 : d.value >= 40 ? 1 : 0;
  return (d.key === "cost" || d.key === "risk" ? ["High", "Medium", "Low"] : ["Weak", "Medium", "Strong"])[band];
}

// The dials that got better from one reading of the idea to the next (the ▲ in the chat's card).
export function dialsUp(before: readonly Dial[], now: readonly Dial[]): DialKey[] {
  return now.filter((d) => d.value > (before.find((b) => b.key === d.key)?.value ?? d.value)).map((d) => d.key);
}

// ── Advice ────────────────────────────────────────────────────────────────────────────────────
export type Advice = { name: "Approve" | "Pilot" | "Needs info"; why: string };
export function adviceOf(overall: number, threshold: number, team: string): Advice {
  if (overall >= threshold) return { name: "Approve", why: "Strong enough to publish. The person who decides can act on it without more detail." };
  if (overall >= threshold - 15) return { name: "Pilot", why: "Try it for a few weeks with " + team + " and measure the result before rolling it out." };
  return { name: "Needs info", why: "Answer the open points on the right. The scores move as soon as you do." };
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

// The idea as it stands: the first message - or the author's last edit of it, sent with a message - and
// every answer since, added to its context one per line. An answer the page reads as "not sure" adds
// nothing, nor does keyboard mashing; the coach's words never do.
export function ideaNow(turns: readonly Turn[]): string {
  let idea: string | null = null;
  const added: string[] = [];
  for (const t of turns) {
    if (t.role !== "user") continue;
    if (idea === null) { idea = t.text; continue; }
    const at = t.text.indexOf(IDEA_UPDATE);
    if (at >= 0) { idea = t.text.slice(at + IDEA_UPDATE.length); added.length = 0; }
    const said = stripTags(at < 0 ? t.text : t.text.slice(0, at));
    if (said && !isUnsure(said) && !isGibberish(said)) added.push(said);
  }
  const { description, context } = splitIdea(idea ?? "");
  const all = [context.trim(), ...added].filter(Boolean).join("\n");
  return all ? description + "\n\n" + all : description;
}
