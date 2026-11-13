// Q8.4: the model on this stack (AI choice `local`). No endpoint, no key and no data-processing agreement; every
// model call - the routing proposal, the assistant's chat, the context draft's completion - goes to the stack's
// brain and nowhere else; the monthly budget still holds; go-live accepts it only while the brain answers; rows of
// the other choices read back as they were. Real Postgres, a sandbox company from the demo template, and one local
// fake brain. No real model is called.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { aiGate } from "@/features/ai/gate";
import { goLiveChecks } from "@/features/pilot/go-live";
import { stampEvent } from "@/features/cases/stamp";
import type { EventPayload } from "@/features/cases/events";
import { DEMO_GOALS } from "@/features/demo/structure";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { seedFor } from "@/features/demo";
import { rowsFromSeed } from "@/features/knowledge";
import { loadAiSettings, saveAiSettings } from "@/lib/db/ai";
import { loadAiBudget } from "@/lib/db/ai-usage";
import { loadAiRouting, loadAssistSettings } from "@/lib/db/assist";
import { getDb } from "@/lib/db/client";
import { loadGoLiveInput } from "@/lib/db/go-live";
import { getIntegration } from "@/lib/db/integrations";
import { replaceKnowledge } from "@/lib/db/knowledge";
import { aiProviderFor, streamingFor } from "@/server/ai";
import { brainHealth } from "@/server/brain-health";
import { proposeOnRaise } from "@/server/routing";

const db = getDb();
const BRAIN_KEY = "brain-key";
const saved = { url: process.env.BRAIN_URL, key: process.env.BRAIN_API_KEY, vault: process.env.CONNECTOR_VAULT_KEY };

type Seen = { method: string; url: string; body: Record<string, unknown> | null; headers: IncomingMessage["headers"] };
let server: Server;
let brainUrl = "";
let healthy = true;
const seen: Seen[] = [];

async function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return chunks.length ? (JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>) : null;
}

const json = (res: ServerResponse, body: unknown) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(body)); };

