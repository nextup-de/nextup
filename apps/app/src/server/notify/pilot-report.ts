// The weekly pilot report mail (plan PIL, D12): from DIGEST_HOUR on the first working day of an ISO week, every
// chosen active manager of a company in its pilot gets one `pilot.report` row in the outbox for the week before.
// Chosen means a stored pilot.report preference that is on - never the default-on rule. The key
// (pilot:<isoWeek>:<user>) makes a second run write nothing; the gate writes a sandbox company's rows as skipped.
// Never throws: a company that fails is logged and the others go on. Not a "use server" module.
import { berlinDate } from "@/features/clock/calendar";
import { gateOf, prefOf } from "@/features/notify/gate";
import { PILOT_REPORT_TEMPLATE, pilotReportDraft, pilotReportDue } from "@/features/pilot/report-mail";
import { localeForEmail } from "@/i18n/server";
import { loadCalendar } from "@/lib/db/calendar";
import { getDb } from "@/lib/db/client";
import { prefsOf } from "@/lib/db/notify-prefs";
import { enqueue, type OutboxDraft } from "@/lib/db/outbox";
import { pilotWeek } from "@/lib/db/pilot-week";
import { companyBaseUrl } from "@/server/case-notice";
import { DIGEST_HOUR } from "./digest";

/** One pass over every non-demo company (or only the one with this slug). Returns how many rows were written. */
export async function runPilotReports(now: Date = new Date(), only?: string): Promise<number> {
  const db = getDb();
  const companies = await db.company.findMany({
    where: { stage: { not: "demo" }, ...(only ? { slug: only } : {}) },
    select: { id: true, slug: true, name: true, stage: true },
    orderBy: { id: "asc" },
  });
  let written = 0;
  for (const company of companies) {
    try {
      const monday = pilotReportDue(now, await loadCalendar(company.id), DIGEST_HOUR);
      if (!monday) continue;
      const data = await pilotWeek(company.id, monday, now);
      if (!data) continue; // not a report week of the pilot, or a week without a working day
      const chosen = await db.notifyPreference.findMany({
        where: { companyId: company.id, template: PILOT_REPORT_TEMPLATE, on: true },
        select: { userId: true },
      });
      if (chosen.length === 0) continue;
      const users = await db.user.findMany({
        where: { companyId: company.id, id: { in: chosen.map((c) => c.userId) }, active: true, role: "manager" },
        select: { id: true, email: true },
        orderBy: { id: "asc" },
      });
      const config = await db.companyConfig.findUnique({ where: { companyId: company.id }, select: { notifications: true, n8n: true } });
      const gateCompany = { stage: company.stage, notifications: config?.notifications ?? false, n8n: config?.n8n ?? false };
      const prefs = await prefsOf(company.id, users.map((u) => u.id));
      const baseUrl = companyBaseUrl(company.slug);
      const drafts: OutboxDraft[] = [];
      for (const u of users) {
        const email = u.email.trim();
        if (!email) continue;
        const gate = gateOf(gateCompany, "mail", PILOT_REPORT_TEMPLATE, prefOf(prefs, u.id, PILOT_REPORT_TEMPLATE));
        const d = pilotReportDraft({ userId: u.id, company: company.name, week: data.week, report: data.report, locale: await localeForEmail(company.id, email), baseUrl });
        drafts.push({ ...d, address: email, status: gate.send ? "pending" : "skipped", lastError: gate.send ? null : gate.reason });
      }
      written += await enqueue(company.id, drafts);
    } catch (e) {
      console.warn(`[notify] pilot report ${company.slug} ${berlinDate(now)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return written;
}
