// The daily digest runner (plan NTF, D12): on each working day of a company's calendar, from 07:00 Europe/Berlin,
// every person who switched the digest on and has a case on their desk gets one `digest` row in the outbox.
// The key (digest:<user>:<workday>) makes a second run the same day write nothing. Demo companies get none.
// Never throws: a company that fails is logged and the others go on. Not a "use server" module.
import { logFromRows } from "@/features/cases/persist";
import { reduce } from "@/features/cases/reducer";
import { berlinDate, isWorkday, workdayOf } from "@/features/clock/calendar";
import { digestFor } from "@/features/notify/digest";
import { gateOf, prefOf } from "@/features/notify/gate";
import { localeForEmail } from "@/i18n/server";
import { loadCalendar } from "@/lib/db/calendar";
import { getDb } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { prefsOf } from "@/lib/db/notify-prefs";
import { enqueue } from "@/lib/db/outbox";
import { companyBaseUrl } from "@/server/case-notice";

/** The hour (Europe/Berlin) from which a working day's digest is written. */
export const DIGEST_HOUR = 7;

const berlinHour = (now: Date): number =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(now));

/** One pass over every non-demo company. Returns how many digest rows were written. */
export async function runDigests(now: Date = new Date()): Promise<number> {
  if (berlinHour(now) < DIGEST_HOUR) return 0;
  const db = getDb();
  const companies = await db.company.findMany({ where: { stage: { not: "demo" } }, select: { id: true, slug: true, stage: true, seedJson: true }, orderBy: { id: "asc" } });
  let written = 0;
  for (const company of companies) {
    try {
      const cal = await loadCalendar(company.id);
      if (!isWorkday(berlinDate(now), cal)) continue;
      const config = await db.companyConfig.findUnique({ where: { companyId: company.id }, select: { notifications: true, n8n: true } });
      const gateCompany = { stage: company.stage, notifications: config?.notifications ?? false, n8n: config?.n8n ?? false };
      const users = await db.user.findMany({ where: { companyId: company.id }, select: { id: true, email: true } });
      const prefs = await prefsOf(company.id, users.map((u) => u.id));
      const wanting = users.filter((u) => u.email.trim() && gateOf(gateCompany, "mail", "digest", prefOf(prefs, u.id, "digest")).send);
      if (wanting.length === 0) continue;

      const seed = await companySeed(company);
      const rows = await db.caseEvent.findMany({
        where: { companyId: company.id },
        orderBy: { seq: "asc" },
        select: { id: true, seq: true, day: true, ts: true, type: true, actor: true, actorUserId: true, targetId: true, payload: true },
      });
      const state = reduce(seed, logFromRows(rows, workdayOf(now, cal)));
      const baseUrl = companyBaseUrl(company.slug);
      const drafts = [];
      for (const u of wanting) {
        const email = u.email.trim();
        const d = digestFor(u.id, state, seed.seats, await localeForEmail(company.id, email), baseUrl);
        if (d) drafts.push({ ...d, address: email });
      }
      written += await enqueue(company.id, drafts);
    } catch (e) {
      console.warn(`[notify] digest ${company.slug}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return written;
}
