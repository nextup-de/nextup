// An idea draft as the studio shows it, and the one function that scores it - shared by the
// server (lib/db/ideas.ts, the turn route, publishing) and the browser-only demo store
// (lib/idea-drafts.ts), so both sides always agree on the number. Pure.
import type { Turn } from "@/features/assist/draft";
import { benchmark, type Benchmark, type BenchmarkContext, type BenchmarkPart } from "./benchmarks";
import { ideaFromTurns } from "./coach";

export type DraftStatus = "draft" | "published" | "discarded";
export type DraftTurn = Turn & { id: string; overall: number | null; at: string };
export type DraftSummary = { id: string; title: string; status: DraftStatus; overall: number; updatedAt: string; caseId: string | null };
export type DraftView = DraftSummary & { scores: BenchmarkPart[]; affected: string[]; attachments: number; turns: DraftTurn[] };

export const MAX_TURN = 2000; // characters in one message
export const MAX_TURNS = 40; // messages in one draft (both sides)

export function scoreDraft(d: { turns: readonly Turn[]; affected: readonly string[]; attachments: number }, ctx: BenchmarkContext): Benchmark {
  return benchmark({ text: ideaFromTurns(d.turns).text, affected: d.affected, attachments: d.attachments }, ctx);
}

export const summaryOf = (d: DraftView): DraftSummary =>
  ({ id: d.id, title: d.title, status: d.status, overall: d.overall, updatedAt: d.updatedAt, caseId: d.caseId });

// Team-level spend authority in euros - the figure behind features/evaluate SPEND_RULE.
export const SPEND_LIMIT_EUR = 5000;

// What the benchmarks compare an idea with: the routing map, the goals, and what is already raised.
export function ideaContext(
  routes: BenchmarkContext["routes"],
  goals: BenchmarkContext["goals"],
  cases: BenchmarkContext["cases"],
): BenchmarkContext {
  return { routes, goals, cases, spendLimitEur: SPEND_LIMIT_EUR };
}
