// The message extension (TMS D13). A stub until TMS-E1 replaces it: the raise from Teams is not built yet.
import type { BotResult } from "./bot";

/** The invoke response: 501 until TMS-E1. TMS-E1 adds the company, person and activity parameters. */
export async function handleExtension(): Promise<BotResult> {
  return { status: 501, body: { error: "The message extension is not available yet." } };
}
