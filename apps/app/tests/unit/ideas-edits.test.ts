// Editing an open idea's Affects and Context (features/ideas/edits.ts): the overlay on the brief, and
// what a save really changes.
import { describe, expect, it } from "vitest";
import { applyIdeaEdits, changesOf } from "@/features/ideas/edits";
import type { IdeaBrief } from "@/features/ideas/brief";

const brief = {
  description: "Two flashing benches for the whole fleet.",
  context: "Booked by phone.",
  prompts: [{ label: "Worth", text: "≈ 3 test days per vehicle" }, { label: "Flagged as", text: "not responsible" }],
  depts: [{ id: "d1", name: "Vehicle Engineering", ai: false, why: "they run the benches", members: [] }],
  people: [{ name: "E. Wagner", ai: false, why: null }],
} as unknown as IdeaBrief;

describe("applyIdeaEdits", () => {
  it("leaves the brief alone without edits", () => {
    expect(applyIdeaEdits(brief, null)).toBe(brief);
  });

  it("keeps known teams and people with their why, and adds new names as teams", () => {
    const out = applyIdeaEdits(brief, { affects: ["E. Wagner", "Logistics"] });
    expect(out.people.map((x) => x.name)).toEqual(["E. Wagner"]);
    expect(out.depts.map((d) => d.name)).toEqual(["Logistics"]);
    expect(applyIdeaEdits(brief, { affects: ["Vehicle Engineering"] }).depts[0].why).toBe("they run the benches");
  });

  it("replaces the context and the facts by label", () => {
    const out = applyIdeaEdits(brief, { context: "  ", prompts: { Worth: "≈ 5 days" } });
    expect(out.context).toBeNull();
    expect(out.prompts).toEqual([{ label: "Worth", text: "≈ 5 days" }, { label: "Flagged as", text: "not responsible" }]);
  });
});

describe("changesOf", () => {
  it("keeps only what really changed", () => {
    expect(changesOf(brief, "Test vehicles wait", { title: "Test vehicles wait", body: brief.description, affects: ["Vehicle Engineering", "E. Wagner"] })).toEqual({});
    expect(changesOf(brief, "Test vehicles wait", { title: " Test vehicles wait 3 days ", context: "Booked by phone, twice." }))
      .toEqual({ title: "Test vehicles wait 3 days", context: "Booked by phone, twice." });
  });

  it("never sends an empty title or text", () => {
    expect(changesOf(brief, "T", { title: " ", body: "" })).toEqual({});
  });
});
