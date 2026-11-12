// A company's AI choice (ADR 0006, docs/plans AIP D5). Lives in the company's Integration row with
// system "ai": `on` = a model may be called, `settings` = the shape below, `secretSealed` = the API
// key (azure-openai, openai-compatible), sealed by features/connectors/vault.ts. Pure.
import { AI_PROVIDER_CHOICES, type AiProviderChoice } from "@nextup/contracts/public";
import { policyFor } from "@/features/admin/stages";
import { pricesOf, type ModelPrices } from "./prices";

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
  /** The company's own prices per model, EUR per million tokens (prices.ts, decision Q7.5); settings JSON, no column. */
  prices?: ModelPrices;
};

/**
 * The stack's brain service, for the choice `local` (the model on this stack, Q8.4): `ok` it answers with its model
 * loaded, `none` this stack runs no brain (BRAIN_URL or BRAIN_API_KEY unset), `down` it is set but does not answer
 * or its model is not there (yet). server/brain-health.ts reads it.
 */
export type BrainState = "ok" | "none" | "down";

/** The part of the Integration row that decides: the switch and the saved settings. */
export type AiRow = { on: boolean; settings: unknown };

export const AI_OFF: AiSettings = { choice: "off", region: DEFAULT_REGION, model: "", endpoint: null, deployment: null };

const str = (v: unknown, fallback: string): string => (typeof v === "string" && v.trim() ? v.trim() : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Bedrock is the choice and no model is set for the brain (plan REM): the brain's purposes have nothing to call. Every other choice names its own or runs on this stack. */
export const noBrainModel = (s: Pick<AiSettings, "choice" | "brainModel">): boolean => s.choice === "bedrock" && !s.brainModel;

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
    const prices = pricesOf(s.prices);
    return {
      choice: row.on ? choice : "off",
      region: str(s.region, DEFAULT_REGION),
      model: str(s.model, ""),
      endpoint: strOrNull(s.endpoint),
      deployment: strOrNull(s.deployment),
      ...(brainModel ? { brainModel } : {}), // absent, not null, so existing settings compare as before
      ...(Object.keys(prices).length ? { prices } : {}),
    };
  }
  if (!policyFor(stage).demoData) return AI_OFF;
  const region = env.LLM_REGION || DEFAULT_REGION;
  const model = env.LLM_MODEL || "";
  // The environment's one model serves the brain as well: a demo company has no row to name another.
  if (env.LLM_PROVIDER === "bedrock" && model) return { choice: "bedrock", region, model, endpoint: null, deployment: null, brainModel: model };
  return { choice: "mock", region, model: "mock", endpoint: null, deployment: null };
}
