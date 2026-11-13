// REM-S1 (B1): Settings -> Rules sets the overload thresholds (rule overload_at, plan OVL D17) and the blocked-step days (rule blocked_days, plan MOV).
// The form takes only what the rule parser keeps, and an empty field leaves the default in force.
import { createElement as h } from "react";
import { renderToStaticMarkup as html } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("@/server/actions/settings/company", () => ({ saveRulesAction: async () => ({}) }));

import { RulesForm } from "@/components/settings/RulesForm";
import { parseRulesForm, type FormFields } from "@/features/settings/company-forms";
import { rowsFromRules, rulesFromRows } from "@/features/knowledge/rules";
import { I18nProvider } from "@/i18n/client";
import { de } from "@/i18n/de";
import { en } from "@/i18n/en";

const base: FormFields = {
  promiseDays: "3", outcomeDays: "10", discussEveryDays: "2", discussMaxRounds: "4", fastLaneEur: "1000", measureDays: "30, 90", tolerancePct: "3", rewardRule: "thanks",
};
const AT: FormFields = { overloadTriage: "8", overloadUp: "16", overloadOverflow: "24", overloadLate: "4" };

const parsed = (f: FormFields) => {
  const r = parseRulesForm({ ...base, ...f });
  if (!r.ok) throw new Error(`${r.field}: ${r.error}`);
  return r.value;
};
const page = (locale: "en" | "de", f: FormFields) => {
  const value = parsed(f);
  return html(h(I18nProvider, { locale, children: h(RulesForm, { slug: "acme", values: value }) } as never));
};

it("REM rules reads and writes overload_at", () => {
  // Written: the four numbers become the overload_at row, exactly as the parser reads them back.
  const value = parsed({ ...AT, blockedDays: "" });
  expect(value.rules.overloadAt).toEqual({ triage: 8, up: 16, overflow: 24, late: 4 });
  const rows = rowsFromRules(value.rules);
  expect(rows.find((r) => r.key === "overload_at")?.value).toEqual({ triage: 8, up: 16, overflow: 24, late: 4 });
  expect(rulesFromRows(rows).overloadAt).toEqual({ triage: 8, up: 16, overflow: 24, late: 4 });
  // The edges the parser keeps: 1, 2, 3 and 1; and 198, 199, 200 and 50.
  expect(parsed({ overloadTriage: "1", overloadUp: "2", overloadOverflow: "3", overloadLate: "1" }).rules.overloadAt).toEqual({ triage: 1, up: 2, overflow: 3, late: 1 });
  expect(parsed({ overloadTriage: "198", overloadUp: "199", overloadOverflow: "200", overloadLate: "50" }).rules.overloadAt).toEqual({ triage: 198, up: 199, overflow: 200, late: 50 });
  // Read: the form shows the stored numbers in both languages, with a label for each.
  const stored = { ...value.rules, overloadAt: { triage: 8, up: 16, overflow: 24, late: 4 } };
  for (const locale of ["en", "de"] as const) {
    const out = html(h(I18nProvider, { locale, children: h(RulesForm, { slug: "acme", values: { ...value, rules: stored } }) } as never));
    for (const tid of ["triage", "up", "overflow", "late"]) expect(out, `${locale} ${tid}`).toContain(`data-testid="settings-rules-overload-${tid}"`);
    expect(out).toContain('value="16"');
    expect(out).toContain(locale === "en" ? "Busy desk" : "Voller Platz");
  }
  // With no rule the form shows the defaults the desk-load card uses.
  const fresh = page("en", {});
  expect(fresh).toContain('value="10"');
  expect(fresh).toContain('value="30"');
});

it("REM rules rejects an invalid order", () => {
  const bad = (f: FormFields) => expect(parseRulesForm({ ...base, ...AT, ...f }), JSON.stringify(f)).toMatchObject({ ok: false, error: "settingsCompany.errOverloadAt", field: "overloadAt" });
  bad({ overloadTriage: "16" }); // triage equal to up
  bad({ overloadTriage: "20" }); // triage above up
  bad({ overloadOverflow: "16" }); // overflow equal to up
  bad({ overloadUp: "30" }); // up above overflow
  bad({ overloadTriage: "0", overloadUp: "1", overloadOverflow: "2" }); // below 1
  bad({ overloadOverflow: "201" }); // above 200
  bad({ overloadLate: "0" });
  bad({ overloadLate: "51" });
  bad({ overloadLate: "2.5" }); // not whole
  bad({ overloadUp: "abc" });
  // The blocked days follow the parser's 1 to 10.
  for (const v of ["0", "11", "-1", "2.5", "x"]) expect(parseRulesForm({ ...base, blockedDays: v }), v).toMatchObject({ ok: false, error: "settingsCompany.errBlockedDays", field: "blockedDays" });
  // Both messages exist in German and English.
  for (const cat of [en, de] as unknown as Record<string, Record<string, string>>[]) {
    expect(cat.settingsCompany?.errOverloadAt).toBeTruthy();
    expect(cat.settingsCompany?.errBlockedDays).toBeTruthy();
  }
});

it("REM rules writes blocked_days", () => {
  const value = parsed({ blockedDays: "5" });
  expect(value.rules.blockedDays).toBe(5);
  const rows = rowsFromRules(value.rules);
  expect(rows.find((r) => r.key === "blocked_days")?.value).toEqual({ days: 5 });
  expect(rulesFromRows(rows).blockedDays).toBe(5);
  expect(parsed({ blockedDays: "1" }).rules.blockedDays).toBe(1);
  expect(parsed({ blockedDays: "10" }).rules.blockedDays).toBe(10);
  // The form shows the stored days, and the default of 3 when there is none.
  const shown = html(h(I18nProvider, { locale: "en", children: h(RulesForm, { slug: "acme", values: value }) } as never));
  expect(shown).toMatch(/id="blockedDays"[^>]*value="5"|value="5"[^>]*id="blockedDays"/);
  expect(page("de", {})).toContain("Erinnerung bei blockiertem Schritt");
  expect(page("en", {})).toMatch(/id="blockedDays"[^>]*value="3"|value="3"[^>]*id="blockedDays"/);
});

it("REM rules empty field keeps the default", () => {
  // Nothing typed: no rule is stored, so the overload and blocked defaults apply.
  const value = parsed({ ...base, overloadTriage: "", overloadUp: "", overloadOverflow: "", overloadLate: "", blockedDays: "" });
  expect(value.rules.overloadAt).toBeUndefined();
  expect(value.rules.blockedDays).toBeUndefined();
  const rows = rowsFromRules(value.rules);
  expect(rows.some((r) => r.key === "overload_at" || r.key === "blocked_days")).toBe(false);
  // Fields left out of the form entirely (an older form) behave the same.
  expect(parsed({}).rules.overloadAt).toBeUndefined();
  // One empty number takes its default (10, 20, 30, 3) and the result is checked as a whole.
  expect(parsed({ overloadTriage: "5", overloadUp: "", overloadOverflow: "", overloadLate: "" }).rules.overloadAt).toEqual({ triage: 5, up: 20, overflow: 30, late: 3 });
  expect(parseRulesForm({ ...base, overloadTriage: "25", overloadUp: "", overloadOverflow: "", overloadLate: "" })).toMatchObject({ ok: false, field: "overloadAt" });
});
