// The AI gate for the project agent's calls (plan AGT, D21, Q4): built as server/actions/brain.ts `gateFor` builds one, from the company's
// own settings, with the database. On top of the gate's rules Q4's default holds: until Kevin decides which model answers the agent,
// the agent's purpose and the reason hint (the brain purpose) run only on a model the company chose itself. Bedrock without a brainModel
// would fall back to the brain's stack model, so there the gate is closed and says what to choose. Not a "use server" module.
import { aiGate, type AiGate } from "@/features/ai/gate";
import { getDb } from "@/lib/db/client";
import { loadAiSettings } from "@/lib/db/ai";
import { loadAiBudget } from "@/lib/db/ai-usage";
import { loadAiRouting, loadAssistSettings } from "@/lib/db/assist";
import { brainConfigured, type BrainPolicy } from "@/server/brain";

/** The purposes the agent's calls run under: `agent` (the daily and the planning run) and `brain` (the reason hint). */
export type AgentGatePurpose = "agent" | "brain";

export const BEDROCK_MODEL_WORDS = "Choose a brain model for Bedrock";

export type AgentGate = {
  gate: AiGate;
  /** The company's own API key for its provider, or null. */
  key: string | null;
  /** The company's redaction: its own patterns and the ceiling above which nothing goes out. */
  policy: BrainPolicy;
};

/** The gate's rules plus Q4's default, as a pure function: what a test feeds it is what the database would give. */
export function agentGateOf(a: Parameters<typeof aiGate>[0]): AiGate {
  const gate = aiGate(a);
  return gate.on && gate.settings.choice === "bedrock" && !gate.settings.brainModel ? { on: false, why: BEDROCK_MODEL_WORDS } : gate;
}

/** The gate for one agent purpose. A company that is not there has a closed gate. */
export async function agentGateFor(companyId: string, _slug: string, purpose: AgentGatePurpose, now: Date = new Date()): Promise<AgentGate> {
  const stage = (await getDb().company.findUnique({ where: { id: companyId }, select: { stage: true } }))?.stage ?? null;
  const [ai, assist, aiRouting, budget] = await Promise.all([
    loadAiSettings(companyId, stage ?? "live"), loadAssistSettings(companyId), loadAiRouting(companyId), loadAiBudget(companyId, now),
  ]);
  const policy = { patterns: assist.patterns, ceiling: assist.ceiling };
  if (stage === null) return { gate: { on: false, why: "The company is not there." }, key: null, policy };
  const gate = agentGateOf({
    stage, hasDatabase: true, settings: ai.settings, dpaSignedAt: assist.dpaSignedAt, purpose, assistantOn: assist.enabled, aiRouting, budget,
    stackBrain: brainConfigured(),
  });
  return { gate, key: ai.key, policy };
}
