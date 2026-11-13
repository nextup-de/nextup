// An idea draft as the studio shows it, and the one function that scores it - shared by the
// server (lib/db/ideas.ts, the turn route, publishing) and the browser-only demo store
// (lib/idea-drafts.ts), so both sides always agree on the number. Pure.
import type { Turn } from "@/features/assist/draft";
import type { CaseProposal } from "@/features/cases/events/case";
import type { SpendRule } from "@/features/demo/types";
import type { Locale } from "@/i18n";
import { benchmark, type Benchmark, type BenchmarkContext, type BenchmarkPart } from "./benchmarks";
import { ideaFromTurns } from "./coach";
import type { Reading } from "./reading";

export type DraftStatus = "draft" | "published" | "discarded";
export type DraftTurn = Turn & { id: string; overall: number | null; at: string; reading?: Reading | null };
export type DraftSummary = { id: string; title: string; status: DraftStatus; overall: number; updatedAt: string; caseId: string | null };
export type DraftView = DraftSummary & { scores: BenchmarkPart[]; affected: string[]; attachments: number; turns: DraftTurn[] };

export const MAX_TURN = 2000; // characters in one message
export const MAX_TURNS = 40; // messages in one draft (both sides)

/**
 * No further turn fits in the draft: the turn route refuses one more pair of messages (app/api/[company]/ideas/turn). From here the
 * rail counts as done and the last look lists what is still open (plan REM, R1), instead of the author waiting for a rail that can
 * no longer be answered.
 */
export const turnLimitReached = (messages: number): boolean => messages + 2 > MAX_TURNS;

/**
 * A short fingerprint of the text a routing proposal was made for (plan REM, R1): the title and the body the way the keyword router reads them,
 * whitespace collapsed. The raise page sends it with the proposal it showed; the server reuses that proposal only when the text it is
 * raising has the same fingerprint. Not a secret and not a signature: it tells an unchanged text from an edited one. Pure, the same in the browser and on the server.
 */
export function routingTextHash(title: string, body: string): string {
  const text = [title, body].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  // cyrb53: 53 bits, no dependency, the same result everywhere.
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/** The proposal a raise carries when the raiser saw it before sending: the proposal, and the fingerprint of the text it was made for. */
export type ShownProposal = CaseProposal & { textHash: string };

export function scoreDraft(d: { turns: readonly Turn[]; affected: readonly string[]; attachments: number }, ctx: BenchmarkContext, locale?: Locale): Benchmark {
  return benchmark({ text: ideaFromTurns(d.turns).text, affected: d.affected, attachments: d.attachments }, ctx, locale);
}

export const summaryOf = (d: DraftView): DraftSummary =>
  ({ id: d.id, title: d.title, status: d.status, overall: d.overall, updatedAt: d.updatedAt, caseId: d.caseId });

// What the benchmarks compare an idea with: the routing map, the goals, and what is already raised.
export function ideaContext(
  routes: BenchmarkContext["routes"],
  goals: BenchmarkContext["goals"],
  cases: BenchmarkContext["cases"],
  spend: SpendRule | null,
): BenchmarkContext {
  return { routes, goals, cases, spendLimitEur: spend?.limitEur ?? null };
}
