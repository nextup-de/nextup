// The case area's hook of the append action (plan REG, decision D18): a no-op until NOR and SEE fill it with the checks and
// the stamps of the case events. NOR and SEE write here; server/actions/events.ts is closed.
import type { AppendCtx, AppendHook } from "./shared";

export async function prepareCaseAppend(c: AppendCtx): Promise<AppendHook> {
  return { ok: true, payload: c.payload };
}
