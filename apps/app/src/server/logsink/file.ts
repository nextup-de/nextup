// The file sink (EID D13): one JSON LogRecord per line in <dir>/audit-<YYYY-MM-DD>.jsonl (UTC day of the
// write), created 0640, append only. The admin never picks the path: `dir` is LOG_EXPORT_DIR.
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { PUBLIC_CONTRACT_VERSION, type LogSink } from "@nextup/contracts/public";

export const DEFAULT_LOG_DIR = "/var/log/nextup";

export const fileName = (day: Date): string => `audit-${day.toISOString().slice(0, 10)}.jsonl`;

export function fileSink(o: { dir: string; now?: () => Date }): LogSink {
  const now = o.now ?? (() => new Date());
  return {
    info: { kind: "LogSink", id: "file", contractVersion: PUBLIC_CONTRACT_VERSION },
    async write(records) {
      if (records.length === 0) return;
      await mkdir(o.dir, { recursive: true });
      const lines = records.map((r) => JSON.stringify(r) + "\n").join("");
      await appendFile(path.join(o.dir, fileName(now())), lines, { encoding: "utf8", mode: 0o640, flag: "a" });
    },
  };
}
