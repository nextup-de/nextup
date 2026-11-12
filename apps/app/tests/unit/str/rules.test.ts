import { describe, expect, it } from "vitest";
import { EMPTY_SEED } from "@/features/demo";
import { DEMO_GOALS, DEMO_RULES } from "@/features/demo/structure";
import { COMPANY_RULE_KEYS, DEFAULT_RULES, MOV_SINCE_KEY, movSinceOf, rowsFromRules, rulesFromRows } from "@/features/knowledge/rules";
import { LOOP_DEFAULTS, loopRules } from "@/features/loop/rules";
import snapshot from "../reg/snapshot/rules.json";

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

describe("REG rule keys", () => {
  const RANGES = [
    { key: "blocked_days", field: "blockedDays", shape: "days", min: 1, max: 10, fallback: 3 },
    { key: "no_reason_min", field: "noReasonMin", shape: "chars", min: 20, max: 400, fallback: 40 },
    { key: "appeal_days", field: "appealDays", shape: "days", min: 1, max: 60, fallback: 10 },
    { key: "question_days", field: "questionDays", shape: "days", min: 2, max: 30, fallback: 5 },
  ] as const;

  for (const r of RANGES) {
    it(`${r.key} reads {${r.shape}} from ${r.min} to ${r.max} and ignores anything else`, () => {
      const read = (value: unknown) => rulesFromRows([{ key: r.key, value }])[r.field];
      expect(read({ [r.shape]: r.min })).toBe(r.min);
      expect(read({ [r.shape]: r.max })).toBe(r.max);
      for (const bad of [{ [r.shape]: r.min - 1 }, { [r.shape]: r.max + 1 }, { [r.shape]: 2.5 + r.min }, { [r.shape]: String(r.min) }, { other: r.min }, r.min, null]) {
        expect(read(bad), JSON.stringify(bad)).toBeUndefined();
      }
    });
    it(`${r.key} round-trips and writes no row while unset; LoopRules defaults to ${r.fallback}`, () => {
      const set = { ...DEFAULT_RULES, [r.field]: r.max };
      expect(rowsFromRules(set)).toContainEqual({ key: r.key, value: { [r.shape]: r.max } });
      expect(rulesFromRows(rowsFromRules(set))).toEqual(set);
      expect(rowsFromRules(DEFAULT_RULES).map((x) => x.key)).not.toContain(r.key);
      expect(rulesFromRows([])[r.field]).toBeUndefined();
      expect(loopRules({})[r.field]).toBe(r.fallback);
      expect(LOOP_DEFAULTS[r.field]).toBe(r.fallback);
      expect(loopRules({ [r.field]: r.max + 1000 })[r.field]).toBe(r.max);
      expect(loopRules({ [r.field]: -5 })[r.field]).toBe(r.min);
    });
  }

  it("mov_since_day is not a company rule key, so saving the rules never deletes it; movSinceOf reads {day} >= 0", () => {
    expect(MOV_SINCE_KEY).toBe(snapshot.movSinceKey);
    expect(COMPANY_RULE_KEYS as readonly string[]).not.toContain(MOV_SINCE_KEY);
    expect(movSinceOf([{ key: MOV_SINCE_KEY, value: { day: 40 } }])).toBe(40);
    expect(movSinceOf([{ key: MOV_SINCE_KEY, value: { day: 0 } }])).toBe(0);
    for (const bad of [{ day: -1 }, { day: 1.5 }, { day: "3" }, { days: 3 }, 3, null]) expect(movSinceOf([{ key: MOV_SINCE_KEY, value: bad }]), JSON.stringify(bad)).toBeNull();
    expect(movSinceOf([])).toBeNull();
    expect(movSinceOf([{ key: "promise_days", value: { day: 4 } }])).toBeNull();
    // rulesFromRows ignores it as an unknown key, and loopRules defaults it.
    expect(rulesFromRows([{ key: MOV_SINCE_KEY, value: { day: 40 } }])).toEqual(DEFAULT_RULES);
    expect(loopRules({}).movSinceDay).toBe(0);
    expect(loopRules({ movSinceDay: 12 }).movSinceDay).toBe(12);
    expect(loopRules({ movSinceDay: -3 }).movSinceDay).toBe(0);
  });

  it("COMPANY_RULE_KEYS as a set equals the snapshot", () => {
    expect([...COMPANY_RULE_KEYS].sort()).toEqual(snapshot.companyRuleKeys);
    expect(new Set(COMPANY_RULE_KEYS).size).toBe(COMPANY_RULE_KEYS.length);
  });
});
