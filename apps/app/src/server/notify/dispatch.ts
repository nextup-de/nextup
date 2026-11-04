// The dispatcher (plan NTF, D6): turn each new event of a company's log into outbox rows.
//
// Per company, under the NotifyCursor lease (one runner at a time, also across processes): read the events behind
// the cursor in seq order, plan each (features/notify/plan.ts), write the drafts and move the cursor in one
// transaction. A crash re-plans from the old cursor and the unique key (companyId, key) stops a second row:
// at least once, never lost, never twice for one key. A company's first run starts its cursor at its newest
// event, so history sends nothing. Never throws: a company that fails records why on its cursor.
//
// Not a "use server" module.
import type { Prisma } from "@prisma/client";
import type { CaseEvent } from "@/features/cases/events";
import { logFromRows } from "@/features/cases/persist";
import { relabelRows } from "@/lib/db/pseudonymise";
import { reduce } from "@/features/cases/reducer";
import { planNotices, type PlanCtx, type PlanPerson } from "@/features/notify/plan";
import { localeForEmail } from "@/i18n/server";
import { DEFAULT_LOCALE } from "@/i18n";
import { loadCalendar } from "@/lib/db/calendar";
import { companySeed } from "@/lib/db/companies";
import { getDb } from "@/lib/db/client";
import { dateOfCompanyDay, companyDay } from "@/lib/db/events";
import { getIntegration } from "@/lib/db/integrations";
import { prefsOf } from "@/lib/db/notify-prefs";
import { teamsUserIds } from "@/lib/db/teams";
import { TEAMS_SYSTEM, teamsApp } from "@/features/teams/config";
import { companyBaseUrl } from "@/server/case-notice";

/** A run that dies without releasing loses its lease after this. */
export const LEASE_MS = 5 * 60_000;
/** Events planned per company and run; the rest waits for the next run. */
export const PLAN_BATCH = 200;
const MAX_ERROR = 500;

export type DispatchCount = { companies: number; events: number; rows: number; skipped: number };

/** The cursor row for a company, created at its newest event the first time (no notices for history). */
async function ensureCursor(companyId: string): Promise<void> {
  const db = getDb();
  if (await db.notifyCursor.findUnique({ where: { companyId }, select: { companyId: true } })) return;
  const newest = await db.caseEvent.aggregate({ where: { companyId }, _max: { seq: true } });
  await db.notifyCursor.createMany({ data: [{ companyId, seq: newest._max.seq ?? 0 }], skipDuplicates: true });
}

