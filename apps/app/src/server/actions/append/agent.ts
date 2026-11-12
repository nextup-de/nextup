// The agent area's hook of the append action (plan REG, decision D18): a no-op until AGT fill it with the checks and
// the stamps of the agent events. AGT write here; server/actions/events.ts is closed.
import type { AppendCtx, AppendHook } from "./shared";

export async function prepareAgentAppend(c: AppendCtx): Promise<AppendHook> {
  return { ok: true, payload: c.payload };
}
