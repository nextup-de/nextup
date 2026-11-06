// AIP acceptance (docs/ASSISTANT.md): the routing proposal is made on the server, the core loop works
// with the AI off, and without a signed DPA no model is called. Real Postgres, sandbox companies
// from the demo template, and two local fakes: an OpenAI-compatible model and a brain that forwards
// to the model it is told about. No real model is called.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { aiGate } from "@/features/ai/gate";
import { emptyLog, type EventPayload } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { stampEvent } from "@/features/cases/stamp";
import { assistGate } from "@/features/assist/gate";
import { DEMO_GOALS } from "@/features/demo/structure";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { seedFor } from "@/features/demo";
import { rowsFromSeed } from "@/features/knowledge";
import { saveAiSettings, loadAiSettings } from "@/lib/db/ai";
import { loadAssistSettings, loadAiRouting } from "@/lib/db/assist";
import { getDb } from "@/lib/db/client";
import { appendEventRow, loadLogForSlug } from "@/lib/db/events";
import { replaceKnowledge } from "@/lib/db/knowledge";
import { proposeOnRaise } from "@/server/routing";

const db = getDb();
const BRAIN_KEY = "brain-key";
const MODEL_KEY = "model-key";

type Fake = { server: Server; url: string; requests: { url: string; body: unknown; headers: IncomingMessage["headers"] }[] };

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
}

async function listen(handler: (req: IncomingMessage, res: ServerResponse, body: unknown) => Promise<void> | void): Promise<Fake> {
  const requests: Fake["requests"] = [];
  const server = createServer((req, res) => {
    void (async () => {
      const body = await readJson(req);
      requests.push({ url: req.url ?? "", body, headers: req.headers });
      await handler(req, res, body);
    })().catch(() => { res.statusCode = 500; res.end(); });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, requests };
}

const json = (res: ServerResponse, body: unknown) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(body)); };

let model: Fake;
let brain: Fake;
let off: { id: string };
let on: { id: string };
let noDpa: { id: string };
const saved = { url: process.env.BRAIN_URL, key: process.env.BRAIN_API_KEY, vault: process.env.CONNECTOR_VAULT_KEY };

async function sandbox(slug: string) {
  const c = await db.company.create({ data: { slug, name: slug, stage: "sandbox", seedJson: toSeedJson(SEED) as object } });
  await replaceKnowledge(c.id, rowsFromSeed(SEED, DEMO_GOALS, () => randomUUID()));
  return c;
}

const compatible = () => ({ choice: "openai-compatible" as const, region: "eu-central-1", model: "fake-model", endpoint: model.url + "/v1", deployment: null });

// The raise path of server/actions/events.ts: stamp the seat, replace the proposal on the server, append.
async function raise(slug: string, companyId: string, routeId: string) {
  const seed = await seedFor(slug);
  const sent: EventPayload = {
    title: "Our sensor order is stuck", body: "need to buy a part", routeId, fromDept: "d1",
    proposal: { routeId: "r9", confidence: 99, source: "llm", version: "forged" },
  };
  const stamped = stampEvent("case.raised", sent, seed);
  const stored = { ...stamped, proposal: await proposeOnRaise(slug, companyId, stamped) };
  const id = randomUUID();
  const res = await appendEventRow(companyId, { id, day: 0, type: "case.raised", actor: "Test", targetId: id, payload: stored });
  expect(res.ok).toBe(true);
  const log = (await loadLogForSlug(slug)) ?? emptyLog();
  const row = await db.caseEvent.findFirstOrThrow({ where: { id, companyId } });
  return { id, seed, stored: row.payload as EventPayload, state: reduce(seed, log) };
}

