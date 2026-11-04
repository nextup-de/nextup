// The log export against a real Postgres and real UDP, TCP and TLS receivers (EID-L1).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEED } from "@/features/demo/seed";
import { toSeedJson } from "@/features/demo/parse";
import { getDb } from "@/lib/db/client";
import { exportStatus, loadExportRun, startExportAt } from "@/lib/db/audit-export";
import { getIntegration, saveIntegration, setIntegrationOn } from "@/lib/db/integrations";
import { LOGSINK, sendTestRecord } from "@/server/logsink";
import { runLogExportOnce } from "@/server/scheduler/log-export";
import { startReceiver, type Receiver } from "../fixtures/syslog/receiver";

const db = getDb();
const base = Date.now() + 60_000;
const at = (s: number) => new Date(base + s * 1000);
let n = 0;

async function company(slug: string): Promise<string> {
  return (await db.company.create({ data: { slug, name: slug, seedJson: toSeedJson(SEED) as object } })).id;
}

async function audit(companyId: string, id: string, s: number): Promise<void> {
  await db.auditEvent.create({
    data: { id, companyId, at: at(s), actorKind: "admin", actorUserId: null, action: "audit.test_row", changes: {}, source: "settings" },
  });
}

async function switchOn(companyId: string, settings: Record<string, unknown>, startAt: Date): Promise<void> {
  await saveIntegration({ companyId, system: LOGSINK, settings, updatedBy: null });
  await setIntegrationOn(companyId, LOGSINK, true, null);
  await startExportAt(companyId, startAt);
}

const ids = (messages: string[]) => messages.map((m) => /id="([^"]+)"/.exec(m)?.[1]);

beforeAll(async () => {
  await db.company.deleteMany({});
});
afterAll(async () => {
  await db.auditExportRun.deleteMany({});
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("EID log export", () => {
  it("sends new rows once, in order, over UDP, TCP and TLS; never history nor another company", async () => {
    const rx = await startReceiver({ udp: true, tcp: true, tls: true });
    try {
      const other = await company(`other${++n}`);
      await audit(other, "other_1", 5);
      for (const t of ["udp", "tcp", "tls"] as const) {
        const id = await company(`co-${t}${++n}`);
        await audit(id, `${t}_old`, -5);
        await switchOn(id, { target: "syslog", host: "127.0.0.1", port: rx.ports[t], transport: t, caPem: t === "tls" ? rx.caPem : null }, at(0));
        await audit(id, `${t}_b`, 2);
        await audit(id, `${t}_a`, 1);
        await audit(id, `${t}_c`, 2);
      }
      await runLogExportOnce(new Date());
      await runLogExportOnce(new Date());
      await rx.waitFor(9);
      expect(ids(rx.by.udp)).toEqual(["udp_a", "udp_b", "udp_c"]);
      expect(ids(rx.by.tcp)).toEqual(["tcp_a", "tcp_b", "tcp_c"]);
      expect(ids(rx.by.tls)).toEqual(["tls_a", "tls_b", "tls_c"]);
      expect(rx.messages.join("\n")).not.toMatch(/other_1|_old/);
      expect(rx.by.udp[0].startsWith("<110>1 ")).toBe(true);
    } finally {
      await rx.stop();
    }
  });

  it("keeps the cursor while the receiver is down and delivers once it is back", async () => {
    const rx: Receiver = await startReceiver({ tcp: true });
    try {
      const id = await company(`down${++n}`);
      await switchOn(id, { target: "syslog", host: "127.0.0.1", port: rx.ports.tcp, transport: "tcp" }, at(0));
      await audit(id, "d_1", 1);
      await rx.down();
      await runLogExportOnce(new Date());
      const run = await loadExportRun(id);
      expect(run?.cursorId).toBeNull();
      expect((await exportStatus(id)).lastError).toBeTruthy();
      expect(rx.messages).toEqual([]);
      await audit(id, "d_2", 2);
      await rx.up();
      await runLogExportOnce(new Date());
      await rx.waitFor(2);
      expect(ids(rx.messages)).toEqual(["d_1", "d_2"]);
      const st = await exportStatus(id);
      expect(st.lastError).toBeNull();
      expect(st.sentToday).toBe(2);
      expect(st.lastOkAt).not.toBeNull();
    } finally {
      await rx.stop();
    }
  });

  it("sends the test record without moving the cursor", async () => {
    const rx = await startReceiver({ tcp: true });
    try {
      const id = await company(`test${++n}`);
      await switchOn(id, { target: "syslog", host: "127.0.0.1", port: rx.ports.tcp, transport: "tcp" }, at(0));
      const before = await loadExportRun(id);
      const r = await sendTestRecord(id);
      expect(r.ok).toBe(true);
      await rx.waitFor(1);
      expect(rx.messages[0]).toContain(" audit.test ");
      expect(await loadExportRun(id)).toEqual(before);
      const acc = (await getIntegration(id, LOGSINK))?.account as { lastTest: { ok: boolean } };
      expect(acc.lastTest.ok).toBe(true);
    } finally {
      await rx.stop();
    }
  });

  it("sends nothing with the export off", async () => {
    const rx = await startReceiver({ tcp: true });
    try {
      const id = await company(`off${++n}`);
      await switchOn(id, { target: "syslog", host: "127.0.0.1", port: rx.ports.tcp, transport: "tcp" }, at(0));
      await setIntegrationOn(id, LOGSINK, false, null);
      await audit(id, "off_1", 1);
      await runLogExportOnce(new Date());
      expect((await sendTestRecord(id)).ok).toBe(false);
      await new Promise((r) => setTimeout(r, 200));
      expect(rx.messages).toEqual([]);
    } finally {
      await rx.stop();
    }
  });
});
