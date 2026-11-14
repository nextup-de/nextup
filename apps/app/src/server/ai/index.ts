// The company's chosen model, behind the contract's AiProvider and the assistant's streaming
// Provider (docs/plans AIP D7). `anthropic` is Claude through Anthropic's own API (server/ai/anthropic.ts). `off` has no adapter; `mock` has only the streaming one. `local` is the
// model on this stack: the same chat calls, sent to the stack's brain service instead of a provider (Q8.4).
import { PUBLIC_CONTRACT_VERSION, type AiProvider, type AiRequest } from "@nextup/contracts/public";
import type { Provider } from "@/features/assist";
import { mockProvider } from "@/features/assist/mock";
import type { AiSettings } from "@/features/ai/settings";
import { brainTarget, brainTimeoutMs } from "@/server/brain-health";
import { anthropicComplete, anthropicStreaming } from "./anthropic";
import { bedrockComplete, bedrockStreaming } from "./bedrock";
import { openaiComplete, openaiStreaming, TIMEOUT_MS, type FetchLike, type Net } from "./openai";

export type { FetchLike, Net };

/** A function is taken as the fetch to use (tests); an object may also set the timeout. */
const netOf = (n?: Net | FetchLike): Net => (typeof n === "function" ? { fetch: n } : (n ?? {}));

/**
 * The model on this stack: the brain's address stands in for the endpoint and its key for the company's key; nothing
 * the company saved is used. Without a brain both are empty and the adapter refuses before any request.
 */
function viaBrain(settings: AiSettings, net?: Net | FetchLike): { settings: AiSettings; key: string | null; net: Net } {
  const target = brainTarget();
  const n = netOf(net);
  return { settings: { ...settings, endpoint: target?.url ?? null }, key: target?.key ?? null, net: { ...n, timeoutMs: n.timeoutMs ?? brainTimeoutMs(TIMEOUT_MS) } };
}

/** The adapter for the choice, or null when there is none (off, or the mock, which only streams). */
export function aiProviderFor(settings: AiSettings, key: string | null, net?: Net | FetchLike): AiProvider | null {
  const choice = settings.choice;
  if (choice === "off" || choice === "mock") return null;
  return {
    info: { kind: "AiProvider", id: choice, contractVersion: PUBLIC_CONTRACT_VERSION },
    complete: (req: AiRequest) => {
      if (choice === "bedrock") return bedrockComplete(settings, req);
      if (choice === "anthropic") return anthropicComplete(settings, key, req);
      if (choice === "local") {
        const b = viaBrain(settings, net);
        return openaiComplete("local", b.settings, b.key, req, b.net);
      }
      return openaiComplete(choice, settings, key, req, netOf(net));
    },
  };
}

/** The assistant's streaming provider for the choice; the mock for "mock" (and for off, which the gate keeps out). */
export function streamingFor(settings: AiSettings, key: string | null, net?: Net | FetchLike): Provider {
  switch (settings.choice) {
    case "bedrock": return bedrockStreaming(settings);
    case "anthropic": return anthropicStreaming(settings, key);
    case "azure-openai":
    case "openai-compatible": return openaiStreaming(settings.choice, settings, key, netOf(net));
    case "local": {
      const b = viaBrain(settings, net);
      return openaiStreaming("local", b.settings, b.key, b.net);
    }
    default: return mockProvider;
  }
}
