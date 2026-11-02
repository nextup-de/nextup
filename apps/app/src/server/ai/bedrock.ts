// Claude on Amazon Bedrock: the assistant's streaming Provider and the contract's `complete`.
// The only file in the app that imports the Bedrock SDK. Credentials come from the AWS chain
// (env, profile, instance role) - no key in this repo. docs/ASSISTANT.md.
import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import type { MessageParam, Tool, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";
import type { AiRequest, AiResponse } from "@nextup/contracts/public";
import type { Provider, ProviderRun, ProviderResult } from "@/features/assist";
import type { AiSettings } from "@/features/ai/settings";

export const MAX_ROUNDS = 4; // tool round trips per answer - the tools are cheap lookups, four is plenty
const MAX_TOKENS = 4000; // a 150-word answer plus thinking; streaming, so no timeout concern

const clients = new Map<string, AnthropicBedrockMantle>();
function clientFor(region: string): AnthropicBedrockMantle {
  let c = clients.get(region);
  if (!c) {
    c = new AnthropicBedrockMantle({ awsRegion: region, maxRetries: 1, timeout: 30_000 });
    clients.set(region, c);
  }
  return c;
}

export function bedrockStreaming(settings: AiSettings): Provider {
  const c = clientFor(settings.region);
  const tools = (defs: ProviderRun["tools"]): Tool[] => defs.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));

  return {
    id: "bedrock",
    async run(r: ProviderRun): Promise<ProviderResult> {
      const messages: MessageParam[] = [
        ...r.history.map((m) => ({ role: m.role, content: m.text }) satisfies MessageParam),
        { role: "user", content: r.question },
      ];
      let text = "";
      let tokensIn = 0;
      let tokensOut = 0;

      for (let round = 0; round <= MAX_ROUNDS; round++) {
        const stream = c.messages.stream(
          {
            model: settings.model,
            max_tokens: MAX_TOKENS,
            // The brief is the long, stable part: cached, so a follow-up question costs little.
            system: [{ type: "text", text: r.system, cache_control: { type: "ephemeral" } }],
            tools: tools(r.tools),
            // Short factual answers from lookups: low effort is fast and holds up here.
            output_config: { effort: "low" },
            messages,
          },
          { signal: r.signal },
        );
        stream.on("text", (delta) => { text += delta; r.onText(delta); });
        const msg = await stream.finalMessage();
        tokensIn += msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0);
        tokensOut += msg.usage.output_tokens;

        if (msg.stop_reason === "refusal") {
          const note = "I can't help with that here. Raise it, so the right person looks at it.";
          r.onText(note);
          return { text: note, model: msg.model, tokensIn, tokensOut };
        }
        if (msg.stop_reason !== "tool_use" || round === MAX_ROUNDS) {
          return { text, model: msg.model, tokensIn, tokensOut };
        }

        // Run every tool call of this turn and answer them in one message.
        messages.push({ role: "assistant", content: msg.content });
        const results: ToolResultBlockParam[] = [];
        for (const b of msg.content) {
          if (b.type !== "tool_use") continue;
          const out = await r.runTool(b.name, b.input).catch(() => null);
          results.push(out === null
            ? { type: "tool_result", tool_use_id: b.id, content: "The lookup failed.", is_error: true }
            : { type: "tool_result", tool_use_id: b.id, content: out });
        }
        messages.push({ role: "user", content: results });
        if (text && !/\s$/.test(text)) { text += " "; r.onText(" "); }
      }
      return { text, model: settings.model, tokensIn, tokensOut };
    },
  };
}

export async function bedrockComplete(settings: AiSettings, req: AiRequest): Promise<AiResponse> {
  const msg = await clientFor(settings.region).messages.create({
    model: settings.model,
    max_tokens: req.maxTokens,
    system: req.system,
    messages: req.messages.map((m) => ({ role: m.role, content: m.text })),
  });
  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return {
    text,
    model: msg.model,
    tokensIn: msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0),
    tokensOut: msg.usage.output_tokens,
  };
}
