// "Export" in the last look (features/ideas/export.ts): the plain text and the document.
import { describe, expect, it } from "vitest";
import { exportFileName, exportHtml, exportParts, exportText, type ExportIdea } from "@/features/ideas/export";

const idea: ExportIdea = {
  kind: "idea", title: "Reuse inbound cardboard for outbound packing",
  summary: "Flatten and sort cardboard from inbound deliveries so packing can reuse it.",
  context: "We bin roughly two pallets of clean cardboard a day.",
  affected: ["Packing", "Logistics"], coll: ["A. Novak"], meet: { dur: "15 min", when: "this week" },
  prompts: [{ label: "Impact", text: "Lower box spend, less waste" }, { label: "", text: "Ask Line 2 first" }, { label: "Trial", text: "  " }],
  author: "J. Schmidt",
};

describe("exportText", () => {
  it("lays the idea out as the handoff's plain text", () => {
    expect(exportText(idea)).toBe([
      "Idea: Reuse inbound cardboard for outbound packing", "",
      "Flatten and sort cardboard from inbound deliveries so packing can reuse it.", "",
      "Context", "We bin roughly two pallets of clean cardboard a day.", "",
      "Affects: Packing, Logistics", "Raised with: A. Novak", "Requested meeting: 15 min, this week",
      "Impact: Lower box spend, less waste", "Note: Ask Line 2 first", "",
      "Raised by J. Schmidt",
    ].join("\n"));
  });
  it("leaves out empty sections and rows, and says Problem for a problem", () => {
    const t = exportText({ ...idea, kind: "problem", context: "", affected: [], coll: [], meet: null, prompts: [] });
    expect(t).toBe("Problem: Reuse inbound cardboard for outbound packing\n\nFlatten and sort cardboard from inbound deliveries so packing can reuse it.\n\nRaised by J. Schmidt");
  });
  it("adds NextUp's assessment only when it is included", () => {
    const analysis = { rec: "Pilot", why: "Try it with Packing first.", overall: 61, scores: [{ label: "Value", val: "59" }, { label: "Risk", val: "–" }] };
    const t = exportText({ ...idea, context: "", affected: [], coll: [], meet: null, prompts: [], analysis });
    expect(t).toBe("Idea: Reuse inbound cardboard for outbound packing\n\nFlatten and sort cardboard from inbound deliveries so packing can reuse it.\n\n" +
      "Assessment (Nextup): Pilot · 61/100\nTry it with Packing first.\nValue 59 · Risk –\n\nRaised by J. Schmidt");
    expect(exportHtml({ ...idea, analysis })).toContain("Overall 61 / 100");
    expect(exportHtml(idea)).not.toContain("Assessment");
  });
});

describe("exportHtml", () => {
  it("escapes what the author wrote and keeps line breaks", () => {
    const h = exportHtml({ ...idea, title: "<b>Boxes</b> & more", context: "line one\nline two" });
    expect(h).toContain("<h1>&lt;b&gt;Boxes&lt;/b&gt; &amp; more</h1>");
    expect(exportHtml({ ...idea, receiver: "T. Vogel" })).toContain("Goes to <b>T. Vogel</b>");
    expect(h).toContain("line one<br>line two");
    expect(exportParts(idea).rows).toHaveLength(5);
  });
});

describe("exportFileName", () => {
  it("keeps word characters, dashes and spaces, at most 60, with a fallback", () => {
    expect(exportFileName("Reuse inbound cardboard: €4k/month!")).toBe("Reuse inbound cardboard 4kmonth.doc");
    expect(exportFileName("x".repeat(80))).toBe("x".repeat(60) + ".doc");
    expect(exportFileName("€€")).toBe("idea.doc");
  });
});
