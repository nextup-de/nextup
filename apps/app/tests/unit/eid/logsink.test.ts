import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LogRecord } from "@nextup/contracts/public";
import type { AuditRow } from "@/lib/db/audit";
import { fileSink } from "@/server/logsink/file";
import { toLogRecord } from "@/server/logsink/record";
import { formatRfc5424, frame } from "@/server/logsink/syslog";
import { unframe } from "../../fixtures/syslog/receiver";

const row: AuditRow = {
  id: "aud_01",
  companyId: "co_acme",
  at: new Date("2026-11-01T09:30:00.000Z"),
  actorKind: "admin",
  actorUserId: "user_01",
  action: "audit.settings.saved",
  targetKind: "integration",
  targetId: "jira",
  changes: { siteUrl: { from: "a", to: "b" } },
  source: "settings",
};

describe("EID log sink", () => {
  it("turns an audit row into the LogRecord of D13, valid for the contract", () => {
    const r = toLogRecord(row);
    expect(LogRecord.safeParse(r).success).toBe(true);
    expect(r).toEqual({
      id: "aud_01", companyId: "co_acme", at: "2026-11-01T09:30:00.000Z", type: "audit.settings.saved",
      actorUserId: "user_01", target: "integration:jira",
      data: { actorKind: "admin", source: "settings", changes: { siteUrl: { from: "a", to: "b" } } },
    });
    expect(toLogRecord({ ...row, targetKind: null, targetId: null, actorUserId: null }).target).toBeNull();
  });

  it("formats RFC 5424 with PRI 110, MSGID = type and the structured data", () => {
    const line = formatRfc5424(toLogRecord(row), { hostname: "host1", appName: "nextup" });
    expect(line.startsWith('<110>1 2026-11-01T09:30:00.000Z host1 nextup - audit.settings.saved ')).toBe(true);
    expect(line).toContain('[nextup@32473 id="aud_01" companyId="co_acme"] ');
    const json = JSON.parse(line.slice(line.indexOf("] ") + 2));
    expect(json).toEqual({
      actorKind: "admin", source: "settings", changes: { siteUrl: { from: "a", to: "b" } },
      actorUserId: "user_01", target: "integration:jira",
    });
  });

  it("escapes structured-data values", () => {
    const line = formatRfc5424({ ...toLogRecord(row), id: 'a"b]c' }, { hostname: "h", appName: "n" });
    expect(line).toContain('id="a\\"b\\]c"');
  });

  it("frames TCP messages with octet counting, counting bytes", () => {
    const a = "héllo";
    const buf = Buffer.concat([frame(a), frame("two")]);
    expect(buf.toString("utf8").startsWith("6 héllo")).toBe(true);
    const { messages, rest } = unframe(Buffer.concat([buf, Buffer.from("9 abc")]));
    expect(messages).toEqual([a, "two"]);
    expect(rest.toString()).toBe("9 abc");
  });

  it("writes one JSON line per record into the day's file, mode 0640, appending", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "nextup-file-sink-"));
    try {
      const sink = fileSink({ dir: path.join(dir, "logs"), now: () => new Date("2026-11-02T23:59:59.000Z") });
      const a = toLogRecord(row);
      const b = toLogRecord({ ...row, id: "aud_02" });
      await sink.write([a, b]);
      await sink.write([toLogRecord({ ...row, id: "aud_03" })]);
      const file = path.join(dir, "logs", "audit-2026-11-02.jsonl");
      const lines = (await readFile(file, "utf8")).trimEnd().split("\n");
      expect(lines.map((l) => JSON.parse(l).id)).toEqual(["aud_01", "aud_02", "aud_03"]);
      expect(JSON.parse(lines[0])).toEqual(a);
      if (process.platform !== "win32") expect((await stat(file)).mode & 0o777).toBe(0o640);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
