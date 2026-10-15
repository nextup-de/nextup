// The company's rules after the routing (src/features/loop/rules.ts), from CompanyConfig. A company
// without a config row gets the defaults - loopRules() fills and clamps whatever is missing.
import { loopRules, type LoopRules, type RewardKind } from "@/features/loop/rules";
import { getDb } from "./client";

export async function loadLoopRules(companyId: string): Promise<LoopRules> {
  const cfg = await getDb().companyConfig.findUnique({
    where: { companyId },
    select: {
      discussEveryDays: true, discussMaxRounds: true, fastLaneEur: true, measureDays: true, measureTolerancePct: true,
      rewardRule: true, rewardAmountEur: true, rewardSharePct: true, rewardCapEur: true,
    },
  });
  if (!cfg) return loopRules();
  return loopRules({
    discussEveryDays: cfg.discussEveryDays,
    discussMaxRounds: cfg.discussMaxRounds,
    fastLaneEur: cfg.fastLaneEur,
    measureDays: cfg.measureDays,
    tolerancePct: cfg.measureTolerancePct,
    reward: { kind: cfg.rewardRule as RewardKind, amount: cfg.rewardAmountEur, sharePct: cfg.rewardSharePct, capEur: cfg.rewardCapEur },
  });
}

/** Admin: write the rules back. The caller has checked who is asking. */
export async function saveLoopRules(companyId: string, rules: LoopRules): Promise<void> {
  const data = {
    discussEveryDays: rules.discussEveryDays,
    discussMaxRounds: rules.discussMaxRounds,
    fastLaneEur: rules.fastLaneEur,
    measureDays: rules.measureDays,
    measureTolerancePct: rules.tolerancePct,
    rewardRule: rules.reward.kind,
    rewardAmountEur: rules.reward.amount,
    rewardSharePct: rules.reward.sharePct,
    rewardCapEur: rules.reward.capEur,
  };
  await getDb().companyConfig.upsert({ where: { companyId }, create: { companyId, ...data }, update: data });
}
