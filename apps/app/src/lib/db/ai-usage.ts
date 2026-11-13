// The assistant's and the brain's tokens and estimated cost per company and period (AID D5, AIB D10).
// Totals only: no user id, no text, no per-person number leaves this function.
import { capOf, monthOf, onRaisePath, spendOf, tokenCapOf, usedUpBy, type AiBudget } from "@/features/ai/budget";
import type { AiPurpose } from "@/features/ai/gate";
import { pricesOf } from "@/features/ai/prices";
import { AI_SYSTEM } from "@/features/ai/settings";
import { aiCost } from "@/features/ai/usage";
import { getDb } from "./client";
import { getIntegration } from "./integrations";

export type AiUsage = {
  turns: number;
  tokensIn: number;
  tokensOut: number;
  byModel: { model: string; turns: number; tokensIn: number; tokensOut: number; costUsd: number | null }[];
  byPurpose: { purpose: string; calls: number; tokensIn: number; tokensOut: number; costUsd: number | null }[];
  costUsd: number | null;
};

export type AiCallInput = {
  purpose: string; model: string; tokensIn: number; tokensOut: number; latencyMs: number;
  /** When the call was made; default: when the row is written. */
  at?: Date;
};

/**
 * After a call is stored: the budget warning mail, if the month just reached a level (decision Q7.6). Imported when
 * first needed, because server/notify/ai-budget.ts reads the budget from this file. Never throws.
 */
async function warnAfterRecord(companyId: string): Promise<void> {
  try {
    const { warnAiBudget } = await import("@/server/notify/ai-budget");
    await warnAiBudget(companyId);
  } catch (err) {
    console.warn("[ai-usage] budget warning not checked", err instanceof Error ? err.name : "failed");
  }
}

/**
 * Stores what one brain call used, then checks the budget warning. Never throws and never delays
 * the answer: neither is awaited, a failure is logged and nothing else changes for the caller.
 */
export function recordAiCall(companyId: string, call: AiCallInput): void {
  try {
    void getDb()
      .aiCall.create({ data: { companyId, purpose: call.purpose, model: call.model, tokensIn: call.tokensIn, tokensOut: call.tokensOut, latencyMs: call.latencyMs, ...(call.at ? { createdAt: call.at } : {}) } })
      .then(
        () => warnAfterRecord(companyId),
        (err: unknown) => console.error("[ai-usage] record failed", err instanceof Error ? err.name : "failed"),
      );
  } catch (err) {
    console.error("[ai-usage] record failed", err instanceof Error ? err.name : "failed");
  }
}

type Part = { purpose: string; model: string; calls: number; tokensIn: number; tokensOut: number };

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

// Null as soon as one part has no price.
function costOf(parts: Part[]): number | null {
  let sum = 0;
  for (const p of parts) {
    const c = aiCost(p.model, p.tokensIn, p.tokensOut);
    if (c === null) return null;
    sum += c;
  }
  return round4(sum);
}

const total = (xs: Part[]) => ({
  tokensIn: xs.reduce((s, x) => s + x.tokensIn, 0),
  tokensOut: xs.reduce((s, x) => s + x.tokensOut, 0),
});

/**
 * Assistant turns and brain calls of the company with from <= createdAt < to, summed per model and per purpose.
 *
 * Every assistant answer is also stored as an AiCall with purpose "assist" (no person, no text, never purged), so the
 * sum holds when retention or pseudonymising deletes the turns. Turns count only before the company's first such call:
 * from then on the AiCall row stands for the turn, and counting both would count it twice. The AiCall carries the
 * time the call started, before its turn is written, so the turn of that first call is already past the line.
 */
