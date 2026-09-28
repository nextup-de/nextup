// The idea studio's benchmarks and coach (docs/IDEAS.md): deterministic, explainable, and a
// one-liner never clears the publish line while a developed idea does.
import { describe, expect, it } from "vitest";
import { amountEur, benchmark, canPublish, DEFAULT_PUBLISH_THRESHOLD, deltas, weakest } from "@/features/ideas/benchmarks";
import { coachBrief, coachMock, ideaFromTurns, toGo } from "@/features/ideas/coach";
import { GOALS } from "@/features/evaluate";
import { ROUTES } from "@/features/demo/seed";

const ctx = {
  routes: ROUTES,
  goals: GOALS,
  cases: [{ title: "Night shift has no one who can sign a €300 parts order", from: "S. Dahl", age: 4, open: true }],
  spendLimitEur: 5000,
};
const T = DEFAULT_PUBLISH_THRESHOLD;

const oneLiner = { text: "A shared calendar for the endurance rig", affected: [], attachments: 0 };
const developed = {
  text: [
    "Reserve the endurance rig on Fridays for unscheduled trials",
    "Changeover experiments wait six weeks today, because every rig slot is booked by customer work. That is 20 minutes lost per changeover setup on every shift.",
    "First step: a pilot for one month on line 3, no spend needed. Engineers and the quality team would plan their trials around the fixed day.",
  ].join("\n"),
  affected: ["M. Roth", "H. Sander"],
  attachments: 1,
};

describe("benchmark", () => {
  it("is deterministic and has the four bars in order", () => {
    const a = benchmark(developed, ctx), b = benchmark(developed, ctx);
    expect(a).toEqual(b);
    expect(a.parts.map((p) => p.id)).toEqual(["fit", "impact", "feasibility", "clarity"]);
    for (const p of a.parts) {
      expect(p.value).toBeGreaterThanOrEqual(0);
      expect(p.value).toBeLessThanOrEqual(100);
    }
  });
  it("a one-liner stays below the publish line and says what is missing", () => {
    const b = benchmark(oneLiner, ctx);
    expect(b.overall).toBeLessThan(T);
    expect(canPublish(b.overall, T)).toBe(false);
    expect(weakest(b)?.missing.length).toBeGreaterThan(0);
  });
  it("goal, upside, first step and affected people lift it over the line", () => {
    const b = benchmark(developed, ctx);
    expect(b.overall).toBeGreaterThanOrEqual(T);
    expect(canPublish(b.overall, T)).toBe(true);
    expect(canPublish(b.overall, 101)).toBe(false); // a stricter company threshold still holds it back
    expect(b.parts[0].found.join(" ")).toContain("changeover");
    expect(b.parts[2].found).toContain("Names a first step");
  });
  it("an open case that reads the same costs novelty and is named", () => {
    const b = benchmark({ text: "Let the night shift sign a €300 parts order", affected: [], attachments: 0 }, ctx);
    expect(b.sameAs?.from).toBe("S. Dahl");
    expect(b.parts[3].missing[0]).toContain("co-sign");
  });
  it("time is not money: \"costs 20 minutes\" does not ask for a price", () => {
    const b = benchmark({ text: "Fixed rig day - the wait costs about 20 minutes per changeover", affected: [], attachments: 0 }, ctx);
    expect(b.parts[2].found).toContain("No spend needed");
  });
  it("spend above the team's authority scores lower than spend within it", () => {
    const low = benchmark({ text: "Buy a torque tester for €900 for the line", affected: [], attachments: 0 }, ctx);
    const high = benchmark({ text: "Buy a torque tester for €12k for the line", affected: [], attachments: 0 }, ctx);
    expect(low.parts[2].value).toBeGreaterThan(high.parts[2].value);
  });
});

describe("amountEur", () => {
  it("reads the common ways of writing euros", () => {
    expect(amountEur("about €5k")).toBe(5000);
    expect(amountEur("5.000 € or 300 EUR")).toBe(5000);
    expect(amountEur("€ 1,5k")).toBe(1500);
    expect(amountEur("no money involved")).toBeNull();
  });
});

describe("coach", () => {
  it("builds the idea from the author's turns only", () => {
    const idea = ideaFromTurns([{ role: "user", text: "Fixed rig day" }, { role: "assistant", text: "Which goal? [S1]" }, { role: "user", text: "Changeovers" }]);
    expect(idea).toEqual({ title: "Fixed rig day", body: "Changeovers", text: "Fixed rig day\nChangeovers" });
  });
  it("first reply states the score and asks about the weakest bar", () => {
    const now = benchmark(oneLiner, ctx);
    const text = coachMock(null, now, T);
    expect(text).toContain("First read: " + now.overall);
    expect(text).toContain(weakest(now)!.missing[0]);
  });
  it("a better turn is called out with its delta", () => {
    const prev = benchmark(oneLiner, ctx), now = benchmark(developed, ctx);
    expect(deltas(prev, now).overall).toBe(now.overall - prev.overall);
    expect(coachMock(prev, now, T)).toContain("Up " + (now.overall - prev.overall));
  });
  it("the model brief pins the numbers and asks for one question", () => {
    const brief = coachBrief(benchmark(oneLiner, ctx), T);
    expect(brief).toContain("not yours to change");
    expect(brief).toContain("exactly one");
    expect(toGo(62, 70)).toBe("8 points to publish");
    expect(toGo(70, 70)).toBe("Ready to publish");
  });
});

describe("coach mode in the system prompt", () => {
  it("swaps the answer rules for the coach rules and carries the brief", async () => {
    const { buildSystem } = await import("@/features/assist/prompt");
    const base = { companyName: "Acme", brief: "roles", rules: "", ceiling: "internal" as const };
    const brief = coachBrief(benchmark(oneLiner, ctx), T);
    const coach = buildSystem({ ...base, coach: brief });
    expect(coach).toContain("How you coach");
    expect(coach).toContain(brief);
    expect(coach).not.toContain("How you answer");
    expect(buildSystem(base)).toContain("How you answer");
    expect(buildSystem(base)).not.toContain("How you coach");
  });
});
