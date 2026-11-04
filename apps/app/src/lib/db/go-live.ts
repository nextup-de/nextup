// Go-live: reading the rows the checks need, moving the stage, and the stage history (PIL D8, D9).
// The mail check and the backup file are handed in, so a test needs no relay and no volume; the real
// ones are passed by server/actions/settings/go-live.ts, server-side only.
import { signsOutOnMove, type Stage } from "@/features/admin/stages";
import { blockers, goLiveChecks, type GoLiveCheck, type GoLiveInput } from "@/features/pilot/go-live";
import { settingsActor, recordAudit } from "@/server/audit/record";
import { listAudit } from "./audit";
import { loadAiSettings } from "./ai";
import { loadBaseline } from "./baseline";
import { getDb } from "./client";
import { loadDirectoryStatus } from "./directory-run";
import { activeGrant } from "./support-grants";

export const PILOT_REPORT_TEMPLATE = "pilot.report";

export type GoLiveDeps = {
  mailStatus: () => Promise<{ configured: boolean; reachable: boolean | null }>;
  readBackupStatus: () => Promise<{ at: Date; offbox: boolean } | null>;
};

export async function loadGoLiveInput(companyId: string, now: Date, deps: GoLiveDeps): Promise<GoLiveInput> {
  const db = getDb();
  const company = await db.company.findUniqueOrThrow({ where: { id: companyId }, select: { stage: true, entraTenantId: true } });
  const [units, roles, rules, seats, calendar, users, config, ai, grant, directory, recipients, baseline, mail, backup] = await Promise.all([
    db.orgUnit.findMany({ where: { companyId }, orderBy: [{ sort: "asc" }, { name: "asc" }], select: { name: true } }),
    db.orgRole.findMany({ where: { companyId }, orderBy: [{ sort: "asc" }, { title: "asc" }], select: { title: true, _count: { select: { holders: true } } } }),
    db.routingRule.findMany({ where: { companyId }, orderBy: { sort: "asc" }, select: { key: true, ownerRoleId: true } }),
    db.orgRoleHolder.findMany({ where: { companyId, userId: { not: null } }, select: { roleId: true, userId: true } }),
    db.companyCalendar.findUnique({ where: { companyId }, select: { companyId: true } }),
    db.user.findMany({ where: { companyId, active: true }, select: { id: true, role: true, loginCodeAt: true, entraOid: true, totpEnabledAt: true } }),
    db.companyConfig.findUnique({ where: { companyId }, select: { notifications: true, dpaSignedAt: true } }),
    loadAiSettings(companyId, company.stage),
    activeGrant(companyId, now),
    loadDirectoryStatus(companyId),
    db.notifyPreference.count({ where: { companyId, template: PILOT_REPORT_TEMPLATE, on: true } }),
    loadBaseline(companyId),
    deps.mailStatus().catch(() => ({ configured: true, reachable: false as boolean | null })),
    deps.readBackupStatus().catch(() => null),
  ]);
  // A deactivated person does not own a route: only holders whose user is active count.
  const activeIds = new Set(users.map((u) => u.id));
  const withUser = new Set(seats.filter((s) => s.userId !== null && activeIds.has(s.userId)).map((s) => s.roleId));
  const managers = users.filter((u) => u.role === "manager" && u.loginCodeAt);
  return {
    now,
    units,
    roles: roles.map((r) => ({ title: r.title, holders: r._count.holders })),
    routes: rules.map((r) => ({ key: r.key, ownerHasUser: withUser.has(r.ownerRoleId) })),
    hasCalendar: calendar !== null,
    people: { active: users.length, canSignIn: users.filter((u) => u.loginCodeAt || u.entraOid).length },
    microsoftOn: company.entraTenantId !== null,
    managers: { withCode: managers.length, withTotp: managers.filter((u) => u.totpEnabledAt).length },
    mail: !mail.configured ? "notConfigured" : mail.reachable === true ? "ok" : "unreachable",
    ai: { choice: ai.settings.choice, dpaSignedAt: config?.dpaSignedAt ?? null },
    backup,
    supportOpenUntil: grant?.expiresAt ?? null,
    notifications: config?.notifications ?? false,
    directory: { on: directory.on, lastRunAt: directory.lastRunAt, lastOkAt: directory.lastOkAt, lastError: directory.lastError },
    recipients,
    baseline: baseline !== null,
  };
}

export async function runGoLiveChecks(companyId: string, now: Date, deps: GoLiveDeps): Promise<GoLiveCheck[]> {
  return goLiveChecks(await loadGoLiveInput(companyId, now, deps));
}

export type MoveResult =
  | { ok: true; from: Stage; to: Stage }
  | { ok: false; reason: "refused" | "blocked" | "changed"; checks?: GoLiveCheck[] };

/**
 * D8: sandbox -> pilot only when no needed check is open after a fresh run; pilot -> sandbox with no checks.
 * Everything else is refused. One transaction: the stage, the epoch (signsOutOnMove), the audit row and, when
 * the company never had a pilot.report row, an `on` row for each active manager.
 */
export async function moveStage(companyId: string, to: Stage, byUserId: string, now: Date, deps: GoLiveDeps): Promise<MoveResult> {
  const db = getDb();
  const company = await db.company.findUnique({ where: { id: companyId }, select: { stage: true } });
  if (!company) return { ok: false, reason: "refused" };
  const from = company.stage;
  const allowed = (from === "sandbox" && to === "pilot") || (from === "pilot" && to === "sandbox");
  if (!allowed) return { ok: false, reason: "refused" };
  if (to === "pilot") {
    const checks = await runGoLiveChecks(companyId, now, deps);
    if (blockers(checks).length > 0) return { ok: false, reason: "blocked", checks };
  }
  return db.$transaction(async (tx) => {
    const { count } = await tx.company.updateMany({
      where: { id: companyId, stage: from },
      data: { stage: to, ...(signsOutOnMove(from as Stage, to) ? { sessionEpoch: { increment: 1 } } : {}) },
    });
    if (count !== 1) return { ok: false, reason: "changed" } as const; // moved by someone else meanwhile
    if (to === "pilot") {
      const any = await tx.notifyPreference.count({ where: { companyId, template: PILOT_REPORT_TEMPLATE } });
      if (any === 0) {
        const managers = await tx.user.findMany({ where: { companyId, role: "manager", active: true }, select: { id: true } });
        if (managers.length > 0) {
          await tx.notifyPreference.createMany({ data: managers.map((m) => ({ companyId, userId: m.id, template: PILOT_REPORT_TEMPLATE, on: true })), skipDuplicates: true });
        }
      }
    }
    await recordAudit(companyId, { actor: settingsActor({ userId: byUserId }), action: "audit.company.stage", target: { kind: "company", id: companyId }, changes: { stage: { before: from, after: to } }, source: "settings" }, tx);
    return { ok: true, from: from as Stage, to } as const;
  });
}

export type StageMove = { at: Date; from: string | null; to: string; actorKind: string; actorUserId: string | null };

/** The stage history from the audit rows (creation and moves), newest first. User ids only. */
export async function stageMoves(companyId: string): Promise<StageMove[]> {
  const rows = await listAudit(companyId, { take: 200, actions: ["audit.company.stage", "audit.company.created"] });
  return rows.flatMap((r) => {
    const stage = (r.changes as { stage?: { before?: unknown; after?: unknown } } | null)?.stage;
    if (!stage || typeof stage.after !== "string") return [];
    return [{ at: r.at, from: typeof stage.before === "string" ? stage.before : null, to: stage.after, actorKind: r.actorKind, actorUserId: r.actorUserId }];
  });
}
