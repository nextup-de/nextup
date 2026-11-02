import { describe, expect, it, vi } from "vitest";
import { aiProviderFor, streamingFor } from "@/server/ai";
import type { AiSettings } from "@/features/ai/settings";
import type { ProviderRun } from "@/features/assist";

const base: AiSettings = { choice: "openai-compatible", region: "eu-central-1", model: "gpt-x", endpoint: "https://llm.example/v1", deployment: null };
const azure: AiSettings = { ...base, choice: "azure-openai", endpoint: "res.openai.azure.com", deployment: "dep1" };
const req = { companyId: "c1", purpose: "coach" as const, system: "sys", messages: [{ role: "user" as const, text: "hi" }], maxTokens: 100 };
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const answer = { model: "gpt-x", choices: [{ message: { content: "hello" } }], usage: { prompt_tokens: 7, completion_tokens: 3 } };

const sse = (...chunks: unknown[]) =>
  new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n", { status: 200 });

describe("AIP adapters", () => {
  it("openai-compatible posts to <endpoint>/chat/completions with a bearer key and the model", async () => {
    const f = vi.fn(async () => ok(answer));
    const r = await aiProviderFor(base, "k", f)!.complete(req);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://llm.example/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer k");
    expect(JSON.parse(init.body as string).model).toBe("gpt-x");
    expect(r).toEqual({ text: "hello", model: "gpt-x", tokensIn: 7, tokensOut: 3 });
  });

  it("azure-openai posts to the v1 path with api-key and the deployment as the model", async () => {
    const f = vi.fn(async () => ok(answer));
    const p = aiProviderFor(azure, "k", f)!;
    expect(p.info).toMatchObject({ kind: "AiProvider", id: "azure-openai" });
    await p.complete(req);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://res.openai.azure.com/openai/v1/chat/completions");
    expect((init.headers as Record<string, string>)["api-key"]).toBe("k");
    expect(JSON.parse(init.body as string).model).toBe("dep1");
  });

  it("off has no adapter", () => {
    expect(aiProviderFor({ ...base, choice: "off" }, null)).toBeNull();
  });

  it("a 500 and a timeout throw (after one retry)", async () => {
    const f500 = vi.fn(async () => new Response("no", { status: 500 }));
    await expect(aiProviderFor(base, "k", f500)!.complete(req)).rejects.toThrow(/500/);
    expect(f500).toHaveBeenCalledTimes(2);
    const hang = vi.fn((_u: string, i: RequestInit) => new Promise<Response>((_, rej) => i.signal?.addEventListener("abort", () => rej(new Error("aborted")))));
    await expect(aiProviderFor(base, "k", { fetch: hang, timeoutMs: 20 })!.complete(req)).rejects.toThrow();
  });

  it("a streamed answer with a tool call runs the tool and continues", async () => {
    const replies = [
      sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: "t1", function: { name: "get_goals", arguments: "{\"que" } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "ry\":\"x\"}" } }] } }] }),
      sse({ choices: [{ delta: { content: "Done." } }] }, { choices: [], usage: { prompt_tokens: 5, completion_tokens: 2 } }),
    ];
    const f = vi.fn(async () => replies.shift()!);
    const runTool = vi.fn(async () => "goal list");
    const seen: string[] = [];
    const run: ProviderRun = { system: "s", history: [], question: "q", tools: [{ name: "get_goals", description: "d", input_schema: { type: "object", properties: {} } }], runTool, onText: (d) => seen.push(d) };
    const out = await streamingFor(base, "k", f).run(run);
    expect(runTool).toHaveBeenCalledWith("get_goals", { query: "x" });
    expect(out.text).toBe("Done.");
    expect(seen.join("")).toBe("Done.");
    expect(out.tokensOut).toBe(2);
    const second = JSON.parse((f.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(second.messages.at(-1)).toMatchObject({ role: "tool", tool_call_id: "t1", content: "goal list" });
  });
});
