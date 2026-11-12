// Writing a directory page into users, seats and cases (DIR/D9). The plan is features/directory/apply.ts;
// this file only reads and writes rows. Every query names the company at the top level.
// employeeId is never logged (DIR/D5): nothing here logs at all.
import type { DirectoryPage } from "@nextup/contracts/public";
import { seatsOfRole } from "@/features/auth/identity";
import { reduce } from "@/features/cases/reducer";
import { heldOf, planDirectoryDelta, type Held, type PlanRef } from "@/features/directory/apply";
import { SCIM_LINK_ISSUER } from "@/features/identity";
import type { DirectoryCounts, DirectorySourceKind } from "@/features/directory";
import { getDb } from "./client";
import { loadSeed } from "./companies";
import type { Tx } from "./org-edit";
import { appendEventRow, loadLog } from "./events";
import { formerCheck } from "./former";
import { loadSeats } from "./holders";
import { linkIdentity } from "./sso";

const ACTOR = "system:directory";

/** Switch users off and vacate their seats. Returns the ids actually switched (active ones only) and the seats vacated. */
async function switchOff(companyId: string, userIds: string[], now: Date, alsoInTx?: (tx: Tx) => Promise<void>): Promise<{ users: string[]; seatIds: Map<string, string[]> }> {
  const db = getDb();
  const users: string[] = [];
  const seatIds = new Map<string, string[]>();
  for (const userId of userIds) {
    const done = await db.$transaction(async (tx) => {
      const r = await tx.user.updateMany({ where: { id: userId, companyId, active: true }, data: { active: false, deactivatedAt: now } });
      if (r.count === 0) return null;
      const seats = await tx.orgRoleHolder.findMany({ where: { companyId, userId }, select: { id: true } });
      await tx.orgRoleHolder.updateMany({ where: { companyId, userId }, data: { userId: null } });
      await alsoInTx?.(tx);
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

/**
 * The projects a leaver leaves behind (MOV, D14/D22). Per live project: where they lead, project.lead.vacated (the
 * reducer frees their open steps too); else where they are a member, the sponsor, a follower or own an open step,
 * project.member off with unassign. The key carries the leaver's deactivation (`deactivatedAt`, persisted by switchOff),
 * so the same departure retried writes nothing new, while leaving again after a reactivation and a new appointment
 * is a new departure and writes again. Returns how many events were newly written.
 */
async function vacateProjects(companyId: string, userIds: string[], now: Date): Promise<number> {
  if (userIds.length === 0) return 0;
  const db = getDb();
  const company = await db.company.findUnique({ where: { id: companyId }, select: { slug: true } });
  if (!company) return 0;
  const seed = await loadSeed(company.slug);
  if (!seed) return 0;
  const seats = await loadSeats(companyId);
  const left = await db.user.findMany({ where: { companyId, id: { in: userIds } }, select: { id: true, deactivatedAt: true } });
  const occurrence = new Map(left.map((u) => [u.id, (u.deactivatedAt ?? now).getTime()]));
  const state = reduce({ ...seed, seats }, await loadLog(companyId, now));
  let written = 0;
  const write = async (type: "project.lead.vacated" | "project.member", projectId: string, userId: string, key: string, payload: Record<string, unknown>) => {
    const r = await appendEventRow(
      companyId,
      { id: crypto.randomUUID(), day: 0, type, actor: ACTOR, targetId: projectId, payload },
      { source: "directory", idemKey: key, now },
    );
    if (r.ok && !r.duplicate) written++;
  };
  for (const p of state.projects) {
    if (p.status === "stopped" || p.status === "recognised") continue;
    for (const userId of userIds) {
      const at = occurrence.get(userId);
      if (at === undefined) continue;
      if (p.leadUserId === userId) {
        await write("project.lead.vacated", p.id, userId, `dir:vacated:${p.id}:${userId}:${at}`, { userId });
      } else if (
        p.memberUserIds.includes(userId) || p.sponsorUserId === userId || p.followerUserIds.includes(userId)
        || p.steps.some((st) => st.ownerUserId === userId && st.column !== "done")
      ) {
        await write("project.member", p.id, userId, `dir:left:${p.id}:${userId}:${at}`, { userId, on: false, unassign: true });
      }
    }
  }
  return written;
}

/** One user leaves: inactive, seats vacated, open cases on them handed. Zero counts when they were inactive already. */
export async function deactivateUser(companyId: string, userId: string, now: Date = new Date(), alsoInTx?: (tx: Tx) => Promise<void>): Promise<Pick<DirectoryCounts, "deactivated" | "handed">> {
  const off = await switchOff(companyId, [userId], now, alsoInTx);
  const handed = await handCases(companyId, [...off.seatIds.values()].flat(), now);
  await vacateProjects(companyId, off.users, now);
  return { deactivated: off.users.length, handed };
}

/** Apply one page of any directory source to the company. The same page twice changes nothing. */
export async function applyDirectoryDelta(
  companyId: string,
  source: DirectorySourceKind,
  page: DirectoryPage,
  now: Date = new Date(),
): Promise<DirectoryCounts & { held: Held }> {
  const db = getDb();
  // SCIM keys people by the subject of their SCIM link (EID D6); the other sources do not read the links.
  const [users, units, withHandle, scimLinks, pseudonyms, isFormer] = await Promise.all([
    db.user.findMany({
      where: { companyId },
      select: { id: true, entraOid: true, employeeId: true, email: true, active: true, managerId: true, dept: true, name: true, line: true },
    }),
    db.orgUnit.findMany({ where: { companyId }, select: { key: true, name: true, sort: true } }),
    db.user.findMany({ where: { companyId, handle: { not: null } }, select: { handle: true } }),
    source === "scim"
      ? db.externalIdentity.findMany({ where: { companyId, provider: "scim", issuer: SCIM_LINK_ISSUER }, select: { userId: true, subject: true } })
      : Promise.resolve([]),
    db.pseudonym.findMany({ where: { companyId }, select: { userId: true } }),
    formerCheck(companyId),
  ]);
  const subjectOf = new Map(scimLinks.map((l) => [l.userId, l.subject]));
  const gone = new Set(pseudonyms.map((p) => p.userId));
  const marked = users.map((u) => ({ ...u, pseudonymised: gone.has(u.id) }));
  // Someone pseudonymised is not on the page at all, and is nobody's manager any more: a manager the
  // company cannot place would hold the colleague back every round.
  const entries = page.entries
    .filter((e) => !isFormer(e.externalId) && !isFormer(e.email))
    .map((e) => (isFormer(e.managerExternalId) ? { ...e, managerExternalId: null } : e));
  const plan = planDirectoryDelta({
    source, units,
    page: { ...page, entries },
    users: source === "scim" ? marked.map((u) => ({ ...u, scimSubject: subjectOf.get(u.id) ?? null })) : marked,
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
      if (source === "scim") await linkIdentity({ companyId, userId: row.id, provider: "scim", issuer: SCIM_LINK_ISSUER, subject: c.externalId }, tx);
    }
    for (const l of plan.links) await linkIdentity({ companyId, userId: l.userId, provider: "scim", issuer: SCIM_LINK_ISSUER, subject: l.subject }, tx);
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
  await vacateProjects(companyId, off.users, now);
  // An update that only came back from leaving is an update, a leaver is not.
  return { added: plan.creates.length, updated: plan.updates.length, deactivated: off.users.length, handed, held: heldOf(plan) };
}
