// REM-A2 (B1): no AI call without a model (plan REM). With Bedrock chosen and no brain model the one gate is closed, with its reason, for every purpose that calls the
// brain: routing, the studio's read and coach, plans, check-ins and the project agent. The assistant has its own model and is not asked for one. Off stays off.
import { expect, it, vi } from "vitest";
import { aiGate, NO_MODEL_WORDS, type AiPurpose } from "@/features/ai/gate";
import { aiSettings, noBrainModel, type AiSettings } from "@/features/ai/settings";
import { askBrain, askBrainCheckin, askBrainCoach, askBrainPlan, askBrainRead } from "@/server/brain";

const bedrock: AiSettings = { choice: "bedrock", region: "eu-central-1", model: "assistant-model", endpoint: null, deployment: null };
const base = { stage: "pilot", hasDatabase: true, dpaSignedAt: new Date("2026-10-01"), assistantOn: true, aiRouting: true, budget: null, stackBrain: true } as const;
/** The brain's purposes: routing, the coach (the studio's read and coach), the brain (plans and check-ins), the project agent. */
const BRAIN_PURPOSES: AiPurpose[] = ["routing", "coach", "brain", "agent"];
const policy = { patterns: [], ceiling: "confidential" } as const;

it("REM ai gate closes Bedrock without a model", async () => {
  for (const stage of ["pilot", "sandbox", "demo"]) {
    for (const purpose of BRAIN_PURPOSES) {
      const gate = aiGate({ ...base, stage, settings: bedrock, purpose });
      expect(gate, `${stage} ${purpose}`).toEqual({ on: false, reason: "no_model", why: NO_MODEL_WORDS });
    }
  }
  // An empty brain model is no model either.
  expect(aiGate({ ...base, settings: { ...bedrock, brainModel: "" }, purpose: "routing" })).toMatchObject({ on: false, reason: "no_model" });
  expect(noBrainModel(bedrock)).toBe(true);
  // The calls themselves send nothing: routing, read, coach, plan and check-in each answer null and never reach the network.
  const fetchSpy = vi.fn();
  const closed = aiGate({ ...base, settings: bedrock, purpose: "routing" });
  const readGate = aiGate({ ...base, settings: bedrock, purpose: "coach" });
  const plan = aiGate({ ...base, settings: bedrock, purpose: "brain" });
  const idea = { title: "Shorter changeover", body: "Pre-stage the tools." };
  const input = { idea, affected: 0, attachments: 0, skip: [], previous: null, audience: { userId: "u" } as never, locale: "en" as const };
  expect(await askBrain(closed, "acme", idea, policy, { fetch: fetchSpy })).toBeNull();
  expect(await askBrainRead(readGate, "acme", input, policy, undefined, { fetch: fetchSpy })).toBeNull();
  expect(await askBrainCoach(readGate, "acme", { idea, turns: [], reading: {} as never, audience: { userId: "u" } as never, locale: "en" }, policy, undefined, { fetch: fetchSpy })).toBeNull();
  expect(await askBrainPlan(plan, "acme", "c1", policy, { fetch: fetchSpy })).toBeNull();
  expect(await askBrainCheckin(plan, "acme", "c1", [], policy, { fetch: fetchSpy })).toBeNull();
  expect(fetchSpy).not.toHaveBeenCalled();
  // The old assistGate and its Gate type are gone: nothing asks the assistant's wrapper any more.
  await expect(import("@/features/assist/gate" as string)).rejects.toThrow();
});

it("REM ai gate open with a model", () => {
  const withModel = { ...bedrock, brainModel: "anthropic.claude-haiku-5-5" };
  for (const purpose of BRAIN_PURPOSES) expect(aiGate({ ...base, settings: withModel, purpose }), purpose).toEqual({ on: true, settings: withModel });
  expect(noBrainModel(withModel)).toBe(false);
  // The assistant answers on its own model: Bedrock without a brain model keeps it open.
  expect(aiGate({ ...base, settings: bedrock, purpose: "assist" })).toEqual({ on: true, settings: bedrock });
  // The other choices name their own model or run on this stack: the rule is Bedrock's alone.
  const azure: AiSettings = { choice: "azure-openai", region: "eu-central-1", model: "gpt", endpoint: "https://x.example", deployment: "d" };
  const compatible: AiSettings = { choice: "openai-compatible", region: "eu-central-1", model: "m", endpoint: "https://y.example", deployment: null };
  const local: AiSettings = { choice: "local", region: "eu-central-1", model: "", endpoint: null, deployment: null };
  for (const settings of [azure, compatible, local, { ...bedrock, choice: "mock" as const }]) {
    expect(noBrainModel(settings), settings.choice).toBe(false);
    expect(aiGate({ ...base, settings, purpose: "routing" }).on, settings.choice).toBe(true);
  }
  // A demo company's one model, from the environment, serves the brain too.
  const demo = aiSettings(null, { LLM_PROVIDER: "bedrock", LLM_MODEL: "claude-x" }, "demo");
  expect(demo).toMatchObject({ choice: "bedrock", model: "claude-x", brainModel: "claude-x" });
  expect(aiGate({ ...base, stage: "demo", settings: demo, purpose: "routing" }).on).toBe(true);
  // A saved row with a brain model is as open as the settings say.
  expect(aiSettings({ on: true, settings: { choice: "bedrock", brainModel: "anthropic.claude-haiku-5-5" } }, {}, "pilot").brainModel).toBe("anthropic.claude-haiku-5-5");
  expect(noBrainModel(aiSettings({ on: true, settings: { choice: "bedrock" } }, {}, "pilot"))).toBe(true);
});

it("REM ai off stays off", async () => {
  const off: AiSettings = { ...bedrock, choice: "off" };
  for (const purpose of BRAIN_PURPOSES) {
    // A real stage with the choice off says so, never that a model is missing; the brain's calls send nothing.
    const gate = aiGate({ ...base, settings: off, purpose });
    expect(gate, purpose).toEqual({ on: false, why: "AI is switched off for this company." });
    expect(gate).not.toHaveProperty("reason");
  }
  expect(noBrainModel(off)).toBe(false);
  expect(aiSettings(null, {}, "pilot")).toMatchObject({ choice: "off" });
  expect(aiSettings({ on: false, settings: { choice: "bedrock", brainModel: "m" } }, {}, "pilot").choice).toBe("off");
  const fetchSpy = vi.fn();
  const gate = aiGate({ ...base, settings: off, purpose: "routing" });
  expect(await askBrain(gate, "acme", { title: "t", body: "b" }, policy, { fetch: fetchSpy })).toBeNull();
  expect(await askBrainPlan(gate, "acme", "c1", policy, { fetch: fetchSpy })).toBeNull();
  expect(await askBrainCheckin(gate, "acme", "c1", [], policy, { fetch: fetchSpy })).toBeNull();
  expect(fetchSpy).not.toHaveBeenCalled();
});
