// What the idea benchmarks compare with, loaded on the server for one company: its routing map,
// its goals and the cases already raised that the person asking may open. Used by the turn route and
// by publishing, so the number the server gates on is computed from the same facts the page was shown.
import { emptyLog } from "@/features/cases/events";
import { reduce, type ReducedCase } from "@/features/cases/reducer";
import { seedFor } from "@/features/demo";
import type { BenchmarkContext } from "@/features/ideas/benchmarks";
import { ideaContext } from "@/features/ideas/drafts";
import type { ReducedProject } from "@/features/projects/types";
import { hasDatabase } from "@/lib/db/client";
import { loadLogForSlug } from "@/lib/db/events";
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
