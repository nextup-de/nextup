import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, rowsFromRules, rulesFromRows } from "@/features/knowledge/rules";
import { loopRules } from "@/features/loop/rules";

describe("LOOP company rules", () => {
  it("no rows: hand-over on and four steps on", () => {
    const r = rulesFromRows([]);
    expect(r.deadlineHandover).toBe(true);
    expect(r.steps).toEqual({ discussion: true, projects: true, measure: true, recognition: true });
  });
  it("{ on: false } turns hand-over off", () => {
    expect(rulesFromRows([{ key: "deadline_handover", value: { on: false } }]).deadlineHandover).toBe(false);
  });
  it("a bad deadline_handover value gives the default", () => {
    expect(rulesFromRows([{ key: "deadline_handover", value: "no" }]).deadlineHandover).toBe(true);
    expect(rulesFromRows([{ key: "deadline_handover", value: { on: "x" } }]).deadlineHandover).toBe(true);
  });
  it("loop_steps falls back per field", () => {
    const r = rulesFromRows([{ key: "loop_steps", value: { projects: false, measure: "x" } }]);
    expect(r.steps).toEqual({ discussion: true, projects: false, measure: true, recognition: true });
  });
  it("loop_steps that is not an object gives all on", () => {
    expect(rulesFromRows([{ key: "loop_steps", value: 3 }]).steps).toEqual(DEFAULT_RULES.steps);
  });
  it("round-trips through rows and always writes both keys", () => {
    const rows = [{ key: "deadline_handover", value: { on: false } }, { key: "loop_steps", value: { recognition: false } }];
    const r = rulesFromRows(rows);
    expect(rulesFromRows(rowsFromRules(r))).toEqual(r);
    const keys = rowsFromRules(DEFAULT_RULES).map((x) => x.key);
    expect(keys).toContain("deadline_handover");
    expect(keys).toContain("loop_steps");
  });
  it("escalation_days: no row means the default of 3, 0 switches it off, a bad value is no rule", () => {
    expect(rulesFromRows([]).escalationDays).toBeUndefined();
    expect(loopRules({ escalationDays: rulesFromRows([]).escalationDays }).escalationDays).toBe(3);
    expect(rulesFromRows([{ key: "escalation_days", value: { days: 0 } }]).escalationDays).toBe(0);
    expect(rulesFromRows([{ key: "escalation_days", value: { days: 60 } }]).escalationDays).toBe(60);
    for (const value of [{ days: 61 }, { days: -1 }, { days: 2.5 }, { days: "4" }, 4, null]) {
      expect(rulesFromRows([{ key: "escalation_days", value }]).escalationDays).toBeUndefined();
    }
  });
  it("escalation_days round-trips, and is only written once it was set", () => {
    const set = rulesFromRows([{ key: "escalation_days", value: { days: 7 } }]);
    expect(rowsFromRules(set)).toContainEqual({ key: "escalation_days", value: { days: 7 } });
    expect(rulesFromRows(rowsFromRules(set))).toEqual(set);
    expect(rowsFromRules({ ...DEFAULT_RULES, escalationDays: 0 })).toContainEqual({ key: "escalation_days", value: { days: 0 } });
    expect(rowsFromRules(DEFAULT_RULES).map((x) => x.key)).not.toContain("escalation_days");
  });
  it("loopRules keeps escalationDays inside 0 to 60", () => {
    expect(loopRules({}).escalationDays).toBe(3);
    expect(loopRules({ escalationDays: 0 }).escalationDays).toBe(0);
    expect(loopRules({ escalationDays: 99 }).escalationDays).toBe(60);
    expect(loopRules({ escalationDays: -2 }).escalationDays).toBe(0);
  });
  it("loopRules defaults the new fields to true and keeps a boolean", () => {
    const d = loopRules({});
    expect([d.deadlineHandover, d.measure, d.recognition]).toEqual([true, true, true]);
    expect(loopRules({ measure: false }).measure).toBe(false);
    expect(loopRules({ deadlineHandover: false }).deadlineHandover).toBe(false);
  });
});
