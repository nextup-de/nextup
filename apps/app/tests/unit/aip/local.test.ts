// Q8.4: the model on this stack, the fifth AI choice (`local`). No endpoint, no key, no data-processing agreement;
// every call goes to the stack's brain; without one the choice says so instead of failing silently.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AI_PROVIDER_CHOICES, AiProviderChoice } from "@nextup/contracts/public";
import { aiGate } from "@/features/ai/gate";
import { aiSettings, type AiSettings } from "@/features/ai/settings";
import { aiStatus } from "@/features/connectors/status";
import { goLiveChecks, type GoLiveInput } from "@/features/pilot/go-live";
import { setupPhases, type SetupFacts } from "@/features/settings/setup-phases";
import { aiBlockView } from "@/components/admin/connectors/views";
import { adminConnectors } from "@/i18n/messages/adminConnectors";
import { settingsGoLive } from "@/i18n/messages/settingsGoLive";
import { aiProviderFor, streamingFor } from "@/server/ai";
import { llmFor } from "@/server/brain";
import { brainHealth, brainTarget } from "@/server/brain-health";

const LOCAL: AiSettings = { choice: "local", region: "eu-central-1", model: "", endpoint: null, deployment: null };
const pilot = { stage: "pilot", hasDatabase: true, settings: LOCAL, dpaSignedAt: null, purpose: "routing" as const, assistantOn: true, aiRouting: true, budget: null };
const BUDGET = { capEur: 50, spentEur: 0, tokensUnpriced: 0, tokenCap: 1000 };
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("Q8.4 contract and settings", () => {
  it("is a fifth choice next to the four, which stay as they were", () => {
    expect(AI_PROVIDER_CHOICES).toEqual(["bedrock", "azure-openai", "openai-compatible", "off", "local"]);
    expect(AiProviderChoice.parse("local")).toBe("local");
  });

  it("reads a saved row back as local", () => {
    expect(aiSettings({ on: true, settings: { choice: "local" } }, {}, "pilot")).toEqual(LOCAL);
    expect(aiSettings({ on: false, settings: { choice: "local" } }, {}, "pilot").choice).toBe("off");
  });
});

describe("Q8.4 gate", () => {
  it("needs no data-processing agreement, in every purpose", () => {
    for (const purpose of ["assist", "routing", "coach", "brain"] as const) {
      expect(aiGate({ ...pilot, purpose, stackBrain: true })).toEqual({ on: true, settings: LOCAL });
    }
  });

  it("needs the stack's brain: without one (or not said) it is closed and says why, in a demo stage too", () => {
    expect(aiGate(pilot)).toEqual({ on: false, why: expect.stringContaining("no brain service") });
    expect(aiGate({ ...pilot, stackBrain: false, stage: "demo" })).toEqual({ on: false, why: expect.stringContaining("no brain service") });
  });

  it("keeps the other switches and the monthly budget", () => {
    expect(aiGate({ ...pilot, stackBrain: true, aiRouting: false }).on).toBe(false);
    expect(aiGate({ ...pilot, stackBrain: true, purpose: "assist", assistantOn: false }).on).toBe(false);
    expect(aiGate({ ...pilot, stackBrain: true, budget: { ...BUDGET, tokensUnpriced: 1200 } })).toEqual({ on: false, why: expect.stringContaining("token limit") });
    expect(aiGate({ ...pilot, stackBrain: true, purpose: "assist", budget: { ...BUDGET, spentEur: 60 } })).toEqual({ on: false, why: expect.stringContaining("used up") });
    expect(aiGate({ ...pilot, stackBrain: true, purpose: "brain", budget: { ...BUDGET, tokensUnpriced: 1000 } })).toEqual({ on: false, why: expect.stringContaining("token limit") });
  });

  it("leaves the other choices as they were: a brain does not stand in for their agreement", () => {
    const bedrock: AiSettings = { ...LOCAL, choice: "bedrock", model: "m", brainModel: "bm" };
    expect(aiGate({ ...pilot, settings: bedrock, stackBrain: true })).toEqual({ on: false, why: expect.stringContaining("data-processing agreement") });
  });
});

