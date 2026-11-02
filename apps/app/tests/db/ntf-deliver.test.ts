// NTF-B1: delivery from the outbox through registered channels, against a real Postgres and a local HTTP receiver.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PUBLIC_CONTRACT_VERSION, type NotifyChannel, type NotifyMessage } from "@nextup/contracts/public";
import { getDb } from "@/lib/db/client";
import { enqueue, type OutboxDraft } from "@/lib/db/outbox";
import { saveSubscription } from "@/lib/db/webhooks";
import { deliverOnce } from "@/server/notify/deliver";
import { registerChannel } from "@/server/notify/registry";

const db = getDb();
const savedKey = process.env.CONNECTOR_VAULT_KEY;
let companyId: string;
let subId: string;
let server: http.Server;
let url: string;
let status = 200;
let seen: { delivery: string; attempt: number; signature: string }[] = [];

const t0 = new Date(Date.now() + 60_000);
const at = (ms: number) => new Date(t0.getTime() + ms);
const MIN = 60_000;

const draft = (key: string, over: Partial<OutboxDraft> = {}): OutboxDraft => ({
  channel: "webhook", key, recipientUserId: null, address: subId, template: "event", locale: "en",
  subject: "s", text: "t", link: null, status: "pending", lastError: null,
  data: {
    event: {
      id: "ev1", type: "case.raised", typeVersion: 1, companyId, occurredAt: new Date().toISOString(),
      actor: { userId: null, roleId: null }, subject: { kind: "case", id: "c1" }, data: {},
    },
  },
  ...over,
});

const rowOf = (key: string) => db.outboxMessage.findFirstOrThrow({ where: { companyId, key } });

beforeAll(async () => {
  process.env.CONNECTOR_VAULT_KEY = "ab".repeat(32);
  await db.company.deleteMany({});
  companyId = (await db.company.create({ data: { slug: "ntf-d", name: "ntf-d", stage: "pilot", seedJson: {} } })).id;
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const env = JSON.parse(body) as { attempt: number };
      seen.push({
        delivery: String(req.headers["x-nextup-delivery"]),
        attempt: env.attempt,
        signature: String(req.headers["x-nextup-signature"]),
      });
      res.statusCode = status;
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
  subId = await saveSubscription(companyId, { url, secrets: ["s1", "s2"], events: ["case.raised"], on: true }, null);
});

beforeEach(async () => {
  await db.outboxMessage.deleteMany({});
  seen = [];
  status = 200;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await db.company.deleteMany({});
  if (savedKey === undefined) delete process.env.CONNECTOR_VAULT_KEY;
  else process.env.CONNECTOR_VAULT_KEY = savedKey;
  await db.$disconnect();
});

describe("NTF delivery", () => {
  it("a registered channel receives a pending row once and the row is sent", async () => {
    const got: NotifyMessage[] = [];
    const testMail: NotifyChannel = {
      info: { kind: "NotifyChannel", id: "mail", contractVersion: PUBLIC_CONTRACT_VERSION },
      async send(m) {
        got.push(m);
        return { ok: true, providerMessageId: null };
      },
    };
    registerChannel("mail", testMail);
    await enqueue(companyId, [draft("m1", { channel: "mail", address: "a@ntf.example", template: "digest" })]);
    await deliverOnce(t0);
    await deliverOnce(at(10 * MIN));
    expect(got.length).toBe(1);
    expect(got[0].recipient.address).toBe("a@ntf.example");
    const row = await rowOf("m1");
    expect(row.status).toBe("sent");
    expect(row.sentAt).not.toBeNull();
  });

  it("a webhook answering 500 is retried on the backoff and failed after attempt 6", async () => {
    status = 500;
    await enqueue(companyId, [draft("w500")]);
    const waits = [1, 5, 30, 120, 720];
    let now = t0;
    for (let i = 0; i < 6; i++) {
      await deliverOnce(now);
      const row = await rowOf("w500");
      expect(row.attempt).toBe(i + 1);
      if (i < 5) {
        expect(row.status).toBe("pending");
        expect(row.nextAt.getTime()).toBe(now.getTime() + waits[i] * MIN);
        now = row.nextAt;
      }
    }
    const row = await rowOf("w500");
    expect(row.status).toBe("failed");
    expect(row.lastError).toContain("500");
    expect(seen.map((s) => s.attempt)).toEqual([1, 2, 3, 4, 5, 6]);
    await deliverOnce(at(24 * 60 * MIN));
    expect(seen.length).toBe(6);
  });

  it("a 404 fails at once", async () => {
    status = 404;
    await enqueue(companyId, [draft("w404")]);
    await deliverOnce(t0);
    const row = await rowOf("w404");
    expect(row.status).toBe("failed");
    expect(row.attempt).toBe(1);
    expect(seen.length).toBe(1);
  });

  it("200 on the second try is sent with attempt 2 and the same delivery id", async () => {
    status = 503;
    await enqueue(companyId, [draft("w2")]);
    await deliverOnce(t0);
    status = 200;
    await deliverOnce(at(2 * MIN));
    const row = await rowOf("w2");
    expect(row.status).toBe("sent");
    expect(row.attempt).toBe(2);
    expect(seen.length).toBe(2);
    expect(seen[0].delivery).toBe(row.id);
    expect(seen[1].delivery).toBe(seen[0].delivery);
    expect(seen[1].attempt).toBe(2);
    expect(seen[1].signature.match(/v1=/g)?.length).toBe(2);
  });

  it("two concurrent runs send each row once", async () => {
    await enqueue(companyId, Array.from({ length: 8 }, (_, i) => draft(`cc${i}`)));
    await Promise.all([deliverOnce(t0), deliverOnce(t0)]);
    expect(seen.length).toBe(8);
    expect(new Set(seen.map((s) => s.delivery)).size).toBe(8);
    expect((await db.outboxMessage.findMany({ where: { companyId } })).every((r) => r.status === "sent")).toBe(true);
  });
});
