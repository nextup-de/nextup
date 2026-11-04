// An audit row as the LogRecord of the public contract (EID D13). Only AuditEvent rows go out.
import type { LogRecord } from "@nextup/contracts/public";
import type { AuditRow } from "@/lib/db/audit";

export function toLogRecord(row: AuditRow): LogRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    at: row.at.toISOString(),
    type: row.action,
    actorUserId: row.actorUserId,
    target: row.targetKind && row.targetId ? `${row.targetKind}:${row.targetId}` : null,
    data: { actorKind: row.actorKind, source: row.source, changes: row.changes },
  };
}
