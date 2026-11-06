// The model's reading of an idea (features/ideas/reading): what goes out, what is kept, and how the
// raise page reads it. The answers are checked against what was sent; a stored row is never trusted.
import { describe, expect, it } from "vitest";
import { coachText } from "@/features/ideas/brain-coach";
import { DEPTS, ROUTES } from "@/features/demo/seed";
import { DEMO_GOALS } from "@/features/demo/structure";
import {
  adviceFromReading, BrainReading, coachReading, dialsFromReading, gapsFromReading, latestReading, proposalOf, readingFrom, readingOf, readRequest, type Reading,
} from "@/features/ideas/reading";

const brain = (over: Partial<BrainReading> = {}): BrainReading => ({
  dials: (["value", "feasibility", "cost", "fit", "risk"] as const).map((key, i) => ({ key, score: 10 + i * 10, note: key + " note", basis: key + " basis" })),
  overall: 30, summary: "Free water on every desk, with no sign that thirst is a problem.",
  advice: "info", advice_why: "Nothing yet shows what it would gain.", pattern: "It stands alone.",
  route_id: "r1", route_reason: "A small spend.", same_as: "c1", related: "c2",
  open: ["What does thirst cost today?", "Which goal does it serve?"], model: "gpt-4.1-mini", version: "brain-read-v1", ...over,
});
const req = { routes: [{ id: "r1" }], known: [{ id: "c1", title: "Water coolers", status: "open" }, { id: "c2", title: "Break rooms", status: "shipped" }] };
const reading = (over: Partial<BrainReading> = {}): Reading => readingFrom(brain(over), req);

describe("readRequest", () => {
  it("sends the idea with the company's goals, routes, earlier items and spend rule", () => {
    const r = readRequest("Acme", { title: " Water ", body: "" }, ROUTES, DEPTS, req.known, {
      goals: DEMO_GOALS, affected: 3, attachments: 1, spendLimitEur: 5000, skip: ["Which goal?"], previous: reading(),
    });
    expect(r.idea.title).toBe("Water");
    expect(r.goals[0]).toEqual({ name: DEMO_GOALS[0].goal, kpi: "" });
    expect(r.routes[0].owner).not.toContain(ROUTES[0].owner.name); // a role, never a name
    expect(r.spend_limit_eur).toBe(5000);
    expect(r.skip).toEqual(["Which goal?"]);
    expect(r.previous[0]).toEqual({ key: "value", score: 10, note: "value note" });
    expect(r.previous[0]).not.toHaveProperty("basis");
  });
});

describe("readingFrom", () => {
  it("keeps the earlier items by title, and how many it was checked against", () => {
    const r = reading();
    expect(r.similar).toEqual([{ id: "c1", title: "Water coolers", status: "open", same: true }, { id: "c2", title: "Break rooms", status: "shipped", same: false }]);
    expect(r.checked).toBe(2);
  });

  it("drops a row or an item the request did not contain", () => {
    const r = reading({ route_id: "r9", same_as: "c9", related: null });
    expect(r.route_id).toBeNull();
    expect(r.same_as).toBeNull();
    expect(r.similar).toEqual([]);
  });
});

describe("the brain's answer", () => {
  it("needs all five dials, each in range", () => {
    expect(BrainReading.safeParse(brain()).success).toBe(true);
    expect(BrainReading.safeParse(brain({ dials: brain().dials.slice(0, 4) })).success).toBe(false);
    expect(BrainReading.safeParse(brain({ dials: brain().dials.map((d) => ({ ...d, score: 140 })) })).success).toBe(false);
  });
});

describe("readingOf", () => {
  it("reads a kept reading back, and nothing else", () => {
    expect(readingOf(JSON.parse(JSON.stringify(reading())))?.overall).toBe(30);
    expect(readingOf(null)).toBeNull();
    expect(readingOf({ overall: 30 })).toBeNull();
  });
});

describe("latestReading", () => {
  it("is the latest reply's: a reply without one means the keyword benchmark answered", () => {
    const r = reading();
    expect(latestReading([{ role: "user" }, { role: "assistant", reading: r }, { role: "user" }])).toBe(r);
    expect(latestReading([{ role: "assistant", reading: r }, { role: "assistant", reading: null }])).toBeNull();
    expect(latestReading([{ role: "user" }])).toBeNull();
  });
});

describe("the page's view of it", () => {
  it("shows the five dials with the model's numbers and words", () => {
    const d = dialsFromReading(reading());
    expect(d.map((x) => x.key)).toEqual(["value", "feas", "cost", "fit", "risk"]);
    expect(d.map((x) => x.value)).toEqual([10, 20, 30, 40, 50]);
    expect(d[1]).toMatchObject({ label: "Feasibility", note: "feasibility note", basis: "feasibility basis", scored: true });
  });

  it("shows the model's advice", () => {
    expect(adviceFromReading(reading())).toEqual({ id: "info", name: "Needs info", why: "Nothing yet shows what it would gain." });
    expect(adviceFromReading(reading(), "de").name).toBe("Braucht mehr Infos");
  });

  it("asks what is open, next the first the author has not said they cannot answer", () => {
    const [a, b] = gapsFromReading(reading());
    expect(a).toEqual({ id: "What does thirst cost today?", label: "What does thirst cost today", ask: "What does thirst cost today?", status: "active" });
    expect(b.status).toBe("open");
    const later = gapsFromReading(reading(), ["What does thirst cost today?"]);
    expect(later.map((g) => g.status)).toEqual(["unknown", "active"]);
    expect(gapsFromReading(reading({ open: [] }))).toEqual([]);
  });

  it("routes by the model's row", () => {
    expect(proposalOf(reading()).proposal).toMatchObject({ routeId: "r1", source: "llm", version: "brain-read-v1" });
    expect(proposalOf(reading({ route_id: null })).proposal.confidence).toBe(0);
  });
});

describe("what the coach is told", () => {
  it("is the same judgement, without the model's bookkeeping", () => {
    const c = coachReading(reading());
    expect(c.open).toEqual(["What does thirst cost today?", "Which goal does it serve?"]);
    expect(c.same_as).toBe("c1");
    expect(c.dials[0]).toEqual({ key: "value", score: 10, note: "value note" });
  });

  it("puts its answer to the author's question first", () => {
    const text = coachText({ open_point: "open", earlier_id: null, answer: "The goals are A and B.", note: "That leaves the number open.", question: "Which fits?", why: "It decides the desk.", recommended: "", model: "m", version: "v" });
    expect(text).toBe("The goals are A and B.\n\nThat leaves the number open.\n\nWhich fits? It decides the desk.");
  });
});
