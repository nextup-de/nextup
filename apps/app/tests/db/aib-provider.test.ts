// AIB acceptance (docs/ASSISTANT.md): a raise gets the proposal through the company's chosen
// provider within the timeout, and with the AI off it still routes. Real Postgres, sandbox companies
// from the demo template and one local fake brain that records the bodies it gets and answers with
// tokens. No real model is called. Setup as in ai-provider.test.ts (AIP).
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AiSettings } from "@/features/ai/settings";
import { stampEvent } from "@/features/cases/stamp";
import type { EventPayload } from "@/features/cases/events";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { seedFor } from "@/features/demo";
import { DEMO_GOALS } from "@/features/demo/structure";
import { rowsFromSeed } from "@/features/knowledge";
import { saveAiSettings } from "@/lib/db/ai";
import { getDb } from "@/lib/db/client";
import { replaceKnowledge } from "@/lib/db/knowledge";
import { proposeOnRaise } from "@/server/routing";

const db = getDb();
const BRAIN_KEY = "brain-key";
const AZURE_KEY = "azure-key";
const SLOW_MS = 2500;
const TIMEOUT_MS = 400;

type Seen = { url: string; body: { llm?: Record<string, unknown> } | null; headers: IncomingMessage["headers"] };

let brain: { server: Server; url: string; seen: Seen[] };
let delayMs = 0;
const timers = new Set<ReturnType<typeof setTimeout>>();
const saved = { url: process.env.BRAIN_URL, key: process.env.BRAIN_API_KEY, vault: process.env.CONNECTOR_VAULT_KEY };
const SLUGS = ["aib-bedrock", "aib-azure", "aib-off", "aib-nodpa", "aib-slow"];
const company: Record<string, { id: string }> = {};

