import { describe, expect, it } from "vitest";
import { parseCalendarForm, parseCompanyForm, parseRulesForm, type FormFields } from "@/features/settings/company-forms";
import { de } from "@/i18n/de";
import { en } from "@/i18n/en";

const goodRules: FormFields = {
  promiseDays: "3", outcomeDays: "10", spendLimitEur: "2500", spendText: "Up to 2500 euros without approval",
  discussEveryDays: "2", discussMaxRounds: "4", fastLaneEur: "1000", measureDays: "30, 90", tolerancePct: "3", rewardRule: "share",
  rewardSharePct: "10", rewardCapEur: "5000",
};

describe("ADM company forms", () => {
  it("refuses a name over 120 characters", () => {
    const r = parseCompanyForm({ name: "x".repeat(121) });
    expect(r).toMatchObject({ ok: false, error: "settingsCompany.errName", field: "name" });
  });

  it("parses the company profile", () => {
    const r = parseCompanyForm({ name: " Acme ", mark: "A", vision: "v", mission: "m", principles: "one\n\n two ", businessModel: "b", complianceRules: "c" });
    expect(r).toEqual({
      ok: true,
      value: { name: "Acme", mark: "A", profile: { vision: "v", mission: "m", principles: ["one", "two"], businessModel: "b", complianceRules: "c" } },
    });
  });

  it("refuses a promise of 0 days", () => {
    expect(parseRulesForm({ ...goodRules, promiseDays: "0" })).toMatchObject({ ok: false, error: "settingsCompany.errPromiseDays" });
  });

  it("refuses a negative spend limit", () => {
    expect(parseRulesForm({ ...goodRules, spendLimitEur: "-1" })).toMatchObject({ ok: false, error: "settingsCompany.errSpendLimit" });
  });

  it("parses the rules and the loop rules", () => {
    const r = parseRulesForm(goodRules);
    expect(r.ok && r.value.rules).toMatchObject({ promiseDays: 3, outcomeDays: 10, spend: { limitEur: 2500, text: "Up to 2500 euros without approval" } });
    expect(r.ok && r.value.loop).toMatchObject({
      discussEveryDays: 2, discussMaxRounds: 4, fastLaneEur: 1000, measureDays: [30, 90], tolerancePct: 3,
      reward: { kind: "share", amount: null, sharePct: 10, capEur: 5000 },
    });
  });

  it("takes an empty spend limit as no spend rule", () => {
    const r = parseRulesForm({ ...goodRules, spendLimitEur: "", spendText: "" });
    expect(r.ok && r.value.rules.spend).toBeNull();
  });

  it("refuses a workday 8", () => {
    expect(parseCalendarForm({ region: "DE", workdays: ["1", "8"] })).toMatchObject({ ok: false, error: "settingsCompany.errWorkday" });
  });

  it("refuses an extra holiday 2026-13-01", () => {
    expect(parseCalendarForm({ region: "DE", workdays: ["1"], extraHolidays: "2026-13-01" })).toMatchObject({ ok: false, error: "settingsCompany.errDate", field: "extraHolidays" });
  });

  it("parses the calendar", () => {
    const r = parseCalendarForm({ region: "DE-BY", workdays: ["5", "1", "2"], extraHolidays: "2026-12-24\n2026-12-31", extraWorkdays: "" });
    expect(r).toEqual({ ok: true, value: { region: "DE-BY", workdays: [1, 2, 5], extraHolidays: ["2026-12-24", "2026-12-31"], extraWorkdays: [] } });
  });

  it("has every refusal key in both catalogs", () => {
    for (const k of ["errName", "errPromiseDays", "errSpendLimit", "errWorkday", "errDate", "forbidden"]) {
      expect(en.settingsCompany).toHaveProperty(k);
      expect(de.settingsCompany).toHaveProperty(k);
    }
  });
});
