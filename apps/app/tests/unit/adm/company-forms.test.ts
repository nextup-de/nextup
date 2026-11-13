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

  it("takes the escalation days from 0 to 60, and an empty field as no rule", () => {
    const of = (escalationDays?: string) => parseRulesForm({ ...goodRules, escalationDays });
    const days = (v?: string) => { const r = of(v); return r.ok ? r.value.rules.escalationDays : "refused"; };
    expect([days("0"), days("3"), days("60"), days(""), days(undefined)]).toEqual([0, 3, 60, undefined, undefined]);
    for (const bad of ["61", "-1", "2.5", "soon"]) {
      expect(of(bad)).toMatchObject({ ok: false, error: "settingsCompany.errEscalationDays", field: "escalationDays" });
    }
  });

  it("takes who an idea is posted as: the name only when chosen, anything else the handle (decision Q1.7)", () => {
    const postAs = (v?: string) => {
      const r = parseRulesForm(v === undefined ? goodRules : { ...goodRules, postAs: v });
      return r.ok ? r.value.rules.postAs : null;
    };
    expect(postAs()).toBe("handle");
    expect(postAs("name")).toBe("name");
    expect(postAs("handle")).toBe("handle");
    expect(postAs("everyone")).toBe("handle");
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

describe("SET start days", () => {
  const of = (projectStartDays?: string) => parseRulesForm({ ...goodRules, projectStartDays });
  const days = (v?: string) => { const r = of(v); return r.ok ? r.value.rules.projectStartDays : "refused"; };

  it("takes a whole number of working days from 1 to 60 and saves it into the company rules", () => {
    expect([days("10"), days("1"), days("60"), days(" 25 ")]).toEqual([10, 1, 60, 25]);
  });

  it("refuses 0 and 61, and anything that is not a whole number, with a message on the field", () => {
    for (const bad of ["0", "61", "-1", "2.5", "soon"]) {
      expect(of(bad)).toMatchObject({ ok: false, error: "settingsCompany.errProjectStartDays", field: "projectStartDays" });
    }
  });

  it("takes an empty field as no rule, so the default applies", () => {
    expect([days(""), days(undefined)]).toEqual([undefined, undefined]);
    const r = of("");
    expect(r.ok && "projectStartDays" in r.value.rules).toBe(false);
  });

  it("has the message and the labels in German and English", () => {
    for (const k of ["errProjectStartDays", "projectStartDays", "projectStartHelp"] as const) {
      expect(en.settingsCompany[k]).toBeTruthy();
      expect(de.settingsCompany[k]).toBeTruthy();
    }
  });
});

// Plan NOR, NOR-C1 (B3): the three rules of the reasoned no, each a whole number in its range, an empty field no rule.
describe("NOR rules form", () => {
  const FIELDS = [
    { id: "noReasonMin", min: 20, max: 400, error: "settingsCompany.errNoReasonMin" },
    { id: "appealDays", min: 1, max: 60, error: "settingsCompany.errAppealDays" },
    { id: "questionDays", min: 2, max: 30, error: "settingsCompany.errQuestionDays" },
  ] as const;
  const of = (id: string, value?: string) => parseRulesForm({ ...goodRules, [id]: value });
  const read = (id: (typeof FIELDS)[number]["id"], value?: string) => { const r = of(id, value); return r.ok ? r.value.rules[id] : "refused"; };

  it("reads noReasonMin from 20 to 400, appealDays from 1 to 60 and questionDays from 2 to 30 into the company rules", () => {
    for (const f of FIELDS) {
      expect([read(f.id, String(f.min)), read(f.id, String(f.max)), read(f.id, ` ${f.min + 1} `)], f.id).toEqual([f.min, f.max, f.min + 1]);
    }
    const all = parseRulesForm({ ...goodRules, noReasonMin: "60", appealDays: "14", questionDays: "7" });
    expect(all.ok && all.value.rules).toMatchObject({ noReasonMin: 60, appealDays: 14, questionDays: 7 });
  });

  it("refuses a value outside the range, or not a whole number, with the field's message", () => {
    for (const f of FIELDS) {
      for (const bad of [String(f.min - 1), String(f.max + 1), "-1", "2.5", "many"]) {
        expect(of(f.id, bad), `${f.id} ${bad}`).toMatchObject({ ok: false, error: f.error, field: f.id });
      }
    }
  });

  it("takes an empty field as no rule, so the default applies", () => {
    for (const f of FIELDS) {
      expect([read(f.id, ""), read(f.id, undefined)], f.id).toEqual([undefined, undefined]);
      const r = of(f.id, "");
      expect(r.ok && f.id in r.value.rules).toBe(false);
    }
  });

  it("has the labels, the help and the messages in German and English", () => {
    for (const k of ["noReasonMin", "noReasonMinHelp", "appealDays", "appealDaysHelp", "questionDays", "questionDaysHelp", "charactersUnit", "errNoReasonMin", "errAppealDays", "errQuestionDays"] as const) {
      expect(en.settingsCompany[k], k).toBeTruthy();
      expect(de.settingsCompany[k], k).toBeTruthy();
    }
  });
});
