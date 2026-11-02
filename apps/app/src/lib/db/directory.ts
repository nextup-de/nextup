// Writing a directory page into users, seats and cases (DIR/D9). The plan is features/directory/apply.ts;
// this file only reads and writes rows. Every query names the company at the top level.
// employeeId is never logged (DIR/D5): nothing here logs at all.
import type { DirectoryPage } from "@nextup/contracts/public";
import { seatsOfRole } from "@/features/auth/identity";
import { reduce } from "@/features/cases/reducer";
import { planDirectoryDelta, type PlanRef } from "@/features/directory/apply";
import type { DirectoryCounts, DirectorySourceKind } from "@/features/directory";
import { getDb } from "./client";
import { loadSeed } from "./companies";
import { appendEventRow, loadLog } from "./events";
import { loadSeats } from "./holders";

const ACTOR = "system:directory";

/** Switch users off and vacate their seats. Returns the ids actually switched (active ones only) and the seats vacated. */
async function switchOff(companyId: string, userIds: string[], now: Date): Promise<{ users: string[]; seatIds: Map<string, string[]> }> {
  const db = getDb();
  const users: string[] = [];
  const seatIds = new Map<string, string[]>();
  for (const userId of userIds) {
    const done = await db.$transaction(async (tx) => {
      const r = await tx.user.updateMany({ where: { id: userId, companyId, active: true }, data: { active: false, deactivatedAt: now } });
      if (r.count === 0) return null;
      const seats = await tx.orgRoleHolder.findMany({ where: { companyId, userId }, select: { id: true } });
      await tx.orgRoleHolder.updateMany({ where: { companyId, userId }, data: { userId: null } });
      return seats.map((s) => s.id);
    });
    if (done) { users.push(userId); seatIds.set(userId, done); }
  }
  return { users, seatIds };
}

/** Hand each open case on a vacated seat to the role's first other seat with an active user. */
async function handCases(companyId: string, vacated: string[], now: Date): Promise<number> {
  if (vacated.length === 0) return 0;
  const db = getDb();
  const company = await db.company.findUnique({ where: { id: companyId }, select: { slug: true } });
  if (!company) return 0;
  const seed = await loadSeed(company.slug);
  if (!seed) return 0;
  const seats = await loadSeats(companyId);
  const activeIds = new Set((await db.user.findMany({ where: { companyId, active: true }, select: { id: true } })).map((u) => u.id));
  const state = reduce({ ...seed, seats }, await loadLog(companyId, now));
  const gone = new Set(vacated);
  let handed = 0;
  for (const c of state.cases) {
    if (!c.open || !c.assigneeSeatId || !gone.has(c.assigneeSeatId) || !c.assigneeRoleId) continue;
    const to = seatsOfRole(seats, c.assigneeRoleId).find((s) => s.id !== c.assigneeSeatId && s.userId !== null && activeIds.has(s.userId));
    if (!to) continue; // nobody else holds the role: the case stays with the role
    const r = await appendEventRow(
      companyId,
      { id: crypto.randomUUID(), day: 0, type: "case.handed", actor: ACTOR, targetId: c.id, payload: { to: to.label, toRoleHolderId: to.id, why: "leaver" } },
      { source: "directory", idemKey: `dir:leaver:${c.id}:${c.assigneeSeatId}`, now },
    );
    if (r.ok && !r.duplicate) handed++;
  }
  return handed;
}

/** One user leaves: inactive, seats vacated, open cases on them handed. Zero counts when they were inactive already. */
export async function deactivateUser(companyId: string, userId: string, now: Date = new Date()): Promise<Pick<DirectoryCounts, "deactivated" | "handed">> {
  const off = await switchOff(companyId, [userId], now);
  const handed = await handCases(companyId, [...off.seatIds.values()].flat(), now);
  return { deactivated: off.users.length, handed };
}

/** Apply one page of any directory source to the company. The same page twice changes nothing. */
export async function applyDirectoryDelta(
  companyId: string,
  source: DirectorySourceKind,
  page: DirectoryPage,
  now: Date = new Date(),
): Promise<DirectoryCounts> {
  const db = getDb();
  const [users, units, withHandle] = await Promise.all([
    db.user.findMany({
      where: { companyId },
      select: { id: true, entraOid: true, employeeId: true, email: true, active: true, managerId: true, dept: true, name: true, line: true },
    }),
    db.orgUnit.findMany({ where: { companyId }, select: { key: true, name: true, sort: true } }),
    db.user.findMany({ where: { companyId, handle: { not: null } }, select: { handle: true } }),
  ]);
  const plan = planDirectoryDelta({
    source, page, users, units,
    takenHandles: withHandle.flatMap((h) => (h.handle ? [h.handle] : [])),
  });

  await db.$transaction(async (tx) => {
    const created: string[] = [];
    for (const c of plan.creates) {
      const row = await tx.user.create({
        data: {
          companyId, name: c.name, email: c.email, role: c.role, dept: c.dept, line: c.line, ini: c.ini, handle: c.handle,
          entraOid: c.entraOid, employeeId: c.employeeId, directorySyncedAt: now,
        },
        select: { id: true },
      });
      created.push(row.id);
    }
    for (const u of plan.updates) {
      const { active, ...rest } = u.fields;
      await tx.user.updateMany({
        where: { id: u.userId, companyId },
        data: { ...rest, ...(active ? { active: true, deactivatedAt: null } : {}) },
      });
    }
    if (plan.seen.length > 0) await tx.user.updateMany({ where: { companyId, id: { in: plan.seen } }, data: { directorySyncedAt: now } });
    const idOf = (r: PlanRef) => ("userId" in r ? r.userId : created[r.create]);
    for (const m of plan.managers) {
      await tx.user.updateMany({ where: { id: idOf(m.who), companyId }, data: { managerId: m.manager ? idOf(m.manager) : null } });
    }
  });

  const off = await switchOff(companyId, plan.leavers, now);
  const handed = await handCases(companyId, [...off.seatIds.values()].flat(), now);
  // An update that only came back from leaving is an update, a leaver is not.
  return { added: plan.creates.length, updated: plan.updates.length, deactivated: off.users.length, handed };
}
