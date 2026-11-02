// The assistant's tokens and estimated cost per company and period (AID D5). Totals only:
// no user id, no text, no per-person number leaves this function.
import { aiCost } from "@/features/ai/usage";
import { getDb } from "./client";

export type AiUsage = {
  turns: number;
  tokensIn: number;
  tokensOut: number;
  byModel: { model: string; turns: number; tokensIn: number; tokensOut: number; costUsd: number | null }[];
  costUsd: number | null;
};

/** Assistant turns of the company with from <= createdAt < to, summed per model. */
export async function aiUsage(companyId: string, from: Date, to: Date): Promise<AiUsage> {
  const groups = await getDb().assistTurn.groupBy({
    by: ["model"],
    where: { companyId, role: "assistant", createdAt: { gte: from, lt: to } },
    _count: { _all: true },
    _sum: { tokensIn: true, tokensOut: true },
    orderBy: { model: "asc" },
  });
  const byModel = groups.map((g) => {
    const tokensIn = g._sum.tokensIn ?? 0;
    const tokensOut = g._sum.tokensOut ?? 0;
    return { model: g.model, turns: g._count._all, tokensIn, tokensOut, costUsd: aiCost(g.model, tokensIn, tokensOut) };
  });
  const costUsd = byModel.some((m) => m.costUsd === null)
    ? null
    : Math.round(byModel.reduce((s, m) => s + (m.costUsd ?? 0), 0) * 10_000) / 10_000;
  return {
    turns: byModel.reduce((s, m) => s + m.turns, 0),
    tokensIn: byModel.reduce((s, m) => s + m.tokensIn, 0),
    tokensOut: byModel.reduce((s, m) => s + m.tokensOut, 0),
    byModel,
    costUsd,
  };
}
