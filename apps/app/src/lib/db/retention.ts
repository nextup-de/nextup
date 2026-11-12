// The retention rules and the nightly run (GDP D16). Every delete names the company.
import type { Prisma } from "@prisma/client";
import { AUDIT_KEEP_DAYS, AUDIT_KEPT_ACTIONS, OUTBOX_KEEP_DAYS, checkRule, cutoff, effectiveRules, type RetentionKind } from "@/features/privacy/retention";
import { SYSTEM_ACTOR, recordAudit } from "@/server/audit/record";
import { getDb } from "./client";

export type RetentionTotals = { assistTurns: number; drafts: number; cases: number; events: number; auditEvents: number; exports: number; outbox: number; teamsLinks: number };

export type RetentionState = {
  rules: Record<RetentionKind, number | null>;
  lastRun: { lastRunAt: Date | null; lastOkAt: Date | null; lastError: string | null; removed: Partial<RetentionTotals> } | null;
};

export async function loadRetention(companyId: string): Promise<RetentionState> {
  const db = getDb();
  const [rows, cfg, run] = await Promise.all([
    db.retentionRule.findMany({ where: { companyId }, select: { kind: true, keepDays: true } }),
    db.companyConfig.findUnique({ where: { companyId }, select: { retentionDays: true } }),
    db.retentionRun.findUnique({ where: { companyId }, select: { lastRunAt: true, lastOkAt: true, lastError: true, removed: true } }),
  ]);
  return {
    rules: effectiveRules(rows, cfg),
    lastRun: run ? { ...run, removed: (run.removed ?? {}) as Partial<RetentionTotals> } : null,
  };
}

/** Stores a rule. Throws on a value `checkRule` refuses. Returns the effective days before and after, for the audit row. */
export async function saveRetentionRule(
  companyId: string,
  kind: RetentionKind,
  keepDays: number | null,
  userId: string | null,
): Promise<{ before: number | null; after: number | null }> {
  const check = checkRule(kind, keepDays);
  if (!check.ok) throw new Error(`retention: ${check.key}`);
  const before = (await loadRetention(companyId)).rules[kind];
  await getDb().retentionRule.upsert({
    where: { companyId_kind: { companyId, kind } },
    create: { companyId, kind, keepDays, updatedById: userId },
    update: { keepDays, updatedById: userId },
  });
  return { before, after: keepDays };
}

/** Closed cases (CaseView open = false) whose newest event is older than the cutoff. */
async function closedCasesBefore(companyId: string, before: Date): Promise<string[]> {
  const rows = await getDb().$queryRaw<{ caseId: string }[]>`
    SELECT v."caseId" AS "caseId"
    FROM "CaseView" v
    WHERE v."companyId" = ${companyId} AND v."open" = false
      AND NOT EXISTS (SELECT 1 FROM "CaseEvent" e WHERE e."companyId" = ${companyId} AND e."targetId" = v."caseId" AND e."ts" >= ${before})`;
  return rows.map((r) => r.caseId);
}

/** The company total a rule of `keepDays` would delete now. */
export async function countRemovable(companyId: string, kind: RetentionKind, keepDays: number | null, now = new Date()): Promise<number> {
  if (keepDays === null) return 0;
  const db = getDb();
  const before = cutoff(keepDays, now);
  if (kind === "assist_turns") return db.assistTurn.count({ where: { companyId, createdAt: { lt: before } } });
  if (kind === "idea_drafts") return db.ideaDraft.count({ where: { companyId, status: "draft", updatedAt: { lt: before } } });
  return (await closedCasesBefore(companyId, before)).length;
}

const CHUNK = 1000;

/** One company's run. Throws on failure (the caller records it). Returns the totals. */
export async function runRetention(companyId: string, now = new Date()): Promise<RetentionTotals> {
  const db = getDb();
  const { rules } = await loadRetention(companyId);
  const t: RetentionTotals = { assistTurns: 0, drafts: 0, cases: 0, events: 0, auditEvents: 0, exports: 0, outbox: 0, teamsLinks: 0 };

  if (rules.assist_turns !== null) {
    t.assistTurns = (await db.assistTurn.deleteMany({ where: { companyId, createdAt: { lt: cutoff(rules.assist_turns, now) } } })).count;
  }
  if (rules.idea_drafts !== null) {
    t.drafts = (await db.ideaDraft.deleteMany({ where: { companyId, status: "draft", updatedAt: { lt: cutoff(rules.idea_drafts, now) } } })).count;
  }
  if (rules.closed_cases !== null) {
    const ids = await closedCasesBefore(companyId, cutoff(rules.closed_cases, now));
    for (let i = 0; i < ids.length; i += CHUNK) {
      const part = ids.slice(i, i + CHUNK);
      const [ev, views] = await db.$transaction([
        db.caseEvent.deleteMany({ where: { companyId, targetId: { in: part } } }),
        db.caseView.deleteMany({ where: { companyId, open: false, caseId: { in: part } } }),
      ]);
      t.events += ev.count;
      t.cases += views.count;
    }
  }
  t.auditEvents = (await db.auditEvent.deleteMany({ where: { companyId, at: { lt: cutoff(AUDIT_KEEP_DAYS, now) }, action: { notIn: [...AUDIT_KEPT_ACTIONS] } } })).count;
  t.exports = (
    await db.dataExport.updateMany({
      where: { companyId, expiresAt: { lt: now }, OR: [{ file: { not: null } }, { status: "ready" }] },
      data: { file: null, status: "expired" },
    })
  ).count;

  t.outbox = (await db.outboxMessage.deleteMany({ where: { companyId, status: { not: "pending" }, createdAt: { lt: cutoff(OUTBOX_KEEP_DAYS, now) } } })).count;
  // Someone who left gets no Teams message: nothing needs their conversation. It comes back when they write to the bot.
  const left = await db.user.findMany({ where: { companyId, active: false }, select: { id: true } });
  t.teamsLinks = (await db.teamsConversation.deleteMany({ where: { companyId, userId: { in: left.map((u) => u.id) } } })).count;

  const removed = t as unknown as Prisma.InputJsonValue;
  const any = Object.values(t).some((n) => n > 0);
  await db.$transaction(async (tx) => {
    await tx.retentionRun.upsert({ where: { companyId }, create: { companyId, removed }, update: { removed } });
    if (any) await recordAudit(companyId, { actor: SYSTEM_ACTOR, action: "audit.privacy.retention_run", changes: { ...t }, source: "scheduler" }, tx);
  });
  return t;
}
