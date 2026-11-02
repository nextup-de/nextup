// OpenAI-style chat completions over fetch, for Azure OpenAI and any OpenAI-compatible endpoint.
//   openai-compatible  POST <endpoint>/chat/completions         Authorization: Bearer <key>
//   azure-openai       POST https://<endpoint>/openai/v1/chat/completions   api-key: <key>,
//                      the deployment is the model
// 30 s per request, one retry on a network error, a timeout or a 5xx. Server only.
import type { AiRequest, AiResponse } from "@nextup/contracts/public";
import type { Provider, ProviderRun, ProviderResult } from "@/features/assist";
import type { AiSettings } from "@/features/ai/settings";

export const TIMEOUT_MS = 30_000;
const MAX_ROUNDS = 4;
const MAX_TOKENS = 4000;

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
export type Net = { fetch?: FetchLike; timeoutMs?: number };

type Kind = "azure-openai" | "openai-compatible";

export function chatUrl(kind: Kind, endpoint: string | null): string {
  if (!endpoint) throw new Error(`The ${kind} endpoint is not set.`);
  if (kind === "azure-openai") {
    const host = endpoint.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    return `https://${host}/openai/v1/chat/completions`;
  }
  return `${endpoint.trim().replace(/\/+$/, "")}/chat/completions`;
}

export function modelFor(kind: Kind, s: AiSettings): string {
  return kind === "azure-openai" ? s.deployment || s.model : s.model;
}

function headers(kind: Kind, key: string | null): Record<string, string> {
  if (!key) throw new Error("The API key is not set.");
  return { "content-type": "application/json", ...(kind === "azure-openai" ? { "api-key": key } : { authorization: `Bearer ${key}` }) };
}

class ClientError extends Error {}

/** POST once with a timeout, once more after a network error, a timeout or a 5xx. Resolves with an ok response. */
async function post(kind: Kind, s: AiSettings, key: string | null, body: unknown, net: Net, outer?: AbortSignal): Promise<Response> {
  const url = chatUrl(kind, s.endpoint);
  const h = headers(kind, key);
  const f: FetchLike = net.fetch ?? ((u, i) => fetch(u, i));
  const ms = net.timeoutMs ?? TIMEOUT_MS;
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (outer?.aborted) throw new Error("Aborted.");
    const ctl = new AbortController();
    const onAbort = () => ctl.abort();
    outer?.addEventListener("abort", onAbort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { ctl.abort(); reject(new Error(`The model did not answer within ${Math.round(ms / 1000)} s.`)); }, ms);
    });
    try {
      const res = await Promise.race([f(url, { method: "POST", headers: h, body: JSON.stringify(body), signal: ctl.signal }), timeout]);
      if (res.ok) return res;
      if (res.status < 500) throw new ClientError(`The model endpoint answered ${res.status}.`);
      last = new Error(`The model endpoint answered ${res.status}.`);
    } catch (e) {
      if (e instanceof ClientError || outer?.aborted) throw e;
      last = e;
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onAbort);
    }
  }
  throw last instanceof Error ? last : new Error("The model call failed.");
}

type Usage = { prompt_tokens?: number; completion_tokens?: number };
const tokens = (u: Usage | undefined) => ({ tokensIn: u?.prompt_tokens ?? 0, tokensOut: u?.completion_tokens ?? 0 });

export async function openaiComplete(kind: Kind, s: AiSettings, key: string | null, req: AiRequest, net: Net = {}): Promise<AiResponse> {
  const model = modelFor(kind, s);
  const res = await post(kind, s, key, {
    model,
    max_tokens: req.maxTokens,
    messages: [{ role: "system", content: req.system }, ...req.messages.map((m) => ({ role: m.role, content: m.text }))],
  }, net);
  const j = (await res.json()) as { choices?: { message?: { content?: string | null } }[]; model?: string; usage?: Usage };
  return { text: j.choices?.[0]?.message?.content ?? "", model: j.model || model, ...tokens(j.usage) };
}

type Msg =
  | { role: "system" | "user" | "assistant"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string };

type Call = { id: string; name: string; args: string };
type Chunk = {
  model?: string;
  usage?: Usage | null;
  choices?: { delta?: { content?: string | null; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[];
};

/** Read one streamed answer: text goes to `onText` as it arrives; tool calls are collected. */
async function readStream(res: Response, onText: (d: string) => void): Promise<{ text: string; calls: Call[]; usage?: Usage; model?: string }> {
  if (!res.body) throw new Error("The model endpoint sent no stream.");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let usage: Usage | undefined;
  let model: string | undefined;
  const calls: Call[] = [];
  const line = (raw: string) => {
    if (!raw.startsWith("data:")) return;
    const data = raw.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let j: Chunk;
    try { j = JSON.parse(data) as Chunk; } catch { return; }
    if (j.model) model = j.model;
    if (j.usage) usage = j.usage;
    const d = j.choices?.[0]?.delta;
    if (d?.content) { text += d.content; onText(d.content); }
    for (const t of d?.tool_calls ?? []) {
      const c = (calls[t.index ?? 0] ??= { id: "", name: "", args: "" });
      if (t.id) c.id = t.id;
      if (t.function?.name) c.name += t.function.name;
      if (t.function?.arguments) c.args += t.function.arguments;
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += dec.decode(value, { stream: !done });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) { line(buf.slice(0, i).replace(/\r$/, "")); buf = buf.slice(i + 1); }
    if (done) break;
  }
  line(buf.replace(/\r$/, ""));
  return { text, calls: calls.filter(Boolean), usage, model };
}

export function openaiStreaming(kind: Kind, s: AiSettings, key: string | null, net: Net = {}): Provider {
  const model = modelFor(kind, s);
  return {
    id: kind,
    async run(r: ProviderRun): Promise<ProviderResult> {
      const messages: Msg[] = [
        { role: "system", content: r.system },
        ...r.history.map((m) => ({ role: m.role, content: m.text }) satisfies Msg),
        { role: "user", content: r.question },
      ];
      const tools = r.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
      let text = "";
      let tokensIn = 0;
      let tokensOut = 0;
      let used = model;

      for (let round = 0; round <= MAX_ROUNDS; round++) {
        const res = await post(kind, s, key, {
          model, max_tokens: MAX_TOKENS, stream: true, stream_options: { include_usage: true },
          messages, ...(tools.length && round < MAX_ROUNDS ? { tools } : {}),
        }, net, r.signal);
        const got = await readStream(res, (d) => { text += d; r.onText(d); });
        const u = tokens(got.usage);
        tokensIn += u.tokensIn;
        tokensOut += u.tokensOut;
        if (got.model) used = got.model;
        if (got.calls.length === 0 || round === MAX_ROUNDS) return { text, model: used, tokensIn, tokensOut };

        messages.push({
          role: "assistant", content: got.text || null,
          tool_calls: got.calls.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: c.args || "{}" } })),
        });
        for (const c of got.calls) {
          let input: unknown = {};
          try { input = c.args ? JSON.parse(c.args) : {}; } catch { /* the tool gets an empty input */ }
          const out = await r.runTool(c.name, input).catch(() => null);
          messages.push({ role: "tool", tool_call_id: c.id, content: out ?? "The lookup failed." });
        }
        if (text && !/\s$/.test(text)) { text += " "; r.onText(" "); }
      }
      return { text, model: used, tokensIn, tokensOut };
    },
  };
}
