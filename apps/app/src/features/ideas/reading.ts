// The model's reading of an idea (services/brain, POST /v1/read): five dials, what it found, the
// advice, the routing row, earlier items and what is still open. The raise page shows this wherever
// the stack has a model; the keyword benchmark (benchmarks.ts) only answers when it has none or it
// failed. This file is the pure half: what goes out, what is kept, and how the page reads it.
import { z } from "zod";
import { DEFAULT_LOCALE, translate, type Locale, type MessageKey } from "@/i18n";
import type { Route, Dept } from "@/features/demo/types";
import type { BrainItem, BrainProposal } from "@/features/routing/brain";
import { brainRequest } from "@/features/routing/brain";
import type { Advice, Dial, DialKey, GapStatus, Topic } from "./raise";

const READ_DIALS = ["value", "feasibility", "cost", "fit", "risk"] as const;
const Score = z.number().int().min(0).max(100);

export const BrainReading = z.object({
  dials: z.array(z.object({ key: z.enum(READ_DIALS), score: Score, note: z.string().max(1000), basis: z.string().max(600) })).length(READ_DIALS.length),
  overall: Score,
  summary: z.string().max(1200),
  advice: z.enum(["approve", "pilot", "info"]),
  advice_why: z.string().max(600),
  pattern: z.string().max(600),
  route_id: z.string().max(40).nullable(),
  route_reason: z.string().max(600),
  same_as: z.string().max(40).nullable(),
  related: z.string().max(40).nullable(),
  open: z.array(z.string().max(400)).max(8),
  model: z.string().max(200),
  version: z.string().max(80),
});
export type BrainReading = z.infer<typeof BrainReading>;

// What is kept with the turn: the brain's answer, with the earlier items by title (they are gone from
// the request by the time the page shows them) and how many it was checked against.
export const Reading = BrainReading.extend({
  similar: z.array(z.object({ id: z.string().max(40), title: z.string().max(300), status: z.string().max(40), same: z.boolean() })).max(2),
  checked: z.number().int().min(0),
});
export type Reading = z.infer<typeof Reading>;

export const COACH_MAX_OPEN = 8;
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export type ReadExtras = { goals: readonly { goal: string }[]; affected: number; attachments: number; spendLimitEur: number | null; skip: readonly string[]; previous: Reading | null };

export const goalsOut = (goals: readonly { goal: string }[]) => goals.filter((g) => g.goal.trim()).slice(0, 20).map((g) => ({ name: clip(g.goal, 200), kpi: "" }));

export function readRequest(company: string, idea: { title: string; body: string }, routes: readonly Route[], depts: readonly Dept[], known: readonly BrainItem[], x: ReadExtras) {
  return {
    ...brainRequest(company, idea, routes, depts, known),
    goals: goalsOut(x.goals),
    affected: Math.min(x.affected, 50),
    attachments: Math.min(x.attachments, 20),
    spend_limit_eur: x.spendLimitEur,
    skip: x.skip.slice(0, 20).map((q) => clip(q, 300)),
    previous: x.previous ? dialBriefs(x.previous) : [],
  };
}

const dialBriefs = (r: Reading) => r.dials.map((d) => ({ key: d.key, score: d.score, note: clip(d.note, 500) }));

// What the coach is told, so it works from the same judgement the page shows.
export const coachReading = (r: Reading) => ({
  summary: clip(r.summary, 800), dials: dialBriefs(r), open: r.open.slice(0, COACH_MAX_OPEN).map((q) => clip(q, 300)), same_as: r.same_as,
});

// The reading's words as they may go back out to a model: the same masking as the idea's own text. It
// was written from masked text, but it is stored, and the company's people and patterns change. Null
// when anything in it reads as above the company's ceiling.
export function maskedReading(r: Reading, cleanAll: (texts: readonly string[]) => string[] | null): Reading | null {
  const out = cleanAll([r.summary, ...r.dials.map((d) => d.note), ...r.open]);
  if (!out) return null;
  return { ...r, summary: out[0], dials: r.dials.map((d, i) => ({ ...d, note: out[i + 1] })), open: out.slice(1 + r.dials.length) };
}

// Checks the answer against what was sent: a row or an item the request did not contain is dropped.
export function readingFrom(a: BrainReading, req: { routes: readonly { id: string }[]; known: readonly BrainItem[] }): Reading {
  const item = (id: string | null, same: boolean) => {
    const k = id ? req.known.find((x) => x.id === id) : null;
    return k ? [{ id: k.id, title: k.title, status: k.status, same }] : [];
  };
  const same_as = req.known.some((k) => k.id === a.same_as) ? a.same_as : null;
  const related = req.known.some((k) => k.id === a.related) ? a.related : null;
  return {
    ...a,
    route_id: req.routes.some((r) => r.id === a.route_id) ? a.route_id : null,
    same_as, related,
    similar: [...item(same_as, true), ...item(related, false)],
    checked: req.known.length,
  };
}