beforeAll(async () => {
  process.env.CONNECTOR_VAULT_KEY = "cd".repeat(32);
  await db.company.deleteMany({});
  // The model: an OpenAI-compatible chat completion that always picks route r2.
  model = await listen((_req, res) => json(res, {
    id: "c1", object: "chat.completion", created: 0, model: "fake-model",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify({ route_id: "r2", confidence: 80, reason: "a rig", same_as: null, related: null }) } }],
  }));
  // The brain: takes /v1/route with the company's `llm`, asks that model, answers in the brain's shape.
  brain = await listen(async (req, res, body) => {
    const llm = (body as { llm?: { base_url: string; model: string; api_key: string } } | null)?.llm;
    if (req.headers["x-api-key"] !== BRAIN_KEY || !llm) { res.statusCode = 401; res.end(); return; }
    const r = await fetch(llm.base_url + "/chat/completions", {
      method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + llm.api_key },
      body: JSON.stringify({ model: llm.model, messages: [{ role: "user", content: "route" }] }),
    });
    const said = JSON.parse(((await r.json()) as { choices: { message: { content: string } }[] }).choices[0].message.content) as Record<string, unknown>;
    json(res, { ...said, model: llm.model, version: "fake-brain-1" });
  });
  process.env.BRAIN_URL = brain.url;
  process.env.BRAIN_API_KEY = BRAIN_KEY;

  off = await sandbox("aip-off");
  on = await sandbox("aip-on");
  noDpa = await sandbox("aip-nodpa");
  for (const c of [on, noDpa]) await saveAiSettings(c.id, compatible(), MODEL_KEY, "t");
  await db.companyConfig.create({ data: { companyId: on.id, aiRouting: true, dpaSignedAt: new Date() } });
  await db.companyConfig.create({ data: { companyId: noDpa.id, aiRouting: true, assistant: true, dpaSignedAt: null } });
});

beforeEach(() => { model.requests.length = 0; brain.requests.length = 0; });

afterAll(async () => {
  for (const [k, v] of [["BRAIN_URL", saved.url], ["BRAIN_API_KEY", saved.key], ["CONNECTOR_VAULT_KEY", saved.vault]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  await db.company.deleteMany({});
  await db.$disconnect();
  await Promise.all([model, brain].map((f) => new Promise((resolve) => f.server.close(resolve))));
});

describe("AIP acceptance: proposal made on the server, off works, DPA gate holds", () => {
  it("choice off: the keyword proposal is stored, the case lands on its route's seat, no model request", async () => {
    expect((await loadAiSettings(off.id, "sandbox")).settings.choice).toBe("off");
    const r = await raise("aip-off", off.id, "r1");
    expect(r.stored.proposal).toMatchObject({ source: "keywords", version: "keywords-v2", routeId: "r1" });
    const seat = r.seed.routes.find((x) => x.id === "r1")?.ownerSeatId;
    expect(seat).toBeTruthy();
    expect(r.state.cases.find((c) => c.id === r.id)?.assigneeSeatId).toBe(seat);
    expect(model.requests).toHaveLength(0);
    expect(brain.requests).toHaveLength(0);
  });

  it("openai-compatible with a DPA and aiRouting: the stored proposal is the model's, via the brain", async () => {
    const r = await raise("aip-on", on.id, "r1");
    expect(r.stored.proposal).toMatchObject({ source: "llm", routeId: "r2", version: "fake-brain-1" });
    expect(r.stored.routeId).toBe("r1"); // the person's choice is untouched
    expect(brain.requests).toHaveLength(1);
    expect(brain.requests[0].url).toBe("/v1/route");
    expect(model.requests).toHaveLength(1);
    expect(model.requests[0].url).toBe("/v1/chat/completions");
    expect(model.requests[0].headers.authorization).toBe("Bearer " + MODEL_KEY);
    const seat = r.seed.routes.find((x) => x.id === "r1")?.ownerSeatId;
    expect(r.state.cases.find((c) => c.id === r.id)?.assigneeSeatId).toBe(seat);
  });

  it("the same choice without a DPA: no request reaches either fake, the proposal is keywords, the gate says why", async () => {
    const r = await raise("aip-nodpa", noDpa.id, "r1");
    expect(r.stored.proposal).toMatchObject({ source: "keywords", version: "keywords-v2" });
    expect(model.requests).toHaveLength(0);
    expect(brain.requests).toHaveLength(0);

    const [ai, assist, aiRouting] = await Promise.all([loadAiSettings(noDpa.id, "sandbox"), loadAssistSettings(noDpa.id), loadAiRouting(noDpa.id)]);
    expect(ai.settings.choice).toBe("openai-compatible");
    const routing = aiGate({ stage: "sandbox", hasDatabase: true, settings: ai.settings, dpaSignedAt: assist.dpaSignedAt, purpose: "routing", assistantOn: assist.enabled, aiRouting });
    expect(routing).toEqual({ on: false, why: expect.stringContaining("data-processing agreement") });
    const gate = assistGate({ stage: "sandbox", hasDatabase: true, configured: "bedrock", enabled: assist.enabled, dpaSignedAt: assist.dpaSignedAt });
    expect(gate.on).toBe(false);
    expect(gate.on ? "" : gate.why).toContain("data-processing agreement");
  });
});
