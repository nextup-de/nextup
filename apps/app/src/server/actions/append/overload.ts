// The overload area's hook of the append action (plan REG, decision D18; plan OVL, D15): none of OVL's six events comes through the generic path. The three the app
// may append (person.away, person.back, desk.covered) are written by OVL's own server actions (server/actions/overload.ts), which resolve their target and check the
// rights; the other three are the clock's and the directory's. server/actions/events.ts is closed.
import { translate } from "@/i18n";
import type { AppendCtx, AppendHook } from "./shared";

/** The six OVL types (D15). */
const OVERLOAD_TYPES: readonly string[] = ["person.away", "person.back", "desk.covered", "desk.overloaded", "desk.cleared", "org.seat.vacant"];

export async function prepareOverloadAppend(c: AppendCtx): Promise<AppendHook> {
  if (OVERLOAD_TYPES.includes(c.type)) return { ok: false, error: translate(c.locale, "overload.err.wrongPath") };
  return { ok: true, payload: c.payload };
}
