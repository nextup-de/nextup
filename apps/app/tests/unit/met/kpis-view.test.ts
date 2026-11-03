// MET-K1: the KPI view's text and the KPI CSV. Pure.
import { describe, expect, it } from "vitest";
import { kpisCsv, kpiView } from "@/components/metrics/kpi-view";
import type { ZiRow } from "@/features/metrics/types";
import { createT } from "@/i18n";

const row = (over: Partial<ZiRow>): ZiRow => ({
  unitId: "u1", label: "Quality", depth: 0, headcount: 40, participationPct: 31, ideasPer100: 19.5, implementationPct: 44,
  medianDaysToDecision: 5, savingsEur: 61000.5, energyKwh: 12500, co2Kg: 800, premiumsEur: 1500, hidden: false, ...over,
});
const hiddenRow = (over: Partial<ZiRow> = {}): ZiRow =>
  row({ unitId: "u2", label: "Logistics", headcount: 0, participationPct: null, ideasPer100: null, implementationPct: null, medianDaysToDecision: null, savingsEur: null, energyKwh: null, co2Kg: null, premiumsEur: null, hidden: true, ...over });

const zi = { company: row({ unitId: null, label: "" }), units: [row({}), hiddenRow()] };
const cell = (cells: { id: string; value: string }[], id: string) => cells.find((c) => c.id === id)?.value;

describe("MET KPI view", () => {
  it("formats percentages, euros and kWh per locale", () => {
    const en = kpiView(zi, createT("en"), true, "en");
    expect(cell(en.tiles, "participation")).toBe("31 %");
    expect(cell(en.tiles, "ideasPer100")).toBe("19.5");
    expect(cell(en.tiles, "days")).toBe("5 days");
    expect(cell(en.tiles, "savings")).toBe("€61,001");
    expect(cell(en.tiles, "energy")).toBe("12,500 kWh");
    const de = kpiView(zi, createT("de"), true, "de");
    expect(cell(de.tiles, "ideasPer100")).toBe("19,5");
    expect(cell(de.tiles, "days")).toBe("5 Tage");
    expect(cell(de.tiles, "energy")).toBe("12.500 kWh");
    expect(cell(de.tiles, "savings")).toContain("€");
    expect(cell(de.tiles, "savings")).toContain("61.001");
    expect(en.projectsOffLine).toBeNull();
  });

  it("a hidden row reads TooFewToShow in every cell and shows no value", () => {
    const t = createT("en");
    const view = kpiView(zi, t, true, "en");
    const hidden = view.rows.find((r) => r.hidden)!;
    expect(hidden.cells.length).toBeGreaterThan(0);
    expect(hidden.cells.every((c) => c.value === t("kpis.tooFew"))).toBe(true);
    expect(view.rows.find((r) => !r.hidden)!.cells.some((c) => c.value === t("kpis.tooFew"))).toBe(false);
    const all = kpiView({ company: hiddenRow({ unitId: null }), units: [] }, t, true, "en");
    expect(all.allHidden).toBe(true);
    expect(all.tiles.every((c) => c.value === t("kpis.tooFew"))).toBe(true);
  });

  it("projects off replaces savings and premiums with the projects-off line", () => {
    const t = createT("en");
    const view = kpiView(zi, t, false, "en");
    expect(view.projectsOffLine).toBe(t("kpis.projectsOff"));
    for (const id of ["savings", "energy", "co2", "premiums"]) expect(cell(view.tiles, id)).toBeUndefined();
    expect(cell(view.tiles, "participation")).toBe("31 %");
  });

  it("the KPI CSV marks hidden rows 'too few'", () => {
    const en = kpisCsv(zi, "en", createT("en"), true).trimEnd().split("\n");
    expect(en[0]).toBe("Unit;Took part (%);Ideas per 100;Implemented (%);Days to decision;Savings (EUR);Energy (kWh);CO2 (kg);Premiums (EUR)");
    expect(en[2]).toBe("Quality;31;19.5;44;5;61000.5;12500;800;1500");
    expect(en[3]).toBe("Logistics;too few;too few;too few;too few;too few;too few;too few;too few");
    const de = kpisCsv(zi, "de", createT("de"), true).trimEnd().split("\n");
    expect(de[2]).toContain("19,5");
    expect(de[3]).toBe("Logistics;zu wenige;zu wenige;zu wenige;zu wenige;zu wenige;zu wenige;zu wenige;zu wenige");
    expect(kpisCsv(zi, "en", createT("en"), false).split("\n")[0]).toBe("Unit;Took part (%);Ideas per 100;Implemented (%);Days to decision");
  });
});
