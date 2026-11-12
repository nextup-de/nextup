// The approval area's hook of the append action (plan REG, decision D18): a no-op until GAT fill it with the checks and
// the stamps of the approval events. GAT write here; server/actions/events.ts is closed.
import type { AppendCtx, AppendHook } from "./shared";

export async function prepareApprovalAppend(c: AppendCtx): Promise<AppendHook> {
  return { ok: true, payload: c.payload };
}
