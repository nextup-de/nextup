// The overload area's hook of the append action (plan REG, decision D18): a no-op until OVL fill it with the checks and
// the stamps of the overload events. OVL write here; server/actions/events.ts is closed.
import type { AppendCtx, AppendHook } from "./shared";

export async function prepareOverloadAppend(c: AppendCtx): Promise<AppendHook> {
  return { ok: true, payload: c.payload };
}
