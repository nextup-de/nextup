// The Claude API as the company's provider (`anthropic`): Claude through Anthropic's own API with the company's key,
// on the same code as Bedrock. Demo companies only - the gate and go-live say so; the key is never in a log.
import { describe, expect, it, vi } from "vitest";
import { aiGate } from "@/features/ai/gate";
import { DEFAULT_ANTHROPIC_MODEL, needsKey, type AiSettings } from "@/features/ai/settings";
import { aiStatus } from "@/features/connectors/status";
import { anthropicComplete, anthropicStreaming } from "@/server/ai/anthropic";
import type { ClaudeClient } from "@/server/ai/bedrock";
import { llmFor } from "@/server/brain";

const claude: AiSettings = { choice: "anthropic", region: "eu-central-1", model: "", endpoint: null, deployment: null };
const req = { companyId: "c1", purpose: "coach" as const, system: "sys", messages: [{ role: "user" as const, text: "hi" }], maxTokens: 100 };
const DPA = new Date("2026-10-01");
const gateIn = { hasDatabase: true, settings: claude, dpaSignedAt: DPA, purpose: "assist" as const, assistantOn: true, aiRouting: true, budget: null };

const message = { content: [{ type: "text", text: "hello" }], model: "claude-opus-5-5", stop_reason: "end_turn", usage: { input_tokens: 7, output_tokens: 3, cache_read_input_tokens: 2, cache_creation_input_tokens: 0 } };

/** A client that answers like Anthropic's: create() for `complete`, stream() for the assistant. */
function fakeClient() {
  const create = vi.fn(async () => message);
  const stream = vi.fn(() => {
    const handlers: ((t: string) => void)[] = [];
    return {
      on: (_e: "text", h: (t: string) => void) => { handlers.push(h); },
      finalMessage: async () => { handlers.forEach((h) => h("hello")); return message; },
    };
  });
  return { client: { messages: { create, stream } } as unknown as ClaudeClient, create, stream };
}

describe("the Claude API choice", () => {
  it("completes with the default model when none is saved, and counts cached tokens in", async () => {
    const f = fakeClient();
    const r = await anthropicComplete(claude, "k", req, f.client);
    expect(f.create).toHaveBeenCalledWith(expect.objectContaining({ model: DEFAULT_ANTHROPIC_MODEL, max_tokens: 100, system: "sys" }));
    expect(r).toEqual({ text: "hello", model: "claude-opus-5-5", tokensIn: 9, tokensOut: 3 });
  });

  it("uses the saved model, streams for the assistant and says it is the anthropic provider", async () => {
    const f = fakeClient();
    const p = anthropicStreaming({ ...claude, model: "claude-sonnet-5-5" }, "k", f.client);
    expect(p.id).toBe("anthropic");
    const seen: string[] = [];
    const out = await p.run({ system: "s", history: [], question: "q", tools: [], onText: (t: string) => seen.push(t), runTool: async () => "", signal: new AbortController().signal } as unknown as Parameters<typeof p.run>[0]);
    expect(f.stream).toHaveBeenCalledWith(expect.objectContaining({ model: "claude-sonnet-5-5" }), expect.anything());
    expect(out.text).toBe("hello");
    expect(seen.join("")).toBe("hello");
  });

  it("refuses to build a client without a key", () => {
    expect(() => anthropicStreaming(claude, null)).toThrow("The API key is not set.");
  });

  it("is open in the demo stage and closed in every other, whatever is signed", () => {
    expect(aiGate({ ...gateIn, stage: "demo" }).on).toBe(true);
    for (const stage of ["sandbox", "pilot", "live"]) {
      const g = aiGate({ ...gateIn, stage });
      expect(g.on, stage).toBe(false);
      if (!g.on) expect(g.why).toContain("demo companies only");
    }
  });

  it("needs its key, like the other hosted choices", () => {
    expect(needsKey("anthropic")).toBe(true);
    expect(needsKey("bedrock")).toBe(false);
    expect(aiStatus({ choice: "anthropic", key: "not set", vault: true })).toBe("needs");
    expect(aiStatus({ choice: "anthropic", key: "set", vault: true })).toBe("on");
  });

  it("hands the brain its key and model, the brain model first", () => {
    expect(llmFor(claude, null)).toBeNull();
    expect(llmFor(claude, "k")).toEqual({ provider: "anthropic", model: DEFAULT_ANTHROPIC_MODEL, api_key: "k" });
    expect(llmFor({ ...claude, model: "claude-opus-5-5", brainModel: "claude-haiku-5-5" }, "k")).toEqual({ provider: "anthropic", model: "claude-haiku-5-5", api_key: "k" });
  });
});
