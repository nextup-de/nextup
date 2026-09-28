import { describe, expect, it } from "vitest";
import { badgeTone, briefFor, briefForCase, numberBlocks, personFor, SCORE_LABELS, shortFileName, tagTone, type Block, type Source } from "@/features/ideas/brief";
import { BRIEFS } from "@/features/ideas/brief-demo";
import { SEED } from "@/features/demo/seed";
import { emptyLog } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";

const ctx = { people: SEED.people, depts: SEED.depts, ideas: SEED.ideas };
const idea = (id: string) => {
  const i = SEED.ideas.find((x) => x.id === id);
  if (!i) throw new Error("no seed idea " + id);
  return i;
};

describe("numberBlocks", () => {
  const pool: Record<string, Source> = { a: { name: "A", where: "x", ext: "PDF" }, b: { name: "B", where: "y", ext: "WEB" } };
  it("numbers sources in first-cited order and reuses a number", () => {
    const blocks: Block[] = [
      { t: "text", h: "h", p: "p", c: ["b", "a"] },
      { t: "facts", items: [{ k: "k", v: "v", c: ["a"] }] },
    ];
    const out = numberBlocks(blocks, pool);
    expect(out.sources.map((s) => [s.n, s.name])).toEqual([[1, "B"], [2, "A"]]);
    expect(out.blocks[0]).toMatchObject({ cites: [1, 2] });
    expect(out.blocks[1]).toMatchObject({ items: [{ cites: [2] }] });
  });
  it("drops keys that are not in the pool", () => {
    const out = numberBlocks([{ t: "text", h: "h", p: "p", c: ["nope", "a"] }], pool);
    expect(out.sources).toHaveLength(1);
    expect(out.blocks[0]).toMatchObject({ cites: [1] });
  });
  it("scales compare bars to the largest row and puts step citations on the last step", () => {
    const out = numberBlocks([
      { t: "compare", title: "t", c: [], rows: [{ label: "us", value: 10, display: "10", us: true }, { label: "them", value: 0, display: "0" }] },
      { t: "steps", c: ["a"], items: [{ label: "one", owner: "o", dur: "1 w" }, { label: "two", owner: "o", dur: "2 w" }] },
    ], pool);
    expect(out.blocks[0]).toMatchObject({ rows: [{ pct: 100, us: true }, { pct: 4, us: false }] });
    expect(out.blocks[1]).toMatchObject({ items: [{ cites: [] }, { cites: [1] }] });
  });
});

describe("the written demo briefs", () => {
  it("cover exactly the seed ideas awaiting a decision", () => {
    const waiting = SEED.ideas.filter((i) => i.status === "Awaiting decision").map((i) => i.id).sort();
    expect(Object.keys(BRIEFS).sort()).toEqual(waiting);
  });
  it("have five scores, every citation resolves, and every named person is on the org chart", () => {
    for (const [id, w] of Object.entries(BRIEFS)) {
      expect(w.scores, id).toHaveLength(SCORE_LABELS.length);
      const keys = [...Object.values(w.cites).flat(), ...w.scores.flatMap((s) => JSON.stringify(s.blocks).match(/"c":\[[^\]]*\]/g) ?? []).flatMap((m) => JSON.parse(m.slice(4)) as string[])];
      for (const k of keys) expect(w.sources[k], id + " cites " + k).toBeDefined();
      for (const n of [...w.affects.people, ...w.routing.map((r) => r.name), ...w.feed.comments.map((c) => c.name)]) {
        expect(SEED.people.some((p) => p.name === n), id + ": " + n).toBe(true);
      }
      for (const d of w.affects.depts) expect(SEED.depts.some((x) => x.id === d), id + ": " + d).toBe(true);
    }
  });
});

