// The raise page's reading of the benchmark (features/ideas/raise.ts): the rail's five points, dials,
// advice, labels. Everything is derived from the benchmark's own facts.
import { describe, expect, it } from "vitest";
import { benchmark, weakest } from "@/features/ideas/benchmarks";
import { ideaFromTurns } from "@/features/ideas/coach";
import { adviceOf, dialsOf, dialsUp, greetName, IDEA_UPDATE, ideaNow, initials, isUnsure, levelOf, RAIL, railOf, splitIdea, splitUpdate, whenLabel, withoutSkipped } from "@/features/ideas/raise";
import { GOALS } from "@/features/evaluate";
import { ROUTES } from "@/features/demo/seed";

const ctx = { routes: ROUTES, goals: GOALS, cases: [], spendLimitEur: 5000 };
const oneLiner = benchmark({ text: "A shared calendar for the endurance rig", affected: [], attachments: 0 }, ctx);

describe("the rail: the five points a decision needs", () => {
  it("is the five dials, in their order", () => {
    expect(railOf(oneLiner.parts).map((g) => g.label)).toEqual(dialsOf(oneLiner.parts).map((d) => d.label));
  });
  it("asks the benchmark's own questions, so a 'not sure' skips the right one", () => {
    const blank = benchmark({ text: "Buy a thing", affected: [], attachments: 0 }, { ...ctx, routes: [], goals: [] });
    const asked = blank.parts.flatMap((p) => p.missing);
    for (const r of RAIL) expect(asked).toContain(r.ask);
  });
  it("starts on the first open point, with what the first message already answers checked off", () => {
    const gaps = railOf(oneLiner.parts);
    expect(gaps.filter((g) => g.status === "active")).toHaveLength(1);
    expect(gaps.find((g) => g.status !== "clear")?.status).toBe("active");
    for (const g of gaps.filter((x) => x.status === "clear")) expect(g.answer).toBeTruthy();
  });
  it("checks a point off once the idea answers it", () => {
    const later = benchmark({ text: "A shared calendar for the endurance rig. A pilot for one week on line 3 saves 20 minutes per shift.", affected: [], attachments: 0 }, ctx);
    const status = (b: typeof later, key: string) => railOf(b.parts).find((g) => g.key === key)?.status;
    expect(status(oneLiner, "value")).not.toBe("clear");
    expect(status(later, "value")).toBe("clear");
    expect(status(later, "risk")).toBe("clear");
  });
  it("leaves out what does not stop a publish: a photo, who else it helps", () => {
    const asks = railOf(oneLiner.parts).map((g) => g.ask);
    expect(asks.some((a) => /photo|who else/i.test(a))).toBe(false);
  });
  it("moves on when the next point is marked unknown", () => {
    const first = railOf(oneLiner.parts).find((g) => g.status === "active");
    const next = railOf(oneLiner.parts, [first?.id ?? ""]);
    expect(next.find((g) => g.id === first?.id)?.status).toBe("unknown");
    expect(next.find((g) => g.status === "active")?.id).not.toBe(first?.id);
  });
  it("keeps the coach off the questions answered 'not sure', without touching the scores", () => {
    const first = railOf(oneLiner.parts).find((g) => g.status === "active")?.id ?? "";
    const asked = withoutSkipped(oneLiner, [first]);
    expect(asked.parts.flatMap((p) => p.missing)).not.toContain(first);
    expect(asked.parts.map((p) => p.value)).toEqual(oneLiner.parts.map((p) => p.value));
    expect(weakest(asked)?.missing[0]).not.toBe(first);
  });
  it("shows only what the author typed when an idea edit travels with the message", () => {
    expect(splitUpdate("Not sure yet" + IDEA_UPDATE + "A printer\n\nMore")).toEqual({ said: "Not sure yet", updated: true });
    expect(splitUpdate("Every shift")).toEqual({ said: "Every shift", updated: false });
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
  it("scores every dial - cost and risk too", () => {
    const d = dialsOf(oneLiner.parts);
    expect(d.every((x) => x.scored)).toBe(true);
    expect(d.every((x) => x.note.length > 0)).toBe(true);
  });
  it("prices spend without an amount low, and asks for a figure", () => {
    const spends = benchmark({ text: "Buy a second label printer for packing", affected: [], attachments: 0 }, ctx);
    const cost = dialsOf(spends.parts).find((x) => x.key === "cost");
    expect(cost?.value).toBe(35);
    expect(cost?.note).toContain("rough figure");
  });
  it("reads risk from the first step, the spend and the reach", () => {
    const small = benchmark({ text: "A pilot for one week on line 3, no new tools", affected: [], attachments: 0 }, ctx);
    const wide = benchmark({ text: "Buy new tools for every shift across all lines, about €20,000", affected: ["M. Roth", "H. Sander", "S. Dahl"], attachments: 0 }, ctx);
    const r = (b: typeof small) => dialsOf(b.parts).find((x) => x.key === "risk");
    expect(r(small)?.value).toBeGreaterThan(r(wide)?.value ?? 100);
    expect(r(small)?.note).toContain("first step");
    expect(r(wide)?.note).toContain("above the team's authority");
  });
  it("reads value, feasibility and fit straight off the benchmark", () => {
    const d = dialsOf(oneLiner.parts);
    expect(d[0].value).toBe(oneLiner.parts[1].value);
    expect(d[1].value).toBe(oneLiner.parts[2].value);
    expect(d[3].value).toBe(oneLiner.parts[0].value);
  });
});

describe("advice and the chat's card", () => {
  it("follows the publish line", () => {
    expect(adviceOf(80, 70, "Production").name).toBe("Approve");
    expect(adviceOf(60, 70, "Production").name).toBe("Pilot");
    expect(adviceOf(30, 70, "Production").name).toBe("Needs info");
  });
  it("says each dial in a word for the chat - the cost and the risk themselves, so low is good there", () => {
    const d = (key: "value" | "cost" | "risk", value: number) => ({ key, label: key, value, note: "", basis: "", scored: true });
    expect([90, 50, 10].map((v) => levelOf(d("value", v)))).toEqual(["Strong", "Medium", "Weak"]);
    expect(levelOf(d("cost", 85))).toBe("Low");
    expect(levelOf(d("risk", 30))).toBe("High");
    expect(levelOf({ ...d("value", 0), scored: false })).toBe("Not yet");
  });
  it("marks only the dials an answer made better", () => {
    const later = benchmark({ text: "A shared calendar for the endurance rig. A pilot for one week on line 3 saves 20 minutes per shift.", affected: [], attachments: 0 }, ctx);
    const up = dialsUp(dialsOf(oneLiner.parts), dialsOf(later.parts));
    expect(up).toEqual(expect.arrayContaining(["value", "risk"]));
    expect(dialsUp(dialsOf(later.parts), dialsOf(later.parts))).toEqual([]);
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
  it("adds every answer to the idea's context, without asking", () => {
    const t = (role: "user" | "assistant", text: string) => ({ role, text });
    expect(ideaNow([t("user", "A printer"), t("assistant", "How often?"), t("user", "Every shift, about 20 minutes"), t("assistant", "Who decides?"), t("user", "Not sure yet")]))
      .toBe("A printer\n\nEvery shift, about 20 minutes");
    expect(ideaNow([t("user", "A printer\n\n*Impact* 40 min"), t("user", "Line 3"), t("user", "jd klafkhdjahjsdhf ajsdhljf")])).toBe("A printer\n\n*Impact* 40 min\nLine 3");
    // An edit sent with a message replaces the idea; the answers after it are added to that.
    expect(ideaNow([t("user", "A printer"), t("user", "Line 3"), t("user", "Pilot first" + IDEA_UPDATE + "A second printer\n\nLine 3, all shifts"), t("user", "Under 5,000 €")]))
      .toBe("A second printer\n\nLine 3, all shifts\nPilot first\nUnder 5,000 €");
    expect(ideaNow([])).toBe("");
  });
});
