import { describe, expect, it } from "vitest";
import { EMPTY_SEED } from "@/features/demo";
import { DEMO_GOALS, DEMO_RULES } from "@/features/demo/structure";
import { DEFAULT_RULES, rowsFromRules, rulesFromRows } from "@/features/knowledge/rules";
import { LOOP_DEFAULTS, loopRules } from "@/features/loop/rules";

describe("STR rule values", () => {
  it("round-trips through rows", () => {
    expect(rulesFromRows(rowsFromRules(DEMO_RULES))).toEqual(DEMO_RULES);
    expect(rulesFromRows(rowsFromRules(DEFAULT_RULES))).toEqual(DEFAULT_RULES);
  });
  it("writes no spend row for null", () => {
    expect(rowsFromRules(DEFAULT_RULES).map((r) => r.key)).toEqual(["promise_days", "outcome_days", "deadline_handover", "loop_steps", "posting"]);
  });
  it("posting: the handle until a company chooses the name (decision Q1.7); anything else is the handle", () => {
    expect(DEFAULT_RULES.postAs).toBe("handle");
    expect(rulesFromRows([]).postAs).toBe("handle");
    expect(rulesFromRows([{ key: "posting", value: { as: "name" } }]).postAs).toBe("name");
    expect(rulesFromRows([{ key: "posting", value: { as: "everyone" } }]).postAs).toBe("handle");
    expect(rulesFromRows([{ key: "posting", value: "name" }]).postAs).toBe("handle");
    expect(rulesFromRows(rowsFromRules({ ...DEFAULT_RULES, postAs: "name" })).postAs).toBe("name");
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
    expect(r).toEqual({ ...DEFAULT_RULES, promiseDays: 60, outcomeDays: 365 });
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

describe("SET project_start_days", () => {
  it("reads {days} between 1 and 60 and ignores anything else", () => {
    expect(rulesFromRows([{ key: "project_start_days", value: { days: 10 } }]).projectStartDays).toBe(10);
    expect(rulesFromRows([{ key: "project_start_days", value: { days: 1 } }]).projectStartDays).toBe(1);
    expect(rulesFromRows([{ key: "project_start_days", value: { days: 60 } }]).projectStartDays).toBe(60);
    for (const bad of [{ days: 0 }, { days: 61 }, { days: 2.5 }, { days: "7" }, "7", null]) {
      expect(rulesFromRows([{ key: "project_start_days", value: bad }]).projectStartDays, JSON.stringify(bad)).toBeUndefined();
    }
    expect(rulesFromRows([]).projectStartDays).toBeUndefined();
  });
  it("round-trips through rowsFromRules, and writes no row while it is unset", () => {
    const rules = { ...DEFAULT_RULES, projectStartDays: 15 };
    expect(rowsFromRules(rules)).toContainEqual({ key: "project_start_days", value: { days: 15 } });
    expect(rulesFromRows(rowsFromRules(rules))).toEqual(rules);
    expect(rowsFromRules(DEFAULT_RULES).map((r) => r.key)).not.toContain("project_start_days");
  });
  it("reaches LoopRules.projectStartDays: 10 by default, clamped to 1 to 60", () => {
    expect(LOOP_DEFAULTS.projectStartDays).toBe(10);
    expect(loopRules({}).projectStartDays).toBe(10);
    expect(loopRules(null).projectStartDays).toBe(10);
    expect(loopRules({ projectStartDays: 20 }).projectStartDays).toBe(20);
    expect(loopRules({ projectStartDays: 0 }).projectStartDays).toBe(1);
    expect(loopRules({ projectStartDays: 99 }).projectStartDays).toBe(60);
  });
});
