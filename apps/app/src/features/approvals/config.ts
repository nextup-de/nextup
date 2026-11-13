// The review and approval settings as CompanyRule rows (plan GAT, D27): one JSON value per key, checked here (pure, no database). The keys
// are not in COMPANY_RULE_KEYS (D7), so saving Settings -> Rules never deletes them, as with mov_since_day. A missing key or a value that
// fails its check gives the default of that key; inside one key a bad field gives that field's default and a bad list entry is dropped.
// Ids are kept as strings: an unknown role id is kept and ignored where it is used.
import type { RuleRow } from "@/features/knowledge/rules";
import {
  APPROVAL_DAYS_DEFAULT, APPROVAL_DAYS_RANGE, COST_EUR_MAX, COUNCIL_EVERY, EMPTY_APPROVAL_CONFIG, REVIEW_DAYS_DEFAULT, REVIEW_DAYS_RANGE,
  type ApprovalConfig, type ApprovalRule, type Council, type ReviewMode,
} from "./types";

export const APPROVAL_CONFIG_KEYS = ["review", "triage_role", "fallback_role", "approval_days", "approval_rules", "councils"] as const;
export type ApprovalConfigKey = (typeof APPROVAL_CONFIG_KEYS)[number];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const intIn = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const REVIEW_MODES: readonly ReviewMode[] = ["company", "always", "never"];

function reviewOf(value: unknown): ApprovalConfig["review"] {
  const d = EMPTY_APPROVAL_CONFIG.review;
  if (!isObj(value)) return { ...d, routes: {} };
  const routes: Record<string, ReviewMode> = {};
  if (isObj(value.routes)) for (const [k, m] of Object.entries(value.routes)) if (REVIEW_MODES.includes(m as ReviewMode)) routes[k] = m as ReviewMode;
  return {
    on: value.on === true,
    roleId: text(value.roleId),
    days: intIn(value.days, REVIEW_DAYS_RANGE[0], REVIEW_DAYS_RANGE[1]) ? value.days : REVIEW_DAYS_DEFAULT,
    deputyRoleId: text(value.deputyRoleId),
    routes,
  };
}

const roleOf = (value: unknown): string | null => (isObj(value) ? text(value.roleId) : null);

function approvalDaysOf(value: unknown): number {
  return isObj(value) && intIn(value.days, APPROVAL_DAYS_RANGE[0], APPROVAL_DAYS_RANGE[1]) ? value.days : APPROVAL_DAYS_DEFAULT;
}

function ruleOf(v: unknown): ApprovalRule | null {
  if (!isObj(v)) return null;
  const id = text(v.id);
  if (id === null) return null;
  const routeKey = v.routeKey === null || v.routeKey === undefined ? null : text(v.routeKey);
  if (v.routeKey !== null && v.routeKey !== undefined && routeKey === null) return null;
  const minEur = v.minEur === null || v.minEur === undefined ? null : intIn(v.minEur, 0, COST_EUR_MAX) ? v.minEur : undefined;
  if (minEur === undefined) return null;
  if (v.kind === "council") {
    const councilId = text(v.councilId);
    return councilId === null ? null : { id, kind: "council", councilId, routeKey, minEur };
  }
  if (v.kind === "role") {
    const roleId = text(v.roleId);
    return roleId === null ? null : { id, kind: "role", roleId, routeKey, minEur };
  }
  return null; // an unknown kind
}

function councilOf(v: unknown): Council | null {
  if (!isObj(v)) return null;
  const id = text(v.id);
  const name = text(v.name);
  const secretaryRoleId = text(v.secretaryRoleId);
  if (id === null || name === null || secretaryRoleId === null) return null;
  if (!Array.isArray(v.memberRoleIds) || !v.memberRoleIds.every((m) => text(m) !== null)) return null;
  if (!intIn(v.everyDays, COUNCIL_EVERY[0], COUNCIL_EVERY[1]) || !Number.isInteger(v.firstDay)) return null;
  return { id, name, memberRoleIds: [...(v.memberRoleIds as string[])], secretaryRoleId, everyDays: v.everyDays, firstDay: v.firstDay as number };
}

function listOf<T>(value: unknown, one: (v: unknown) => T | null): T[] {
  return Array.isArray(value) ? value.map(one).filter((x): x is T => x !== null) : [];
}

/** The configuration of a company from its CompanyRule rows; rows of other keys are ignored, a key twice gives the last. */
export function parseApprovalConfig(rows: readonly RuleRow[]): ApprovalConfig {
  const byKey = new Map<string, unknown>();
  for (const r of rows) if ((APPROVAL_CONFIG_KEYS as readonly string[]).includes(r.key)) byKey.set(r.key, r.value);
  return {
    review: reviewOf(byKey.get("review")),
    triageRoleId: roleOf(byKey.get("triage_role")),
    fallbackRoleId: roleOf(byKey.get("fallback_role")),
    approvalDays: approvalDaysOf(byKey.get("approval_days")),
    rules: listOf(byKey.get("approval_rules"), ruleOf),
    councils: listOf(byKey.get("councils"), councilOf),
  };
}

/** The inverse of parseApprovalConfig: every key is written, so a saved company never falls back to a default by a missing row. */
export function approvalConfigRows(c: ApprovalConfig): RuleRow[] {
  return [
    { key: "review", value: { on: c.review.on, roleId: c.review.roleId, days: c.review.days, deputyRoleId: c.review.deputyRoleId, routes: { ...c.review.routes } } },
    { key: "triage_role", value: { roleId: c.triageRoleId } },
    { key: "fallback_role", value: { roleId: c.fallbackRoleId } },
    { key: "approval_days", value: { days: c.approvalDays } },
    { key: "approval_rules", value: c.rules.map((r) => ({ ...r })) },
    { key: "councils", value: c.councils.map((k) => ({ ...k, memberRoleIds: [...k.memberRoleIds] })) },
  ];
}
