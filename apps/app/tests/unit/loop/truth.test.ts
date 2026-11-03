// LOOP-T1 (HD16/D5): a model proposes, a person or a rule decides. The route a model proposed earns
// no score points, and suggested answers are never ranked or filtered by score gain.
import { describe, expect, it } from "vitest";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { evaluate } from "@/features/evaluate";
import { benchmark, weakest } from "@/features/ideas/benchmarks";
import { withCoachSuggestion, type CoachAnswer } from "@/features/ideas/brain-coach";
import { suggestReplies } from "@/features/ideas/replies";
import { scoreCase, type Scorable } from "@/features/scoring";
import { routeSourceOf } from "@/features/scoring/route-source";
import { DEMO_GOALS, DEMO_RULES } from "@/features/demo/structure";
import { PEOPLE, PROBLEMS, PROMISE_DAYS, ROLES, ROUTES } from "@/features/demo/seed";

let n = 0;
const ev = (type: CaseEventType, payload: EventPayload = {}): CaseEvent =>
  ({ id: "t" + n++, ts: 0, day: 0, type, actor: "L. Brandt", target: "c_a", payload });
const raised = (routeId: string | null, proposal?: EventPayload["proposal"]) =>
  ev("case.raised", { kind: "problem", title: "Case", routeId, ...(proposal ? { proposal } : {}) });
const base: Scorable = { routeId: "r1", upside: "", body: "", age: 0, open: true };
const fits = (s: ReturnType<typeof scoreCase>) => s.parts.find((p) => p.label === "Fits a decision type on the map");
const byAi = (s: ReturnType<typeof scoreCase>) => s.parts.find((p) => p.label === "Route proposed by AI");
const llm = { routeId: "r1", confidence: 80, source: "llm" as const, version: "v" };

describe("LOOP no model points", () => {
  it("a keyword route gives +20", () => {
    const s = scoreCase({ ...base, history: [raised("r1", { ...llm, source: "keywords" })] }, 5);
    expect(fits(s)?.points).toBe(20);
    expect(byAi(s)).toBeUndefined();
  });
  it("a route the model proposed, raised on it, gives 0 points and the part 'Route proposed by AI'", () => {
    const s = scoreCase({ ...base, history: [raised("r1", llm)] }, 5);
    expect(fits(s)).toBeUndefined();
    expect(byAi(s)).toEqual({ label: "Route proposed by AI", points: 0 });
    expect(s.value).toBe(35);
  });
  it("raised on another route than the model proposed gives +20 (a person chose)", () => {
    const history = [raised("r2", llm)];
    expect(routeSourceOf(history)).toBe("person");
    expect(fits(scoreCase({ ...base, routeId: "r2", history }, 5))?.points).toBe(20);
  });
  it("a later case.override turns the model's route into a person's", () => {
    const history = [raised("r1", llm), ev("case.override", { proposed: "r1", chosen: "r2" })];
    expect(routeSourceOf(history)).toBe("person");
    expect(fits(scoreCase({ ...base, history }, 5))?.points).toBe(20);
    expect(routeSourceOf([raised("r1", llm)], { chosen: "r2" })).toBe("person");
  });
  it("no proposal (seed and demo cases) gives +20", () => {
    const history = [raised("r1")];
    expect(routeSourceOf(history)).toBeNull();
    expect(fits(scoreCase({ ...base, history }, 5))?.points).toBe(20);
    expect(fits(scoreCase(base, 5))?.points).toBe(20);
  });
  it("an explicit routeSource wins over the history", () => {
    expect(byAi(scoreCase({ ...base, routeSource: "llm", history: [raised("r1")] }, 5))).toBeDefined();
    expect(fits(scoreCase({ ...base, routeSource: "person", history: [raised("r1", llm)] }, 5))?.points).toBe(20);
  });
  it("evaluate with a brain proposal gives no +20, without one it does", () => {
    const ctx = { routes: ROUTES, people: PEOPLE, personas: ROLES, problems: PROBLEMS, cases: [], promiseDays: PROMISE_DAYS, goals: DEMO_GOALS, spend: DEMO_RULES.spend };
    const input = { kind: "problem" as const, text: "We wait days for a €300 part on night shift because nobody can sign the order", affected: [], attachments: 0, who: { name: "J. Schmidt", line: "Production", handle: "Anonymous #1" } };
    const plain = evaluate(input, ctx);
    expect(plain.score.parts.map((p) => p.label)).toContain("Fits a decision type on the map");
    const brain = { proposal: { routeId: "r1", confidence: 90, source: "llm" as const, version: "v" }, reason: "", sameAs: null, related: null };
    const withBrain = evaluate(input, ctx, brain);
    expect(withBrain.score.parts.map((p) => p.label)).not.toContain("Fits a decision type on the map");
    expect(withBrain.score.parts).toContainEqual({ label: "Route proposed by AI", points: 0 });
  });
});

