// Pseudonymising one person who left (GDP D15). One transaction. The event log is never touched: no
// CaseEvent row, payload or seedJson is updated, and no free text is searched or rewritten. Historical
// actors resolve by actorUserId through the person's Pseudonym row (features/cases/actor-label), and what
// leaves the server is relabelled on the way out (relabelRows).
import { relabelEvents } from "@/features/cases/relabel";
import { hideSmallDepts, namesDeptUnderHandle, unitPeople, type UnitPeople } from "@/features/cases/stamp";
import { pickPseudonymNumber, pseudonymLabel } from "@/features/privacy/pseudonymise";
import { resolveLocale } from "@/i18n";
import { getDb } from "./client";
import { memo } from "./company-memo";
import { keepFormerKeys } from "./former";
import { loadSeats } from "./holders";
import { loadMembers } from "./knowledge";
import type { Tx } from "./org-edit";

export type PseudonymiseCounts = {
  /** Structured identity references changed: the user row, saved-by names and seat labels. */
  identityRefs: number;
  /** Private rows deleted: assistant turns, unpublished drafts, connections, notification choices, the Teams link, notices to them. */
  deleted: number;
  /** Exports with the person as subject that lost their file. */
  exportsExpired: number;
};

export type Pseudonymised = { label: string; number: number; counts: PseudonymiseCounts };

/**
 * Pseudonymises the person, or returns null when they are not in the company or already pseudonymised.
 * The caller has checked the rest (inactive, no seat, not oneself). Pass `client` to run inside the
 * caller's transaction (the audit row), else this opens its own.
 */
export async function pseudonymiseUser(companyId: string, userId: string, now: Date = new Date(), client?: Tx): Promise<Pseudonymised | null> {
  if (client) return run(client, companyId, userId, now);
  return getDb().$transaction((tx) => run(tx, companyId, userId, now));
}

async function run(tx: Tx, companyId: string, userId: string, now: Date): Promise<Pseudonymised | null> {
  const user = await tx.user.findFirst({ where: { id: userId, companyId }, select: { name: true, email: true, entraOid: true, employeeId: true } });
  if (!user) return null;
  if (await tx.pseudonym.findUnique({ where: { companyId_userId: { companyId, userId } }, select: { userId: true } })) return null;

  const cfg = await tx.companyConfig.findUnique({ where: { companyId }, select: { defaultLocale: true } });
  const taken = await tx.pseudonym.findMany({ where: { companyId }, select: { number: true } });
  const number = pickPseudonymNumber(taken.map((p) => p.number));
  const label = pseudonymLabel(number, resolveLocale({ companyLocale: cfg?.defaultLocale }));
  await tx.pseudonym.create({ data: { companyId, userId, number, label, at: now } });
  await keepFormerKeys(tx, companyId, userId, [user.entraOid, user.employeeId, user.email]);

  await tx.user.update({
    where: { id: userId, companyId },
    data: {
      name: label, email: `former-${userId}@pseudonymised.invalid`, ini: "", line: "", dept: "",
      loginCodeHash: null, loginCodeAt: null, entraOid: null, employeeId: null,
    },
  });
  let identityRefs = 1;

  // "Saved by" and seat labels hold a display name, not a user id: the old name is the only link there
  // is, so these exact matches, inside this company, are the one place a name is compared.
  const was = user.name;
  const saved = { where: { companyId, updatedBy: was }, data: { updatedBy: label } } as const;
  const changed = [
    await tx.directoryRun.updateMany(saved),
    await tx.companyCalendar.updateMany(saved),
    await tx.integration.updateMany(saved),
    await tx.webhookSubscription.updateMany(saved),
    await tx.companyProfile.updateMany(saved),
    await tx.orgUnit.updateMany(saved),
    await tx.orgRole.updateMany(saved),
    await tx.routingRule.updateMany(saved),
    await tx.goal.updateMany(saved),
    await tx.companyRule.updateMany(saved),
    await tx.floorArea.updateMany(saved),
    await tx.orgRoleHolder.updateMany({ where: { companyId, userId: null, name: was }, data: { name: label } }),
  ];
  identityRefs += changed.reduce((n, c) => n + c.count, 0);

  const turns = await tx.assistTurn.deleteMany({ where: { companyId, userId } });
  const drafts = await tx.ideaDraft.deleteMany({ where: { companyId, userId, status: { not: "published" } } }); // their turns go with them
  const connections = await tx.connection.deleteMany({ where: { companyId, userId } });
  const prefs = await tx.notifyPreference.deleteMany({ where: { companyId, userId } });
  const teams = await tx.teamsConversation.deleteMany({ where: { companyId, userId } });
  const notices = await tx.outboxMessage.deleteMany({ where: { companyId, OR: [{ recipientUserId: userId }, { address: user.email }] } });
  const exports = await tx.dataExport.updateMany({
    where: { companyId, subjectUserId: userId },
    data: { file: null, sizeBytes: null, status: "expired" },
  });

  return {
    label, number,
    counts: { identityRefs, deleted: turns.count + drafts.count + connections.count + prefs.count + teams.count + notices.count, exportsExpired: exports.count },
  };
}

