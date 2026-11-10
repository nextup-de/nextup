import { describe, expect, it } from "vitest";
import { aiGate } from "@/features/ai/gate";
import { aiSettings, type AiSettings } from "@/features/ai/settings";
import { assistGate } from "@/features/assist/gate";

const bedrock: AiSettings = { choice: "bedrock", region: "eu-central-1", model: "m", endpoint: null, deployment: null };
const off: AiSettings = { ...bedrock, choice: "off" };
const DPA = new Date("2026-10-01");
const real = { stage: "pilot", hasDatabase: true, settings: bedrock, dpaSignedAt: DPA, purpose: "assist" as const, assistantOn: true, aiRouting: true, budget: null };

describe("AIP gate", () => {
  it("settings: a demo company without a row follows the environment, any other stage is off", () => {
    expect(aiSettings(null, { LLM_PROVIDER: "bedrock", LLM_MODEL: "claude-x", LLM_REGION: "eu-west-1" }, "demo")).toMatchObject({ choice: "bedrock", model: "claude-x", region: "eu-west-1" });
    expect(aiSettings(null, { LLM_PROVIDER: "bedrock", LLM_MODEL: "claude-x" }, "demo").region).toBe("eu-central-1");
    expect(aiSettings(null, {}, "demo").choice).toBe("mock");
    expect(aiSettings(null, { LLM_PROVIDER: "bedrock" }, "demo").choice).toBe("mock");
    expect(aiSettings(null, { LLM_PROVIDER: "bedrock", LLM_MODEL: "claude-x" }, "sandbox").choice).toBe("off");
  });

  it("settings: a row wins; an unknown choice is off", () => {
    const row = { on: true, settings: { choice: "azure-openai", model: "gpt", endpoint: "https://x.example", deployment: "d" } };
    expect(aiSettings(row, { LLM_PROVIDER: "bedrock", LLM_MODEL: "m" }, "demo")).toEqual({ choice: "azure-openai", region: "eu-central-1", model: "gpt", endpoint: "https://x.example", deployment: "d" });
    expect(aiSettings({ on: true, settings: { choice: "skynet" } }, {}, "demo").choice).toBe("off");
    expect(aiSettings({ on: false, settings: { choice: "bedrock" } }, {}, "demo").choice).toBe("off");
  });

  it("gate: no database means the mock, and only in a demo stage", () => {
    expect(aiGate({ ...real, stage: "demo", hasDatabase: false })).toEqual({ on: true, settings: { ...bedrock, choice: "mock" } });
    expect(aiGate({ ...real, hasDatabase: false }).on).toBe(false);
  });

  it("gate: a real company needs the DPA for any model but the mock", () => {
    expect(aiGate({ ...real, dpaSignedAt: null })).toMatchObject({ on: false, why: expect.stringContaining("agreement") });
    expect(aiGate(real)).toEqual({ on: true, settings: bedrock });
    expect(aiGate({ ...real, settings: { ...bedrock, choice: "mock" }, dpaSignedAt: null }).on).toBe(true);
  });

  it("gate: off is off for every purpose", () => {
    for (const purpose of ["assist", "routing", "coach", "brain"] as const) {
      expect(aiGate({ ...real, settings: off, purpose })).toMatchObject({ on: false, why: expect.any(String) });
    }
  });

  it("gate: routing needs aiRouting, assist needs the assistant switch", () => {
    expect(aiGate({ ...real, purpose: "routing", aiRouting: false }).on).toBe(false);
    expect(aiGate({ ...real, purpose: "routing" }).on).toBe(true);
    expect(aiGate({ ...real, purpose: "assist", assistantOn: false }).on).toBe(false);
    expect(aiGate({ ...real, purpose: "coach", assistantOn: false, aiRouting: false }).on).toBe(true);
  });

  it("assistGate answers as before for assist", () => {
    const base = { stage: "pilot", hasDatabase: true, configured: "bedrock" as const, enabled: true, dpaSignedAt: new Date() };
    expect(assistGate(base)).toEqual({ on: true, provider: "bedrock" });
    expect(assistGate({ ...base, enabled: false }).on).toBe(false);
    expect(assistGate({ ...base, dpaSignedAt: null }).on).toBe(false);
    expect(assistGate({ ...base, configured: "mock", dpaSignedAt: null })).toEqual({ on: true, provider: "mock" });
    expect(assistGate({ ...base, stage: "whatever", enabled: false }).on).toBe(false);
    expect(assistGate({ stage: "demo", hasDatabase: false, configured: "bedrock", enabled: false, dpaSignedAt: null })).toEqual({ on: true, provider: "mock" });
    expect(assistGate({ stage: "live", hasDatabase: false, configured: "bedrock", enabled: true, dpaSignedAt: new Date() }).on).toBe(false);
  });
});
