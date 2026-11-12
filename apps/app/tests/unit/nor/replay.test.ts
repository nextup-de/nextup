// NOR-A1 (B3): a log written the way main writes today reduces to exactly the same cases as before NOR, in every field a
// case had before (decision D6). The expected values were taken from the reducer at the base commit and copied in.
import { describe, expect, it } from "vitest";
import { reduce } from "@/features/cases/reducer";
import { EXPECTED } from "./replay-expected";
import { LOG_DAY, oldFields, preNorEvents, seedOf } from "./replay-log";

describe("NOR replay", () => {
  for (const mode of ["demo", "workdays"] as const) {
    it(`a pre-NOR log reduces to the same cases as before NOR (${mode} clock)`, () => {
      const s = reduce(seedOf(mode === "workdays"), { events: preNorEvents(), day: LOG_DAY });
      const expected = EXPECTED[mode] as unknown as Record<string, unknown>;
      expect(s.cases.map((c) => c.id)).toEqual(Object.keys(expected));
      for (const c of s.cases) expect(JSON.parse(JSON.stringify(oldFields(c))), c.id).toEqual(expected[c.id]);
      expect(s.ledger).toEqual(EXPECTED[`${mode}Ledger`]);
      expect(s.projects.map((p) => ({ id: p.id, title: p.title, lead: p.lead, status: p.status, sources: p.sources }))).toEqual(EXPECTED[`${mode}Projects`]);
    });
  }

  it("the old noes keep their reason and note, an old yes its project, and a pass on an asked case without keepsQuestion is still ignored", () => {
    const s = reduce(seedOf(false), { events: preNorEvents(), day: LOG_DAY });
    const by = (id: string) => s.cases.find((c) => c.id === id)!;
    expect(by("ca").decided).toMatchObject({ answer: "no", reason: "no time", note: "The plan is full until Q4", category: "no-time" });
    expect(by("cb").decided).toMatchObject({ reason: "Too costly", note: "", category: "other" });
    expect(by("cd").decided).toMatchObject({ answer: "yes", projectId: "p_cd" });
    expect(by("cc").handed.map((h) => h.why)).toEqual(["Quality owns it", "Engineering owns it"]); // the first pass, on the asked case, is not one
    expect(by("cc").question?.answer?.text).toBe("Line 3");
  });

  it("the new fields of an old log are empty or derived: no reopens, no appeal, cycle from the raise day, passes of people counted", () => {
    const s = reduce(seedOf(false), { events: preNorEvents(), day: LOG_DAY });
    for (const c of s.cases) {
      expect(c, c.id).toMatchObject({ appeal: null, reopens: [], dueFloor: null, reopenSeq: null });
      expect(c.cycleStartDay, c.id).toBe(c.raisedDay);
    }
    expect(s.cases.find((c) => c.id === "cc")!.passes).toBe(2);
    expect(s.cases.find((c) => c.id === "ce")!.passes).toBe(0); // the clock's hand-over is not a person's pass
    expect(s.cases.find((c) => c.id === "ca")!.decisions).toHaveLength(1);
  });
});