export async function aiUsage(companyId: string, from: Date, to: Date): Promise<AiUsage> {
  const createdAt = { gte: from, lt: to };
  const first = await getDb().aiCall.findFirst({ where: { companyId, purpose: "assist" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
  const turnsUntil = first && first.createdAt < to ? first.createdAt : to;
  const [turns, calls] = await Promise.all([
    getDb().assistTurn.groupBy({
      by: ["model"],
      where: { companyId, role: "assistant", createdAt: { gte: from, lt: turnsUntil } },
      _count: { _all: true },
      _sum: { tokensIn: true, tokensOut: true },
      orderBy: { model: "asc" },
    }),
    getDb().aiCall.groupBy({
      by: ["purpose", "model"],
      where: { companyId, createdAt },
      _count: { _all: true },
      _sum: { tokensIn: true, tokensOut: true },
    }),
  ]);
  const parts: Part[] = [
    ...turns.map((g) => ({ purpose: "assist", model: g.model, calls: g._count._all, tokensIn: g._sum.tokensIn ?? 0, tokensOut: g._sum.tokensOut ?? 0 })),
    ...calls.map((g) => ({ purpose: g.purpose, model: g.model, calls: g._count._all, tokensIn: g._sum.tokensIn ?? 0, tokensOut: g._sum.tokensOut ?? 0 })),
  ];
  // Assistant answers: the turns before the line and the "assist" calls after it.
  const answers = (xs: Part[]) => xs.filter((p) => p.purpose === "assist").reduce((s, x) => s + x.calls, 0);
  const byModel = [...new Set(parts.map((p) => p.model))].sort().map((model) => {
    const mine = parts.filter((p) => p.model === model);
    const t = total(mine);
    return { model, turns: answers(mine), ...t, costUsd: aiCost(model, t.tokensIn, t.tokensOut) };
  });
  const byPurpose = [...new Set(parts.map((p) => p.purpose))].sort().map((purpose) => {
    const mine = parts.filter((p) => p.purpose === purpose);
    return { purpose, calls: mine.reduce((s, x) => s + x.calls, 0), ...total(mine), costUsd: costOf(mine) };
  });
  return {
    turns: answers(parts),
    ...total(parts),
    byModel,
    byPurpose,
    costUsd: byModel.some((m) => m.costUsd === null) ? null : round4(byModel.reduce((s, m) => s + (m.costUsd ?? 0), 0)),
  };
}

/**
 * The company's caps and what its assistant turns and brain calls of the calendar month cost so far (decisions Q7.3,
 * Q7.5): what the gate asks before a model call. Priced with the company's own prices from its AI settings first.
 * Only answered calls are stored, so the sum reads low by whatever timed out.
 */
export async function loadAiBudget(companyId: string, now: Date = new Date()): Promise<AiBudget> {
  const { from, to } = monthOf(now);
  const [cfg, usage, ai] = await Promise.all([
    getDb().companyConfig.findUnique({ where: { companyId }, select: { aiMonthlyCapEur: true, aiMonthlyTokenCap: true } }),
    aiUsage(companyId, from, to),
    getIntegration(companyId, AI_SYSTEM),
  ]);
  const settings = ai?.settings && typeof ai.settings === "object" ? (ai.settings as Record<string, unknown>) : {};
  return { capEur: capOf(cfg?.aiMonthlyCapEur), tokenCap: tokenCapOf(cfg?.aiMonthlyTokenCap), ...spendOf(usage.byModel, pricesOf(settings.prices)) };
}

/** What a call may use at most, before it is made: the model it will be billed as and the most tokens it can take in and give out. */
export type AiEstimate = { model: string; tokensIn: number; tokensOut: number };

/** A word for the lock: the same company always maps to the same number, whatever the purpose (the agent's calls and the brain's share one budget). */
const lockKey = (companyId: string): string => `ai:budget:${companyId}`;

/**
 * Reserves a call's estimated cost against the month's cap (plan REM, AGT D21): under one lock per company the estimate is added to what the stored calls
 * cost so far, and when that would use the cap up the answer is null and no call is made. Otherwise the estimate is stored as an AiCall row of the
 * purpose, so every check that follows - the gate's too - counts it at once, and its id is returned. A raise-path purpose (routing, the studio's read and
 * coach) goes on to the grace share first, as the gate lets it (Q7.4). Throws when the database does: the caller treats that as a closed budget.
 */
export async function reserveAiCall(companyId: string, purpose: string, estimate: AiEstimate, now: Date = new Date()): Promise<string | null> {
  const grace = onRaisePath((purpose === "read" ? "coach" : purpose) as AiPurpose);
  return getDb().$transaction(async (tx) => {
    // One reservation at a time per company: the next one reads the sum after this one is committed.
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${lockKey(companyId)}, 0))`;
    const [budget, ai] = await Promise.all([loadAiBudget(companyId, now), getIntegration(companyId, AI_SYSTEM)]);
    const settings = ai?.settings && typeof ai.settings === "object" ? (ai.settings as Record<string, unknown>) : {};
    const planned = spendOf([estimate], pricesOf(settings.prices));
    const after = { capEur: budget.capEur, tokenCap: budget.tokenCap, spentEur: budget.spentEur + planned.spentEur, tokensUnpriced: budget.tokensUnpriced + planned.tokensUnpriced };
    if (usedUpBy(after, grace) !== null) return null;
    const row = await tx.aiCall.create({
      data: { companyId, purpose, model: estimate.model, tokensIn: estimate.tokensIn, tokensOut: estimate.tokensOut, latencyMs: 0, createdAt: now },
      select: { id: true },
    });
    return row.id;
  });
}

/** What the provider reported replaces the estimate of a reserved call. */
export async function settleAiCall(companyId: string, id: string, data: { model?: string; tokensIn?: number; tokensOut?: number; latencyMs?: number }): Promise<void> {
  await getDb().aiCall.updateMany({ where: { id, companyId }, data });
}

/** A reserved call that billed nothing (the brain refused before any model ran): its row goes. */
export async function releaseAiCall(companyId: string, id: string): Promise<void> {
  await getDb().aiCall.deleteMany({ where: { id, companyId } });
}
