// "We do not use this" (Q9.1), read from and written as audit rows: there is no table of its own. The retention
// run keeps these rows (features/privacy/retention.ts, AUDIT_KEPT_ACTIONS), since they are state.
import { DECLINED_ACTION, REOPENED_ACTION, declinedFrom, type Declinable, type Declined } from "@/features/settings/declined";
import { recordAudit, settingsActor } from "@/server/audit/record";
import { listAudit } from "./audit";

export async function loadDeclined(companyId: string): Promise<Declined> {
  return declinedFrom(await listAudit(companyId, { take: 200, actions: [DECLINED_ACTION, REOPENED_ACTION] }));
}

/** A second decision replaces the reason: the newest row wins. */
export async function declineSystem(companyId: string, byUserId: string, system: Declinable, reason: string): Promise<void> {
  await recordAudit(companyId, {
    actor: settingsActor({ userId: byUserId }), action: DECLINED_ACTION, target: { kind: "connector", id: system },
    changes: { system, reason }, source: "settings",
  });
}

/** "Use it after all". False when nothing was declined: then no row is written. */
export async function reopenSystem(companyId: string, byUserId: string, system: Declinable): Promise<boolean> {
  if (!(await loadDeclined(companyId))[system]) return false;
  await recordAudit(companyId, {
    actor: settingsActor({ userId: byUserId }), action: REOPENED_ACTION, target: { kind: "connector", id: system },
    changes: { system }, source: "settings",
  });
  return true;
}
