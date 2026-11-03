"use server";
// /<company>/settings/notifications: the switch and Retry (ADM-N1). Each action starts with companyAdminOf
// and names the company id from the guard, never one from the form.
import { revalidatePath } from "next/cache";
import { companyPrefix } from "@/features/tenant/urls";
import { auditChanges } from "@/features/audit";
import { retryOutboxRow } from "@/lib/db/outbox-retry";
import { settingsActor } from "@/server/audit/record";
import { audited } from "./audited";
import { companyAdminOf } from "./guard";
import type { SettingsFormState } from "./company";

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};

export async function saveNotificationsSwitchAction(_prev: SettingsFormState, form: FormData): Promise<SettingsFormState> {
  const slug = str(form, "slug");
  const viewer = slug ? await companyAdminOf(slug) : null;
  if (!viewer) return { error: "settingsCompany.forbidden" };
  const on = str(form, "on") === "on";
  const saved = await audited(
    viewer.companyId,
    (was: boolean | null) => ({
      actor: settingsActor(viewer), action: "audit.settings.notifications", target: { kind: "company", id: viewer.companyId },
      changes: auditChanges({ notifications: was }, { notifications: on }), source: "settings",
    }),
    async (tx) => {
      const row = await tx.companyConfig.findUnique({ where: { companyId: viewer.companyId }, select: { notifications: true } });
      await tx.companyConfig.upsert({
        where: { companyId: viewer.companyId },
        create: { companyId: viewer.companyId, notifications: on },
        update: { notifications: on },
      });
      return row?.notifications ?? null;
    },
  );
  if (!saved.ok) return { error: "settingsCompany.auditFailed" };
  revalidatePath(`${companyPrefix(slug)}/settings/notifications`);
  return { ok: true };
}

export async function retryOutboxAction(_prev: SettingsFormState, form: FormData): Promise<SettingsFormState> {
  const slug = str(form, "slug");
  const viewer = slug ? await companyAdminOf(slug) : null;
  if (!viewer) return { error: "settingsCompany.forbidden" };
  const id = str(form, "id");
  if (!id || !(await retryOutboxRow(viewer.companyId, id))) return { error: "settingsNotifications.retryGone" };
  revalidatePath(`${companyPrefix(slug)}/settings/notifications`);
  return { ok: true };
}
