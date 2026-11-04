// A company's AI choice: its Integration row with system "ai" (features/ai/settings.ts). The API key
// is sealed with the vault and bound to the company; it comes out only here, for the adapter.
import { integrationContext, open, seal, vaultKey } from "@/features/connectors/vault";
import { AI_SYSTEM, aiSettings, type AiSettings } from "@/features/ai/settings";
import { getIntegration, integrationSecrets, saveIntegration, setIntegrationOn, type Tx } from "./integrations";
import type { Db } from "./client";

export type LoadedAi = { settings: AiSettings; key: string | null };

/** The company's settings and, when there is a vault key and a sealed key, the API key. */
export async function loadAiSettings(companyId: string, stage: string, env: Record<string, string | undefined> = process.env): Promise<LoadedAi> {
  const row = await getIntegration(companyId, AI_SYSTEM);
  const settings = aiSettings(row ? { on: row.on, settings: row.settings } : null, env, stage);
  const vault = vaultKey(env);
  if (!row || !vault) return { settings, key: null };
  const sealed = (await integrationSecrets(companyId, AI_SYSTEM))?.secretSealed;
  return { settings, key: sealed ? open(sealed, vault, integrationContext(companyId, AI_SYSTEM)) : null };
}

/**
 * Save the choice. `key`: a string replaces the stored key, `null` keeps it. The row is on unless
 * the choice is off.
 */
export async function saveAiSettings(companyId: string, settings: AiSettings, key: string | null, by: string | null, client?: Tx | Db): Promise<void> {
  let secretSealed: string | undefined;
  if (key !== null) {
    const vault = vaultKey();
    if (!vault) throw new Error("CONNECTOR_VAULT_KEY is missing; the API key cannot be stored.");
    secretSealed = seal(key, vault, integrationContext(companyId, AI_SYSTEM));
  }
  const choice = settings.choice === "mock" ? "off" : settings.choice;
  await saveIntegration({
    companyId,
    system: AI_SYSTEM,
    settings: { choice, region: settings.region, model: settings.model, endpoint: settings.endpoint, deployment: settings.deployment, brainModel: settings.brainModel ?? null },
    ...(secretSealed !== undefined ? { secretSealed } : {}),
    updatedBy: by,
  }, client);
  await setIntegrationOn(companyId, AI_SYSTEM, choice !== "off", by, new Date(), client);
}
