// The idea studio's tables (docs/IDEAS.md). Every query names the company AND the author: a
// draft is private to the person writing it, so there is no "list everyone's drafts" here -
// ideaStats() is counts only.
import type { BenchmarkPart } from "@/features/ideas/benchmarks";
import { DEFAULT_PUBLISH_THRESHOLD } from "@/features/ideas/benchmarks";
import type { DraftStatus, DraftSummary, DraftView } from "@/features/ideas/drafts";
import { getDb } from "./client";

const status = (s: string): DraftStatus => (s === "published" || s === "discarded" ? s : "draft");
const summary = (d: { id: string; title: string; status: string; overall: number; updatedAt: Date; caseId: string | null }): DraftSummary =>
  ({ id: d.id, title: d.title, status: status(d.status), overall: d.overall, updatedAt: d.updatedAt.toISOString(), caseId: d.caseId });

export async function loadPublishThreshold(companyId: string): Promise<number> {
  const cfg = await getDb().companyConfig.findUnique({ where: { companyId }, select: { publishThreshold: true } });
  return cfg?.publishThreshold ?? DEFAULT_PUBLISH_THRESHOLD;
}

export async function listDrafts(companyId: string, userId: string): Promise<DraftSummary[]> {
  const rows = await getDb().ideaDraft.findMany({
    where: { companyId, userId, status: { not: "discarded" } },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, title: true, status: true, overall: true, updatedAt: true, caseId: true },
  });
  return rows.map(summary);
}

export async function getDraft(companyId: string, userId: string, id: string): Promise<DraftView | null> {
  const db = getDb();
  const d = await db.ideaDraft.findFirst({ where: { companyId, userId, id, status: { not: "discarded" } } });
  if (!d) return null;
  const turns = await db.ideaTurn.findMany({ where: { companyId, draftId: id }, orderBy: { createdAt: "asc" } });
  return {
    ...summary(d),
    scores: (d.scores as unknown as BenchmarkPart[]) ?? [],
    affected: d.affected,
    attachments: d.attachments,
    turns: turns.map((t) => ({ id: t.id, role: t.role === "assistant" ? "assistant" : "user", text: t.text, overall: t.overall, at: t.createdAt.toISOString() })),
  };
}

export async function createDraft(companyId: string, userId: string): Promise<string> {
  const d = await getDb().ideaDraft.create({ data: { companyId, userId }, select: { id: true } });
  return d.id;
}

export type TurnRow = { role: "user" | "assistant"; text: string; overall?: number; model?: string; promptVersion?: string };
export type Snapshot = { title: string; overall: number; scores: BenchmarkPart[] };

/** Appends turns and the score they led to. False when the draft is not this author's open draft. */
export async function addTurns(companyId: string, userId: string, draftId: string, turns: readonly TurnRow[], snap: Snapshot): Promise<boolean> {
  const db = getDb();
  const owned = await db.ideaDraft.count({ where: { companyId, userId, id: draftId, status: "draft" } });
  if (!owned) return false;
  await db.$transaction([
    ...turns.map((t) => db.ideaTurn.create({
      data: { companyId, draftId, role: t.role, text: t.text, overall: t.overall ?? null, model: t.model ?? "", promptVersion: t.promptVersion ?? "" },
    })),
    db.ideaDraft.updateMany({ where: { companyId, userId, id: draftId }, data: { title: snap.title, overall: snap.overall, scores: snap.scores } }),
  ]);
  return true;
}

export async function saveDraftMeta(companyId: string, userId: string, id: string, meta: { title?: string; affected?: string[]; attachments?: number }): Promise<boolean> {
  const r = await getDb().ideaDraft.updateMany({ where: { companyId, userId, id, status: "draft" }, data: meta });
  return r.count > 0;
}

export async function discardDraft(companyId: string, userId: string, id: string): Promise<boolean> {
  const r = await getDb().ideaDraft.updateMany({ where: { companyId, userId, id, status: "draft" }, data: { status: "discarded" } });
  return r.count > 0;
}

/** Only an open draft can be published, and only once. */
export async function markPublished(companyId: string, userId: string, id: string, caseId: string, snap: Snapshot): Promise<boolean> {
  const r = await getDb().ideaDraft.updateMany({
    where: { companyId, userId, id, status: "draft" },
    data: { status: "published", caseId, publishedAt: new Date(), title: snap.title, overall: snap.overall, scores: snap.scores },
  });
  return r.count > 0;
}

/** Discarded drafts go for good after the company's retention period. */
export async function purgeDiscardedDrafts(companyId: string, retentionDays: number, now = new Date()): Promise<number> {
  const before = new Date(now.getTime() - Math.max(1, retentionDays) * 86_400_000);
  const r = await getDb().ideaDraft.deleteMany({ where: { companyId, status: "discarded", updatedAt: { lt: before } } });
  return r.count;
}

/** Counts only - never whose draft. For /admin. */
export async function ideaStats(companyId: string): Promise<{ drafts: number; published: number }> {
  const db = getDb();
  const [drafts, published] = await Promise.all([
    db.ideaDraft.count({ where: { companyId, status: "draft" } }),
    db.ideaDraft.count({ where: { companyId, status: "published" } }),
  ]);
  return { drafts, published };
}
