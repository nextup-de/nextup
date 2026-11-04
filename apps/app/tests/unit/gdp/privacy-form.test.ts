import { describe, expect, it } from "vitest";
import { formErrors, fromRules, needsConfirm, toRuleInput, type RuleInput } from "@/features/privacy/privacy-form";

const rules = (assist: number, drafts: number, closed: number | null): RuleInput => ({ assist_turns: assist, idea_drafts: drafts, closed_cases: closed });

describe("GDP privacy form", () => {
  it("turns months into days and back", () => {
    const input = toRuleInput({ assistDays: 90, draftDays: 180, closedCases: "remove", closedMonths: 24 });
    expect(input.closed_cases).toBe(720);
    expect(fromRules(input)).toEqual({ assistDays: 90, draftDays: 180, closedCases: "remove", closedMonths: 24 });
  });

  it("keep means null and comes back as keep", () => {
    const input = toRuleInput({ assistDays: 90, draftDays: 180, closedCases: "keep", closedMonths: 24 });
    expect(input.closed_cases).toBeNull();
    expect(fromRules(input).closedCases).toBe("keep");
  });

  it("refuses values outside each kind's limits", () => {
    expect(formErrors(rules(6, 180, null)).assist_turns).toBe("retentionTooShort");
    expect(formErrors(rules(731, 180, null)).assist_turns).toBe("retentionTooLong");
    expect(formErrors(rules(90, 29, null)).idea_drafts).toBe("retentionTooShort");
    expect(formErrors(rules(90, 180, 300)).closed_cases).toBe("retentionTooShort");
    expect(formErrors({ ...rules(90, 180, null), assist_turns: null }).assist_turns).toBe("retentionKeepNotAllowed");
    expect(formErrors(rules(7.5, 180, 360)).assist_turns).toBe("retentionNotWhole");
    expect(formErrors(rules(90, 180, 360))).toEqual({});
  });

  it("asks for confirmation when a period gets shorter or closed cases switch from keep to remove", () => {
    expect(needsConfirm(rules(90, 180, null), rules(30, 180, null))).toBe(true);
    expect(needsConfirm(rules(30, 180, null), rules(90, 180, null))).toBe(false);
    expect(needsConfirm(rules(90, 180, null), rules(90, 180, 360))).toBe(true);
    expect(needsConfirm(rules(90, 180, 360), rules(90, 180, null))).toBe(false);
    expect(needsConfirm(rules(90, 180, 720), rules(90, 180, 720))).toBe(false);
  });
});
