import { describe, expect, it } from "vitest";
import { EMPTY_SEED } from "@/features/demo";
import { DEMO_GOALS, DEMO_RULES } from "@/features/demo/structure";
import { DEFAULT_RULES, rowsFromRules, rulesFromRows } from "@/features/knowledge/rules";

describe("STR rule values", () => {
  it("round-trips through rows", () => {
    expect(rulesFromRows(rowsFromRules(DEMO_RULES))).toEqual(DEMO_RULES);
    expect(rulesFromRows(rowsFromRules(DEFAULT_RULES))).toEqual(DEFAULT_RULES);
  });
  it("writes no spend row for null", () => {
    expect(rowsFromRules(DEFAULT_RULES).map((r) => r.key)).toEqual(["promise_days", "outcome_days"]);
  });
  it("falls back to the default per key", () => {
    const d = DEFAULT_RULES;
    expect(rulesFromRows([{ key: "promise_days", value: { days: 0 } }]).promiseDays).toBe(d.promiseDays);
    expect(rulesFromRows([{ key: "promise_days", value: { days: 61 } }]).promiseDays).toBe(d.promiseDays);
    expect(rulesFromRows([{ key: "outcome_days", value: { days: 366 } }]).outcomeDays).toBe(d.outcomeDays);
    expect(rulesFromRows([{ key: "spend", value: { limitEur: -1, text: "x" } }]).spend).toBeNull();
    expect(rulesFromRows([{ key: "spend", value: { limitEur: 10, text: "" } }]).spend).toBeNull();
    expect(rulesFromRows([{ key: "promise_days", value: "7" }]).promiseDays).toBe(d.promiseDays);
    expect(rulesFromRows([{ key: "spend", value: "5k" }]).spend).toBeNull();
  });
  it("accepts the bounds and ignores unknown keys", () => {
    const r = rulesFromRows([{ key: "promise_days", value: { days: 60 } }, { key: "outcome_days", value: { days: 365 } }, { key: "nope", value: 1 }]);
    expect(r).toEqual({ promiseDays: 60, outcomeDays: 365, spend: null });
  });
  it("holds acme's goals and spend rule", () => {
    expect(DEMO_GOALS).toHaveLength(4);
    expect(DEMO_RULES.spend?.text).toContain("€5k");
  });
  it("starts an empty seed without goals or spend", () => {
    expect(EMPTY_SEED.goals).toEqual([]);
    expect(EMPTY_SEED.spend).toBeNull();
  });
});