describe("Q8.4 every call goes to the stack's brain", () => {
  beforeEach(() => { vi.stubEnv("BRAIN_URL", "http://brain:8000/"); vi.stubEnv("BRAIN_API_KEY", "bk"); });
  afterEach(() => vi.unstubAllEnvs());

  it("the brain's own calls carry no model of the company's, whatever else was saved", () => {
    expect(llmFor({ ...LOCAL, endpoint: "https://llm.example/v1", model: "x", brainModel: "y" }, "k")).toBe("none");
  });

  it("the context draft completes at the brain with the stack's key, never a saved endpoint or key", async () => {
    const f = vi.fn(async () => ok({ model: "mistral-nemo", choices: [{ message: { content: "draft" } }], usage: { prompt_tokens: 4, completion_tokens: 2 } }));
    const p = aiProviderFor({ ...LOCAL, endpoint: "https://llm.example/v1" }, "company-key", f)!;
    expect(p.info).toMatchObject({ kind: "AiProvider", id: "local" });
    const r = await p.complete({ companyId: "c1", purpose: "brain", system: "s", messages: [{ role: "user", text: "hi" }], maxTokens: 50 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://brain:8000/v1/chat/completions");
    expect(init.headers).toEqual({ "content-type": "application/json", "x-api-key": "bk" });
    expect(JSON.parse(init.body as string).model).toBe("stack");
    expect(r).toEqual({ text: "draft", model: "mistral-nemo", tokensIn: 4, tokensOut: 2 });
  });

  it("the assistant streams from the brain", async () => {
    const f = vi.fn(async () => new Response(`data: ${JSON.stringify({ model: "mistral-nemo", choices: [{ delta: { content: "Hi." } }], usage: { prompt_tokens: 3, completion_tokens: 1 } })}\n\ndata: [DONE]\n\n`, { status: 200 }));
    const provider = streamingFor(LOCAL, null, f);
    expect(provider.id).toBe("local");
    const out = await provider.run({ system: "s", history: [], question: "q", tools: [], runTool: async () => "", onText: () => {} });
    expect(out).toEqual({ text: "Hi.", model: "mistral-nemo", tokensIn: 3, tokensOut: 1 });
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("http://brain:8000/v1/chat/completions");
  });

  it("without a brain the adapter refuses before any request", async () => {
    vi.stubEnv("BRAIN_URL", "");
    const f = vi.fn(async () => ok({}));
    await expect(aiProviderFor(LOCAL, null, f)!.complete({ companyId: "c1", purpose: "brain", system: "s", messages: [{ role: "user", text: "hi" }], maxTokens: 5 })).rejects.toThrow();
    expect(f).not.toHaveBeenCalled();
  });
});

describe("Q8.4 brain health", () => {
  it("is none without BRAIN_URL or BRAIN_API_KEY, and asks nothing", async () => {
    const f = vi.fn(async () => ok({ status: "ok" })) as unknown as typeof fetch;
    expect(brainTarget({ BRAIN_URL: "http://brain:8000" })).toBeNull();
    expect(await brainHealth({ BRAIN_API_KEY: "k" }, f)).toBe("none");
    expect(f).not.toHaveBeenCalled();
  });

  it("is ok only when the brain says ok, down for degraded, an error status or no answer", async () => {
    const env = { BRAIN_URL: "http://brain:8000/", BRAIN_API_KEY: "k" };
    const said = (r: Response | Error) => vi.fn(async () => { if (r instanceof Error) throw r; return r; }) as unknown as typeof fetch;
    const f = said(ok({ status: "ok" }));
    expect(await brainHealth(env, f)).toBe("ok");
    expect((f as unknown as { mock: { calls: [string][] } }).mock.calls[0][0]).toBe("http://brain:8000/health");
    expect(await brainHealth(env, said(ok({ status: "degraded" })))).toBe("down");
    expect(await brainHealth(env, said(new Response("no", { status: 502 })))).toBe("down");
    expect(await brainHealth(env, said(new Error("ECONNREFUSED")))).toBe("down");
  });
});

describe("Q8.4 console and go-live", () => {
  it("the console status: on with a brain that answers, needs you without one, an error when it does not answer", () => {
    expect(aiStatus({ choice: "local", key: "not set", vault: false, brain: "ok" })).toBe("on");
    expect(aiStatus({ choice: "local", key: "not set", vault: false, brain: "none" })).toBe("needs");
    expect(aiStatus({ choice: "local", key: "not set", vault: false })).toBe("needs");
    expect(aiStatus({ choice: "local", key: "set", vault: true, brain: "down" })).toBe("error");
    expect(aiStatus({ choice: "openai-compatible", key: "set", vault: true, brain: "none" })).toBe("on");
    expect(aiBlockView(LOCAL, false, false, [], "ok")).toMatchObject({ choice: "local", brain: "ok", endpoint: "" });
  });

  const GO: GoLiveInput = {
    now: new Date("2026-11-11T12:00:00Z"), units: [{ name: "Plant" }], roles: [{ title: "Lead", holders: 1 }], routes: [{ key: "spend", ownerHasUser: true }],
    hasCalendar: true, people: { active: 2, canSignIn: 2 }, microsoftOn: true, managers: { withCode: 1, withTotp: 1 }, mail: "ok",
    ai: { choice: "local", dpaSignedAt: null, brain: "ok" }, backup: { at: new Date("2026-11-11T11:00:00Z"), offbox: true }, supportOpenUntil: null,
    notifications: true, directory: null, recipients: 1, baseline: true, agreements: {},
  };
  const ai = (brain?: "ok" | "none" | "down") => goLiveChecks({ ...GO, ai: { choice: "local", dpaSignedAt: null, ...(brain ? { brain } : {}) } }).find((c) => c.key === "ai");

  it("go-live: done with no agreement while the brain answers; blocked when it is missing or silent", () => {
    expect(ai("ok")).toMatchObject({ level: "needed", state: "done", line: "settingsGoLive.lineAiLocal" });
    expect(ai("down")).toMatchObject({ state: "unknown", line: "settingsGoLive.lineAiLocalDown" });
    expect(ai("none")).toMatchObject({ state: "needs", line: "settingsGoLive.lineAiLocalNoBrain" });
    expect(ai()).toMatchObject({ state: "needs", line: "settingsGoLive.lineAiLocalNoBrain" });
  });

  it("the setup overview says the same, with no date to fill in", () => {
    const facts = (brain: "ok" | "none" | "down", status: "on" | "needs" | "error"): SetupFacts => ({
      viewer: "both", prefix: "/acme", goLive: { ...GO, ai: { choice: "local", dpaSignedAt: null, brain } },
      it: { consoleBase: "/admin", admins: 1, connectors: { m365: "on", jira: "on", ai: status, directory: "on", teams: "on" }, declined: {} },
      counts: { named: true, units: 1, seats: 1, routes: 1, members: 2 }, openedAt: null, context: "notUsed",
    });
    const line = (f: SetupFacts) => setupPhases(f).find((p) => p.key === "connectors")?.lines.find((l) => l.key === "ai");
    expect(line(facts("ok", "on"))).toEqual({ key: "ai", status: "done", line: "settingsSetupPhases.lineAiLocal" });
    expect(line(facts("none", "needs"))).toMatchObject({ status: "yourTurn", line: "settingsSetupPhases.lineAiLocalNoBrain" });
    expect(line(facts("down", "error"))).toMatchObject({ status: "problem", line: "settingsSetupPhases.lineAiLocalDown" });
  });

  it("says it in German and English", () => {
    const all = JSON.stringify([adminConnectors, settingsGoLive]);
    expect(all).toContain("Model on this stack · nothing leaves the server");
    expect(all).toContain("Modell auf diesem Stack · nichts verlässt den Server");
  });
});
