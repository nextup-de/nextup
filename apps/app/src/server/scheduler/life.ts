// Musterwerk's working day (features/demo/life): every LIFE_INTERVAL_MS (default 10 minutes) this looks for the generated demo
// company (named "Musterwerk GmbH", in sandbox or pilot, with the flag musterwerkLife switched on in admin.sellux.ch; it is off
// by default, so the test runs' own generated companies stay still) and, from 07:00 Europe/Berlin on a working
// day of its calendar, writes that day's ideas, decisions and project moves once. Every event carries an idemKey
// (life:<date>:<what>), so another process or a restart writes nothing twice. Stored with source "life": the notice planner
// keeps only the in-app copy, so nobody gets mail or a Teams message from the simulation. LIFE_OFF=1 switches it off. Started from instrumentation.ts.
//
// Not a "use server" module.
import { reduce } from "@/features/cases/reducer";
import { berlinDate, isWorkday } from "@/features/clock/calendar";
import { isEnabled } from "@/features/flags";
import { lifeDay, LIFE_SOURCE, type LifePerson, type LifeRoute } from "@/features/demo/life/plan";
import { loadCalendar } from "@/lib/db/calendar";
import { getDb, hasDatabase } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { appendEventRow, loadLog } from "@/lib/db/events";
import { loadKnowledge } from "@/lib/db/knowledge";

export const LIFE_COMPANY_NAME = "Musterwerk GmbH";
const LIFE_HOUR = 7;
/** Events the people of the company did not write themselves: the generator's, the clock's, this loop's, the directory's, the agent's. */
const NOT_A_PERSON = ["clock", LIFE_SOURCE, "directory", "agent"];

const intervalMs = (): number => {
  const n = Number(process.env.LIFE_INTERVAL_MS);
  return Number.isFinite(n) && n >= 1000 ? n : 10 * 60_000;
};

const berlinHour = (now: Date): number =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(now));

/** One company's day. Returns how many events were newly written. */
export async function runLifeDay(company: { id: string; slug: string; seedJson: unknown; stage: string }, now: Date): Promise<number> {
  const db = getDb();
  const calendar = await loadCalendar(company.id);
  const iso = berlinDate(now);
  if (!isWorkday(iso, calendar) || berlinHour(now) < LIFE_HOUR) return 0;

  const knowledge = await loadKnowledge(company.id);
  const seed = await companySeed(company, knowledge);
  const log = await loadLog(company.id, now);
  const state = reduce(seed, log);
  const [users, acted] = await Promise.all([
    db.user.findMany({ where: { companyId: company.id, active: true }, select: { id: true, name: true, dept: true, role: true } }),
    db.caseEvent.findMany({
      where: { companyId: company.id, actorUserId: { not: null }, source: { notIn: NOT_A_PERSON }, NOT: { id: { startsWith: `${company.slug}-e` } } },
      distinct: ["actorUserId"],
      select: { actorUserId: true },
    }),
  ]);
  const people: LifePerson[] = users.map((u) => ({ id: u.id, name: u.name, dept: u.dept, role: u.role }));
  const byId = new Map(people.map((p) => [p.id, p]));
  const routes: LifeRoute[] = knowledge.rules.flatMap((rule) => {
    const holder = [...knowledge.holders].sort((a, b) => a.sort - b.sort).find((h) => h.roleId === rule.ownerRoleId); // the route's owner seat (knowledge/index.ts)
    return holder ? [{ key: rule.key, holderId: holder.id, owner: holder.userId ? byId.get(holder.userId) ?? null : null }] : [];
  });
  const humans = new Set(acted.map((a) => a.actorUserId!));

  const events = lifeDay({ slug: company.slug, iso, today: log.day, state, promiseDays: seed.promiseDays, routes, people, humans });
  let written = 0;
  for (const e of events) {
    const r = await appendEventRow(
      company.id,
      { id: e.id, day: 0, type: e.type, actor: e.actor, targetId: e.targetId, payload: e.payload },
      { actorUserId: e.actorUserId, source: LIFE_SOURCE, idemKey: e.idemKey, now },
    );
    if (!r.ok) throw new Error(r.error);
    if (!r.duplicate) written++;
  }
  return written;
}

/** One pass over the generated demo companies. Never throws. */
export async function runLifeOnce(now: Date = new Date()): Promise<{ slug: string; written: number }[]> {
  const out: { slug: string; written: number }[] = [];
  const companies = await getDb().company.findMany({
    where: { name: LIFE_COMPANY_NAME, stage: { in: ["sandbox", "pilot"] } },
    select: { id: true, slug: true, seedJson: true, stage: true },
  });
  for (const company of companies) {
    try {
      if (!(await isEnabled(company.slug, "musterwerkLife"))) continue;
      const written = await runLifeDay(company, now);
      if (written > 0) console.log(`[life] ${company.slug}: ${written} events`);
      out.push({ slug: company.slug, written });
    } catch (e) {
      console.warn(`[life] ${company.slug}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}

const globalForLife = globalThis as unknown as { __nextupLife?: ReturnType<typeof setInterval> };

const tick = (): void => {
  void runLifeOnce().catch((e) => console.warn(`[life] run: ${e instanceof Error ? e.message : String(e)}`));
};

/** Start the loop from instrumentation.ts. Idempotent; a no-op without a database or with LIFE_OFF=1. */
export function startLife(): void {
  if (!hasDatabase() || process.env.LIFE_OFF === "1" || globalForLife.__nextupLife) return;
  globalForLife.__nextupLife = setInterval(tick, intervalMs());
  tick();
}
