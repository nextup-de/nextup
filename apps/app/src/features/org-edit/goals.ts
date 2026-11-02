// The rules of the goals editor (ADM D17). Pure: a change and the company's Knowledge in, null or
// the message key of the rule that refuses it out. lib/db/goals-edit.ts writes what passes.
import type { Knowledge } from "@/features/knowledge";
import type { MessageKey } from "@/i18n";

export type GoalError = Extract<MessageKey, `settingsGoals.err${string}`>;

export type GoalInput = {
  title: string; kpi: string; target: string; period: string;
  orgUnitId: string | null; keywords: string[];
};
export type GoalChange =
  | { kind: "addGoal"; goal: GoalInput }
  | { kind: "updateGoal"; id: string; goal: GoalInput }
  | { kind: "removeGoal"; id: string };

export const GOAL_TITLE_MAX = 120;
export const GOAL_KEYWORDS_MAX = 30;
export const GOAL_KEYWORD_MAX = 40;
const FREE_TEXT_MAX = 120;

export function goalTitleRule(title: string): GoalError | null {
  const n = title.trim().length;
  return n >= 1 && n <= GOAL_TITLE_MAX ? null : "settingsGoals.errTitle";
}

/** 0-30 keywords of 1-40 characters (trimmed). */
export function goalKeywordsRule(keywords: readonly string[]): GoalError | null {
  const ks = keywords.map((k) => k.trim());
  return ks.length <= GOAL_KEYWORDS_MAX && ks.every((k) => k.length >= 1 && k.length <= GOAL_KEYWORD_MAX) ? null : "settingsGoals.errKeywords";
}

/** A company-wide goal (null) or a unit of this company. */
export function goalUnitRule(k: Knowledge, orgUnitId: string | null): GoalError | null {
  return orgUnitId === null || k.units.some((u) => u.id === orgUnitId) ? null : "settingsGoals.errUnit";
}

function fieldsRule(k: Knowledge, g: GoalInput): GoalError | null {
  if (goalTitleRule(g.title)) return "settingsGoals.errTitle";
  if ([g.kpi, g.target, g.period].some((s) => s.trim().length > FREE_TEXT_MAX)) return "settingsGoals.errText";
  return goalUnitRule(k, g.orgUnitId) ?? goalKeywordsRule(g.keywords);
}

/** The first rule a change breaks, or null when it is fine. */
export function checkGoalChange(k: Knowledge, c: GoalChange): GoalError | null {
  switch (c.kind) {
    case "addGoal":
      return fieldsRule(k, c.goal);
    case "updateGoal":
      return k.goals.some((g) => g.id === c.id) ? fieldsRule(k, c.goal) : "settingsGoals.errNotFound";
    case "removeGoal":
      return k.goals.some((g) => g.id === c.id) ? null : "settingsGoals.errNotFound";
  }
}
