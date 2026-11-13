// The values of the CompanyRule rows: one key per rule, a JSON value checked here (pure, no database).
// A missing key or a value that fails its check gives the default for that key.
import type { SpendRule } from "@/features/demo/types";
import { DEFAULT_POST_AS, postAsOf, type PostAs } from "@/features/ideas/posting";

export const COMPANY_RULE_KEYS = ["promise_days", "outcome_days", "spend", "deadline_handover", "escalation_days", "loop_steps", "posting", "project_start_days", "blocked_days", "no_reason_min", "appeal_days", "question_days", "overload_at"] as const;
export type CompanyRuleKey = (typeof COMPANY_RULE_KEYS)[number];

/** The thresholds of an overloaded desk (plan OVL, D17): open work items per present holder from which it is triage, up and overflow, and how many late ones make it triage. */
export type OverloadAt = { triage: number; up: number; overflow: number; late: number };

export type LoopSteps = { discussion: boolean; projects: boolean; measure: boolean; recognition: boolean };
export type CompanyRules = {
  promiseDays: number;
  outcomeDays: number;
  spend: SpendRule | null;
  deadlineHandover: boolean;
  /** Working days after the answer date until the case goes one level up; 0 = never. Missing (no row) = the default of features/loop/rules.ts. */
  escalationDays?: number;
  /** Working days a project draft has to start, counted from the lead taking it (1 to 60); missing (no row) = the default of features/loop/rules.ts. */
  projectStartDays?: number;
  /** Working days a blocked step may stand before the project counts as stalled, 1 to 10 (plan MOV); missing (no row) = the default of features/loop/rules.ts. */
  blockedDays?: number;
  /** The fewest characters a reason for a no needs, 20 to 400 (plan NOR). */
  noReasonMin?: number;
  /** Working days the raiser has to appeal a no, 1 to 60 (plan NOR). */
  appealDays?: number;
  /** Working days a question to the raiser waits for an answer, 2 to 30 (plan NOR). */
  questionDays?: number;
  /** The thresholds of an overloaded desk, 1 <= triage < up < overflow <= 200 and 1 <= late <= 50 (plan OVL, D17). */
  overloadAt?: OverloadAt;
  steps: LoopSteps;
  /** Who a member's raise is preselected as on the last look (decision Q1.7); the member can change it per raise. */
  postAs: PostAs;
};
export const DEFAULT_RULES: CompanyRules = {
  promiseDays: 5,
  outcomeDays: 14,
  spend: null,
  deadlineHandover: true,
  steps: { discussion: true, projects: true, measure: true, recognition: true },
  postAs: DEFAULT_POST_AS,
};
/** The most working days an escalation may wait, as promise_days. */
export const ESCALATION_DAYS_MAX = 60;
/** The most working days a project draft may have to start. */
export const PROJECT_START_DAYS_MAX = 60;

/**
 * The key of the day MOV went live for a company (plan MOV, D17). It is not in COMPANY_RULE_KEYS on purpose: saving
 * the rules (lib/db/rules.ts saveCompanyRules) deletes only those keys, so it can never delete this one.
 */
export const MOV_SINCE_KEY = "mov_since_day";

export type RuleRow = { key: string; value: unknown };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const intIn = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

function days(value: unknown, max: number, min = 1): number | null {
  return isObj(value) && intIn(value.days, min, max) ? value.days : null;
}

function spendOf(value: unknown): SpendRule | null {
  if (!isObj(value)) return null;
  const { limitEur, text } = value;
  if (typeof limitEur !== "number" || !Number.isInteger(limitEur) || limitEur < 0) return null;
  if (typeof text !== "string" || text.length < 1 || text.length > 200) return null;
  return { limitEur, text };
}

function handoverOf(value: unknown): boolean {
  return isObj(value) && typeof value.on === "boolean" ? value.on : DEFAULT_RULES.deadlineHandover;
}

function stepsOf(value: unknown): LoopSteps {
  const d = DEFAULT_RULES.steps;
  if (!isObj(value)) return { ...d };
  const b = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
  return {
    discussion: b(value.discussion, d.discussion),
    projects: b(value.projects, d.projects),
    measure: b(value.measure, d.measure),
    recognition: b(value.recognition, d.recognition),
  };
}

