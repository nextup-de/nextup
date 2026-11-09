// NTF acceptance against a real Postgres (NTF-Z1): a deadline gives each recipient one reminder across repeated
// runs and a restart, a failing webhook is retried on the backoff and then marked failed, and a sandbox company
// sends nothing. Mail goes to a channel this test registers (never SMTP); webhooks to a local node:http server.
// Time is passed in: every run below gets a date, and the dates are after the real clock so that rows written
// with the database's now() are already due.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PUBLIC_CONTRACT_VERSION, type NotifyChannel, type NotifyMessage } from "@nextup/contracts/public";
import { usersOfRole } from "@/features/auth/identity";
import { stampEvent } from "@/features/cases/stamp";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { getDb } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { bindDemoCompany } from "@/lib/db/demo-identity";
import { appendEventRow } from "@/lib/db/events";
import { writeStructure } from "@/lib/db/structure-writes";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { workdayOf } from "@/features/clock/calendar";
import { enqueue } from "@/lib/db/outbox";
import { saveSubscription } from "@/lib/db/webhooks";
import { startFakeSmtp } from "../fixtures/smtp/fake-smtp";

const db = getDb();
const savedKey = process.env.CONNECTOR_VAULT_KEY;
const MIN = 60_000;
const BACKOFF_MIN = [1, 5, 30, 120, 720];

/** 09:00 Berlin (CET, +01:00) on a March 2027 day. */
const at9 = (day: number): Date => new Date(`2027-03-${String(day).padStart(2, "0")}T09:00:00+01:00`);
const RAISED_AT = at9(1); // Monday; the promise is five working days
const TEN_DAYS = Array.from({ length: 10 }, (_, i) => at9(8 + i)); // Mon 8 March to Wed 17 March
const FIVE_MORE = Array.from({ length: 5 }, (_, i) => at9(18 + i)); // Thu 18 March to Mon 22 March

let mail: NotifyMessage[] = [];
const testMail: NotifyChannel = {
  info: { kind: "NotifyChannel", id: "mail", contractVersion: PUBLIC_CONTRACT_VERSION },
  async send(m) {
    mail.push(m);
    return { ok: true, providerMessageId: null };
  },
};

// The local webhook receiver: one path per company, so each test knows what reached it.
let server: http.Server;
let base = "";
const hits: Record<string, number> = {};
const answers: Record<string, number> = {};

type Box = { id: string; slug: string; routeId: string; raiserId: string; recipients: string[]; hook: string };

/** A company from the demo template with the three demo people, notifications and n8n on, and a subscription for case.raised. */
async function company(slug: string, stage: string): Promise<Box> {
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const person = (name: string, role: string, handle?: string) => ({
    name, email: name.replace(/\W+/g, "").toLowerCase() + `@${slug}.example`, role, dept: "", ini: "XX", handle: handle ?? null,
  });
  const c = await db.company.create({
    data: {
      slug, name: slug, stage, seedJson: toSeedJson(writes.seedJson) as object,
      users: { create: [person("B. Hartmann", "manager"), person("T. Vogel", "leader"), person("J. Schmidt", "member", "Anonymous #4471")] },
    },
  });
  await writeStructure(c.id, writes, "test");
  await bindDemoCompany(c.id);
  await db.companyConfig.upsert({ where: { companyId: c.id }, create: { companyId: c.id, notifications: true, n8n: true }, update: { notifications: true, n8n: true } });
  const hook = `/${slug}`;
  answers[hook] = 200;
  hits[hook] = 0;
  await saveSubscription(c.id, { url: base + hook, secrets: ["s1"], events: ["case.raised"], on: true }, null);

  const raiserId = (await db.user.findFirstOrThrow({ where: { companyId: c.id, name: "J. Schmidt" } })).id;
  const seed = await companySeed({ id: c.id, seedJson: c.seedJson, stage });
  const route = seed.routes.find((r) => r.id === "r1")!;
  const owners = usersOfRole(seed.seats, seed.seats.find((s) => s.id === route.ownerSeatId)!.roleId);
  const deputies = route.deputyRoleId ? usersOfRole(seed.seats, route.deputyRoleId) : [];
  const recipients = [...new Set([...owners, ...deputies])].filter((id) => id !== raiserId);
  return { id: c.id, slug, routeId: route.id, raiserId, recipients, hook };
}

