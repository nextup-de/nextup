// The coach with the brain (features/ideas/brain-coach): what goes out, the message it becomes,
// and its best guess as a suggested answer - offered without a gain check, marked as the AI's.
import { describe, expect, it } from "vitest";
import { benchmark, weakest } from "@/features/ideas/benchmarks";
import { coachRequest, coachText, withCoachSuggestion, COACH_MAX_HISTORY, type CoachAnswer } from "@/features/ideas/brain-coach";
import { suggestReplies } from "@/features/ideas/replies";
import { DEMO_GOALS } from "@/features/demo/structure";
import { DEPTS, ROUTES } from "@/features/demo/seed";
import { readingFrom } from "@/features/ideas/reading";

const ctx = { routes: ROUTES, goals: DEMO_GOALS, cases: [], spendLimitEur: 5000 };
const idea = { text: "Paper changeover sheets are a waste", affected: [], attachments: 0 };
const answer = (over: Partial<CoachAnswer> = {}): CoachAnswer => ({
  open_point: "impact", earlier_id: null, note: "Paper you type in again is double work.",
  question: "How much time does one sheet cost?", why: "Minutes per shift decide whether this is a quick fix.",
  recommended: "For example: About 20 minutes per changeover, twelve changeovers a shift, so four hours a shift for the whole line.",
  model: "mistral-nemo", version: "brain-coach-v1", ...over,
});

describe("coachRequest", () => {
  it("sends the idea, the latest turns, the reading, the goals and the earlier items, within the brain's limits", () => {
    const turns = Array.from({ length: 30 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", text: "turn " + i }));
    const known = [{ id: "c3", title: "Changeover sheet", status: "open" }];
    const reading = readingFrom({
      dials: (["value", "feasibility", "cost", "fit", "risk"] as const).map((key) => ({ key, score: 40, note: "n", basis: "b" })), overall: 40, summary: "Paper twice.",
      advice: "info", advice_why: "w", pattern: "p", route_id: null, route_reason: "", same_as: null, related: null, open: ["How long does a sheet take?"], model: "m", version: "v",
    }, { routes: [], known });
    const r = coachRequest("Acme", { title: " Sheets ", body: "" }, turns, reading, known, ROUTES, DEPTS, DEMO_GOALS, "de");
    expect(r.locale).toBe("de");
    expect(r.history).toHaveLength(COACH_MAX_HISTORY);
    expect(r.history[0].text).toBe("turn 10");
    expect(r.idea.title).toBe("Sheets");
    expect(r.known[0].id).toBe("c3");
    expect(r.reading.open).toEqual(["How long does a sheet take?"]);
    expect(r.goals[0].name).toBe(DEMO_GOALS[0].goal);
    expect(r.routes.length).toBe(ROUTES.length);
  });
});

describe("coachText", () => {
  it("is the note, then the one question and why it will be asked", () => {
    expect(coachText(answer())).toBe("Paper you type in again is double work.\n\nHow much time does one sheet cost? Minutes per shift decide whether this is a quick fix.");
  });
  it("ready: only the note", () => {
    expect(coachText(answer({ open_point: "none", question: "", why: "", recommended: "", note: "Ready to publish." }))).toBe("Ready to publish.");
  });
});

describe("withCoachSuggestion", () => {
  const now = benchmark(idea, ctx);
  const replies = suggestReplies(idea, now, ctx);

  it("drops the German 'Zum Beispiel:' the same way", () => {
    const offered = withCoachSuggestion(answer({ recommended: "Zum Beispiel: etwa 20 Minuten pro Umrüstung." }), idea, now, ctx, replies);
    expect(offered[0].text).toBe("etwa 20 Minuten pro Umrüstung.");
  });

  it("offers the brain's guess first, without 'For example:', one per bar", () => {
    const out = withCoachSuggestion(answer(), idea, now, ctx, replies);
    expect(out[0].text.startsWith("About 20 minutes")).toBe(true);
    expect(out[0].id).toBe(weakest(now)?.id);
    expect(out[0].source).toBe("ai");
    expect(out.length).toBeLessThanOrEqual(3);
    expect(new Set(out.map((r) => r.id)).size).toBe(out.length);
  });
  it("a guess that adds no points is still offered (no gain check); a stub or an empty one is not", () => {
    expect(withCoachSuggestion(answer({ recommended: "Yes." }), idea, now, ctx, replies)).toEqual(replies);
    expect(withCoachSuggestion(answer({ recommended: "" }), idea, now, ctx, replies)).toEqual(replies);
  });
});
