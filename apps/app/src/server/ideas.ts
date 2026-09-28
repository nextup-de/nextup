// What the idea benchmarks compare with, loaded on the server for one company: its routing map,
// its goals and every case already raised. Used by the turn route and by publishing, so the
// number the server gates on is computed from the same facts the page was shown.
import { emptyLog } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { seedFor } from "@/features/demo";
import { GOALS } from "@/features/evaluate";
import type { BenchmarkContext } from "@/features/ideas/benchmarks";
import { ideaContext } from "@/features/ideas/drafts";
import { hasDatabase } from "@/lib/db/client";
import { loadLogForSlug } from "@/lib/db/events";

export async function serverIdeaContext(slug: string): Promise<BenchmarkContext> {
  const seed = await seedFor(slug);
  const log = (hasDatabase() ? await loadLogForSlug(slug) : null) ?? emptyLog();
  return ideaContext(seed.routes, GOALS, reduce(seed, log).cases);
}
