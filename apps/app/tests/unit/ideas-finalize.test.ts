// The finalized idea document (features/ideas/finalize.ts): what it carries and how it reads as text.
import { describe, expect, it } from "vitest";
import { docFileName, docText, ideaDoc, type DocInput } from "@/features/ideas/finalize";
import { IDEA_UPDATE, dialsOf } from "@/features/ideas/raise";
import { benchmark } from "@/features/ideas/benchmarks";
import { GOALS } from "@/features/evaluate";
import { ROUTES } from "@/features/demo/seed";

const parts = benchmark({ text: "A shared setup cart for line 3", affected: [], attachments: 0 }, { routes: ROUTES, goals: GOALS, cases: [], spendLimitEur: 5000 }).parts;
const dials = dialsOf(parts);
const empty = { value: [], feas: [], cost: [], fit: [], risk: [] };

const input = (over: Partial<DocInput> = {}): DocInput => ({
  title: "Setup cart for line 3", date: "15 October 2026", author: "A. Meier", team: "Line 3", receiver: "T. Vogel",
  advice: { name: "Pilot", why: "Try it for a few weeks." }, overall: 64,
  description: "A shared setup cart for line 3.", context: "Changeovers lose 20 minutes.\nAll three shifts.",
  dials, company: { ...empty, value: [{ source: "Company goals", text: "Serves “Every changeover under 20 minutes”." }] },
  pattern: "It stands on its own.", openTopics: ["Who else it helps"],
  similar: [], sources: [{ name: "Company goals", where: "3 goals checked" }],
  turns: [
    { role: "user", text: "A shared setup cart for line 3" },
    { role: "assistant", text: "How much time does a changeover lose?" },
    { role: "user", text: "About 20 minutes." + IDEA_UPDATE + "edited idea" },
  ],
  ...over,
});

describe("ideaDoc", () => {
  it("has the five dials and keeps the facts checked across the company with their dial", () => {
    const d = ideaDoc(input());
    expect(d.dials.map((x) => x.label)).toEqual(dials.map((x) => x.label));
    expect(d.dials.find((x) => x.label === "Value")?.facts).toHaveLength(1);
  });
  it("leaves the idea out of the conversation, and idea edits out of the author's lines", () => {
    const d = ideaDoc(input());
    expect(d.conversation).toEqual([{ who: "coach", text: "How much time does a changeover lose?" }, { who: "author", text: "About 20 minutes." }]);
  });
  it("falls back to the first words of the idea for a missing title", () => {
    expect(ideaDoc(input({ title: "  " })).title).toBe("A shared setup cart for line 3.");
    expect(ideaDoc(input({ title: "", description: "" })).title).toBe("Untitled idea");
  });
  it("keeps the summary short", () => {
    expect(ideaDoc(input({ description: "word ".repeat(300) })).summary.length).toBeLessThanOrEqual(421);
  });
});

describe("docText", () => {
  it("reads as the document: sections in order, sources numbered, the decision left to the person", () => {
    const t = docText(ideaDoc(input()));
    const order = ["SUMMARY", "THE IDEA", "DETAILS", "ASSESSMENT (AI)", "CHECKED ACROSS THE COMPANY", "STILL OPEN", "SIMILAR IDEAS", "HOW WE GOT HERE", "SOURCES"].map((h) => t.indexOf(h));
    expect(order.every((i, n) => i >= 0 && (n === 0 || i > order[n - 1]))).toBe(true);
    expect(t).toContain("1. Company goals - 3 goals checked");
    expect(t.trimEnd().endsWith("You make the decision.")).toBe(true);
  });
});

describe("docFileName", () => {
  it("is safe for a file system", () => { expect(docFileName(ideaDoc(input({ title: "Cart: line 3 / fast?" })))).toBe("Cart-line-3-fast"); });
});
