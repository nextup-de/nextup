// The raise page's reading of the benchmark (features/ideas/raise.ts): rail segments, dials,
// advice, labels. Everything is derived from the benchmark's own facts.
import { describe, expect, it } from "vitest";
import { benchmark } from "@/features/ideas/benchmarks";
import { ideaFromTurns } from "@/features/ideas/coach";
import { adviceOf, deltaNote, dialsOf, gapsOf, greetName, initials, isUnsure, MAX_TOPICS, MIN_TOPICS, splitIdea, topicsOf, whenLabel } from "@/features/ideas/raise";
import { GOALS } from "@/features/evaluate";
import { ROUTES } from "@/features/demo/seed";

const ctx = { routes: ROUTES, goals: GOALS, cases: [], spendLimitEur: 5000 };
const oneLiner = benchmark({ text: "A shared calendar for the endurance rig", affected: [], attachments: 0 }, ctx);

describe("topics and the rail", () => {
  const topics = topicsOf(oneLiner.parts);
  it("prepares 2-8 topics from what the first message leaves open", () => {
    expect(topics.length).toBeGreaterThanOrEqual(MIN_TOPICS);
    expect(topics.length).toBeLessThanOrEqual(MAX_TOPICS);
    expect(new Set(topics).size).toBe(topics.length);
  });
  it("starts empty on step one: nothing clear, the first topic active, short labels", () => {
    const gaps = gapsOf(topics, oneLiner.parts);
    expect(gaps.filter((g) => g.status === "clear")).toHaveLength(0);
    expect(gaps.map((g) => g.status)).toEqual(["active", ...gaps.slice(1).map(() => "open")]);
    expect(gaps.every((g) => g.label.length <= 20)).toBe(true);
  });
  it("checks a topic off once the idea answers it", () => {
    const later = benchmark({ text: "A shared calendar for the endurance rig. A pilot for one week on line 3 saves 20 minutes per shift.", affected: ["M. Roth"], attachments: 0 }, ctx);
    expect(gapsOf(topics, later.parts).filter((g) => g.status === "clear").length).toBeGreaterThan(0);
  });
  it("puts the coach's first question first: the weakest bar's", () => {
    const weakestBar = [...oneLiner.parts].sort((a, b) => a.value - b.value).find((p) => p.missing.length);
    expect(topics[0]).toBe(weakestBar?.missing[0]);
  });
  it("moves on when the active topic is marked unknown", () => {
    const first = gapsOf(topics, oneLiner.parts).find((g) => g.status === "active");
    const next = gapsOf(topics, oneLiner.parts, [first?.id ?? ""]);
    expect(next.find((g) => g.id === first?.id)?.status).toBe("unknown");
    expect(next.find((g) => g.status === "active")?.id).not.toBe(first?.id);
  });
  it("tops a nearly finished idea up to two topics", () => {
    const done = oneLiner.parts.map((p) => ({ ...p, missing: [], found: p.found.length ? p.found : ["Point of " + p.id] }));
    expect(topicsOf(done)).toHaveLength(MIN_TOPICS);
  });
  it("recognises an unsure answer", () => {
    expect(isUnsure("Not sure yet")).toBe(true);
    expect(isUnsure("Every shift, about 25 minutes")).toBe(false);
  });
});

describe("dialsOf", () => {
  it("gives the five dials in the design's order", () => {
    expect(dialsOf(oneLiner.parts).map((d) => d.label)).toEqual(["Value", "Feasibility", "Cost", "Fit", "Risk"]);
  });
  it("reads value, feasibility and fit straight off the benchmark", () => {
    const d = dialsOf(oneLiner.parts);
    expect(d[0].value).toBe(oneLiner.parts[1].value);
    expect(d[1].value).toBe(oneLiner.parts[2].value);
    expect(d[3].value).toBe(oneLiner.parts[0].value);
    expect(d[4].scored).toBe(false);
  });
});

describe("advice and notes", () => {
  it("follows the publish line", () => {
    expect(adviceOf(80, 70, "Production").name).toBe("Approve");
    expect(adviceOf(60, 70, "Production").name).toBe("Pilot");
    expect(adviceOf(30, 70, "Production").name).toBe("Needs info");
  });
  it("names only the bars that went up", () => {
    expect(deltaNote({ fit: 0, impact: 40, feasibility: -5, clarity: 15 }, oneLiner.parts)).toBe("Impact & reach +40 · Novelty & clarity +15");
    expect(deltaNote(null, oneLiner.parts)).toBeNull();
  });
});

describe("labels", () => {
  const now = new Date(2026, 9, 5, 14, 30);
  it("says when, relative to now", () => {
    expect(whenLabel(new Date(2026, 9, 5, 14, 29, 40).toISOString(), now)).toBe("Now");
    expect(whenLabel(new Date(2026, 9, 5, 9, 5).toISOString(), now)).toBe("9:05");
    expect(whenLabel(new Date(2026, 9, 4, 9, 5).toISOString(), now)).toBe("Yesterday");
    expect(whenLabel(new Date(2026, 9, 1, 9, 5).toISOString(), now)).toBe("Thu");
    expect(whenLabel(new Date(2026, 8, 3, 9, 5).toISOString(), now)).toBe("3 Sep");
  });
  it("greets by first name, or the whole name after an initial", () => {
    expect(greetName("Sam Timmers")).toBe("Sam");
    expect(greetName("J. Schmidt")).toBe("J. Schmidt");
    expect(initials("T. Vogel")).toBe("TV");
  });
  it("titles the idea with the first line only, the context goes to the body", () => {
    const idea = ideaFromTurns([{ role: "user", text: "A second label printer\n\n*Impact* 40 min a day" }, { role: "user", text: "Pilot on line 3" }]);
    expect(idea).toEqual({ title: "A second label printer", body: "*Impact* 40 min a day\nPilot on line 3", text: "A second label printer\n\n*Impact* 40 min a day\nPilot on line 3" });
  });
  it("splits the first message into description and context", () => {
    expect(splitIdea("A printer\n\n*Impact* 40 min\n\nmore")).toEqual({ description: "A printer", context: "*Impact* 40 min\n\nmore" });
    expect(splitIdea("Just a line")).toEqual({ description: "Just a line", context: "" });
  });
});
