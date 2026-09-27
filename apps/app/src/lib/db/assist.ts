// The raise-page assistant's tables: documents to search, the audit of every turn, the company's
// switches. docs/ASSISTANT.md. Every query names the company; the one raw query (full-text search,
// which Prisma cannot express) names it in SQL and re-applies the classification ceiling there.
import { LEVELS, ceilingOf, rank, type Level } from "@/features/assist/classify";
import type { DocHit, Source } from "@/features/assist/tools";
import type { Hits } from "@/features/assist/redact";
import { getDb } from "./client";

export type AssistSettings = {
  enabled: boolean;
  ceiling: Level;
  retentionDays: number;
  dpaSignedAt: Date | null;
  patterns: string[];
  rules: string;
};

export async function loadAssistSettings(companyId: string): Promise<AssistSettings> {
  const db = getDb();
  const [cfg, profile] = await Promise.all([
    db.companyConfig.findUnique({
      where: { companyId },
      select: { assistant: true, classificationCeiling: true, retentionDays: true, dpaSignedAt: true, redactPatterns: true },
    }),
    db.companyProfile.findUnique({ where: { companyId }, select: { complianceRules: true } }),
  ]);
  return {
    enabled: cfg?.assistant ?? false,
    ceiling: ceilingOf(cfg?.classificationCeiling),
    retentionDays: cfg?.retentionDays ?? 90,
    dpaSignedAt: cfg?.dpaSignedAt ?? null,
    patterns: cfg?.redactPatterns ?? [],
    rules: profile?.complianceRules ?? "",
  };
}

/** Search terms as an OR tsquery: letters and digits only, so nothing reaches to_tsquery unescaped. */
export function tsQuery(text: string): string {
  const words = [...new Set((text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []))].slice(0, 12);
  return words.map((w) => w + ":*").join(" | ");
}

type DocRow = { id: string; title: string; snippet: string; classification: string; source: string };

export async function searchDocuments(companyId: string, ceiling: Level, text: string, limit = 4): Promise<DocHit[]> {
  const q = tsQuery(text);
  if (!q) return [];
  const allowed = LEVELS.filter((l) => rank(l) <= rank(ceilingOf(ceiling)));
  return getDb().$queryRaw<DocRow[]>`
    SELECT "id", "title", "classification", "source",
           ts_headline('simple', "body", to_tsquery('simple', ${q}), 'MaxWords=40, MinWords=15, StartSel="", StopSel=""') AS "snippet"
    FROM "Document"
    WHERE "companyId" = ${companyId}
      AND "classification" = ANY(${allowed}::text[])
      AND "search" @@ to_tsquery('simple', ${q})
    ORDER BY ts_rank("search", to_tsquery('simple', ${q})) DESC, "updatedAt" DESC
    LIMIT ${Math.min(Math.max(limit, 1), 8)}`;
}

export type DocumentInput = { source: string; externalId: string; title: string; body: string; classification: string };

/** Insert or update by (company, source, externalId). Returns how many rows were written. */
export async function upsertDocuments(companyId: string, docs: readonly DocumentInput[]): Promise<number> {
  const db = getDb();
  await db.$transaction(docs.map((d) => db.document.upsert({
    where: { companyId_source_externalId: { companyId, source: d.source, externalId: d.externalId } },
    create: { companyId, ...d },
    update: { title: d.title, body: d.body, classification: d.classification },
  })));
  return docs.length;
}

/** Removes one document of this company. False when it was not there (or not this company's). */
export async function deleteDocument(companyId: string, id: string): Promise<boolean> {
  const r = await getDb().document.deleteMany({ where: { companyId, id } });
  return r.count > 0;
}

export async function listDocuments(companyId: string) {
  return getDb().document.findMany({
    where: { companyId },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: { id: true, source: true, externalId: true, title: true, classification: true, updatedAt: true },
  });
}

export type TurnInput = {
  userId: string | null;
  sessionId: string;
  role: "user" | "assistant";
  text: string;
  sources?: Source[];
  redactions?: Hits;
  blocked?: boolean;
  unsourced?: boolean;
  model?: string;
  promptVersion?: string;
  latencyMs?: number;
  tokensIn?: number;
  tokensOut?: number;
};

/** Stores the turns and returns the id of the last one (the answer the employee rates). */
export async function recordTurns(companyId: string, turns: readonly TurnInput[]): Promise<string | null> {
  const db = getDb();
  const rows = await db.$transaction(turns.map((t) => db.assistTurn.create({
    data: {
      companyId, userId: t.userId, sessionId: t.sessionId, role: t.role, text: t.text,
      sources: t.sources ?? [], redactions: t.redactions ?? {}, blocked: t.blocked ?? false, unsourced: t.unsourced ?? false,
      model: t.model ?? "", promptVersion: t.promptVersion ?? "", latencyMs: t.latencyMs ?? 0, tokensIn: t.tokensIn ?? 0, tokensOut: t.tokensOut ?? 0,
    },
    select: { id: true },
  })));
  return rows.at(-1)?.id ?? null;
}

/** "That solved it" / "Raise it anyway" on the viewer's own answer. */
export async function rateTurn(companyId: string, userId: string, turnId: string, helpful: boolean): Promise<boolean> {
  const r = await getDb().assistTurn.updateMany({ where: { companyId, userId, id: turnId, role: "assistant" }, data: { helpful } });
  return r.count > 0;
}

export async function linkRaise(companyId: string, userId: string, sessionId: string, caseId: string): Promise<void> {
  await getDb().assistTurn.updateMany({ where: { companyId, userId, sessionId }, data: { raisedCaseId: caseId, helpful: false } });
}

/** Deletes turns older than the company's retention. Returns how many went. */
export async function purgeAssistTurns(companyId: string, retentionDays: number, now = new Date()): Promise<number> {
  const before = new Date(now.getTime() - Math.max(1, retentionDays) * 86_400_000);
  const r = await getDb().assistTurn.deleteMany({ where: { companyId, createdAt: { lt: before } } });
  return r.count;
}

export type AssistStats = { answers: number; solved: number; raised: number; unsourced: number; blocked: number; byModel: Record<string, number> };

/** Counts only - never who asked what. The admin view of the assistant (BetrVG §87). */
export async function assistStats(companyId: string, since: Date): Promise<AssistStats> {
  const db = getDb();
  const where = { companyId, createdAt: { gte: since } };
  const [answers, solved, raised, unsourced, blocked, models] = await Promise.all([
    db.assistTurn.count({ where: { ...where, role: "assistant" } }),
    db.assistTurn.count({ where: { ...where, role: "assistant", helpful: true } }),
    db.assistTurn.count({ where: { ...where, role: "assistant", raisedCaseId: { not: null } } }),
    db.assistTurn.count({ where: { ...where, role: "assistant", unsourced: true } }),
    db.assistTurn.count({ where: { ...where, role: "user", blocked: true } }),
    db.assistTurn.groupBy({ by: ["model"], where: { ...where, role: "assistant" }, _count: { _all: true } }),
  ]);
  return { answers, solved, raised, unsourced, blocked, byModel: Object.fromEntries(models.map((m) => [m.model || "?", m._count._all])) };
}
