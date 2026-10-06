// The static demo's company (features/demo/static-demo.ts): what the employee's dashboard shows before
// anyone types, and that the demo script still reads as a new idea next to it. Plus the case body's
// main points (features/ideas/brief.ts splitBody), which is how the script's case shows them.
import { describe, expect, it } from "vitest";
import { emptyLog } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { dashboardRow } from "@/features/cases/rows";
import { deskThread } from "@/features/cases/thread";
import { STATIC_DEMO_SEED, staticDemoDrafts } from "@/features/demo/static-demo";
import { GOALS } from "@/features/evaluate";
import { splitBody } from "@/features/ideas/brief";
import { DEMO_CASE, DEMO_SCRIPT } from "@/features/ideas/demo-script";
import { ideaContext, scoreDraft } from "@/features/ideas/drafts";

const log = emptyLog();
const S = reduce(STATIC_DEMO_SEED, log);
const me = STATIC_DEMO_SEED.personas.find((r) => r.id === "member")!.who;
const row = (id: string) => dashboardRow(S.cases.find((c) => c.id === id)!, STATIC_DEMO_SEED.promiseDays, me, log);

describe("the employee's dashboard on the static demo", () => {
  it("has three more ideas of their own, each in another state", () => {
    expect(["d1", "d2", "d3"].map((id) => [row(id).kind, row(id).mine])).toEqual([["idea", true], ["idea", true], ["idea", true]]);
    expect(row("d1").status).toBe("move"); // a question for them
    expect(row("d2").status).toBe("replied"); // asked and answered
    expect(row("d3")).toMatchObject({ status: "waiting", overdue: true, escalated: true }); // past the promise, with the deputy
  });
  it("gives every case of theirs a conversation, not an empty chat", () => {
    const mine = S.cases.filter((c) => c.from === me.name);
    expect(mine.length).toBeGreaterThanOrEqual(6);
    for (const c of mine) expect(deskThread(c, log).length, c.title).toBeGreaterThan(0);
    const sheet = S.cases.find((c) => c.id === "c3")!;
    expect(sheet.assignee).toBe("Hans Sander");
    expect(deskThread(sheet, log).map((e) => e.t)).toEqual(["handed", "asked", "answered"]);
  });
  it("leaves acme's own seed as it was", async () => {
    const { SEED } = await import("@/features/demo/seed");
    expect(SEED.cases.some((c) => c.id === "d1")).toBe(false);
    expect(SEED.cases.find((c) => c.id === "c3")!.seedEvents).toBeUndefined();
    expect(SEED.people.some((p) => p.name === "T. Vogel")).toBe(true);
  });
  it("uses clear full names everywhere: no initials, no anonymous handles", () => {
    const all = JSON.stringify(STATIC_DEMO_SEED) + JSON.stringify(staticDemoDrafts(new Date()));
    expect(all.match(/\b[A-Z]\. [A-Z][a-zäöü]+/g) ?? []).toEqual([]);
    expect(all).not.toContain("Anonymous #");
    expect(me).toMatchObject({ name: "Jonas Schmidt", handle: null });
    expect(STATIC_DEMO_SEED.people.find((p) => p.name === "Jonas Schmidt")?.reportsTo).toBe("Thomas Vogel");
  });
  it("never makes the demo script look already raised", () => {
    const ctx = ideaContext(STATIC_DEMO_SEED.routes, GOALS, S.cases);
    const turns = DEMO_SCRIPT.flatMap((s) => [{ role: "user" as const, text: s.say }, { role: "assistant" as const, text: s.reply }]);
    for (const n of [2, 4, 6]) expect(scoreDraft({ turns: turns.slice(0, n), affected: [], attachments: 0 }, ctx).sameAs).toBeNull();
  });
});

describe("his earlier chats with the coach", () => {
  const drafts = staticDemoDrafts(new Date("2026-10-06T12:00:00Z"));
  it("lists three published ideas, each linked to its case, and one draft still open", () => {
    expect(drafts.map((d) => [d.status, d.caseId])).toEqual([["published", "d1"], ["published", "d2"], ["published", "d3"], ["draft", null]]);
    for (const d of drafts) expect(S.cases.find((c) => c.id === d.caseId)?.title ?? d.title).toBe(d.title);
  });
  it("gives each a conversation the benchmark scored, with no scores in the coach's words", () => {
    for (const d of drafts) {
      expect(d.turns[0].role).toBe("user");
      expect(d.turns.at(-1)!.role).toBe("assistant");
      expect(d.scores).toHaveLength(4);
      for (const t of d.turns.filter((x) => x.role === "assistant")) expect(t.text).not.toMatch(/\d/);
    }
  });
});

describe("a case body's main points", () => {
  it("reads the first paragraph as the idea, the next as context, *Label* lines as facts", () => {
    expect(splitBody("One line.\n\nMore about it.\n*Cost* None\n*Then* Line 2")).toEqual({
      description: "One line.", context: "More about it.", facts: [{ label: "Cost", text: "None" }, { label: "Then", text: "Line 2" }],
    });
  });
  it("keeps a plain body as it was: all of it the idea, no context, no facts", () => {
    expect(splitBody("Twelve changeovers a shift.\nSix values each time.")).toEqual({ description: "Twelve changeovers a shift.\nSix values each time.", context: null, facts: [] });
  });
  it("gives the script's case its main points", () => {
    const b = splitBody(DEMO_CASE.body);
    expect(b.description).toMatch(/^Every changeover on line 3 loses about 20 minutes/);
    expect(b.context).toMatch(/all three shifts/);
    expect(b.facts.map((f) => f.label)).toEqual(["Goal", "First step", "Cost", "Then", "Still open"]);
  });
});
