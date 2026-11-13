import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiGate } from "@/features/ai/gate";
import { aiSettings, type AiSettings } from "@/features/ai/settings";
import { askBrain, askBrainPlan } from "@/server/brain";

const compatible: AiSettings = { choice: "openai-compatible", region: "eu-central-1", model: "llama-x", endpoint: "https://llm.example/v1", deployment: null };
const azure: AiSettings = { choice: "azure-openai", region: "eu-central-1", model: "gpt", endpoint: "https://res.openai.azure.com/", deployment: "dep1" };
const DPA = new Date("2026-10-01");
const base = { stage: "pilot", hasDatabase: true, dpaSignedAt: DPA, assistantOn: true, aiRouting: true, budget: null };
const policy = { patterns: [], ceiling: "confidential" as const };
const ROUTE = { route_id: null, confidence: 0, reason: "-", same_as: null, related: null, model: "m", version: "v" };
const PLAN = { steps: ["a"], metric: null, model: "m", version: "v" };

function fakeFetch(answer: unknown) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(answer), { status: 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe("AIP brain gate", () => {
  beforeEach(() => { vi.stubEnv("BRAIN_URL", "http://brain:8000"); vi.stubEnv("BRAIN_API_KEY", "k"); });
  afterEach(() => vi.unstubAllEnvs());

  it("a sandbox company without a DPA makes no request", async () => {
    const { f, calls } = fakeFetch(ROUTE);
    const gate = aiGate({ ...base, stage: "sandbox", settings: compatible, dpaSignedAt: null, purpose: "routing" });
    expect(gate.on).toBe(false);
    expect(await askBrain(gate, "acme", { title: "Gauge reads off", body: "x" }, policy, { key: "sk", fetch: f })).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("with a DPA and aiRouting off routing makes no request, plan does", async () => {
    const { f, calls } = fakeFetch(PLAN);
    const routing = aiGate({ ...base, settings: compatible, purpose: "routing", aiRouting: false });
    const brain = aiGate({ ...base, settings: compatible, purpose: "brain", aiRouting: false });
    expect(routing.on).toBe(false);
    expect(brain.on).toBe(true);
    expect(await askBrain(routing, "acme", { title: "Gauge reads off", body: "x" }, policy, { key: "sk", fetch: f })).toBeNull();
    expect(calls).toHaveLength(0);
    // a case id that does not exist ends before the request; the gate itself let it through
    await askBrainPlan(brain, "acme", "nope", policy, { key: "sk", fetch: f });
    expect(calls).toHaveLength(0);
  });

  it("an openai-compatible company's body carries its endpoint, model and key", async () => {
    const { f, calls } = fakeFetch(ROUTE);
    const gate = aiGate({ ...base, stage: "demo", settings: compatible, purpose: "routing" });
    await askBrain(gate, "acme", { title: "Gauge reads off", body: "x" }, policy, { key: "sk-1", fetch: f });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://brain:8000/v1/route");
    expect(calls[0].body.llm).toEqual({ base_url: "https://llm.example/v1", model: "llama-x", api_key: "sk-1" });
  });

  it("an azure company's base_url is the endpoint's /openai/v1 and the model its deployment", async () => {
    const { f, calls } = fakeFetch(ROUTE);
    const gate = aiGate({ ...base, stage: "demo", settings: azure, purpose: "routing" });
    await askBrain(gate, "acme", { title: "Gauge reads off", body: "x" }, policy, { key: "sk-2", fetch: f });
    expect(calls[0].body.llm).toEqual({ provider: "azure-openai", base_url: "https://res.openai.azure.com/openai/v1", model: "dep1", api_key: "sk-2" });
  });

  it("a company without a key sends nothing", async () => {
    const { f, calls } = fakeFetch(ROUTE);
    const gate = aiGate({ ...base, stage: "demo", settings: compatible, purpose: "routing" });
    expect(await askBrain(gate, "acme", { title: "Gauge reads off", body: "x" }, policy, { key: null, fetch: f })).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("a demo company without a row sends no llm", async () => {
    const { f, calls } = fakeFetch(ROUTE);
    const gate = aiGate({ ...base, stage: "demo", settings: aiSettings(null, {}, "demo"), purpose: "routing" });
    await askBrain(gate, "acme", { title: "Gauge reads off", body: "x" }, policy, { fetch: f });
    expect(calls).toHaveLength(1);
    expect("llm" in calls[0].body).toBe(false);
  });
});

// Plan AGT, D21: the project agent's purpose follows the brain's rules, not the raise path's.
describe("AGT purpose", () => {
  const settings = compatible;
  const BUDGET = { capEur: 50, spentEur: 0, tokensUnpriced: 0, tokenCap: 1000 };
  const at = (pct: number) => ({ ...BUDGET, spentEur: (BUDGET.capEur * pct) / 100 });

  it("on a real stage with a signed DPA the gate is on for agent, as for brain", () => {
    const agent = aiGate({ ...base, settings, purpose: "agent" });
    expect(agent).toEqual({ on: true, settings });
    expect(aiGate({ ...base, settings, purpose: "brain" })).toEqual(agent);
  });

  it("agent has no switch of its own: the assistant and routing switches do not close it", () => {
    expect(aiGate({ ...base, settings, purpose: "agent", assistantOn: false, aiRouting: false }).on).toBe(true);
  });

  it("without the DPA the gate is closed for agent, with the words of every other purpose", () => {
    const g = aiGate({ ...base, settings, purpose: "agent", dpaSignedAt: null });
    expect(g).toEqual({ on: false, why: expect.stringContaining("data-processing agreement") });
  });

  it("at 100 % of the month's budget it is off for agent and brain and on for routing until 120 %", () => {
    expect(aiGate({ ...base, settings, purpose: "agent", budget: at(99) }).on).toBe(true);
    for (const purpose of ["agent", "brain"] as const) {
      const g = aiGate({ ...base, settings, purpose, budget: at(100) });
      expect(g, purpose).toEqual({ on: false, why: expect.stringContaining("used up") });
      expect(aiGate({ ...base, settings, purpose, budget: at(110) }).on, purpose).toBe(false);
    }
    expect(aiGate({ ...base, settings, purpose: "routing", budget: at(100) }).on).toBe(true);
    expect(aiGate({ ...base, settings, purpose: "routing", budget: at(119) }).on).toBe(true);
    expect(aiGate({ ...base, settings, purpose: "routing", budget: at(120) }).on).toBe(false);
  });

  it("the token cap of a model without a price stops agent too", () => {
    expect(aiGate({ ...base, settings, purpose: "agent", budget: { ...BUDGET, tokensUnpriced: 1000 } })).toEqual({ on: false, why: expect.stringContaining("token limit") });
  });
});