// The brain: answers itself with "mistral-nemo", the stack's model. A request that names another model to use is refused.
function handle(req: IncomingMessage, res: ServerResponse, body: Record<string, unknown> | null) {
  if (req.url === "/health") return json(res, { status: healthy ? "ok" : "degraded", llm: { model: "mistral-nemo" } });
  if (req.headers["x-api-key"] !== BRAIN_KEY) { res.statusCode = 401; return res.end(); }
  if (body && "llm" in body) { res.statusCode = 400; return res.end(); }
  if (req.url === "/v1/route") {
    return json(res, { route_id: "r2", confidence: 80, reason: "a rig", same_as: null, related: null, model: "mistral-nemo", version: "fake-brain-1", tokens_in: 40, tokens_out: 5 });
  }
  if (req.url === "/v1/chat/completions" && body?.stream) {
    res.setHeader("content-type", "text/event-stream");
    const chunks = [
      { model: "mistral-nemo", choices: [{ index: 0, delta: { content: "On this " } }] },
      { model: "mistral-nemo", choices: [{ index: 0, delta: { content: "stack." } }] },
      { model: "mistral-nemo", choices: [], usage: { prompt_tokens: 30, completion_tokens: 4 } },
    ];
    return res.end(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n");
  }
  if (req.url === "/v1/chat/completions") {
    return json(res, { model: "mistral-nemo", choices: [{ index: 0, message: { role: "assistant", content: "A draft." } }], usage: { prompt_tokens: 20, completion_tokens: 3 } });
  }
  res.statusCode = 404;
  res.end();
}

const LOCAL = { choice: "local" as const, region: "eu-central-1", model: "", endpoint: null, deployment: null };
let local: { id: string };

async function sandbox(slug: string) {
  const c = await db.company.create({ data: { slug, name: slug, stage: "sandbox", seedJson: toSeedJson(SEED) as object } });
  await replaceKnowledge(c.id, rowsFromSeed(SEED, DEMO_GOALS, () => randomUUID()));
  return c;
}

async function raise(slug: string, companyId: string) {
  const sent: EventPayload = { title: "Our sensor order is stuck", body: "need to buy a part", routeId: "r1", fromDept: "d1" };
  return proposeOnRaise(slug, companyId, stampEvent("case.raised", sent, await seedFor(slug)));
}

async function gateFor(companyId: string, stackBrain: boolean) {
  const [ai, assist, aiRouting, budget] = await Promise.all([loadAiSettings(companyId, "sandbox"), loadAssistSettings(companyId), loadAiRouting(companyId), loadAiBudget(companyId)]);
  return aiGate({ stage: "sandbox", hasDatabase: true, settings: ai.settings, dpaSignedAt: assist.dpaSignedAt, purpose: "routing", assistantOn: assist.enabled, aiRouting, budget, stackBrain });
}

const req = { companyId: "c1", purpose: "brain" as const, system: "sys", messages: [{ role: "user" as const, text: "draft it" }], maxTokens: 100 };

beforeAll(async () => {
  process.env.CONNECTOR_VAULT_KEY = "cd".repeat(32);
  await db.company.deleteMany({});
  server = createServer((r, s) => {
    void (async () => {
      const body = await readJson(r);
      seen.push({ method: r.method ?? "", url: r.url ?? "", body, headers: r.headers });
      handle(r, s, body);
    })().catch(() => { s.statusCode = 500; s.end(); });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  brainUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.BRAIN_URL = brainUrl;
  process.env.BRAIN_API_KEY = BRAIN_KEY;

  local = await sandbox("ail-local");
  await saveAiSettings(local.id, LOCAL, null, "t");
  // No DPA date: nothing leaves the stack, so none is asked.
  await db.companyConfig.create({ data: { companyId: local.id, aiRouting: true, assistant: true, dpaSignedAt: null } });
});

beforeEach(() => {
  seen.length = 0;
  healthy = true;
  process.env.BRAIN_URL = brainUrl;
  process.env.BRAIN_API_KEY = BRAIN_KEY;
});

afterAll(async () => {
  for (const [k, v] of [["BRAIN_URL", saved.url], ["BRAIN_API_KEY", saved.key], ["CONNECTOR_VAULT_KEY", saved.vault]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  await db.company.deleteMany({});
  await db.$disconnect();
  await new Promise((resolve) => server.close(resolve));
});

describe("Q8.4 the model on this stack", () => {
  it("saves with no endpoint and no key, and reads back as local with the row on", async () => {
    const row = await getIntegration(local.id, "ai");
    expect(row).toMatchObject({ on: true, hasSecret: false });
    expect(row?.settings).toMatchObject({ choice: "local", endpoint: null, deployment: null, brainModel: null });
    expect((await loadAiSettings(local.id, "sandbox")).settings).toEqual(LOCAL);
  });

  it("routing without a DPA goes to the stack's brain, with no model of the company's in the request", async () => {
    const p = await raise("ail-local", local.id);
    expect(p).toMatchObject({ source: "llm", routeId: "r2", version: "fake-brain-1" });
    expect(seen.map((s) => s.url)).toEqual(["/v1/route"]);
    expect(seen[0].body).not.toHaveProperty("llm");
  });

  it("the assistant streams from the brain and the context draft completes there, with the stack's key", async () => {
    const ai = await loadAiSettings(local.id, "sandbox");
    const text: string[] = [];
    const out = await streamingFor(ai.settings, ai.key).run({ system: "s", history: [], question: "q", tools: [], runTool: async () => "", onText: (d) => text.push(d) });
    expect(out).toEqual({ text: "On this stack.", model: "mistral-nemo", tokensIn: 30, tokensOut: 4 });
    const done = await aiProviderFor(ai.settings, ai.key)!.complete(req);
    expect(done).toEqual({ text: "A draft.", model: "mistral-nemo", tokensIn: 20, tokensOut: 3 });
    expect(seen.map((s) => [s.url, s.headers["x-api-key"], s.headers.authorization])).toEqual([
      ["/v1/chat/completions", BRAIN_KEY, undefined],
      ["/v1/chat/completions", BRAIN_KEY, undefined],
    ]);
    expect(seen[0].body).toMatchObject({ model: "stack", stream: true });
  });

  it("without a brain on the stack the gate says so and nothing is sent", async () => {
    delete process.env.BRAIN_URL;
    expect(await gateFor(local.id, false)).toEqual({ on: false, why: expect.stringContaining("no brain service") });
    const p = await raise("ail-local", local.id);
    expect(p).toMatchObject({ source: "keywords" });
    expect(seen).toHaveLength(0);
  });

  it("the monthly budget still holds: the stack's model without a price stops at the token limit, a price of 0 lets it go on", async () => {
    await db.companyConfig.update({ where: { companyId: local.id }, data: { aiMonthlyTokenCap: 100 } });
    await db.aiCall.create({ data: { companyId: local.id, purpose: "routing", model: "mistral-nemo", tokensIn: 90, tokensOut: 20, latencyMs: 5 } });
    expect(await gateFor(local.id, true)).toEqual({ on: false, why: expect.stringContaining("token limit") });
    expect(await raise("ail-local", local.id)).toMatchObject({ source: "keywords" });
    expect(seen).toHaveLength(0);

    await saveAiSettings(local.id, { ...LOCAL, prices: { "mistral-nemo": { in: 0, out: 0 } } }, null, "t");
    expect(await gateFor(local.id, true)).toMatchObject({ on: true });
    await db.aiCall.deleteMany({ where: { companyId: local.id } });
    await db.companyConfig.update({ where: { companyId: local.id }, data: { aiMonthlyTokenCap: null } });
    await saveAiSettings(local.id, LOCAL, null, "t");
  });

  it("go-live: done while the brain answers, blocked while it does not or is missing, and no agreement asked", async () => {
    const deps = { mailStatus: async () => ({ configured: true, reachable: true }), readBackupStatus: async () => null };
    const aiCheck = async () => goLiveChecks(await loadGoLiveInput(local.id, new Date(), deps)).find((c) => c.key === "ai");
    expect(await aiCheck()).toMatchObject({ state: "done", line: "settingsGoLive.lineAiLocal" });
    expect(seen.map((s) => [s.method, s.url])).toEqual([["GET", "/health"]]);
    healthy = false;
    expect(await brainHealth()).toBe("down");
    expect(await aiCheck()).toMatchObject({ state: "unknown", line: "settingsGoLive.lineAiLocalDown" });
    delete process.env.BRAIN_API_KEY;
    expect(await aiCheck()).toMatchObject({ state: "needs", line: "settingsGoLive.lineAiLocalNoBrain" });
  });

  it("the other choices read back as they were: an old compatible row keeps its endpoint and model, and asks for a DPA", async () => {
    const old = await sandbox("ail-old");
    await db.integration.create({
      data: { companyId: old.id, system: "ai", on: true, settings: { choice: "openai-compatible", region: "eu-central-1", model: "llama-x", endpoint: "https://llm.example/v1", deployment: null } },
    });
    await db.companyConfig.create({ data: { companyId: old.id, aiRouting: true, dpaSignedAt: null } });
    const ai = await loadAiSettings(old.id, "sandbox");
    expect(ai.settings).toEqual({ choice: "openai-compatible", region: "eu-central-1", model: "llama-x", endpoint: "https://llm.example/v1", deployment: null });
    expect(await gateFor(old.id, true)).toEqual({ on: false, why: expect.stringContaining("data-processing agreement") });
  });
});
