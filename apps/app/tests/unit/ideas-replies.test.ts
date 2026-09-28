// Suggested answers under the coach (features/ideas/replies) and the keyboard-mashing filter:
// every suggestion really moves the score, and mashing never does.
import { describe, expect, it } from "vitest";
import { benchmark } from "@/features/ideas/benchmarks";
import { coachMock, ideaFromTurns, isGibberish } from "@/features/ideas/coach";
import { suggestReplies } from "@/features/ideas/replies";
import { GOALS } from "@/features/evaluate";
import { ROUTES } from "@/features/demo/seed";

const ctx = { routes: ROUTES, goals: GOALS, cases: [], spendLimitEur: 5000 };
const idea = { text: "i want to change IT", affected: [], attachments: 0 };

describe("suggestReplies", () => {
  it("offers up to three answers, one per bar, each with its real gain", () => {
    const now = benchmark(idea, ctx);
    const replies = suggestReplies(idea, now, ctx);
    expect(replies.length).toBeGreaterThan(0);
    expect(replies.length).toBeLessThanOrEqual(3);
    expect(new Set(replies.map((r) => r.id)).size).toBe(replies.length);
    for (const r of replies) {
      expect(r.gain).toBeGreaterThan(0);
      expect(benchmark({ ...idea, text: idea.text + "\n" + r.text }, ctx).overall - now.overall).toBe(r.gain);
    }
  });
  it("answers the question the coach asked first, with a company goal", () => {
    const now = benchmark(idea, ctx);
    const [first] = suggestReplies(idea, now, ctx);
    expect(first.id).toBe("fit");
    expect(first.text).toContain("New hires productive in week one"); // via the IT route's words
  });
  it("does not offer a goal once the idea already serves one", () => {
    const text = "Laminated setup sheets at the changeover station";
    const replies = suggestReplies({ ...idea, text }, benchmark({ ...idea, text }, ctx), ctx);
    expect(replies.some((r) => r.text.startsWith("It serves our goal"))).toBe(false);
  });
  it("never offers an answer that gains nothing", () => {
    const text = "It serves “Every changeover under 20 minutes” - saves 20 minutes per changeover on every shift for the team, because the fixture setup waits. First step: a pilot on line 3, no spend.";
    const full = { text, affected: ["A", "B", "C"], attachments: 1 };
    expect(suggestReplies(full, benchmark(full, ctx), ctx).every((r) => r.gain > 0)).toBe(true);
  });
});

describe("keyboard mashing", () => {
  it("is recognised, and real sentences are not", () => {
    expect(isGibberish("jd klafkhdjahjsdhf ajsdhljf hasdjhf ashdjf")).toBe(true);
    expect(isGibberish("ads fadklsfjkas djökfa dkf")).toBe(true);
    expect(isGibberish("Let team leads approve spare-part orders on night shift")).toBe(false);
    expect(isGibberish("Die Rüstzeit an der Maschine ist zu lang")).toBe(false);
    expect(isGibberish("the strengths of this")).toBe(false);
  });
  it("does not count toward the idea, and the coach says so without repeating itself", () => {
    const turns = [
      { role: "user" as const, text: "i want to change IT" },
      { role: "assistant" as const, text: "Which company goal does it serve?" },
      { role: "user" as const, text: "jd klafkhdjahjsdhf ajsdhljf hasdjhf ashdjf" },
    ];
    expect(ideaFromTurns(turns).text).toBe("i want to change IT");
    const prev = benchmark(idea, ctx), now = benchmark({ ...idea, text: ideaFromTurns(turns).text }, ctx);
    expect(now.overall).toBe(prev.overall);
    const reply = coachMock(prev, now, 70, turns[2].text, 3);
    expect(reply).toContain("slip of the keyboard");
    expect(reply).toContain("suggested answer");
    expect(reply).not.toContain("Which company goal");
  });
});
