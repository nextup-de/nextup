// Which sink a company's log export uses (EID D13), from its `logsink` Integration row.
import { randomUUID } from "node:crypto";
import type { LogRecord, LogSink } from "@nextup/contracts/public";
import { parseLogExportSettings } from "@/features/identity/settings";
import { getDb } from "@/lib/db/client";
import { getIntegration } from "@/lib/db/integrations";
import { DEFAULT_LOG_DIR, fileSink } from "./file";
import { syslogSink } from "./syslog";

export const LOGSINK = "logsink";

/** The sink of a company whose export is on and whose settings parse; null otherwise. */
export async function logSinkFor(companyId: string): Promise<LogSink | null> {
  const row = await getIntegration(companyId, LOGSINK);
  if (!row || !row.on) return null;
  const parsed = parseLogExportSettings(row.settings);
  if (!parsed.ok) return null;
  const s = parsed.value;
  if (s.target === "file") return fileSink({ dir: process.env.LOG_EXPORT_DIR || DEFAULT_LOG_DIR });
  if (!s.host || s.port === null || !s.transport) return null;
  return syslogSink({ host: s.host, port: s.port, transport: s.transport, caPem: s.caPem, appName: s.appName });
}

/** Sends one `audit.test` record straight to the sink. Moves no cursor; stores `account.lastTest`. */
export async function sendTestRecord(companyId: string, now: Date = new Date()): Promise<{ ok: boolean; detail: string }> {
  const sink = await logSinkFor(companyId);
  let ok = false;
  let detail = "The export is off or its settings are not valid.";
  if (sink) {
    const record: LogRecord = {
      id: `test_${randomUUID()}`, companyId, at: now.toISOString(), type: "audit.test",
      actorUserId: null, target: null, data: { actorKind: "system", source: "settings", changes: {} },
    };
    try {
      await sink.write([record]);
      ok = true;
      detail = "Test record sent.";
    } catch (e) {
      detail = (e instanceof Error ? e.message : String(e)).slice(0, 300) || "failed";
    }
  }
  await getDb().integration.updateMany({
    where: { companyId, system: LOGSINK },
    data: { account: { lastTest: { at: now.toISOString(), ok, detail } } },
  });
  return { ok, detail };
}
