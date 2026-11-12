// The project area's hook of the append action (plan REG, decision D18): a no-op until MOV and RES fill it with the checks and
// the stamps of the project events. MOV and RES write here; server/actions/events.ts is closed.
import type { AppendCtx, AppendHook } from "./shared";

export async function prepareProjectAppend(c: AppendCtx): Promise<AppendHook> {
  return { ok: true, payload: c.payload };
}
