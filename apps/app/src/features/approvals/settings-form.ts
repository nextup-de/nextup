// The forms of Settings -> Approvals, -> Routing and -> Rules (plan GAT, D12, D16, D27), checked and turned into the config. Pure: no database,
// no clock, no randomness; the ids of new rules and councils and the working day of a date come in through `ParseEnv`. A refusal names the form
// field it is about (for the page to mark) and one message key; every bad value of the configuration says `approvals.permConfig`.
import type { Knowledge } from "@/features/knowledge";
import type { MessageKey } from "@/i18n";
import {
  APPROVAL_DAYS_RANGE, COST_EUR_MAX, COUNCIL_EVERY, REVIEW_DAYS_DEFAULT, REVIEW_DAYS_RANGE,
  type ApprovalConfig, type ApprovalRule, type Council, type ReviewMode,
} from "./types";

export type Checked<T> = { ok: true; value: T } | { ok: false; field: string; error: MessageKey };

const BAD: MessageKey = "approvals.permConfig";
const refuse = (field: string): { ok: false; field: string; error: MessageKey } => ({ ok: false, field, error: BAD });

const text = (form: FormData, key: string): string => {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
};
const all = (form: FormData, key: string): string[] => form.getAll(key).filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean);
const whole = (v: string): number | null => (/^\d{1,9}$/.test(v) ? Number(v) : null);
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** What a parse needs from outside: ids for new rows, the working day of an ISO date (null: not a working day of the calendar), and the config the form does not own. */
export type ParseEnv = { base: ApprovalConfig; newId: () => string; dayOfDate: (iso: string) => number | null };

/** The indexes n of the rows named `<prefix>.<n>.<field>` the form carries, in order. */
function rowsOf(form: FormData, prefix: string): number[] {
  const seen = new Set<number>();
  for (const key of form.keys()) {
    const m = key.startsWith(prefix + ".") ? /^\w+\.(\d{1,3})\./.exec(key) : null;
    if (m) seen.add(Number(m[1]));
  }
  return [...seen].sort((a, b) => a - b);
}

const known = (roles: readonly { id: string }[], id: string): boolean => roles.some((r) => r.id === id);

/**
 * The Approvals page: the review switch, role, days and deputy; the approval days; the rules; the councils. The per-route review modes, the
 * triage role and the fallback role are not on this form: they stay as `env.base` has them. A rule names its approver as `role:<id>` or
 * `council:<id>`; a council row carries a hidden `id` (an old one, or a temporary one of a row added in the browser, which gets a new id here).
 */
export function parseApprovalsForm(form: FormData, roles: readonly { id: string }[], councilsBefore: readonly Council[], env: ParseEnv): Checked<ApprovalConfig> {
  const on = text(form, "reviewOn") === "on";
  const reviewRole = text(form, "reviewRole");
  if (on && reviewRole === "") return refuse("reviewRole");
  if (reviewRole !== "" && !known(roles, reviewRole)) return refuse("reviewRole");
  const deputy = text(form, "reviewDeputy");
  if (deputy !== "" && !known(roles, deputy)) return refuse("reviewDeputy");
  const reviewDaysText = text(form, "reviewDays");
  const reviewDays = reviewDaysText === "" ? REVIEW_DAYS_DEFAULT : whole(reviewDaysText);
  if (reviewDays === null || reviewDays < REVIEW_DAYS_RANGE[0] || reviewDays > REVIEW_DAYS_RANGE[1]) return refuse("reviewDays");
  const approvalDaysText = text(form, "approvalDays");
  const approvalDays = approvalDaysText === "" ? env.base.approvalDays : whole(approvalDaysText);
  if (approvalDays === null || approvalDays < APPROVAL_DAYS_RANGE[0] || approvalDays > APPROVAL_DAYS_RANGE[1]) return refuse("approvalDays");

  // Councils first: a rule may name one.
  const councils: Council[] = [];
  const idOf = new Map<string, string>(); // the id the form used -> the id the council has
  const before = new Set(councilsBefore.map((c) => c.id));
  for (const n of rowsOf(form, "council")) {
    const f = (k: string) => `council.${n}.${k}`;
    const name = text(form, f("name"));
    if (name === "" || name.length > 120) return refuse(f("name"));
    const secretary = text(form, f("secretary"));
    if (secretary === "" || !known(roles, secretary)) return refuse(f("secretary"));
    const members = [...new Set(all(form, f("members")))];
    if (!members.every((m) => known(roles, m))) return refuse(f("members"));
    const every = whole(text(form, f("every")));
    if (every === null || every < COUNCIL_EVERY[0] || every > COUNCIL_EVERY[1]) return refuse(f("every"));
    const first = /^\d{4}-\d{2}-\d{2}$/.test(text(form, f("first"))) ? env.dayOfDate(text(form, f("first"))) : null;
    if (first === null || first < 1) return refuse(f("first"));
    const given = text(form, f("id"));
    const id = before.has(given) && !idOf.has(given) ? given : env.newId();
    idOf.set(given, id);
    councils.push({ id, name, memberRoleIds: members, secretaryRoleId: secretary, everyDays: every, firstDay: first });
  }

  const rules: ApprovalRule[] = [];
  const used = new Set<string>();
  for (const n of rowsOf(form, "rule")) {
    const f = (k: string) => `rule.${n}.${k}`;
    const picked = text(form, f("approver"));
    const colon = picked.indexOf(":");
    const kind = colon < 0 ? "" : picked.slice(0, colon);
    const ref = colon < 0 ? "" : picked.slice(colon + 1);
    let approver: Pick<ApprovalRule, "kind" | "councilId" | "roleId">;
    if (kind === "role" && ref !== "" && known(roles, ref)) approver = { kind: "role", roleId: ref };
    else if (kind === "council" && ref !== "" && idOf.has(ref)) approver = { kind: "council", councilId: idOf.get(ref) };
    else return refuse(f("approver"));
    const routeKey = text(form, f("route"));
    if (routeKey.length > 64) return refuse(f("route"));
    const minText = text(form, f("minEur"));
    const minEur = minText === "" ? null : whole(minText);
    if (minText !== "" && (minEur === null || minEur > COST_EUR_MAX)) return refuse(f("minEur"));
    const given = text(form, f("id"));
    const id = ID.test(given) && !used.has(given) ? given : env.newId();
    used.add(id);
    rules.push({ id, ...approver, routeKey: routeKey === "" ? null : routeKey, minEur });
  }

  return {
    ok: true,
    value: {
      ...env.base,
      review: { ...env.base.review, on, roleId: reviewRole === "" ? null : reviewRole, days: reviewDays, deputyRoleId: deputy === "" ? null : deputy },
      approvalDays, rules, councils,
    },
  };
}

