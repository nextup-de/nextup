// AiProvider connector interface (model calls).
// Part of @nextup/contracts/public (PILOT public contracts). Changes only by D3: add an optional field, a new
// export or an optional interface member; anything else is a new version next to the old one.
import { z } from "zod";
import { PublicId } from "../primitives";
import type { Connector } from "./base";

/**
 * `off` is a valid company setting with no adapter behind it (D8). `local` is the model on the company's own stack,
 * behind its brain service: no endpoint, no key, nothing leaves the stack (Q8.4).
 */
export const AI_PROVIDER_CHOICES = ["bedrock", "azure-openai", "openai-compatible", "off", "local"] as const;
export const AiProviderChoice = z.enum(AI_PROVIDER_CHOICES);
export type AiProviderChoice = z.infer<typeof AiProviderChoice>;

export const AiMessage = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string(),
});
export type AiMessage = z.infer<typeof AiMessage>;

export const AiRequest = z.object({
  companyId: PublicId,
  purpose: z.enum(["assist", "routing", "coach", "brain"]),
  system: z.string(),
  messages: z.array(AiMessage).min(1),
  maxTokens: z.number().int().min(1).max(32000),
});
export type AiRequest = z.infer<typeof AiRequest>;

export const AiResponse = z.object({
  text: z.string(),
  model: z.string(),
  tokensIn: z.number().int().min(0),
  tokensOut: z.number().int().min(0),
});
export type AiResponse = z.infer<typeof AiResponse>;

export interface AiProvider extends Connector<"AiProvider"> {
  complete(request: AiRequest): Promise<AiResponse>;
}
