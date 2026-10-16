// The demo script (features/ideas/demo-script.ts): where a conversation stands in it, which message gets
// a prepared reply, the rail it walks, and what its answers give the benchmark on the static demo's seed.
import { beforeAll, describe, expect, it } from "vitest";
import { emptyLog } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { STATIC_DEMO_SEED } from "@/features/demo/static-demo";
import { GOALS } from "@/features/evaluate";
import { DEFAULT_PUBLISH_THRESHOLD, type BenchmarkContext } from "@/features/ideas/benchmarks";
import { DEMO_IDEA, DEMO_SCRIPT, DEMO_TOPICS, SCRIPT_MOVES, scriptRail, scriptReply, scriptStep } from "@/features/ideas/demo-script";
import { ideaContext, scoreDraft } from "@/features/ideas/drafts";
import { IDEA_UPDATE } from "@/features/ideas/raise";

type Turn = { role: "user" | "assistant"; text: string };
const [idea, more, last] = DEMO_SCRIPT;
const END = DEMO_SCRIPT.length;
const said = (n: number): Turn[] => DEMO_SCRIPT.slice(0, n).flatMap((s): Turn[] => [{ role: "user", text: s.say }, { role: "assistant", text: s.reply }]);

describe("where a conversation stands", () => {
  it("counts the script's steps said so far", () => {
    expect(scriptStep([])).toBe(0);
    expect(scriptStep(said(1))).toBe(1);
    expect(scriptStep(said(END))).toBe(END);
  });
  it("leaves the script once the author writes their own words", () => {
    expect(scriptStep([{ role: "user", text: "A new coffee machine" }])).toBe(-1);
    expect(scriptStep([...said(1), { role: "user", text: "It is about 40 minutes, I think." }])).toBe(-1);
    expect(scriptStep([...said(END), { role: "user", text: more.say }])).toBe(-1);
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
    expect(scriptReply(said(END), last.say)).toBeNull();
  });
  it("carries no scores - those stay on the side", () => {
    for (const s of DEMO_SCRIPT) expect(s.reply).not.toMatch(/of 100|\d+ points?\b|\bUp \d/);
  });
});

describe("the rail", () => {
  it("has the eight topics, each answer clears the next one, and the last answer clears them all", () => {
    expect(DEMO_TOPICS).toHaveLength(8);
    expect(DEMO_SCRIPT).toHaveLength(DEMO_TOPICS.length + 1);
    expect(scriptRail(1).map((t) => t.status)).toEqual(["active", "open", "open", "open", "open", "open", "open", "open"]);
    expect(scriptRail(4).map((t) => t.status)).toEqual(["clear", "clear", "clear", "active", "open", "open", "open", "open"]);
    expect(scriptRail(DEMO_SCRIPT.length).every((t) => t.status === "clear")).toBe(true);
  });
  it("the first reply names every topic, each later one asks the next topic's question, the last says it is ready", () => {
    for (const t of DEMO_TOPICS) expect(DEMO_SCRIPT[0].reply.toLowerCase()).toContain(t.label.toLowerCase());
    DEMO_SCRIPT.slice(1, -1).forEach((s, i) => expect(s.reply.toLowerCase()).toContain(DEMO_TOPICS[i + 1].ask.replace(/\?$/, "").toLowerCase()));
    expect(DEMO_SCRIPT.at(-1)!.reply).toMatch(/Publish it/);
  });
});

describe("what the script's answers give the benchmark", () => {
  let ctx: BenchmarkContext;
  beforeAll(() => { ctx = ideaContext(STATIC_DEMO_SEED.routes, GOALS, reduce(STATIC_DEMO_SEED, emptyLog()).cases); });
  const first = DEMO_IDEA.text + "\n\n" + DEMO_IDEA.ctx;
  const after = (n: number) => scoreDraft({ turns: said(n).map((t, i) => (i === 0 ? { ...t, text: first } : t)), affected: DEMO_IDEA.aff, attachments: DEMO_IDEA.files.length }, ctx);
  it("starts under the publish line with the idea as filled, and the answers lift it over", () => {
    expect(after(1).overall).toBeLessThan(DEFAULT_PUBLISH_THRESHOLD);
    expect(after(END).overall).toBeGreaterThanOrEqual(DEFAULT_PUBLISH_THRESHOLD);
  });
  it("is never taken for an idea already raised, nor for one of the goals it does not name", () => {
    for (let n = 1; n <= END; n++) {
      expect(after(n).sameAs).toBeNull();
      expect(after(n).parts[0].found.join(" ")).not.toMatch(/^Serves/);
    }
  });
  it("the cost answer stays within team authority", () => {
    expect(after(END).parts.flatMap((p) => p.found)).toContain("Within team authority (≤ €5,000)");
  });
});

describe("what each scripted answer moves", () => {
  it("has one entry per step, and every answer moves one to three dials", () => {
    expect(SCRIPT_MOVES).toHaveLength(DEMO_SCRIPT.length);
    for (const moves of SCRIPT_MOVES.slice(1)) {
      const n = Object.keys(moves).length;
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(3);
    }
  });
});
