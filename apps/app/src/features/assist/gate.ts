// May the assistant answer for this company right now, and with which provider? Pure; the route
// asks this before anything else. Fail closed: every "no" names the switch that is missing.
// A thin wrapper over the one gate for every model call (features/ai/gate.ts), purpose "assist".
import type { AiBudget } from "@/features/ai/budget";
import { aiGate } from "@/features/ai/gate";
import { DEFAULT_REGION } from "@/features/ai/settings";

export type Gate = { on: true; provider: "bedrock" | "mock" } | { on: false; why: string };

export function assistGate(a: {
  stage: string;
  hasDatabase: boolean;
  configured: "bedrock" | "mock";
  enabled: boolean;
  dpaSignedAt: Date | null;
  /** The month's cap and spend; left out where nothing is counted (no database). */
  budget?: Pick<AiBudget, "capEur" | "spentEur"> | null;
}): Gate {
  const g = aiGate({
    stage: a.stage,
    hasDatabase: a.hasDatabase,
    settings: { choice: a.configured, region: DEFAULT_REGION, model: "", endpoint: null, deployment: null },
    dpaSignedAt: a.dpaSignedAt,
    purpose: "assist",
    assistantOn: a.enabled,
    aiRouting: true,
    budget: a.budget ?? null,
  });
  if (!g.on) return g;
  return { on: true, provider: g.settings.choice === "bedrock" ? "bedrock" : "mock" };
}
