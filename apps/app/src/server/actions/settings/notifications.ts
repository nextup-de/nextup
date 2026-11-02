"use server";
// /<company>/settings/notifications: the switch and Retry (ADM-N1). Each action starts with companyAdminOf
// and names the company id from the guard, never one from the form.
import { revalidatePath } from "next/cache";
import { companyPrefix } from "@/features/tenant/urls";
import { getDb } from "@/lib/db/client";
import { retryOutboxRow } from "@/lib/db/outbox-retry";
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
  await getDb().companyConfig.upsert({
    where: { companyId: viewer.companyId },
    create: { companyId: viewer.companyId, notifications: on },
    update: { notifications: on },
  });
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