async function startBrain() {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const body = raw ? (JSON.parse(raw) as Seen["body"]) : null;
      seen.push({ url: req.url ?? "", body, headers: req.headers });
      const answer = (r: ServerResponse) => {
        if (req.headers["x-api-key"] !== BRAIN_KEY) { r.statusCode = 401; r.end(); return; }
        r.setHeader("content-type", "application/json");
        r.end(JSON.stringify({
          route_id: "r2", confidence: 80, reason: "a rig", same_as: null, related: null,
          model: String(body?.llm?.model ?? "stack-model"), version: "fake-brain-aib", tokens_in: 120, tokens_out: 30,
        }));
      };
      if (delayMs > 0) { const t = setTimeout(() => answer(res), delayMs); timers.add(t); } else answer(res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
}

async function sandbox(slug: string, settings: AiSettings | null, key: string | null, dpa: boolean) {
  const c = await db.company.create({ data: { slug, name: slug, stage: "sandbox", seedJson: toSeedJson(SEED) as object } });
  await replaceKnowledge(c.id, rowsFromSeed(SEED, DEMO_GOALS, () => randomUUID()));
  if (settings) await saveAiSettings(c.id, settings, key, "t");
  await db.companyConfig.create({ data: { companyId: c.id, aiRouting: true, dpaSignedAt: dpa ? new Date() : null } });
  company[slug] = c;
}

const bedrock: AiSettings = { choice: "bedrock", region: "eu-central-1", model: "stack-model", endpoint: null, deployment: null, brainModel: "anthropic.claude-haiku-5-5" };
const azure: AiSettings = { choice: "azure-openai", region: "eu-central-1", model: "", endpoint: "https://res.openai.azure.com/", deployment: "dep-brain" };

// The proposal stored for a raise.
async function raise(slug: string, timeoutMs?: number) {
  const sent: EventPayload = { title: "Our sensor order is stuck", body: "need to buy a part", routeId: "r1", fromDept: "d1" };
  const payload = stampEvent("case.raised", sent, await seedFor(slug));
  const started = Date.now();
  const proposal = await proposeOnRaise(slug, company[slug].id, payload, timeoutMs ? { timeoutMs } : {});
  return { proposal, ms: Date.now() - started };
}

// recordAiCall is not awaited by the brain call: wait for the row.
async function aiCalls(companyId: string, want: number) {
  for (let i = 0; i < 40; i++) {
    const rows = await db.aiCall.findMany({ where: { companyId } });
    if (rows.length >= want) return rows;
    await new Promise((r) => setTimeout(r, 50));
  }
  return db.aiCall.findMany({ where: { companyId } });
}

beforeAll(async () => {
  process.env.CONNECTOR_VAULT_KEY = "cd".repeat(32);
  await db.company.deleteMany({ where: { slug: { in: SLUGS } } });
  brain = await startBrain();
  process.env.BRAIN_URL = brain.url;
  process.env.BRAIN_API_KEY = BRAIN_KEY;
  await sandbox("aib-bedrock", bedrock, null, true);
  await sandbox("aib-azure", azure, AZURE_KEY, true);
  await sandbox("aib-off", null, null, true);
  await sandbox("aib-nodpa", azure, AZURE_KEY, false);
  await sandbox("aib-slow", azure, AZURE_KEY, true);
});

beforeEach(() => { brain.seen.length = 0; delayMs = 0; });

afterAll(async () => {
  for (const t of timers) clearTimeout(t);
  for (const [k, v] of [["BRAIN_URL", saved.url], ["BRAIN_API_KEY", saved.key], ["CONNECTOR_VAULT_KEY", saved.vault]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  await db.company.deleteMany({ where: { slug: { in: SLUGS } } });
  await db.$disconnect();
  brain.server.closeAllConnections();
  await new Promise((resolve) => brain.server.close(resolve));
});

describe("AIB acceptance: a raise gets the proposal through the chosen provider within the timeout, and off still routes", () => {
  it("bedrock: the request carries the Bedrock override, the brain's proposal and an AiCall are stored", async () => {
    const { proposal } = await raise("aib-bedrock");
    expect(proposal).toMatchObject({ source: "llm", routeId: "r2", version: "fake-brain-aib" });
    expect(brain.seen).toHaveLength(1);
    expect(brain.seen[0].url).toBe("/v1/route");
    expect(brain.seen[0].body?.llm).toEqual({ provider: "bedrock", region: "eu-central-1", model: "anthropic.claude-haiku-5-5" });
    const [call, ...rest] = await aiCalls(company["aib-bedrock"].id, 1);
    expect(rest).toHaveLength(0);
    expect(call).toMatchObject({ purpose: "routing", model: "anthropic.claude-haiku-5-5", tokensIn: 120, tokensOut: 30 });
    expect(call.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("azure-openai: the request carries the Azure override with the company's key, proposal and AiCall are stored", async () => {
    const { proposal } = await raise("aib-azure");
    expect(proposal).toMatchObject({ source: "llm", routeId: "r2", version: "fake-brain-aib" });
    expect(brain.seen).toHaveLength(1);
    expect(brain.seen[0].body?.llm).toEqual({
      provider: "azure-openai", base_url: "https://res.openai.azure.com/openai/v1", model: "dep-brain", api_key: AZURE_KEY,
    });
    const rows = await aiCalls(company["aib-azure"].id, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ purpose: "routing", model: "dep-brain", tokensIn: 120, tokensOut: 30 });
  });

  it("choice off: nothing is sent and the keywords route", async () => {
    const { proposal } = await raise("aib-off");
    expect(proposal).toMatchObject({ source: "keywords", version: "keywords-v2" });
    expect(brain.seen).toHaveLength(0);
    expect(await db.aiCall.count({ where: { companyId: company["aib-off"].id } })).toBe(0);
  });

  it("a chosen provider without a signed agreement: nothing is sent and the keywords route", async () => {
    const { proposal } = await raise("aib-nodpa");
    expect(proposal).toMatchObject({ source: "keywords", version: "keywords-v2" });
    expect(brain.seen).toHaveLength(0);
    expect(await db.aiCall.count({ where: { companyId: company["aib-nodpa"].id } })).toBe(0);
  });

  it("a brain slower than the timeout: the keyword proposal arrives in time", async () => {
    delayMs = SLOW_MS;
    const { proposal, ms } = await raise("aib-slow", TIMEOUT_MS);
    expect(proposal).toMatchObject({ source: "keywords", version: "keywords-v2" });
    expect(brain.seen).toHaveLength(1); // it was asked, it was just too slow
    expect(ms).toBeLessThan(SLOW_MS - 500);
    expect(ms).toBeGreaterThanOrEqual(TIMEOUT_MS - 50);
  });
});
