"use server";
// /<company>/settings/notifications: the switch and Retry (ADM-N1). Each action starts with companyAdminOf
// and names the company id from the guard, never one from the form.
import { revalidatePath } from "next/cache";
import { companyPrefix } from "@/features/tenant/urls";
import { auditChanges } from "@/features/audit";
import { getViewerFor } from "@/features/auth/session";
import { noticeChannelFor } from "@/features/notify/channels";
import { noticeChannelsFromForm, NOTICE_GROUP_ORDER, storedNoticeChannels } from "@/features/settings/notifications";
import { TEAMS_SYSTEM, teamsApp } from "@/features/teams/config";
import { getDb } from "@/lib/db/client";
import { getIntegration } from "@/lib/db/integrations";
import { conversationOf } from "@/lib/db/teams";
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

/** How the company's notices travel (INB-C1, D6): one rule per notice group. Managers only; the company is the guard's, never the form's. */
export async function saveNoticeChannelsAction(slug: string, _prev: SettingsFormState, form: FormData): Promise<SettingsFormState> {
  const viewer = slug ? await companyAdminOf(slug) : null;
  if (!viewer) return { error: "settingsCompany.forbidden" };
  const rules = noticeChannelsFromForm(form);
  const stored = storedNoticeChannels(rules);
  const saved = await audited(
    viewer.companyId,
    (was: unknown) => ({
      actor: settingsActor(viewer), action: "audit.settings.notifications", target: { kind: "company", id: viewer.companyId },
      changes: auditChanges(
        Object.fromEntries(NOTICE_GROUP_ORDER.map((g) => [`noticeChannels.${g}`, noticeChannelFor({ noticeChannels: was }, g)])),
        Object.fromEntries(NOTICE_GROUP_ORDER.map((g) => [`noticeChannels.${g}`, rules[g]])),
      ),
      source: "settings",
    }),
    async (tx) => {
      const row = await tx.companyConfig.findUnique({ where: { companyId: viewer.companyId }, select: { noticeChannels: true } });
      await tx.companyConfig.upsert({
        where: { companyId: viewer.companyId },
        create: { companyId: viewer.companyId, noticeChannels: stored },
        update: { noticeChannels: stored },
      });
      return row?.noticeChannels ?? null;
    },
  );
  if (!saved.ok) return { error: "settingsCompany.auditFailed" };
  revalidatePath(`${companyPrefix(slug)}/settings/notifications`);
  return { ok: true };
}

/** Whether Teams can reach the signed-in person: it is on for the company and they have a chat with the bot (D7). Their own, never anybody else's. */
export async function myTeamsReachableAction(slug: string): Promise<boolean> {
  const viewer = slug ? await getViewerFor(slug) : null;
  if (!viewer || !teamsApp()) return false;
  const [integration, tenant, chat] = await Promise.all([
    getIntegration(viewer.companyId, TEAMS_SYSTEM),
    getDb().company.findUnique({ where: { id: viewer.companyId }, select: { entraTenantId: true } }),
    conversationOf(viewer.companyId, viewer.userId),
  ]);
  return !!integration?.on && !!tenant?.entraTenantId && !!chat;
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
