// The coach with the brain (features/ideas/brain-coach): what goes out, the message it becomes,
// and its best guess as a suggested answer - re-scored like every other, never offered for free.
import { describe, expect, it } from "vitest";
import { benchmark, weakest } from "@/features/ideas/benchmarks";
import { coachRequest, coachText, withCoachSuggestion, COACH_MAX_HISTORY, type CoachAnswer } from "@/features/ideas/brain-coach";
import { suggestReplies } from "@/features/ideas/replies";
import { GOALS } from "@/features/evaluate";
import { ROUTES } from "@/features/demo/seed";

const ctx = { routes: ROUTES, goals: GOALS, cases: [], spendLimitEur: 5000 };
const idea = { text: "Paper changeover sheets are a waste", affected: [], attachments: 0 };
const answer = (over: Partial<CoachAnswer> = {}): CoachAnswer => ({
  open_point: "impact", earlier_id: null, note: "Paper you type in again is double work.",
  question: "How much time does one sheet cost?", why: "Minutes per shift decide whether this is a quick fix.",
  recommended: "For example: About 20 minutes per changeover, twelve changeovers a shift, so four hours a shift for the whole line.",
  model: "mistral-nemo", version: "brain-coach-v1", ...over,
});

describe("coachRequest", () => {
  it("sends the idea, the latest turns, the brief and the earlier items, within the brain's limits", () => {
    const turns = Array.from({ length: 30 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", text: "turn " + i }));
    const r = coachRequest("Acme", { title: " Sheets ", body: "" }, turns, "brief", [{ id: "c3", title: "Changeover sheet", status: "open" }]);
    expect(r.history).toHaveLength(COACH_MAX_HISTORY);
    expect(r.history[0].text).toBe("turn 10");
    expect(r.idea.title).toBe("Sheets");
    expect(r.known[0].id).toBe("c3");
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

  it("offers the brain's guess first, re-scored, without 'For example:', one per bar", () => {
    const out = withCoachSuggestion(answer(), idea, now, ctx, replies);
    expect(out[0].text.startsWith("About 20 minutes")).toBe(true);
    expect(out[0].id).toBe(weakest(now)?.id);
    expect(out[0].gain).toBe(benchmark({ ...idea, text: idea.text + "\n" + out[0].text }, ctx).overall - now.overall);
    expect(out.length).toBeLessThanOrEqual(3);
    expect(new Set(out.map((r) => r.id)).size).toBe(out.length);
  });
  it("a guess that would not move the score is not offered", () => {
    expect(withCoachSuggestion(answer({ recommended: "Yes." }), idea, now, ctx, replies)).toEqual(replies);
    expect(withCoachSuggestion(answer({ recommended: "" }), idea, now, ctx, replies)).toEqual(replies);
  });
});
