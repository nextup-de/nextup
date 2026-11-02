// The company's chosen model, behind the contract's AiProvider and the assistant's streaming
// Provider (docs/plans AIP D7). `off` has no adapter; `mock` has only the streaming one.
import { PUBLIC_CONTRACT_VERSION, type AiProvider, type AiRequest } from "@nextup/contracts/public";
import type { Provider } from "@/features/assist";
import { mockProvider } from "@/features/assist/mock";
import type { AiSettings } from "@/features/ai/settings";
import { bedrockComplete, bedrockStreaming } from "./bedrock";
import { openaiComplete, openaiStreaming, type FetchLike, type Net } from "./openai";

export type { FetchLike, Net };

/** A function is taken as the fetch to use (tests); an object may also set the timeout. */
const netOf = (n?: Net | FetchLike): Net => (typeof n === "function" ? { fetch: n } : (n ?? {}));

/** The adapter for the choice, or null when there is none (off, or the mock, which only streams). */
export function aiProviderFor(settings: AiSettings, key: string | null, net?: Net | FetchLike): AiProvider | null {
  const choice = settings.choice;
  if (choice === "off" || choice === "mock") return null;
  return {
    info: { kind: "AiProvider", id: choice, contractVersion: PUBLIC_CONTRACT_VERSION },
    complete: (req: AiRequest) => (choice === "bedrock" ? bedrockComplete(settings, req) : openaiComplete(choice, settings, key, req, netOf(net))),
  };
}

/** The assistant's streaming provider for the choice; the mock for "mock" (and for off, which the gate keeps out). */
export function streamingFor(settings: AiSettings, key: string | null, net?: Net | FetchLike): Provider {
  switch (settings.choice) {
    case "bedrock": return bedrockStreaming(settings);
    case "azure-openai":
    case "openai-compatible": return openaiStreaming(settings.choice, settings, key, netOf(net));
    default: return mockProvider;
  }
}
