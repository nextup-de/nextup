// The grilling rail's count (features/ideas/raise.ts): as many topics as the idea needs, each checked off once
// answered - by the benchmark, or by the author's own answer when it was asked - so publishing can wait for the rail.
import { describe, expect, it } from "vitest";
import { benchmark } from "@/features/ideas/benchmarks";
import { answeredOf, gapsOf, MAX_TOPICS, openCount, topicIn, topicsOf } from "@/features/ideas/raise";
import { translate } from "@/i18n";
import { DEMO_GOALS } from "@/features/demo/structure";
import { ROUTES } from "@/features/demo/seed";

const ctx = { routes: ROUTES, goals: DEMO_GOALS, cases: [], spendLimitEur: 5000 };
const bench = (text: string) => benchmark({ text, affected: [], attachments: 0 }, ctx);

describe("ideas/raise rail count", () => {
  it("gives a vague idea many topics and a precise one few", () => {
    const vague = topicsOf(bench("Buy a thing").parts);
    const precise = topicsOf(bench("A pilot for one week on line 3: the shift team logs changeover minutes in a shared sheet, because we lose 20 minutes per shift waiting for parts, so every team sees the downtime rate.").parts);
    expect(vague.length).toBeGreaterThan(8); // no longer capped at eight
    expect(vague.length).toBeLessThanOrEqual(MAX_TOPICS);
    expect(precise.length).toBeLessThan(vague.length);
  });

  it("checks off the topic being asked when the author answers it, in their own words", () => {
    const idea = "Buy a thing";
    const topics = topicsOf(bench(idea).parts);
    const before = gapsOf(topics, bench(idea).parts);
    const asked = before.find((g) => g.status === "active")!.id;
    const answered = answeredOf(topics, [{ said: "Honestly it is just annoying for us", parts: bench(idea).parts }]);
    expect(answered).toEqual([asked]);
    const after = gapsOf(topics, bench(idea + "\nHonestly it is just annoying for us").parts, [], undefined, answered);
    expect(after.find((g) => g.id === asked)?.status).toBe("clear");
    expect(openCount(after)).toBeLessThan(openCount(before));
  });

  it("checks off nothing for a not-sure answer - that one is unknown instead", () => {
    const topics = topicsOf(bench("Buy a thing").parts);
    expect(answeredOf(topics, [{ said: "not sure yet", parts: bench("Buy a thing").parts }])).toEqual([]);
  });

  it("is done once every topic is answered, one answer per topic at most", () => {
    const idea = "Buy a thing";
    const topics = topicsOf(bench(idea).parts);
    const rounds = topics.map(() => ({ said: "We talked about it in the team", parts: bench(idea).parts }));
    const answered = answeredOf(topics, rounds);
    expect(openCount(gapsOf(topics, bench(idea).parts, [], undefined, answered))).toBe(0);
  });
});

describe("ideas/raise topicIn", () => {
  it("words a German topic the way the English coach reads it", () => {
    expect(topicIn(translate("de", "ideas.benchMissGoal"), "de")).toBe(translate("en", "ideas.benchMissGoal"));
    expect(topicIn(translate("de", "ideas.topicRaised"), "de")).toBe(translate("en", "ideas.topicRaised"));
    expect(topicIn("something else", "de")).toBe("something else");
  });
});
