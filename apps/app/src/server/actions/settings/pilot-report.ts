"use server";
// /<company>/settings/pilot-report, the Weekly email card (PIL D12, Q1): who gets the mail, and a mail to
// yourself. Each action starts with companyAdminOf and names the company id from the guard, never one from the
// form. Recipients are user ids of active managers of this company and nobody else.
import { revalidatePath } from "next/cache";
import { auditChanges } from "@/features/audit";
import { gateOf } from "@/features/notify/gate";
import { PILOT_REPORT_TEMPLATE, pilotReportDraft } from "@/features/pilot/report-mail";
import { companyPrefix } from "@/features/tenant/urls";
import { localeForUser } from "@/i18n/server";
import { getDb } from "@/lib/db/client";
import { enqueue } from "@/lib/db/outbox";
import { pilotWeek, pilotWeekList } from "@/lib/db/pilot-week";
import { companyBaseUrl } from "@/server/case-notice";
import { settingsActor } from "@/server/audit/record";
import { audited } from "./audited";
import { companyAdminOf } from "./guard";
import type { SettingsFormState } from "./company";

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};

/** The chosen recipients (preference rows with the template on) of the company, sorted. */
async function chosenIds(companyId: string): Promise<string[]> {
  const rows = await getDb().notifyPreference.findMany({ where: { companyId, template: PILOT_REPORT_TEMPLATE, on: true }, select: { userId: true } });
  return rows.map((r) => r.userId).sort();
}

/** Replaces the recipient list with the `userId` fields of the form. Anybody who is not an active manager is refused. */
export async function savePilotReportRecipientsAction(_prev: SettingsFormState, form: FormData): Promise<SettingsFormState> {
  const slug = str(form, "slug");
  const viewer = slug ? await companyAdminOf(slug) : null;
  if (!viewer) return { error: "settingsCompany.forbidden" };
  const wanted = [...new Set(form.getAll("userId").filter((v): v is string => typeof v === "string" && v !== ""))].sort();
  const managers = await getDb().user.findMany({
    where: { companyId: viewer.companyId, id: { in: wanted }, active: true, role: "manager" },
    select: { id: true },
  });
  if (managers.length !== wanted.length) return { error: "settingsPilotReport.emailNotManager", field: "userId" };

  const saved = await audited(
    viewer.companyId,
    (was: string[]) => {
      const changes = auditChanges({ pilotReportRecipients: was }, { pilotReportRecipients: wanted });
      if (Object.keys(changes).length === 0) return null;
      return { actor: settingsActor(viewer), action: "audit.settings.notifications", target: { kind: "company", id: viewer.companyId }, changes, source: "settings" };
    },
    async (tx) => {
      const rows = await tx.notifyPreference.findMany({ where: { companyId: viewer.companyId, template: PILOT_REPORT_TEMPLATE }, select: { userId: true, on: true } });
      const was = rows.filter((r) => r.on).map((r) => r.userId).sort();
      for (const userId of wanted) {
        await tx.notifyPreference.upsert({
          where: { companyId_userId_template: { companyId: viewer.companyId, userId, template: PILOT_REPORT_TEMPLATE } },
          create: { companyId: viewer.companyId, userId, template: PILOT_REPORT_TEMPLATE, on: true },
          update: { on: true },
        });
      }
      await tx.notifyPreference.updateMany({
        where: { companyId: viewer.companyId, template: PILOT_REPORT_TEMPLATE, on: true, userId: { notIn: wanted } },
        data: { on: false },
      });
      return was;
    },
  );
  if (!saved.ok) return { error: "settingsCompany.auditFailed" };
  revalidatePath(`${companyPrefix(slug)}/settings/pilot-report`);
  return { ok: true };
}

/**
 * Mails the signed-in admin the newest report week now. Its own key (pilot-me:<week>:<user>:<instant>), so it never
 * collides with, or uses up, the Monday mail. A sandbox writes nothing: the person is told so.
 */
export async function sendMeThisWeekAction(_prev: SettingsFormState, form: FormData): Promise<SettingsFormState> {
  const slug = str(form, "slug");
  const viewer = slug ? await companyAdminOf(slug) : null;
  if (!viewer) return { error: "settingsCompany.forbidden" };
  const db = getDb();
  const company = await db.company.findUnique({ where: { id: viewer.companyId }, select: { name: true, stage: true } });
  const me = await db.user.findFirst({ where: { id: viewer.userId, companyId: viewer.companyId }, select: { email: true } });
  if (!company || !me || !me.email.trim()) return { error: "settingsCompany.forbidden" };
  const config = await db.companyConfig.findUnique({ where: { companyId: viewer.companyId }, select: { notifications: true, n8n: true } });
  if (!gateOf({ stage: company.stage, notifications: config?.notifications ?? false, n8n: config?.n8n ?? false }, "mail", PILOT_REPORT_TEMPLATE, { template: true, all: null }).send) {
    return { error: "settingsPilotReport.emailSandbox" };
  }
  const now = new Date();
  const weeks = (await pilotWeekList(viewer.companyId, now)).weeks;
  // The newest week that has a working day.
  let data = null;
  for (let i = weeks.length - 1; i >= 0 && !data; i--) data = await pilotWeek(viewer.companyId, weeks[i].monday, now);
  if (!data) return { error: "settingsPilotReport.emailNoWeek" };
  const email = me.email.trim();
  const draft = pilotReportDraft({ userId: viewer.userId, company: company.name, week: data.week, report: data.report, locale: await localeForUser(viewer.companyId, viewer.userId), baseUrl: companyBaseUrl(slug) });
  await enqueue(viewer.companyId, [{ ...draft, address: email, key: `pilot-me:${draft.key.slice("pilot:".length)}:${now.getTime()}` }]);
  return { ok: true };
}