const MODES: readonly ReviewMode[] = ["company", "always", "never"];

/** The Routing page: the triage role and one review mode per route (`review.<route key>`). 'company' is the default and is not stored; a route the form does not name keeps it. */
export function parseRoutingReviewForm(form: FormData, routeKeys: readonly string[], roleIds: readonly string[]): Checked<{ triageRoleId: string | null; routes: Record<string, ReviewMode> }> {
  const triage = text(form, "triageRole");
  if (triage !== "" && !roleIds.includes(triage)) return refuse("triageRole");
  const routes: Record<string, ReviewMode> = {};
  for (const key of routeKeys) {
    const mode = text(form, `review.${key}`) || "company";
    if (!MODES.includes(mode as ReviewMode)) return refuse(`review.${key}`);
    if (mode !== "company") routes[key] = mode as ReviewMode;
  }
  return { ok: true, value: { triageRoleId: triage === "" ? null : triage, routes } };
}

/** The Rules page: the fallback desk role; empty = none = the first manager role (D16). */
export function parseFallbackRoleForm(form: FormData, roleIds: readonly string[]): Checked<string | null> {
  const role = text(form, "fallbackRole");
  if (role !== "" && !roleIds.includes(role)) return refuse("fallbackRole");
  return { ok: true, value: role === "" ? null : role };
}

/** The first meeting day of a council on or after `today`: firstDay + k * everyDays (D23). */
export function nextMeetingDay(c: Pick<Council, "firstDay" | "everyDays">, today: number): number {
  return today <= c.firstDay ? c.firstDay : c.firstDay + Math.ceil((today - c.firstDay) / c.everyDays) * c.everyDays;
}

/** What the pages show when this copy of NextUp has no database (the sample company of features/settings/demo.ts): review on with the plant manager, one council. Never saved. */
export const SAMPLE_APPROVAL_CONFIG: ApprovalConfig = {
  review: { on: true, roleId: "r-qa", days: 2, deputyRoleId: "r-plant", routes: { safety: "never" } },
  triageRoleId: null,
  fallbackRoleId: "r-plant",
  approvalDays: 5,
  rules: [{ id: "sample-rule", kind: "council", councilId: "sample-council", routeKey: null, minEur: 25000 }],
  councils: [{ id: "sample-council", name: "Investment council", memberRoleIds: ["r-plant", "r-qa"], secretaryRoleId: "r-plant", everyDays: 10, firstDay: 400 }],
};

/** The roles of a company as a select lists them: the title and its unit. */
export function roleOptionsOf(k: Pick<Knowledge, "roles" | "units">): { id: string; label: string }[] {
  const unit = new Map(k.units.map((u) => [u.id, u.name]));
  return k.roles.map((r) => ({ id: r.id, label: `${r.title} · ${unit.get(r.orgUnitId) ?? "?"}` }));
}
