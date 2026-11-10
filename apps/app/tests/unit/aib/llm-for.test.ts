import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiGate } from "@/features/ai/gate";
import type { AiSettings } from "@/features/ai/settings";
import { askBrain, llmFor } from "@/server/brain";

const bedrock: AiSettings = { choice: "bedrock", region: "eu-central-1", model: "stack-model", endpoint: null, deployment: null };
const azure: AiSettings = { choice: "azure-openai", region: "eu-central-1", model: "gpt", endpoint: "https://res.openai.azure.com/", deployment: "dep1" };
const compatible: AiSettings = { choice: "openai-compatible", region: "eu-central-1", model: "llama-x", endpoint: "https://llm.example/v1/", deployment: null };

describe("AIB llmFor", () => {
  it("gives the Bedrock override only with a brainModel", () => {
    expect(llmFor(bedrock, null)).toBe("none");
    expect(llmFor({ ...bedrock, brainModel: "" }, null)).toBe("none");
    expect(llmFor({ ...bedrock, brainModel: "anthropic.claude-haiku-5-5" }, null)).toEqual({
      provider: "bedrock", region: "eu-central-1", model: "anthropic.claude-haiku-5-5",
    });
  });

  it("gives the Azure override with brainModel winning over the deployment", () => {
    expect(llmFor(azure, "k")).toEqual({ provider: "azure-openai", base_url: "https://res.openai.azure.com/openai/v1", model: "dep1", api_key: "k" });
    expect(llmFor({ ...azure, brainModel: "dep2" }, "k")).toMatchObject({ provider: "azure-openai", model: "dep2" });
  });

  it("gives the compatible override with brainModel winning over the model", () => {
    expect(llmFor(compatible, "k")).toEqual({ base_url: "https://llm.example/v1", model: "llama-x", api_key: "k" });
    expect(llmFor({ ...compatible, brainModel: "llama-y" }, "k")).toEqual({ base_url: "https://llm.example/v1", model: "llama-y", api_key: "k" });
  });

  it("gives null for incomplete settings and none for the rest", () => {
    expect(llmFor(azure, null)).toBeNull();
    expect(llmFor({ ...azure, deployment: null, brainModel: "x" }, "k")).toBeNull();
    expect(llmFor({ ...azure, endpoint: null }, "k")).toBeNull();
    expect(llmFor({ ...compatible, endpoint: null }, "k")).toBeNull();
    expect(llmFor({ ...compatible, model: "" }, "k")).toBeNull();
    expect(llmFor({ ...bedrock, choice: "mock" }, "k")).toBe("none");
  });

  describe("with the gate", () => {
    beforeEach(() => { vi.stubEnv("BRAIN_URL", "http://brain:8000"); vi.stubEnv("BRAIN_API_KEY", "k"); });
    afterEach(() => vi.unstubAllEnvs());

    it("a closed gate sends nothing", async () => {
      const f = vi.fn() as unknown as typeof fetch;
      const gate = aiGate({
        stage: "sandbox", hasDatabase: true, dpaSignedAt: null, assistantOn: true, aiRouting: true, budget: null,
        settings: { ...bedrock, brainModel: "anthropic.claude-haiku-5-5" }, purpose: "routing",
      });
      expect(gate.on).toBe(false);
      const policy = { patterns: [], ceiling: "confidential" as const };
      expect(await askBrain(gate, "acme", { title: "Gauge reads off", body: "x" }, policy, { fetch: f })).toBeNull();
      expect(f).not.toHaveBeenCalled();
    });
  });
});