/** A raise the way appendEventAction stores it: the server stamps the seat, the actor user id comes from the session. */
async function raise(box: Box, id: string, now: Date): Promise<void> {
  const c = await db.company.findUniqueOrThrow({ where: { id: box.id }, select: { id: true, seedJson: true, stage: true } });
  const payload = stampEvent("case.raised", { title: "Scanner " + id, body: "It does not read.", routeId: box.routeId, kind: "problem" }, await companySeed(c));
  const r = await appendEventRow(box.id, { id, day: 0, type: "case.raised", actor: "Anonymous #4471", targetId: "c_" + id, payload }, { actorUserId: box.raiserId, now });
  expect(r.ok).toBe(true);
}

type Notify = {
  runClockOnce: (now: Date) => Promise<unknown>;
  dispatchOnce: (now: Date) => Promise<unknown>;
  deliverOnce: (now: Date) => Promise<unknown>;
};

/** The notify modules as a fresh process would load them (after vi.resetModules()), with the test mail channel registered. */
async function load(): Promise<Notify> {
  const [clock, dispatch, deliver, registry] = await Promise.all([
    import("@/server/scheduler/clock"),
    import("@/server/notify/dispatch"),
    import("@/server/notify/deliver"),
    import("@/server/notify/registry"),
  ]);
  registry.registerChannel("mail", testMail);
  return { runClockOnce: clock.runClockOnce, dispatchOnce: dispatch.dispatchOnce, deliverOnce: deliver.deliverOnce };
}

/** One day of the system: the clock writes what fell due, the dispatcher plans it, delivery sends what is due. */
async function day(n: Notify, now: Date): Promise<void> {
  await n.runClockOnce(now);
  await n.dispatchOnce(now);
  await n.deliverOnce(now);
}

