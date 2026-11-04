"use server";
// /<company>/settings/teams: the company's Teams switch and the test card (TMS-F1, D16). Each action starts
// with companyAdminOf and names the company id from the guard, never one from the form.
import { revalidatePath } from "next/cache";
import { auditChanges } from "@/features/audit";
import { attachment, textCard } from "@/features/teams/cards";
import { TEAMS_SYSTEM, teamsApp } from "@/features/teams/config";
import { companyPrefix } from "@/features/tenant/urls";
import type { MessageKey } from "@/i18n";
import { createT } from "@/i18n";
import { localeForUser } from "@/i18n/server";
import { getDb } from "@/lib/db/client";
import { conversationOf } from "@/lib/db/teams";
import { recordAudit, settingsActor } from "@/server/audit/record";
import { sendActivity } from "@/server/teams/connector";
import { audited } from "./audited";
import { companyAdminOf } from "./guard";

/** `detail` fills the {error} of `testFailed`. */
export type TeamsFormState = { ok?: boolean; error?: MessageKey; detail?: string; note?: MessageKey };

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};

/** Switch Teams on or off. On needs this stack's bot registration and the company's Microsoft tenant id. */
export async function setTeamsOnAction(_prev: TeamsFormState, form: FormData): Promise<TeamsFormState> {
  const slug = str(form, "slug");
  const viewer = slug ? await companyAdminOf(slug) : null;
  if (!viewer) return { error: "settingsTeams.forbidden" };
  const on = str(form, "on") === "on";
  if (on) {
    if (!teamsApp()) return { error: "settingsTeams.notConfigured" };
    const company = await getDb().company.findUnique({ where: { id: viewer.companyId }, select: { entraTenantId: true } });
    if (!company?.entraTenantId) return { error: "settingsTeams.noTenant" };
  }
  const saved = await audited(
    viewer.companyId,
    (was: boolean | null) => ((was ?? false) === on ? null : {
      actor: settingsActor(viewer), action: "audit.settings.teams", target: { kind: "integration", id: TEAMS_SYSTEM },
      changes: auditChanges({ teams: was }, { teams: on }), source: "settings",
    }),
    async (tx) => {
      const where = { companyId_system: { companyId: viewer.companyId, system: TEAMS_SYSTEM } };
      const row = await tx.integration.findUnique({ where, select: { on: true, enabledAt: true } });
      await tx.integration.upsert({
        where,
        create: { companyId: viewer.companyId, system: TEAMS_SYSTEM, on, enabledAt: on ? new Date() : null, settings: {}, updatedBy: viewer.userId },
        update: { on, enabledAt: on ? (row?.enabledAt ?? new Date()) : row?.enabledAt ?? null, updatedBy: viewer.userId },
      });
      return row ? row.on : null;
    },
  );
  if (!saved.ok) return { error: "settingsTeams.auditFailed" };
  revalidatePath(`${companyPrefix(slug)}/settings/teams`);
  return { ok: true, note: "settingsTeams.saved" };
}

/** A text card straight through the connector to the admin's own conversation with the bot. */
export async function sendTestCardAction(_prev: TeamsFormState, form: FormData): Promise<TeamsFormState> {
  const slug = str(form, "slug");
  const viewer = slug ? await companyAdminOf(slug) : null;
  if (!viewer) return { error: "settingsTeams.forbidden" };
  const app = teamsApp();
  if (!app) return { error: "settingsTeams.notConfigured" };
  const conversation = await conversationOf(viewer.companyId, viewer.userId);
  if (!conversation) return { error: "settingsTeams.testNoChat" };

  const company = await getDb().company.findUnique({ where: { id: viewer.companyId }, select: { name: true } });
  const locale = await localeForUser(viewer.companyId, viewer.userId);
  const t = createT(locale);
  const card = textCard(
    { subject: t("settingsTeams.testSubject"), text: t("settingsTeams.testText", { company: company?.name ?? slug }) },
    locale,
  );
  try {
    const sent = await sendActivity(app, conversation.serviceUrl, conversation.conversationId, { type: "message", attachments: [attachment(card)] });
    if (sent.status < 200 || sent.status >= 300) return { error: "settingsTeams.testFailed", detail: `Teams answered ${sent.status}` };
  } catch (e) {
    return { error: "settingsTeams.testFailed", detail: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
  }
  try {
    await recordAudit(viewer.companyId, {
      actor: settingsActor(viewer), action: "audit.settings.teams", target: { kind: "integration", id: TEAMS_SYSTEM },
      changes: { testCard: { before: null, after: "sent" } }, source: "settings",
    });
  } catch (e) {
    console.error(`[audit] audit.settings.teams not written: ${e instanceof Error ? e.message : String(e)}`);
  }
  revalidatePath(`${companyPrefix(slug)}/settings/teams`);
  return { ok: true, note: "settingsTeams.testSent" };
}
