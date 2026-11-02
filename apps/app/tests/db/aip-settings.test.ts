// A company's AI choice against a real Postgres (lib/db/ai.ts): the Integration row "ai", the key sealed.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEED } from "@/features/demo/seed";
import { toSeedJson } from "@/features/demo/parse";
import { getDb } from "@/lib/db/client";
import { loadAiSettings, saveAiSettings } from "@/lib/db/ai";
import { integrationSecrets } from "@/lib/db/integrations";

const db = getDb();
const VAULT_KEY = "cd".repeat(32);
const API_KEY = "sk-very-secret-key-123";
let a: { id: string };
let b: { id: string };

beforeAll(async () => {
  process.env.CONNECTOR_VAULT_KEY = VAULT_KEY;
  await db.company.deleteMany({});
  a = await db.company.create({ data: { slug: "aip-a", name: "A", seedJson: toSeedJson(SEED) as object } });
  b = await db.company.create({ data: { slug: "aip-b", name: "B", seedJson: toSeedJson(SEED) as object } });
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("AIP settings", () => {
  it("saves an azure-openai choice with a sealed key and reads it back for that company only", async () => {
    const settings = { choice: "azure-openai" as const, region: "westeurope", model: "gpt-x", endpoint: "https://x.openai.azure.example", deployment: "dep" };
    await saveAiSettings(a.id, settings, API_KEY, "Kevin");

    expect(await loadAiSettings(a.id, "pilot")).toEqual({ settings, key: API_KEY });

    const sealed = (await integrationSecrets(a.id, "ai"))?.secretSealed;
    expect(sealed).toBeTruthy();
    expect(sealed).not.toContain(API_KEY);

    expect(await loadAiSettings(b.id, "pilot")).toEqual({ settings: expect.objectContaining({ choice: "off" }), key: null });
  });

  it("keeps the stored key when saved with null", async () => {
    await saveAiSettings(a.id, { choice: "azure-openai", region: "westeurope", model: "gpt-y", endpoint: "https://x.openai.azure.example", deployment: "dep" }, null, "Kevin");
    expect(await loadAiSettings(a.id, "pilot")).toMatchObject({ settings: { model: "gpt-y" }, key: API_KEY });
  });
});