async function claim(companyId: string, now: Date): Promise<boolean> {
  const r = await getDb().notifyCursor.updateMany({
    where: { companyId, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    data: { leaseUntil: new Date(now.getTime() + LEASE_MS), lastRunAt: now },
  });
  return r.count === 1;
}

/** One company's run, lease already held. Returns what it planned. */
async function planCompany(company: { id: string; slug: string; stage: string; demoDay: number; seedJson: unknown }, now: Date): Promise<{ events: number; rows: number }> {
  const db = getDb();
  const cursor = await db.notifyCursor.findUniqueOrThrow({ where: { companyId: company.id }, select: { seq: true } });
  const rows = await db.caseEvent.findMany({
    where: { companyId: company.id },
    orderBy: { seq: "asc" },
    select: { id: true, seq: true, day: true, ts: true, type: true, actor: true, actorUserId: true, targetId: true, payload: true },
  });
  const firstNew = rows.findIndex((r) => r.seq > cursor.seq);
  if (firstNew === -1) return { events: 0, rows: 0 };
  const upto = Math.min(rows.length, firstNew + PLAN_BATCH);

  // Teams works for the company (TMS D6): the app is set up, the switch is on, the tenant is known.
  const [integration, tenant] = teamsApp()
    ? await Promise.all([getIntegration(company.id, TEAMS_SYSTEM), db.company.findUnique({ where: { id: company.id }, select: { entraTenantId: true } })])
    : [null, null];
  const teamsOn = !!integration?.on && !!tenant?.entraTenantId;
  const teamsIds = teamsOn ? await teamsUserIds(company.id) : new Set<string>();

  const [users, config, subs] = await Promise.all([
    db.user.findMany({ where: { companyId: company.id }, select: { id: true, name: true, email: true, handle: true } }),
    db.companyConfig.findUnique({ where: { companyId: company.id }, select: { notifications: true, n8n: true } }),
    db.webhookSubscription.findMany({ where: { companyId: company.id }, select: { id: true, events: true, on: true } }),
  ]);
  const people: PlanPerson[] = [];
  for (const u of users) {
    const email = u.email.trim() || null;
    people.push({ id: u.id, email, locale: email ? await localeForEmail(company.id, email) : DEFAULT_LOCALE, name: u.name, handle: u.handle, teams: teamsIds.has(u.id) });
  }
  const ctx = {
    companyId: company.id,
    people,
    prefs: await prefsOf(company.id, users.map((u) => u.id)),
    company: { stage: company.stage, notifications: config?.notifications ?? false, n8n: config?.n8n ?? false },
    subscriptions: subs,
    baseUrl: companyBaseUrl(company.slug),
    teamsOn,
    dateOfDay: (n: number) => dateOfCompanyDay(company, calendar, n),
  };

  const seed = await companySeed(company);
  const calendar = await loadCalendar(company.id);
  const day = companyDay(company, calendar, now);
  const drafts: (Prisma.OutboxMessageCreateManyInput)[] = [];
  const named = await relabelRows(company.id, rows);
  let failure: string | null = null;
  for (let i = firstNew; i < upto; i++) {
    const log = logFromRows(named.slice(0, i + 1), day);
    const ev: CaseEvent = log.events[i];
    try {
      const planCtx: PlanCtx = { ...ctx, state: reduce(seed, log) };
      for (const d of planNotices(ev, planCtx)) drafts.push({ ...d, companyId: company.id });
    } catch (e) {
      // One event that cannot be planned must not hold back the company's other notices.
      failure = `${ev.type} ${ev.id}: ${e instanceof Error ? e.message : String(e)}`;
      console.warn(`[notify] ${company.slug}: could not plan ${failure}`);
    }
  }

  const last = rows[upto - 1].seq;
  const written = await db.$transaction(async (tx) => {
    const r = drafts.length ? await tx.outboxMessage.createMany({ data: drafts, skipDuplicates: true }) : { count: 0 };
    await tx.notifyCursor.update({ where: { companyId: company.id }, data: { seq: last, lastError: failure?.slice(0, MAX_ERROR) ?? null } });
    return r.count;
  });
  return { events: upto - firstNew, rows: written };
}

/** One pass over every company. */
export async function dispatchOnce(now: Date = new Date()): Promise<DispatchCount> {
  const count: DispatchCount = { companies: 0, events: 0, rows: 0, skipped: 0 };
  const db = getDb();
  const companies = await db.company.findMany({ select: { id: true, slug: true, stage: true, demoDay: true, seedJson: true }, orderBy: { id: "asc" } });
  for (const company of companies) {
    try {
      await ensureCursor(company.id);
      if (!(await claim(company.id, now))) {
        count.skipped++;
        continue;
      }
      try {
        const r = await planCompany(company, now);
        count.companies++;
        count.events += r.events;
        count.rows += r.rows;
      } catch (e) {
        const why = e instanceof Error ? e.message : String(e);
        console.warn(`[notify] ${company.slug}: ${why}`);
        await db.notifyCursor.updateMany({ where: { companyId: company.id }, data: { lastError: why.slice(0, MAX_ERROR) || "failed" } });
      } finally {
        await db.notifyCursor.updateMany({ where: { companyId: company.id }, data: { leaseUntil: null } }).catch(() => undefined);
      }
    } catch (e) {
      console.warn(`[notify] ${company.slug}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return count;
}
