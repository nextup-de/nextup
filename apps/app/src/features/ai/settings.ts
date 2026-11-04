// A company's AI choice (ADR 0006, docs/plans AIP D5). Lives in the company's Integration row with
// system "ai": `on` = a model may be called, `settings` = the shape below, `secretSealed` = the API
// key (azure-openai, openai-compatible), sealed by features/connectors/vault.ts. Pure.
import { AI_PROVIDER_CHOICES, type AiProviderChoice } from "@nextup/contracts/public";
import { policyFor } from "@/features/admin/stages";

export const AI_SYSTEM = "ai";
export const DEFAULT_REGION = "eu-central-1";

export type AiSettings = {
  choice: AiProviderChoice | "mock";
  region: string;
  model: string;
  endpoint: string | null;
  deployment: string | null;
  /** The model the brain (routing, coaching, plans) uses; settings JSON, no column (plan AIB D8). */
  brainModel?: string | null;
};

/** The part of the Integration row that decides: the switch and the saved settings. */
export type AiRow = { on: boolean; settings: unknown };

export const AI_OFF: AiSettings = { choice: "off", region: DEFAULT_REGION, model: "", endpoint: null, deployment: null };

const str = (v: unknown, fallback: string): string => (typeof v === "string" && v.trim() ? v.trim() : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * A row wins (an unknown choice, or a row switched off, is off). Without a row a demo company keeps
 * the environment rule (LLM_PROVIDER=bedrock with LLM_MODEL: bedrock in LLM_REGION, else the mock);
 * any other stage is off.
 */
export function aiSettings(row: AiRow | null, env: Record<string, string | undefined>, stage: string): AiSettings {
  if (row) {
    const s = row.settings && typeof row.settings === "object" ? (row.settings as Record<string, unknown>) : {};
    const choice = (AI_PROVIDER_CHOICES as readonly unknown[]).includes(s.choice) ? (s.choice as AiProviderChoice) : "off";
    const brainModel = strOrNull(s.brainModel);
    return {
      choice: row.on ? choice : "off",
      region: str(s.region, DEFAULT_REGION),
      model: str(s.model, ""),
      endpoint: strOrNull(s.endpoint),
      deployment: strOrNull(s.deployment),
      ...(brainModel ? { brainModel } : {}), // absent, not null, so existing settings compare as before
    };
  }
  if (!policyFor(stage).demoData) return AI_OFF;
  const region = env.LLM_REGION || DEFAULT_REGION;
  const model = env.LLM_MODEL || "";
  if (env.LLM_PROVIDER === "bedrock" && model) return { choice: "bedrock", region, model, endpoint: null, deployment: null };
  return { choice: "mock", region, model: "mock", endpoint: null, deployment: null };
}
