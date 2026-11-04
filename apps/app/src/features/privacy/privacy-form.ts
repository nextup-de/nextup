// The Data and privacy form (GDP D18): what the person types, what a rule stores. Pure: no database, no React.
import { RETENTION_KINDS, checkRule, daysToMonths, monthsToDays, type RetentionCheck, type RetentionKind } from "./retention";

/** What the form holds. Closed cases are typed in months; "keep" has no number. */
export type PrivacyForm = {
  assistDays: number;
  draftDays: number;
  closedCases: "keep" | "remove";
  closedMonths: number;
};

/** The three rules in days; null = keep. */
export type RuleInput = Record<RetentionKind, number | null>;

export function toRuleInput(form: PrivacyForm): RuleInput {
  return {
    assist_turns: form.assistDays,
    idea_drafts: form.draftDays,
    closed_cases: form.closedCases === "keep" ? null : monthsToDays(form.closedMonths),
  };
}

export function fromRules(rules: RuleInput): PrivacyForm {
  const closed = rules.closed_cases;
  return {
    assistDays: rules.assist_turns ?? 0,
    draftDays: rules.idea_drafts ?? 0,
    closedCases: closed === null ? "keep" : "remove",
    closedMonths: closed === null ? daysToMonths(360) : daysToMonths(closed),
  };
}

/** The kinds whose rule would delete more than before: a shorter period, or closed cases from keep to a period. */
export function shortened(before: RuleInput, after: RuleInput): RetentionKind[] {
  return RETENTION_KINDS.filter((k) => {
    const a = after[k];
    if (a === null) return false;
    const b = before[k];
    return b === null || a < b;
  });
}

export const needsConfirm = (before: RuleInput, after: RuleInput): boolean => shortened(before, after).length > 0;

export type FormErrorKey = Exclude<RetentionCheck, { ok: true }>["key"];

/** The refused kinds with the message key of `settingsPrivacy` for each. */
export function formErrors(input: RuleInput): Partial<Record<RetentionKind, FormErrorKey>> {
  const out: Partial<Record<RetentionKind, FormErrorKey>> = {};
  for (const k of RETENTION_KINDS) {
    const c = checkRule(k, input[k]);
    if (!c.ok) out[k] = c.key;
  }
  return out;
}
