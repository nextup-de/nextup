"use server";
// The idea studio's drafts (docs/IDEAS.md). Every action works on the viewer's own drafts only;
// without a database and a session there is nothing server-side, and the page keeps its drafts
// in the browser instead (lib/idea-drafts.ts) - these return { ok: false } in that case.
//
// Publishing is gated here, not in the browser: the score is recomputed from the stored turns
// and the company's threshold, and only then may the page append case.raised.
import { z } from "zod";
import { getViewerFor } from "@/features/auth/session";
import { canPublish } from "@/features/ideas/benchmarks";
import { scoreDraft, type DraftSummary, type DraftView } from "@/features/ideas/drafts";
import { ideaFromTurns } from "@/features/ideas/coach";
import { hasDatabase } from "@/lib/db/client";
import { createDraft, discardDraft, getDraft, listDrafts, loadPublishThreshold, markPublished, purgeDiscardedDrafts, saveDraftMeta } from "@/lib/db/ideas";
import { loadAssistSettings } from "@/lib/db/assist";
import { serverIdeaContext } from "@/server/ideas";
import { suggestReplies, type Reply } from "@/features/ideas/replies";

const Slug = z.string().min(1).max(64);
const Id = z.string().min(1).max(64);

async function me(slug: string) {
  if (!hasDatabase()) return null;
  return getViewerFor(slug);
}

export async function listIdeaDraftsAction(input: { slug: string }): Promise<{ ok: boolean; drafts: DraftSummary[]; threshold: number }> {
  const p = z.object({ slug: Slug }).safeParse(input);
  const v = p.success ? await me(p.data.slug) : null;
  if (!v) return { ok: false, drafts: [], threshold: 0 };
  const [drafts, threshold, settings] = await Promise.all([listDrafts(v.companyId, v.userId), loadPublishThreshold(v.companyId), loadAssistSettings(v.companyId)]);
  // Retention on use, as the assistant does it: no scheduler to forget.
  purgeDiscardedDrafts(v.companyId, settings.retentionDays).catch((e) => console.error("[ideas] purge", e instanceof Error ? e.message : e));
  return { ok: true, drafts, threshold };
}

export async function getIdeaDraftAction(input: { slug: string; id: string }): Promise<{ ok: boolean; draft: DraftView | null }> {
  const p = z.object({ slug: Slug, id: Id }).safeParse(input);
  const v = p.success ? await me(p.data.slug) : null;
  if (!p.success || !v) return { ok: false, draft: null };
  const draft = await getDraft(v.companyId, v.userId, p.data.id);
  return { ok: draft !== null, draft };
}

export async function createIdeaDraftAction(input: { slug: string }): Promise<{ ok: boolean; id: string | null }> {
  const p = z.object({ slug: Slug }).safeParse(input);
  const v = p.success ? await me(p.data.slug) : null;
  if (!v) return { ok: false, id: null };
  return { ok: true, id: await createDraft(v.companyId, v.userId) };
}

const Meta = z.object({
  slug: Slug, id: Id,
  title: z.string().trim().min(1).max(140).optional(),
  affected: z.array(z.string().min(1).max(120)).max(50).optional(),
  attachments: z.number().int().min(0).max(4).optional(),
});

export async function saveIdeaDraftAction(input: z.input<typeof Meta>): Promise<{ ok: boolean }> {
  const p = Meta.safeParse(input);
  const v = p.success ? await me(p.data.slug) : null;
  if (!p.success || !v) return { ok: false };
  const { title, affected, attachments } = p.data;
  return { ok: await saveDraftMeta(v.companyId, v.userId, p.data.id, { title, affected, attachments }) };
}

export async function discardIdeaDraftAction(input: { slug: string; id: string }): Promise<{ ok: boolean }> {
  const p = z.object({ slug: Slug, id: Id }).safeParse(input);
  const v = p.success ? await me(p.data.slug) : null;
  if (!p.success || !v) return { ok: false };
  return { ok: await discardDraft(v.companyId, v.userId, p.data.id) };
}

// The suggested answers for a draft that is reopened (a new message brings its own with the score).
// Server mode reads the viewer's stored draft; the local demo sends its turns along.
const RepliesIn = z.object({
  slug: Slug, id: Id.optional(),
  turns: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) })).max(40).default([]),
  affected: z.array(z.string().min(1).max(120)).max(50).default([]),
  attachments: z.number().int().min(0).max(4).default(0),
});
export async function ideaRepliesAction(input: z.input<typeof RepliesIn>): Promise<{ ok: boolean; replies: Reply[] }> {
  const p = RepliesIn.safeParse(input);
  if (!p.success) return { ok: false, replies: [] };
  let d: { turns: { role: "user" | "assistant"; text: string }[]; affected: string[]; attachments: number } = p.data;
  if (hasDatabase()) {
    const v = await me(p.data.slug);
    const stored = v && p.data.id ? await getDraft(v.companyId, v.userId, p.data.id) : null;
    if (!stored || stored.status !== "draft") return { ok: false, replies: [] };
    d = stored;
  }
  if (!d.turns.some((t) => t.role === "user")) return { ok: true, replies: [] };
  const ctx = await serverIdeaContext(p.data.slug);
  const now = scoreDraft(d, ctx);
  return { ok: true, replies: suggestReplies({ text: ideaFromTurns(d.turns).text, affected: d.affected, attachments: d.attachments }, now, ctx) };
}

export type PublishResult =
  | { ok: true; title: string; body: string; overall: number }
  | { ok: false; reason: string; overall?: number; threshold?: number };

// The page mints the case id (so the case.raised it appends next carries it) and asks first.
export async function publishIdeaDraftAction(input: { slug: string; id: string; caseId: string }): Promise<PublishResult> {
  const p = z.object({ slug: Slug, id: Id, caseId: z.string().regex(/^c_[a-z0-9]{4,40}$/) }).safeParse(input);
  const v = p.success ? await me(p.data.slug) : null;
  if (!p.success || !v) return { ok: false, reason: "Sign in first." };
  const d = await getDraft(v.companyId, v.userId, p.data.id);
  if (!d || d.status !== "draft") return { ok: false, reason: "This draft is no longer open." };
  const [ctx, threshold] = await Promise.all([serverIdeaContext(p.data.slug), loadPublishThreshold(v.companyId)]);
  const score = scoreDraft(d, ctx);
  if (!canPublish(score.overall, threshold)) return { ok: false, reason: "Not ready yet.", overall: score.overall, threshold };
  const idea = ideaFromTurns(d.turns);
  const title = d.title || idea.title;
  const done = await markPublished(v.companyId, v.userId, d.id, p.data.caseId, { title, overall: score.overall, scores: score.parts });
  if (!done) return { ok: false, reason: "This draft is no longer open." };
  return { ok: true, title, body: idea.body, overall: score.overall };
}
