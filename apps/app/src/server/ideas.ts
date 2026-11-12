// What the idea benchmarks compare with, loaded on the server for one company: its routing map,
// its goals and the cases already raised that the person asking may open. Used by the turn route and
// by publishing, so the number the server gates on is computed from the same facts the page was shown.
import { emptyLog } from "@/features/cases/events";
import { reduce, type ReducedCase } from "@/features/cases/reducer";
import { seedFor } from "@/features/demo";
import type { BenchmarkContext, BenchmarkPart } from "@/features/ideas/benchmarks";
import { ideaContext, scoreDraft } from "@/features/ideas/drafts";
import { ideaFromTurns } from "@/features/ideas/coach";
import { latestReading } from "@/features/ideas/reading";
import type { ReducedProject } from "@/features/projects/types";
import { hasDatabase } from "@/lib/db/client";
import { loadLogForSlug } from "@/lib/db/events";
import { getDraft } from "@/lib/db/ideas";
import { caseFilterFor, type LogViewer } from "@/lib/db/viewer-log";

// Who an idea's comparison is for. A title they could not open must not come back to them, not in a
// hint and not through a model. Null: nobody signed in, so only the local demo's own seed counts.
export type Audience = (LogViewer & { companyId: string }) | null;

export async function casesFor(state: { cases: ReducedCase[]; projects: ReducedProject[] }, audience: Audience): Promise<ReducedCase[]> {
  if (!audience) return hasDatabase() ? [] : state.cases;
  return state.cases.filter(await caseFilterFor(audience.companyId, audience, state.projects));
}

export async function serverIdeaContext(slug: string, audience: Audience): Promise<BenchmarkContext> {
  const seed = await seedFor(slug);
  const log = (hasDatabase() ? await loadLogForSlug(slug) : null) ?? emptyLog();
  const state = reduce(seed, log);
  return ideaContext(seed.routes, seed.goals, await casesFor(state, audience), seed.spend);
}

/** What a published draft becomes: the case's title and body, and the snapshot the draft keeps. */
export type DraftToPublish = { title: string; body: string; overall: number; scores: BenchmarkPart[] };

/**
 * The viewer's draft as it would be published, or null when it is not theirs or no longer open. The score is
 * recomputed from the stored turns; it does not gate publishing - the author decides when it is ready.
 */
export async function draftToPublish(slug: string, viewer: NonNullable<Audience>, draftId: string): Promise<DraftToPublish | null> {
  const d = await getDraft(viewer.companyId, viewer.userId, draftId);
  if (!d || d.status !== "draft") return null;
  const score = scoreDraft(d, await serverIdeaContext(slug, viewer));
  const idea = ideaFromTurns(d.turns);
  // The number the author was shown.
  return { title: d.title || idea.title, body: idea.body, overall: latestReading(d.turns)?.overall ?? score.overall, scores: score.parts };
}