// A kept reading, or null for anything else: a stored row is never trusted to have the current shape.
export function readingOf(raw: unknown): Reading | null {
  const r = Reading.safeParse(raw);
  return r.success ? r.data : null;
}

// The newest reading of a conversation: null when the latest reply came without one (the model failed).
export function latestReading(turns: readonly { role: string; reading?: Reading | null }[]): Reading | null {
  for (let i = turns.length - 1; i >= 0; i--) if (turns[i].role === "assistant") return turns[i].reading ?? null;
  return null;
}

// The newest reading anywhere in the conversation, for what compares against the last one: the model's
// next reading and its movement. A reply without a reading in between does not reset that comparison.
export function newestReading(turns: readonly { reading?: Reading | null }[]): Reading | null {
  for (let i = turns.length - 1; i >= 0; i--) if (turns[i].reading) return turns[i].reading ?? null;
  return null;
}

// How far the overall moved with this message, like with like: a reading against the last reading, the
// benchmark against itself. The two are different scales, so a first reading has moved nothing yet.
export const overallDelta = (benchmark: number, reading: Reading | null, last: Reading | null): number =>
  reading ? (last ? reading.overall - last.overall : 0) : benchmark;

// The reply when the read worked and the coach did not: the reading's own words, no new model call. The
// offline coach (coachMock) speaks in benchmark points, which would contradict the number on the page.
export function readingReply(r: Reading): string {
  return [r.summary.trim(), (r.open[0] ?? r.advice_why).trim()].filter(Boolean).join("\n\n");
}

// What the assistant model is told when it stands in for the coach: the reading's numbers, as coachBrief
// does with the benchmark's. Keys and numbers only, so nothing here needs masking.
export function readingBrief(r: Reading, threshold: number): string {
  const weakest = r.dials.reduce((a, b) => (b.score < a.score ? b : a));
  return [
    `The idea scores ${r.overall}/100; it can be published at ${threshold}. The scores are computed, not yours to change - never state a different number.`,
    ...r.dials.map((d) => `- ${d.key}: ${d.score}/100`),
    r.open.length ? `Ask exactly one short, challenging question that would raise "${weakest.key}". Do not answer it yourself.` : "Tell them it is ready for the person who decides.",
  ].join("\n");
}

// The routing as the page's evaluation takes it (features/evaluate): the same shape as a brain proposal.
export const proposalOf = (r: Reading): BrainProposal => ({
  proposal: { routeId: r.route_id, confidence: r.route_id ? 80 : 0, source: "llm", version: r.version },
  reason: r.route_reason, sameAs: r.same_as, related: r.related,
});

const DIAL_OF: Record<(typeof READ_DIALS)[number], { key: DialKey; label: MessageKey }> = {
  value: { key: "value", label: "ideas.dialValue" },
  feasibility: { key: "feas", label: "ideas.dialFeas" },
  cost: { key: "cost", label: "ideas.dialCost" },
  fit: { key: "fit", label: "ideas.dialFit" },
  risk: { key: "risk", label: "ideas.dialRisk" },
};

export const dialsFromReading = (r: Reading, locale: Locale = DEFAULT_LOCALE): Dial[] =>
  r.dials.map((d) => ({ key: DIAL_OF[d.key].key, label: translate(locale, DIAL_OF[d.key].label), value: d.score, note: d.note, basis: d.basis, scored: true }));

const ADVICE_NAME: Record<Reading["advice"], MessageKey> = { approve: "ideas.adviceApprove", pilot: "ideas.advicePilot", info: "ideas.adviceInfo" };
export const adviceFromReading = (r: Reading, locale: Locale = DEFAULT_LOCALE): Advice =>
  ({ id: r.advice, name: translate(locale, ADVICE_NAME[r.advice]), why: r.advice_why });

// The rail and "Still unclear": what the reading finds open, the first one being the one to answer next.
export function gapsFromReading(r: Reading, unknown: readonly string[] = []): Topic[] {
  const active = r.open.find((q) => !unknown.includes(q)) ?? null;
  return r.open.map((q) => {
    const status: GapStatus = unknown.includes(q) ? "unknown" : q === active ? "active" : "open";
    return { id: q, label: q.replace(/[.?]$/, ""), ask: q, status };
  });
}
