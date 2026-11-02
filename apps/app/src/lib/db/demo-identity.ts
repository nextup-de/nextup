// Binds a demo company's content to its ids (IDN/D9): the seats to the users whose label they carry,
// and the stored seed's cases, history, projects and personas to seat and user ids. The label
// matching is features/demo/identity.ts; this file only reads and writes rows.
// Every query names the company at the top level, so the tenant guard sees it.
import { contentOnly } from "@/features/demo/content";
import { bindDemoIds, userByLabel, type DemoUser } from "@/features/demo/identity";
import { isSeed, parseSeed, toSeedJson } from "@/features/demo/parse";
import { getDb } from "./client";
import { loadSeats } from "./holders";

/**
 * Sets userId on every seat with none whose label names exactly one user, then stores the seed bound
 * to those ids. A second run changes nothing: seatsLinked is 0 and seedBound is false.
 */
export async function bindDemoCompany(companyId: string): Promise<{ seatsLinked: number; seedBound: boolean }> {
  const db = getDb();
  const users: DemoUser[] = await db.user.findMany({ where: { companyId }, select: { id: true, name: true, handle: true } });
  const seats = await loadSeats(companyId);

  let seatsLinked = 0;
  const linked = [];
  for (const s of seats) {
    const userId = s.userId ?? userByLabel(users, s.label);
    if (s.userId === null && userId !== null) {
      await db.orgRoleHolder.update({ where: { id: s.id, companyId }, data: { userId } });
      seatsLinked++;
    }
    linked.push({ ...s, userId });
  }

  const row = await db.company.findUnique({ where: { id: companyId }, select: { seedJson: true } });
  if (!row || !isSeed(row.seedJson)) return { seatsLinked, seedBound: false };
  const bound = toSeedJson(contentOnly(bindDemoIds(parseSeed(row.seedJson), linked, users)));
  const seedBound = JSON.stringify(bound) !== JSON.stringify(row.seedJson);
  if (seedBound) await db.company.update({ where: { id: companyId }, data: { seedJson: bound as object } });
  return { seatsLinked, seedBound };
}
