// The assistant's and the brain's tokens and estimated cost per company and period (AID D5, AIB D10).
// Totals only: no user id, no text, no per-person number leaves this function.
import { capOf, monthOf, spendOf, tokenCapOf, type AiBudget } from "@/features/ai/budget";
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

export type AiCallInput = { purpose: string; model: string; tokensIn: number; tokensOut: number; latencyMs: number };

/**
 * Stores what one brain call used. Never throws and never delays the answer: the write is not
 * awaited, a failure is logged and nothing else changes for the caller.
 */
export function recordAiCall(companyId: string, call: AiCallInput): void {
  try {
    void getDb()
      .aiCall.create({ data: { companyId, ...call } })
      .catch((err: unknown) => console.error("[ai-usage] record failed", err instanceof Error ? err.name : "failed"));
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

/** Assistant turns and brain calls of the company with from <= createdAt < to, summed per model and per purpose. */
export async function aiUsage(companyId: string, from: Date, to: Date): Promise<AiUsage> {
  const createdAt = { gte: from, lt: to };
  const [turns, calls] = await Promise.all([
    getDb().assistTurn.groupBy({
      by: ["model"],
      where: { companyId, role: "assistant", createdAt },
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
  const byModel = [...new Set(parts.map((p) => p.model))].sort().map((model) => {
    const t = total(parts.filter((p) => p.model === model));
    return { model, turns: turns.find((g) => g.model === model)?._count._all ?? 0, ...t, costUsd: aiCost(model, t.tokensIn, t.tokensOut) };
  });
  const byPurpose = [...new Set(parts.map((p) => p.purpose))].sort().map((purpose) => {
    const mine = parts.filter((p) => p.purpose === purpose);
    return { purpose, calls: mine.reduce((s, x) => s + x.calls, 0), ...total(mine), costUsd: costOf(mine) };
  });
  return {
    turns: turns.reduce((s, g) => s + g._count._all, 0),
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
