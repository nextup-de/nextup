// LOOP-I1: a KPI file is read into rows; the latest row of the baseline metric is the measure.
import { describe, expect, it } from "vitest";
import { parseKpiCsv, pickForCheck } from "@/features/projects/measure-import";

describe("LOOP KPI file", () => {
  it("reads a German ; file with decimal comma and German dates", () => {
    const r = parseKpiCsv("Datum;Kennzahl;Wert\n31.10.2026;Rüstzeit;12,5\n");
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([{ date: "2026-10-31", metric: "Rüstzeit", value: 12.5 }]);
  });

  it("reads an English , file with ISO dates and decimal point", () => {
    const r = parseKpiCsv("date,metric,value\r\n2026-10-31,Changeover,12.5\r\n2026-11-30,Changeover,\"11\"\r\n");
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => [x.date, x.value])).toEqual([["2026-10-31", 12.5], ["2026-11-30", 11]]);
  });

  it("reports a line with a missing value by its line number", () => {
    const r = parseKpiCsv("date,metric,value\n2026-10-01,A,1\n2026-10-02,A,\n2026-10-03,A,x\n");
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toEqual([{ line: 3, reason: "missing value" }, { line: 4, reason: "bad value" }]);
  });

  it("picks the latest date of the metric, case-insensitively, and null for an unknown one", () => {
    const { rows } = parseKpiCsv("date;metric;value\n2026-10-01;Scrap;5\n2026-10-20;scrap ;4\n2026-10-25;Other;9\n");
    expect(pickForCheck(rows, " SCRAP")).toEqual({ date: "2026-10-20", metric: "scrap", value: 4 });
    expect(pickForCheck(rows, "Nope")).toBeNull();
  });
});
