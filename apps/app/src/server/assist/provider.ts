// Which model answers the raise-page assistant. docs/ASSISTANT.md.
//
// A company's own choice (features/ai, lib/db/ai.ts) is served by server/ai. What is left here is
// the environment default - LLM_PROVIDER / LLM_MODEL / LLM_REGION - for a demo company without a row.
//
//   bedrock  Claude on Amazon Bedrock, called in LLM_REGION (default eu-central-1, Frankfurt).
//   mock     No model: features/assist/mock.ts strings tool results together. Demo, e2e, dev.
import type { Provider } from "@/features/assist";
import { aiSettings } from "@/features/ai/settings";
import { streamingFor } from "@/server/ai";

export type ProviderConfig = { id: "bedrock" | "mock"; region: string; model: string };

/** What the environment asks for. Bedrock only when a model is named; otherwise the mock. */
export function providerConfig(env: NodeJS.ProcessEnv = process.env): ProviderConfig {
  const s = aiSettings(null, env, "demo");
  return { id: s.choice === "bedrock" ? "bedrock" : "mock", region: s.region, model: s.model };
}

export function providerFor(cfg: ProviderConfig): Provider {
  return streamingFor({ choice: cfg.id, region: cfg.region, model: cfg.model, endpoint: null, deployment: null }, null);
}
