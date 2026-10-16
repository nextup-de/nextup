// The idea's labelled lines (features/ideas/prompts.ts): rows to context lines and back.
import { describe, expect, it } from "vitest";
import { promptContext, splitPrompts } from "@/features/ideas/prompts";

describe("promptContext", () => {
  it("puts the free text first, then one *Label* line per filled row", () => {
    expect(promptContext(" Jams every morning ", [{ label: "Impact", text: "40 min a day" }, { label: "Cost", text: " €1,200 ", custom: true }]))
      .toBe("Jams every morning\n*Impact* 40 min a day\n*Cost* €1,200");
  });
  it("leaves out rows without a label or text, and is empty when nothing is filled", () => {
    expect(promptContext("", [{ label: "Impact", text: "" }, { label: "", text: "orphan", custom: true }])).toBe("");
  });
});

describe("splitPrompts", () => {
  it("turns *Label* lines into rows and keeps the rest as the free text", () => {
    const { free, rows } = splitPrompts("The printer jams.\n*Impact* 40 min a day\n*Cost* €1,200");
    expect(free).toBe("The printer jams.");
    expect(rows).toEqual([{ label: "Impact", text: "40 min a day" }, { label: "Cost", text: "€1,200", custom: true }]);
  });
  it("reads 'Preset: text' lines as rows too, but not any line with a colon", () => {
    const { free, rows } = splitPrompts("Note: the board is wiped on Fridays\nImpact: fewer lost reports\nTrial: one station");
    expect(free).toBe("Note: the board is wiped on Fridays");
    expect(rows).toEqual([{ label: "Impact", text: "fewer lost reports" }, { label: "Trial", text: "one station" }]);
  });
  it("round-trips", () => {
    const rows = [{ label: "Deadline", text: "Before Q4" }];
    expect(splitPrompts(promptContext("Free", rows))).toEqual({ free: "Free", rows });
  });
});
