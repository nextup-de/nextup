// The values of the CompanyRule rows: one key per rule, a JSON value checked here (pure, no database).
// A missing key or a value that fails its check gives the default for that key.
import type { SpendRule } from "@/features/demo/types";
import { DEFAULT_POST_AS, postAsOf, type PostAs } from "@/features/ideas/posting";

export const COMPANY_RULE_KEYS = ["promise_days", "outcome_days", "spend", "deadline_handover", "escalation_days", "loop_steps", "posting", "project_start_days"] as const;
export type CompanyRuleKey = (typeof COMPANY_RULE_KEYS)[number];

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
  if (r.spend) rows.push({ key: "spend", value: { limitEur: r.spend.limitEur, text: r.spend.text } });
  return rows;
}
