// Claude through Anthropic's own API (the choice `anthropic`): the same streaming Provider and `complete` as
// Bedrock (server/ai/bedrock.ts), with the company's API key instead of the AWS chain. For demo companies only:
// the gate (features/ai/gate.ts) refuses it in every other stage, because the data would leave the EU.
// The only file in the app that builds a first-party Anthropic client. Server only.
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import type { AiRequest, AiResponse } from "@nextup/contracts/public";
import type { Provider } from "@/features/assist";
import { DEFAULT_ANTHROPIC_MODEL, type AiSettings } from "@/features/ai/settings";
import { claudeComplete, claudeStreaming, type ClaudeClient } from "./bedrock";

// One client per key, kept by the key's hash: the key itself is never a map key, a log line or an error text.
const clients = new Map<string, Anthropic>();
function clientFor(key: string | null): Anthropic {
  if (!key) throw new Error("The API key is not set.");
  const id = createHash("sha256").update(key).digest("hex");
  let c = clients.get(id);
  if (!c) {
    c = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 30_000 });
    clients.set(id, c);
  }
  return c;
}

/** The saved settings with a model: an empty model field means the default. */
const withModel = (s: AiSettings): AiSettings => (s.model ? s : { ...s, model: DEFAULT_ANTHROPIC_MODEL });

export function anthropicStreaming(settings: AiSettings, key: string | null, client?: ClaudeClient): Provider {
  return claudeStreaming("anthropic", client ?? clientFor(key), withModel(settings));
}

export function anthropicComplete(settings: AiSettings, key: string | null, req: AiRequest, client?: ClaudeClient): Promise<AiResponse> {
  return claudeComplete(client ?? clientFor(key), withModel(settings), req);
}
