// AIB contract: the `llm` object the app sends for each provider is exactly the shared fixture,
// which the brain's own test (services/brain/tests/test_llm_contract.py) feeds to its request models.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiSettings } from "@/features/ai/settings";
import { askBrain, llmFor } from "@/server/brain";

const FIXTURE = JSON.parse(readFileSync(join(__dirname, "../../../../../services/brain/tests/fixtures/llm-overrides.json"), "utf8")) as Record<string, unknown>;
const KEY = "fixture-key-not-real";

const SETTINGS: Record<string, AiSettings> = {
  bedrock: { choice: "bedrock", region: "eu-central-1", model: "stack-model", endpoint: null, deployment: null, brainModel: "anthropic.claude-haiku-5-5" },
  "azure-openai": { choice: "azure-openai", region: "eu-central-1", model: "", endpoint: "https://res.openai.azure.com/", deployment: "dep-brain" },
  "openai-compatible": { choice: "openai-compatible", region: "eu-central-1", model: "llama-brain", endpoint: "https://llm.example/v1/", deployment: null },
};

describe("AIB contract", () => {
  beforeEach(() => { vi.stubEnv("BRAIN_URL", "http://brain:8000"); vi.stubEnv("BRAIN_API_KEY", "k"); });
  afterEach(() => vi.unstubAllEnvs());

  it("the fixture names exactly the three providers", () => {
    expect(Object.keys(FIXTURE).sort()).toEqual(Object.keys(SETTINGS).sort());
  });

  for (const provider of Object.keys(SETTINGS)) {
    it(`${provider}: llmFor gives the fixture`, () => {
      expect(llmFor(SETTINGS[provider], KEY)).toEqual(FIXTURE[provider]);
    });

    it(`${provider}: the body sent to the brain carries the fixture as llm`, async () => {
      let sent: unknown = null;
      const f = vi.fn(async (_url: unknown, init?: RequestInit) => {
        sent = JSON.parse(String(init?.body));
        return new Response("{}", { status: 500 });
      }) as unknown as typeof fetch;
      const gate = { on: true as const, settings: SETTINGS[provider] };
      const policy = { patterns: [], ceiling: "confidential" as const };
      await askBrain(gate, "acme", { title: "Gauge reads off", body: "x" }, policy, { key: KEY, fetch: f });
      expect((sent as { llm?: unknown } | null)?.llm).toEqual(FIXTURE[provider]);
    });
  }
});
