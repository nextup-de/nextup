// "Last saved … by …" on a settings card, read from the audit log (Kevin on #378: no new fields).
// Pure: the newest audit row and the names of the company's people in, the line's parts out.
import { actorLabelKey, type ActorKind } from "@/features/audit";
import type { MessageKey } from "@/i18n";

export type LastSaved = { at: string; name: string | null; kindKey: MessageKey };
export type AuditFacts = { at: Date; actorKind: string; actorUserId: string | null };

/** A person by name when the row names one we still know; otherwise how they came in ("Console", "System"). */
export function lastSaved(row: AuditFacts | null, names: ReadonlyMap<string, string>): LastSaved | null {
  if (!row) return null;
  const name = row.actorUserId ? names.get(row.actorUserId) ?? null : null;
  return { at: row.at.toISOString(), name, kindKey: `settingsAudit.${actorLabelKey(row.actorKind as ActorKind)}` as MessageKey };
}
