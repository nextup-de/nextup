"use server";
// Settings -> Approvals, -> Routing and -> Rules, the part that is the review and approval configuration (plan GAT, D12, D16, D27). Every action
// starts with companyAdminOf and writes the company id from the guard, never one from the form. Each reads the stored config, changes only its own
// part and writes the six rows back (saveApprovalConfig); the change and its audit row (audit.settings.rules: they are company rules) are one
// transaction. The parsing is pure and lives in features/approvals/settings-form.ts.
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { approvalConfigRows } from "@/features/approvals/config";
import { parseApprovalsForm, parseFallbackRoleForm, parseRoutingReviewForm, type Checked } from "@/features/approvals/settings-form";
import type { ApprovalConfig } from "@/features/approvals/types";
import { auditChanges } from "@/features/audit";
import { dateOfWorkday, workdayOf } from "@/features/clock/calendar";
import { companyPrefix } from "@/features/tenant/urls";
import { loadApprovalConfig, saveApprovalConfig } from "@/lib/db/approvals-config";
import { loadCalendar } from "@/lib/db/calendar";
import { loadKnowledge } from "@/lib/db/knowledge";
import { settingsActor } from "@/server/audit/record";
import { audited } from "./audited";
import type { SettingsFormState } from "./company";
import { companyAdminOf } from "./guard";

const asRecord = (c: ApprovalConfig): Record<string, unknown> => Object.fromEntries(approvalConfigRows(c).map((r) => [r.key, r.value]));

/** The guard, the stored config and the company's roles and route keys, then `change`; the new config, its audit row and the page refresh follow. */
async function save(
  form: FormData,
  change: (current: ApprovalConfig, ctx: { roleIds: string[]; routeKeys: string[] }) => Checked<ApprovalConfig>,
): Promise<SettingsFormState> {
  const slug = form.get("slug");
  const viewer = typeof slug === "string" && slug !== "" ? await companyAdminOf(slug) : null;
  if (!viewer || typeof slug !== "string") return { error: "settingsCompany.forbidden" };
  const { companyId, userId } = viewer;
  const [current, knowledge] = await Promise.all([loadApprovalConfig(companyId), loadKnowledge(companyId)]);
  const next = change(current, { roleIds: knowledge.roles.map((r) => r.id), routeKeys: knowledge.rules.map((r) => r.key) });
  if (!next.ok) return { error: next.error, field: next.field };
  const saved = await audited(
    companyId,
    () => ({
      actor: settingsActor(viewer), action: "audit.settings.rules", target: { kind: "company", id: companyId },
      changes: auditChanges(asRecord(current), asRecord(next.value)), source: "settings",
    }),
    (tx) => saveApprovalConfig(companyId, next.value, userId, tx),
  );
  if (!saved.ok) return { error: "settingsCompany.auditFailed" };
  for (const section of ["approvals", "routing", "rules"]) revalidatePath(`${companyPrefix(slug)}/settings/${section}`);
  return { ok: true };
}

/** Settings -> Approvals: the review switch, role, days and deputy, the approval days, the rules and the councils. The route modes, the triage role and the fallback role stay. */
export async function saveApprovalsAction(_prev: SettingsFormState, form: FormData): Promise<SettingsFormState> {
  const slug = form.get("slug");
  const viewer = typeof slug === "string" && slug !== "" ? await companyAdminOf(slug) : null;
  if (!viewer) return { error: "settingsCompany.forbidden" };
  // A council's first meeting is a date in the form and a working day in the config: the company's calendar converts it.
  const cal = await loadCalendar(viewer.companyId);
  const dayOfDate = (iso: string): number | null => {
    const n = workdayOf(new Date(`${iso}T12:00:00Z`), cal);
    return n >= 1 && dateOfWorkday(n, cal) === iso ? n : null;
  };
  return save(form, (current, ctx) => parseApprovalsForm(form, ctx.roleIds.map((id) => ({ id })), current.councils, { base: current, newId: randomUUID, dayOfDate }));
}

/** Settings -> Routing: the triage role and the review mode of each route. Everything else of the config stays. */
export async function saveRoutingReviewAction(_prev: SettingsFormState, form: FormData): Promise<SettingsFormState> {
  return save(form, (current, ctx) => {
    const parsed = parseRoutingReviewForm(form, ctx.routeKeys, ctx.roleIds);
    if (!parsed.ok) return parsed;
    // While the company review is on the select is disabled and not sent: the stored triage role stays.
    const triageRoleId = form.has("triageRole") ? parsed.value.triageRoleId : current.triageRoleId;
    return { ok: true, value: { ...current, triageRoleId, review: { ...current.review, routes: parsed.value.routes } } };
  });
}

/** Settings -> Rules: the fallback desk role. Everything else of the config stays. */
export async function saveFallbackRoleAction(_prev: SettingsFormState, form: FormData): Promise<SettingsFormState> {
  return save(form, (current, ctx) => {
    const parsed = parseFallbackRoleForm(form, ctx.roleIds);
    if (!parsed.ok) return parsed;
    // Disabled and not sent while the company review is on: the stored fallback role stays.
    return { ok: true, value: { ...current, fallbackRoleId: form.has("fallbackRole") ? parsed.value : current.fallbackRoleId } };
  });
}