beforeAll(async () => {
  process.env.CONNECTOR_VAULT_KEY = "ab".repeat(32);
  server = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      const path = req.url ?? "";
      hits[path] = (hits[path] ?? 0) + 1;
      res.statusCode = answers[path] ?? 404;
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(async () => {
  await db.company.deleteMany({});
  mail = [];
  vi.resetModules();
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await db.company.deleteMany({});
  if (savedKey === undefined) delete process.env.CONNECTOR_VAULT_KEY;
  else process.env.CONNECTOR_VAULT_KEY = savedKey;
  await db.$disconnect();
});

describe("NTF acceptance: reminders once, webhook retries, sandbox sends nothing", () => {
  it("a deadline gives each recipient one reminder across ten days and a restart", async () => {
    const box = await company("ntfz-pilot", "pilot");
    expect(box.recipients.length).toBeGreaterThan(0);
    let n = await load();
    await n.dispatchOnce(RAISED_AT); // the first run starts the cursor at the newest event: history sends nothing
    await raise(box, "ntfz-r1", RAISED_AT);

    for (const d of TEN_DAYS) await day(n, d);

    // The demo template's own cases fall due too; this proof is about the case raised here.
    const mine = (data: unknown) => (data as { subjectId?: string }).subjectId === "c_ntfz-r1";
    const reminders = (await db.outboxMessage.findMany({ where: { companyId: box.id, template: "reminder.deadline" } })).filter((r) => mine(r.data));
    expect(reminders.map((r) => r.recipientUserId).sort()).toEqual([...box.recipients].sort());
    expect(reminders.every((r) => r.status === "sent" && r.attempt === 1 && r.sentAt !== null)).toBe(true);
    // Ten days is past escalation_days too: the second level's fact is there as well, with its own notices.
    const due = await db.caseEvent.findMany({ where: { companyId: box.id, type: "clock.due", targetId: "c_ntfz-r1" }, orderBy: { seq: "asc" } });
    expect(due.map((f) => (f.payload as { kind: string }).kind)).toEqual(["deadline", "escalation"]);
    const facts = due.slice(0, 1);
    const up = (await db.outboxMessage.findMany({ where: { companyId: box.id, template: "reminder.escalation" } })).filter((r) => mine(r.data));
    expect(up.map((r) => r.recipientUserId)).toContain(box.raiserId); // the raiser hears that the answer is late
    expect(up.every((r) => r.status === "sent" && r.key === `rem:${due[1].id}:${r.recipientUserId}`)).toBe(true);
    expect(reminders.every((r) => r.key === `rem:${facts[0].id}:${r.recipientUserId}`)).toBe(true);

    const seen = () => mail.filter((m) => m.template === "reminder.deadline" && mine(m.data)).map((m) => m.recipient.userId).sort();
    expect(seen()).toEqual([...box.recipients].sort());

    // The raise itself: its mail and its webhook went out once as well.
    expect((await db.outboxMessage.findMany({ where: { companyId: box.id, template: "raised" } })).every((r) => r.status === "sent")).toBe(true);
    expect(hits[box.hook]).toBe(1);

    // A restart: fresh modules, the same database, five more days.
    vi.resetModules();
    n = await load();
    const before = await db.outboxMessage.count({ where: { companyId: box.id } });
    for (const d of FIVE_MORE) await day(n, d);
    expect(await db.outboxMessage.count({ where: { companyId: box.id } })).toBe(before);
    expect((await db.outboxMessage.findMany({ where: { companyId: box.id, template: "reminder.deadline" } })).filter((r) => mine(r.data))).toHaveLength(box.recipients.length);
    expect(seen()).toEqual([...box.recipients].sort());
    expect(hits[box.hook]).toBe(1);
  }, 60_000);

  it("the working-day clock: answer date on a Friday, no reminder that Friday or over the weekend, the first one just after midnight on Monday", async () => {
    // The shape of Musterwerk's first live reminder (answer date Fri 13 Nov 2026), in a year after the real clock.
    const berlin = (iso: string) => new Date(iso + "+01:00"); // November: CET
    const box = await company("ntfz-clock", "pilot");
    const n = await load();
    await n.dispatchOnce(berlin("2030-11-08T09:00:00"));
    await raise(box, "ntfz-c1", berlin("2030-11-08T09:00:00")); // Friday; five working days to answer

    const mine = async () => (await db.outboxMessage.findMany({ where: { companyId: box.id, template: "reminder.deadline" } }))
      .filter((r) => (r.data as { subjectId?: string }).subjectId === "c_ntfz-c1");
    for (const t of ["2030-11-15T09:00:00", "2030-11-15T23:59:00", "2030-11-16T12:00:00", "2030-11-17T23:59:00"]) {
      await day(n, berlin(t));
      expect(await mine(), `no reminder at ${t} Berlin`).toEqual([]);
    }
    await day(n, berlin("2030-11-18T00:01:00")); // Monday, 23:01 UTC on Sunday
    const fact = await db.caseEvent.findFirstOrThrow({ where: { companyId: box.id, type: "clock.due", targetId: "c_ntfz-c1" } });
    expect(fact.payload).toMatchObject({ kind: "deadline", dueDay: workdayOf(berlin("2030-11-15T12:00:00"), DEFAULT_CALENDAR) });
    const rows = await mine();
    expect(rows.map((r) => r.recipientUserId).sort()).toEqual([...box.recipients].sort());
    expect(rows.every((r) => r.status === "sent" && r.sentAt?.getTime() === berlin("2030-11-18T00:01:00").getTime())).toBe(true);
    await day(n, berlin("2030-11-18T09:00:00"));
    expect(await mine()).toHaveLength(box.recipients.length);
  }, 60_000);

  it("a receiver answering 500 is tried on the backoff schedule and the row is failed after attempt 6", async () => {
    const box = await company("ntfz-retry", "pilot");
    answers[box.hook] = 500;
    const n = await load();
    await n.dispatchOnce(RAISED_AT);
    await raise(box, "ntfz-w1", RAISED_AT);
    await n.dispatchOnce(RAISED_AT);

    const row = () => db.outboxMessage.findFirstOrThrow({ where: { companyId: box.id, channel: "webhook" } });
    expect((await row()).key).toMatch(/^wh:ntfz-w1:/);

    let now = at9(2);
    for (let i = 0; i < 6; i++) {
      await n.deliverOnce(now);
      const r = await row();
      expect(r.attempt).toBe(i + 1);
      expect(hits[box.hook]).toBe(i + 1);
      if (i < 5) {
        expect(r.status).toBe("pending");
        expect(r.nextAt.getTime()).toBe(now.getTime() + BACKOFF_MIN[i] * MIN);
        // Before the wait is over nothing is sent again.
        await n.deliverOnce(new Date(r.nextAt.getTime() - 1));
        expect(hits[box.hook]).toBe(i + 1);
        now = r.nextAt;
      }
    }
    const last = await row();
    expect(last.status).toBe("failed");
    expect(last.lastError).toContain("500");
    await n.deliverOnce(new Date(now.getTime() + 24 * 60 * MIN));
    expect(hits[box.hook]).toBe(6);
  }, 60_000);

  it("through the real mail channel, a hard bounce is failed after one try and a soft bounce walks the ladder", async () => {
    const smtp = await startFakeSmtp((to) => (to.startsWith("gone@") ? "550 5.1.1 User unknown" : to.startsWith("full@") ? "452 4.2.2 Mailbox full" : "250 OK"));
    const savedSmtp = process.env.SMTP_URL;
    process.env.SMTP_URL = smtp.url;
    try {
      const box = await company("ntfz-bounce", "pilot");
      const [registry, channel, deliver] = await Promise.all([
        import("@/server/notify/registry"), import("@/server/notify/channels/mail"), import("@/server/notify/deliver"),
      ]);
      registry.registerChannel("mail", channel.mailChannel);
      const draft = (key: string, address: string) => ({
        channel: "mail", key, recipientUserId: box.recipients[0], address, template: "reminder.deadline", locale: "de",
        subject: "Antwort fällig", text: "Die Antwort ist fällig.", link: null, data: {}, status: "pending" as const, lastError: null,
      });
      expect(await enqueue(box.id, [draft("bounce:hard", "gone@x.test"), draft("bounce:soft", "full@x.test")])).toBe(2);
      const row = (key: string) => db.outboxMessage.findFirstOrThrow({ where: { companyId: box.id, key } });
      const tries = (address: string) => smtp.rcpts.filter((r) => r === address).length;

      let now = at9(2);
      for (let i = 0; i < 6; i++) {
        await deliver.deliverOnce(now);
        const hard = await row("bounce:hard");
        expect(hard).toMatchObject({ status: "failed", attempt: 1, sentAt: null });
        expect(hard.lastError).toMatch(/^Hard bounce: .*550 5\.1\.1 User unknown/);
        expect(tries("gone@x.test")).toBe(1);

        const soft = await row("bounce:soft");
        expect(soft.attempt).toBe(i + 1);
        expect(tries("full@x.test")).toBe(i + 1);
        expect(soft.lastError).toContain("452 4.2.2 Mailbox full");
        if (i < 5) {
          expect(soft.status).toBe("pending");
          expect(soft.nextAt.getTime()).toBe(now.getTime() + BACKOFF_MIN[i] * MIN);
          await deliver.deliverOnce(new Date(soft.nextAt.getTime() - 1));
          expect(tries("full@x.test")).toBe(i + 1);
          now = soft.nextAt;
        }
      }
      expect((await row("bounce:soft")).status).toBe("failed");
      await deliver.deliverOnce(new Date(now.getTime() + 24 * 60 * MIN));
      expect([tries("gone@x.test"), tries("full@x.test")]).toEqual([1, 6]);
      expect(smtp.accepted).toEqual([]);
    } finally {
      if (savedSmtp === undefined) delete process.env.SMTP_URL;
      else process.env.SMTP_URL = savedSmtp;
      await smtp.close();
    }
  }, 60_000);

  it("a sandbox company with the same setup sends nothing and writes every row as skipped", async () => {
    const box = await company("ntfz-sandbox", "sandbox");
    const n = await load();
    await n.dispatchOnce(RAISED_AT);
    await raise(box, "ntfz-s1", RAISED_AT);

    for (const d of TEN_DAYS) await day(n, d);

    const rows = await db.outboxMessage.findMany({ where: { companyId: box.id } });
    const templates = new Set(rows.map((r) => r.template));
    expect(templates).toContain("raised");
    expect(templates).toContain("reminder.deadline");
    expect(templates).toContain("webhook");
    expect(rows.every((r) => r.status === "skipped" && r.lastError === "sandbox" && r.sentAt === null && r.attempt === 0)).toBe(true);
    expect(mail).toEqual([]);
    expect(hits[box.hook]).toBe(0);
  }, 60_000);
});
