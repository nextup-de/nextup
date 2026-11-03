// LOOP-U1: what the measure card says about a result: its source, its impact, whether it is confirmed.
import { describe, expect, it } from "vitest";
import { LOOP_DEFAULTS } from "@/features/loop/rules";
import type { Measure, ReducedProject } from "@/features/projects/types";
import { impactLines, measureShown, measureSourceLine, rewardShown, verdictLabel } from "@/features/projects/views";
import { createT } from "@/i18n";

const base: Measure = {
  check: 30, value: 12, source: "", note: "", day: 5, by: "Lena", byUserId: "u1",
  sourceKind: "typed", sourceInfo: { kind: "typed" }, impact: null,
  confirmed: false, confirmedByUserId: null, confirmedDay: null, verdict: "better", changePct: -40,
};
const day = (d: number) => "day " + d;
const names = { by: "Lena", confirmedBy: "Max", day };

describe("LOOP measure card", () => {
  it("says where a result comes from, in English and German", () => {
    const en = createT("en"), de = createT("de");
    const imported: Measure = { ...base, sourceKind: "import", sourceInfo: { kind: "import", file: "kpi.csv", sha256: "ab", rows: 3 } };
    const confirmed: Measure = { ...base, confirmed: true, confirmedByUserId: "u2", confirmedDay: 7 };
    expect(measureSourceLine(imported, names, en)).toBe("From kpi.csv · imported day 5");
    expect(measureSourceLine(base, names, en)).toBe("Typed by Lena · not confirmed");
    expect(measureSourceLine(confirmed, names, en)).toBe("Typed by Lena · Confirmed by Max on day 7");
    expect(measureSourceLine(imported, names, de)).toBe("Aus kpi.csv · importiert am day 5");
    expect(measureSourceLine(base, names, de)).toBe("Eingetippt von Lena · nicht bestätigt");
    expect(measureSourceLine(confirmed, names, de)).toBe("Eingetippt von Lena · Bestätigt von Max am day 7");
  });

  it("lists only the impact figures that were given", () => {
    const lines = impactLines({ savingEurPerYear: 1200, scrapPartsPerYear: 40 }, "en");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("1,200");
    expect(lines[1]).toContain("40");
    expect(impactLines(null, "en")).toEqual([]);
  });

  it("reads 'Not confirmed yet' for an unconfirmed better result", () => {
    const p: Pick<ReducedProject, "measures" | "verdict"> = { measures: [base], verdict: "better" };
    expect(verdictLabel(p, "en")).toBe("Not confirmed yet");
    expect(verdictLabel(p, "de")).toBe("Noch nicht bestätigt");
    expect(verdictLabel({ measures: [{ ...base, confirmed: true }], verdict: "better" }, "en")).toBe("better");
  });

  it("shows the panels by the company's steps", () => {
    expect(measureShown({ ...LOOP_DEFAULTS, measure: true })).toBe(true);
    expect(measureShown({ ...LOOP_DEFAULTS, measure: false })).toBe(false);
    expect(rewardShown({ ...LOOP_DEFAULTS, recognition: true })).toBe(true);
    expect(rewardShown({ ...LOOP_DEFAULTS, recognition: false })).toBe(false);
  });
});
