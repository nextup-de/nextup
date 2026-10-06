// The demo script (features/ideas/demo-script.ts): where a conversation stands in it, which message gets
// a prepared reply, and that what the prepared replies say is still true of the benchmark on acme's seed.
import { beforeAll, describe, expect, it } from "vitest";
import { emptyLog } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { seedFor } from "@/features/demo";
import { GOALS } from "@/features/evaluate";
import { DEFAULT_PUBLISH_THRESHOLD, type BenchmarkContext } from "@/features/ideas/benchmarks";
import { DEMO_SCRIPT, scriptReply, scriptStep } from "@/features/ideas/demo-script";
import { ideaContext, scoreDraft } from "@/features/ideas/drafts";
import { IDEA_UPDATE, railOf } from "@/features/ideas/raise";

type Turn = { role: "user" | "assistant"; text: string };
const [idea, more, last] = DEMO_SCRIPT;
const said = (n: number): Turn[] => DEMO_SCRIPT.slice(0, n).flatMap((s): Turn[] => [{ role: "user", text: s.say }, { role: "assistant", text: s.reply }]);

describe("where a conversation stands", () => {
  it("counts the script's steps said so far", () => {
    expect(scriptStep([])).toBe(0);
    expect(scriptStep(said(1))).toBe(1);
    expect(scriptStep(said(3))).toBe(DEMO_SCRIPT.length);
  });
  it("leaves the script once the author writes their own words", () => {
    expect(scriptStep([{ role: "user", text: "A new coffee machine" }])).toBe(-1);
    expect(scriptStep([...said(1), { role: "user", text: "It is about 40 minutes, I think." }])).toBe(-1);
    expect(scriptStep([...said(3), { role: "user", text: more.say }])).toBe(-1);
  });
  it("keeps the idea when context and choices were added under its first line", () => {
    expect(scriptStep([{ role: "user", text: idea.say + "\n\nSuggested receiver: T. Vogel" }])).toBe(1);
  });
  it("keeps an answer that carries idea edits along", () => {
    expect(scriptStep([...said(1), { role: "user", text: more.say + IDEA_UPDATE + "Changed idea" }])).toBe(2);
  });
});

describe("prepared replies", () => {
  it("answers each step in order, and nothing else", () => {
    expect(scriptReply([], idea.say)).toBe(idea.reply);
    expect(scriptReply(said(1), more.say)).toBe(more.reply);
    expect(scriptReply(said(2), last.say)).toBe(last.reply);
    expect(scriptReply([], more.say)).toBeNull();
    expect(scriptReply(said(1), "Something of my own")).toBeNull();
    expect(scriptReply(said(3), last.say)).toBeNull();
  });
  it("carries no scores - those stay on the side", () => {
    for (const s of DEMO_SCRIPT) expect(s.reply).not.toMatch(/of 100|\d+ points?\b|\bUp \d/);
  });
});

describe("what the replies say is true of the benchmark", () => {
  let ctx: BenchmarkContext;
  beforeAll(async () => {
    const seed = await seedFor("acme");
    ctx = ideaContext(seed.routes, GOALS, reduce(seed, emptyLog()).cases);
  });
  const after = (n: number) => scoreDraft({ turns: said(n), affected: [], attachments: 0 }, ctx);
  const found = (n: number) => after(n).parts.flatMap((p) => p.found);

  it("the idea: serves the changeover goal, the tooling and layout owner decides, nothing like it is raised", () => {
    expect(found(1)).toContain("Serves “Every changeover under 20 minutes”");
    expect(found(1)).toContain("Decided by the owner of “Fixture, tooling or line layout”");
    for (const n of [1, 2, 3]) expect(after(n).sameAs).toBeNull();
  });
  it("starts under the publish line, the first answer lifts it over, the second needs no spend and names a first step", () => {
    expect(after(1).overall).toBeLessThan(DEFAULT_PUBLISH_THRESHOLD);
    expect(after(2).overall).toBeGreaterThanOrEqual(DEFAULT_PUBLISH_THRESHOLD);
    expect(found(3)).toEqual(expect.arrayContaining(["No spend needed", "Names a first step"]));
    expect(after(3).overall).toBeGreaterThan(after(2).overall);
  });
  it("walks the rail as the replies do: the value first, then the first step, then ready", () => {
    const rail = (n: number) => Object.fromEntries(railOf(after(n).parts).map((g) => [g.key, g.status]));
    expect(rail(1)).toEqual({ value: "active", feas: "clear", cost: "clear", fit: "clear", risk: "open" });
    expect(rail(2)).toEqual({ value: "clear", feas: "clear", cost: "clear", fit: "clear", risk: "active" });
    expect(Object.values(rail(3))).toEqual(["clear", "clear", "clear", "clear", "clear"]);
  });
  it("still misses the two points the last reply says do not block it: who else it helps, and a photo", () => {
    const missing = after(3).parts.flatMap((p) => p.missing).join(" ");
    expect(missing).toMatch(/who else it helps/);
    expect(missing).toMatch(/photo/);
  });
});