describe("briefFor", () => {
  it("builds the written brief: author from the org chart, department members, numbered sources", () => {
    const b = briefFor(idea("i1"), ctx);
    expect(b.written).toBe(true);
    expect(b.author).toMatchObject({ name: "C. Ilg", role: "Ops & Admin lead" });
    expect(b.author).toMatchObject({ dept: "Ops & Admin", location: "Ulm HQ", email: "c.ilg@example.com" });
    const fin = b.depts.find((d) => d.id === "FIN");
    expect(fin?.members.map((m) => m.name)).toContain("K. Adler");
    expect(b.people.find((p) => p.name === "K. Adler")).toMatchObject({ ai: true, why: expect.any(String) });
    expect(b.people.find((p) => p.name === "R. Nowak")).toMatchObject({ ai: false, why: null });
    expect(b.sources.map((s) => s.n)).toEqual(b.sources.map((_, i) => i + 1));
    expect(new Set(b.sources.map((s) => s.name)).size).toBe(b.sources.length);
    for (const n of Object.values(b.cites).flat()) expect(n).toBeLessThanOrEqual(b.sources.length);
  });
  it("an idea without a written brief is built from its seed fields only", () => {
    const b = briefFor(idea("i7"), ctx);
    expect(b.written).toBe(false);
    expect(b.description).toBe(idea("i7").rationale);
    expect(b.scores).toHaveLength(5);
    expect(b.rec).toBe("info");
    expect(b.feed.comments).toEqual([]);
  });
});

describe("personFor", () => {
  it("finds people on the org chart with their demo profile, and nobody else", () => {
    expect(personFor("H. Sander", ctx)).toEqual({ name: "H. Sander", role: "Quality lead", dept: "Quality", location: "Ravensburg plant", email: "h.sander@example.com" });
    expect(personFor("Anonymous #4471", ctx)).toBeNull();
  });
});

describe("briefForCase", () => {
  const S = reduce(SEED, emptyLog());
  const caseOf = (id: string) => { const c = S.cases.find((x) => x.id === id); if (!c) throw new Error("no case " + id); return c; };
  const facts = { promiseDays: SEED.promiseDays, me: "T. Vogel", affected: [], attachments: 0, updates: 0, passTo: "M. Roth", history: "" };

  it("keeps an anonymous raiser anonymous", () => {
    const b = briefForCase(caseOf("c1"), ctx, facts);
    expect(b.author).toMatchObject({ name: "Anonymous #2210", anonymous: true, email: "", location: "" });
  });
  it("offers the four case actions, all live, and scores from the case's own facts", () => {
    const b = briefForCase(caseOf("c1"), ctx, facts);
    expect(b.actions.map((a) => [a.key, a.live])).toEqual([["yes", true], ["no", true], ["hand", true], ["ask", true]]);
    expect(b.actions[2].label).toBe("Pass to M. Roth");
    expect(b.scores.map((s) => s.label)).toEqual(["Value", "Fit", "Detail", "Urgency", "Support"]);
    for (const s of b.scores) { expect(s.value).toBeGreaterThanOrEqual(10); expect(s.value).toBeLessThanOrEqual(95); }
    expect(b.sources.map((s) => s.n)).toEqual(b.sources.map((_, i) => i + 1));
  });
  it("suggests passing it on when the map names someone else, deciding when it is mine", () => {
    const c = caseOf("c1");
    const owner = c.route?.owner.name ?? "";
    expect(briefForCase(c, ctx, { ...facts, me: owner === "T. Vogel" ? "Someone else" : "T. Vogel" }).rec).toBe("hand");
    expect(briefForCase(c, ctx, { ...facts, me: owner }).rec).toBe(c.upside ? "yes" : "ask");
  });
  it("counts everyone who stands behind it as support", () => {
    const one = briefForCase(caseOf("c1"), ctx, facts).scores[4].value;
    const three = briefForCase(caseOf("c1"), ctx, { ...facts, affected: ["S. Dahl", "J. Klein", "J. Schmidt"] });
    expect(three.scores[4].value).toBeGreaterThan(one);
    expect(three.people.map((p) => p.name)).toEqual(["S. Dahl", "J. Klein", "J. Schmidt"]);
  });
});

describe("display helpers", () => {
  it("shortens long file names in the middle, keeping the extension", () => {
    expect(shortFileName("approval-times-mar-aug.xlsx")).toBe("approval-time…-aug.xlsx");
    expect(shortFileName("short.pdf")).toBe("short.pdf");
  });
  it("tags files by type", () => {
    expect([tagTone("PDF"), tagTone("CSV"), tagTone("PNG"), tagTone("PPTX"), tagTone("DATA")]).toEqual(["red", "green", "violet", "blue", "grey"]);
  });
  it("reads red only once more than a week late", () => {
    expect([badgeTone(3), badgeTone(0), badgeTone(-1), badgeTone(-7), badgeTone(-8), badgeTone(-20, true)]).toEqual(["left", "left", "overdue", "overdue", "late", "paused"]);
  });
});
