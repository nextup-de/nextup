// The values of the CompanyRule rows: one key per rule, a JSON value checked here (pure, no database).
// A missing key or a value that fails its check gives the default for that key.
import type { SpendRule } from "@/features/demo/types";

export const COMPANY_RULE_KEYS = ["promise_days", "outcome_days", "spend", "deadline_handover", "loop_steps"] as const;
export type CompanyRuleKey = (typeof COMPANY_RULE_KEYS)[number];

export type LoopSteps = { discussion: boolean; projects: boolean; measure: boolean; recognition: boolean };
export type CompanyRules = {
  promiseDays: number;
  outcomeDays: number;
  spend: SpendRule | null;
  deadlineHandover: boolean;
  steps: LoopSteps;
};
export const DEFAULT_RULES: CompanyRules = {
  promiseDays: 5,
  outcomeDays: 14,
  spend: null,
  deadlineHandover: true,
  steps: { discussion: true, projects: true, measure: true, recognition: true },
};

export type RuleRow = { key: string; value: unknown };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const intIn = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

function days(value: unknown, max: number): number | null {
  return isObj(value) && intIn(value.days, 1, max) ? value.days : null;
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
    else if (key === "loop_steps") out.steps = stepsOf(value);
  }
  return out;
}

export function rowsFromRules(r: CompanyRules): RuleRow[] {
  const rows: RuleRow[] = [
    { key: "promise_days", value: { days: r.promiseDays } },
    { key: "outcome_days", value: { days: r.outcomeDays } },
    { key: "deadline_handover", value: { on: r.deadlineHandover } },
    { key: "loop_steps", value: { ...r.steps } },
  ];
  if (r.spend) rows.push({ key: "spend", value: { limitEur: r.spend.limitEur, text: r.spend.text } });
  return rows;
}