/** user id -> pseudonym row, for the given people of one company (GDP-M1). */
export async function pseudonymOf(companyId: string, userIds: string[]): Promise<Map<string, { number: number; label: string; at: Date }>> {
  if (userIds.length === 0) return new Map();
  const rows = await getDb().pseudonym.findMany({ where: { companyId, userId: { in: userIds } }, select: { userId: true, number: true, label: true, at: true } });
  return new Map(rows.map((r) => [r.userId, { number: r.number, label: r.label, at: r.at }]));
}

/** user id -> label for every former member of the company: what event rendering resolves actorUserId through. */
export function pseudonymLabelsFor(companyId: string): Promise<Record<string, string>> {
  return memo("labels", companyId, async () => {
    const rows = await getDb().pseudonym.findMany({ where: { companyId }, select: { userId: true, label: true } });
    return Object.fromEntries(rows.map((r) => [r.userId, r.label]));
  });
}

/** How many active people each person's unit has, for the department on an anonymous raise (features/cases/stamp.ts). */
export function loadUnitPeople(companyId: string): Promise<UnitPeople> {
  return memo("unit-people", companyId, async () => {
    const db = getDb();
    const [units, roles, holders, members] = await Promise.all([
      db.orgUnit.findMany({ where: { companyId }, select: { id: true, parentId: true } }),
      db.orgRole.findMany({ where: { companyId }, select: { id: true, orgUnitId: true } }),
      db.orgRoleHolder.findMany({ where: { companyId, userId: { not: null } }, orderBy: [{ sort: "asc" }, { id: "asc" }], select: { roleId: true, userId: true } }),
      loadMembers(companyId),
    ]);
    const seated = holders.flatMap((h) => (h.userId ? [{ roleId: h.roleId, userId: h.userId }] : []));
    const active = new Set(
      (await db.user.findMany({ where: { companyId, active: true, id: { in: seated.map((h) => h.userId) } }, select: { id: true } })).map((u) => u.id),
    );
    return unitPeople({ units, roles, seats: seated.filter((h) => active.has(h.userId)), members });
  });
}

/**
 * Event rows as they may leave the server: the stored rows keep what they were written with (D15). A raise
 * under a handle loses its department where the raiser's unit is too small today, and the people who have
 * left carry their pseudonym.
 */
export async function relabelRows<T extends { type: string; actor: string; actorUserId?: string | null; payload: unknown }>(companyId: string, rows: readonly T[]): Promise<readonly T[]> {
  const shown = rows.some(namesDeptUnderHandle) ? hideSmallDepts(rows, await loadUnitPeople(companyId)) : rows;
  const labels = await pseudonymLabelsFor(companyId);
  if (Object.keys(labels).length === 0) return shown;
  return relabelEvents(shown, labels, await loadSeats(companyId));
}