/** A valid overload_at value or null: whole numbers, 1 <= triage < up < overflow <= 200 and 1 <= late <= 50; anything else is ignored (plan OVL, D17). */
function overloadAtOf(value: unknown): OverloadAt | null {
  if (!isObj(value) || !intIn(value.triage, 1, 200) || !intIn(value.up, 1, 200) || !intIn(value.overflow, 1, 200) || !intIn(value.late, 1, 50)) return null;
  return value.triage < value.up && value.up < value.overflow ? { triage: value.triage, up: value.up, overflow: value.overflow, late: value.late } : null;
}

export function rulesFromRows(rows: readonly RuleRow[]): CompanyRules {
  const out: CompanyRules = { ...DEFAULT_RULES, steps: { ...DEFAULT_RULES.steps } };
  for (const { key, value } of rows) {
    if (key === "promise_days") out.promiseDays = days(value, 60) ?? DEFAULT_RULES.promiseDays;
    else if (key === "outcome_days") out.outcomeDays = days(value, 365) ?? DEFAULT_RULES.outcomeDays;
    else if (key === "spend") out.spend = spendOf(value);
    else if (key === "deadline_handover") out.deadlineHandover = handoverOf(value);
    else if (key === "escalation_days") {
      const n = days(value, ESCALATION_DAYS_MAX, 0);
      if (n !== null) out.escalationDays = n;
    }
    else if (key === "project_start_days") {
      const n = days(value, PROJECT_START_DAYS_MAX);
      if (n !== null) out.projectStartDays = n;
    }
    else if (key === "blocked_days") {
      const n = days(value, 10);
      if (n !== null) out.blockedDays = n;
    }
    else if (key === "no_reason_min") {
      if (isObj(value) && intIn(value.chars, 20, 400)) out.noReasonMin = value.chars;
    }
    else if (key === "appeal_days") {
      const n = days(value, 60);
      if (n !== null) out.appealDays = n;
    }
    else if (key === "question_days") {
      if (isObj(value) && intIn(value.days, 2, 30)) out.questionDays = value.days;
    }
    else if (key === "overload_at") {
      const at = overloadAtOf(value);
      if (at !== null) out.overloadAt = at;
    }
    else if (key === "loop_steps") out.steps = stepsOf(value);
    else if (key === "posting") out.postAs = postAsOf(isObj(value) ? value.as : undefined);
  }
  return out;
}

export function rowsFromRules(r: CompanyRules): RuleRow[] {
  const rows: RuleRow[] = [
    { key: "promise_days", value: { days: r.promiseDays } },
    { key: "outcome_days", value: { days: r.outcomeDays } },
    { key: "deadline_handover", value: { on: r.deadlineHandover } },
    { key: "loop_steps", value: { ...r.steps } },
    { key: "posting", value: { as: r.postAs } },
  ];
  if (r.escalationDays !== undefined) rows.push({ key: "escalation_days", value: { days: r.escalationDays } });
  if (r.projectStartDays !== undefined) rows.push({ key: "project_start_days", value: { days: r.projectStartDays } });
  if (r.blockedDays !== undefined) rows.push({ key: "blocked_days", value: { days: r.blockedDays } });
  if (r.noReasonMin !== undefined) rows.push({ key: "no_reason_min", value: { chars: r.noReasonMin } });
  if (r.appealDays !== undefined) rows.push({ key: "appeal_days", value: { days: r.appealDays } });
  if (r.questionDays !== undefined) rows.push({ key: "question_days", value: { days: r.questionDays } });
  if (r.overloadAt !== undefined) rows.push({ key: "overload_at", value: { ...r.overloadAt } });
  if (r.spend) rows.push({ key: "spend", value: { limitEur: r.spend.limitEur, text: r.spend.text } });
  return rows;
}

/** The day MOV went live, from the rows of one company; null while there is no such row or it is not a whole day number >= 0. */
export function movSinceOf(rows: readonly RuleRow[]): number | null {
  const v = rows.find((r) => r.key === MOV_SINCE_KEY)?.value;
  return isObj(v) && typeof v.day === "number" && Number.isInteger(v.day) && v.day >= 0 ? v.day : null;
}
