// Which model answers the raise-page assistant. docs/ASSISTANT.md.
//
//   bedrock  Claude on Amazon Bedrock, called in LLM_REGION (default eu-central-1, Frankfurt).
//            WHERE it is processed depends on LLM_MODEL: an EU geographic inference profile may
//            run in any EU region; Frankfurt-only needs a model with single-region inference.
//            Retention follows the AWS account's Bedrock settings - check both before a pilot
//            (docs/ASSISTANT.md). Credentials come from the AWS chain (env, profile, instance
//            role) - no key in this repo.
//   anthropic  Claude through the Anthropic API directly (ANTHROPIC_API_KEY). Processed in the US,
//            so features/assist/gate.ts allows it for the demo stage (made-up data) only.
//   mock     No model: features/assist/mock.ts strings tool results together. Demo, e2e, dev.
//
// The one outside call this app makes. Server only - the browser talks to /api/<company>/assist,
// and the CSP keeps connect-src at 'self'.
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import type { MessageParam, Messages, Tool, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";
import type { Provider, ProviderId, ProviderRun, ProviderResult } from "@/features/assist";
import { mockProvider } from "@/features/assist/mock";

const MAX_ROUNDS = 4; // tool round trips per answer - the tools are cheap lookups, four is plenty
const MAX_TOKENS = 4000; // a 150-word answer plus thinking; streaming, so no timeout concern

export type ProviderConfig = { id: ProviderId; region: string; model: string };

/**
 * What the environment asks for. Bedrock only when a model is named; the Anthropic API only with a
 * key (model defaults to claude-opus-5); otherwise the mock.
 */
export function providerConfig(env: NodeJS.ProcessEnv = process.env): ProviderConfig {
  const region = env.LLM_REGION || "eu-central-1";
  if (env.LLM_PROVIDER === "bedrock" && env.LLM_MODEL) return { id: "bedrock", region, model: env.LLM_MODEL };
  if (env.LLM_PROVIDER === "anthropic" && env.ANTHROPIC_API_KEY) return { id: "anthropic", region: "anthropic-api", model: env.LLM_MODEL || "claude-opus-5" };
  return { id: "mock", region, model: "mock" };
}

let bedrockClient: AnthropicBedrockMantle | null = null;
let anthropicClient: Anthropic | null = null;

function clientFor(cfg: ProviderConfig): { messages: Messages } {
  if (cfg.id === "anthropic") return (anthropicClient ??= new Anthropic({ maxRetries: 1, timeout: 30_000 }));
  return (bedrockClient ??= new AnthropicBedrockMantle({ awsRegion: cfg.region, maxRetries: 1, timeout: 30_000 }));
}

function claude(cfg: ProviderConfig): Provider {
  const c = clientFor(cfg);
  const tools = (defs: ProviderRun["tools"]): Tool[] => defs.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));

  return {
    id: cfg.id,
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
            model: cfg.model,
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
      return { text, model: cfg.model, tokensIn, tokensOut };
    },
  };
}

export function providerFor(cfg: ProviderConfig): Provider {
  return cfg.id === "mock" ? mockProvider : claude(cfg);
}
