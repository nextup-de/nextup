// The project area's hook of the append action (plan REG, decision D18): MOV and RES write here; server/actions/events.ts is closed.
// MOV-B1: whoever becomes the lead (a hand-over or a new lead after the leaver) must be an active person of this company,
// and the actor must hold the right to name them now: the state is the one this request reduced, not the one the sheet was
// opened on.
import { meFor, type Actor } from "@/features/auth/identity";
import { mayAppendProject } from "@/features/projects/permissions";
import { translate } from "@/i18n";
import { getDb } from "@/lib/db/client";
import type { AppendCtx, AppendHook } from "./shared";

/** The events that put a new person on the lead's chair. */
const LEAD_TARGET_EVENTS: readonly string[] = ["project.handed", "project.lead.changed"];

export async function prepareProjectAppend(c: AppendCtx): Promise<AppendHook> {
  if (LEAD_TARGET_EVENTS.includes(c.type)) {
    const refuse = (error: string): AppendHook => ({ ok: false, error });
    const toUserId = c.payload.toUserId;
    if (typeof toUserId !== "string" || toUserId === "") return refuse(translate(c.locale, "projectMove.permLeadTarget"));
    // Current authority first: a stale sheet (the lead came back, the escalation ended, the seat changed hands) is refused
    // before anything is looked up for it.
    const actor: Actor = { role: c.viewer.role as Actor["role"], userId: c.viewer.userId, me: meFor(c.viewer.userId, c.seed.seats), name: "", handle: null };
    const verdict = mayAppendProject(actor, { type: c.type, target: c.target, payload: c.payload }, c.state, c.locale);
    if (!verdict.ok) return refuse(verdict.error);
    // The target is an active user of this company, never an id the client made up or one that belongs to another company.
    const target = await getDb().user.findFirst({ where: { id: toUserId, companyId: c.companyId, active: true }, select: { id: true } });
    if (!target) return refuse(translate(c.locale, "projectMove.permLeadTarget"));
  }
  return { ok: true, payload: c.payload };
}