describe("LOOP suggestions not ranked by gain", () => {
  const ctx = { routes: ROUTES, goals: DEMO_GOALS, cases: [], spendLimitEur: 5000 };
  const idea = { text: "i want to change IT", affected: [], attachments: 0 };
  const now = benchmark(idea, ctx);

  it("every reply has a source, at most one per bar, at most three", () => {
    const replies = suggestReplies(idea, now, ctx);
    expect(replies.length).toBeGreaterThan(0);
    expect(replies.length).toBeLessThanOrEqual(3);
    expect(new Set(replies.map((r) => r.id)).size).toBe(replies.length);
    expect(replies.every((r) => r.source === "company")).toBe(true);
  });
  it("the asked bar comes first, then the fixed bar order", () => {
    const replies = suggestReplies(idea, now, ctx);
    expect(replies[0].id).toBe(weakest(now)?.id);
    const fixed = ["fit", "impact", "feasibility", "clarity"];
    const rest = replies.slice(1).map((r) => fixed.indexOf(r.id));
    expect(rest).toEqual([...rest].sort((a, b) => a - b));
  });
  it("a suggestion for a bar with a missing part is offered even when it adds no points", () => {
    const text = "It serves “Every changeover under 20 minutes” - saves 20 minutes per changeover on every shift for the team. First step: a pilot on line 3, no spend.";
    const full = { text, affected: ["A", "B", "C"], attachments: 1 };
    const fullNow = benchmark(full, ctx);
    const open = fullNow.parts.filter((p) => p.missing.length > 0).map((p) => p.id);
    const replies = suggestReplies(full, fullNow, ctx);
    expect(replies.map((r) => r.id).sort()).toEqual(open.slice(0, 3).sort());
  });
  it("a bar with nothing missing gets no suggestion", () => {
    const full = { ...now, parts: now.parts.map((p) => (p.id === "clarity" ? { ...p, missing: [] } : p)) };
    expect(suggestReplies(idea, full, ctx).some((r) => r.id === "clarity")).toBe(false);
  });
  it("the model's recommended text with zero gain is offered with source 'ai', first", () => {
    const text = "Thanks a lot, will do.";
    expect(benchmark({ ...idea, text: idea.text + "\n" + text }, ctx).overall - now.overall).toBeLessThanOrEqual(0);
    const a: CoachAnswer = { open_point: "impact", earlier_id: null, note: "", question: "q", why: "w", model: "m", version: "v", recommended: text };
    const out = withCoachSuggestion(a, idea, now, ctx, suggestReplies(idea, now, ctx));
    expect(out[0]).toMatchObject({ text, source: "ai", id: weakest(now)?.id });
  });
  it("a recommended text equal to an offered one is not offered twice", () => {
    const replies = suggestReplies(idea, now, ctx);
    const a: CoachAnswer = { open_point: "fit", earlier_id: null, note: "", question: "", why: "", model: "m", version: "v", recommended: replies[0].text };
    expect(withCoachSuggestion(a, idea, now, ctx, replies)).toEqual(replies);
  });
});
