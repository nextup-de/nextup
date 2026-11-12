// NTF-C1: the dispatcher plans the log into the outbox, and the old senders are off. Against a real Postgres;
// mail goes through the real mail channel with sendMail replaced by a recorder (never SMTP).
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { usersOfRole } from "@/features/auth/identity";
import { buildRaisedNotice } from "@/features/cases/notice";
import { stampEvent } from "@/features/cases/stamp";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { companySeed } from "@/lib/db/companies";
import { getDb } from "@/lib/db/client";
import { appendEventRow } from "@/lib/db/events";
import { bindDemoCompany } from "@/lib/db/demo-identity";
import { writeStructure } from "@/lib/db/structure-writes";
import { deliverRaisedNotice } from "@/server/case-notice";
import { deliverOnce } from "@/server/notify/deliver";
import { dispatchOnce } from "@/server/notify/dispatch";

const sent: { to: string; subject: string }[] = [];
vi.mock("@/server/mail", async (orig) => ({
  ...(await orig<typeof import("@/server/mail")>()),
  mailConfigured: () => true,
  sendMail: async (m: { to: string; subject: string }) => {
    sent.push({ to: m.to, subject: m.subject });
    return { ok: true };
  },
}));

const db = getDb();
const SLUG = "ntf-dispatch";
let companyId = "";
let routeId = "";
let ownerEmails: string[] = [];
let raiserId = "";
const later = () => new Date(Date.now() + 60_000);

/** A raise the way appendEventAction stores it: the server stamps the seat, the actor user id comes from the session. */
async function raise(id: string): Promise<void> {
  const company = await db.company.findUniqueOrThrow({ where: { id: companyId }, select: { id: true, seedJson: true, stage: true } });
  const seed = await companySeed(company);
  const payload = stampEvent("case.raised", { title: "Scanner " + id, body: "It does not read.", routeId, kind: "problem" }, seed);
  const r = await appendEventRow(companyId, { id, day: 0, type: "case.raised", actor: "Anonymous #4471", targetId: "c_" + id, payload }, { actorUserId: raiserId });
  expect(r.ok).toBe(true);
}

const rowsOf = (prefix: string) => db.outboxMessage.findMany({ where: { companyId, key: { startsWith: prefix } }, orderBy: { key: "asc" } });
const seqOf = async (id: string) => (await db.caseEvent.findFirstOrThrow({ where: { companyId, id } })).seq;
const cursor = () => db.notifyCursor.findUniqueOrThrow({ where: { companyId } });

beforeAll(async () => {
  await db.company.deleteMany({});
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const person = (name: string, role: string, handle?: string) => ({
    name, email: name.replace(/\W+/g, "").toLowerCase() + "@ntf-dispatch.example", role, dept: "", ini: "XX", handle: handle ?? null,
  });
  const c = await db.company.create({
    data: {
      slug: SLUG, name: "NTF dispatch", seedJson: toSeedJson(writes.seedJson) as object,
      users: { create: [person("B. Hartmann", "manager"), person("T. Vogel", "leader"), person("J. Schmidt", "member", "Anonymous #4471")] },
    },
  });
  companyId = c.id;
  await writeStructure(c.id, writes, "test");
  await bindDemoCompany(c.id);
  raiserId = (await db.user.findFirstOrThrow({ where: { companyId, name: "J. Schmidt" } })).id;
  const seed = await companySeed({ id: c.id, seedJson: c.seedJson, stage: c.stage });
  // A route whose owner seat is held by somebody other than the raiser.
  for (const r of seed.routes) {
    const seat = seed.seats.find((s) => s.id === r.ownerSeatId);
    const users = seat ? usersOfRole(seed.seats, seat.roleId) : [];
    if (users.length && !users.includes(raiserId)) {
      routeId = r.id;
      const found = await db.user.findMany({ where: { companyId, id: { in: users } }, select: { email: true } });
      ownerEmails = found.map((u) => u.email);
      break;
    }
  }
  expect(routeId).not.toBe("");
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("NTF dispatcher", () => {
  it("plans events appended after the first run once, and gives history nothing", async () => {
    await raise("h1");
    await dispatchOnce();
    expect(await db.outboxMessage.count({ where: { companyId } })).toBe(0);
    expect((await cursor()).seq).toBe(await seqOf("h1"));

    await raise("r1");
    const first = await dispatchOnce();
    expect(first.events).toBe(1);
    const rows = await rowsOf("notify:r1");
    expect(rows.length).toBe(ownerEmails.length);
    expect(rows[0].key).toBe("notify:r1");
    expect(rows.every((r) => r.template === "raised" && r.status === "pending")).toBe(true);
    expect(rows.map((r) => r.address).sort()).toEqual([...ownerEmails].sort());
    expect(await rowsOf("notify:h1")).toEqual([]);

    const second = await dispatchOnce();
    expect(second.events).toBe(0);
    expect(await rowsOf("notify:r1")).toHaveLength(rows.length);
  });

  it("writes no duplicate row when the cursor is rolled back by hand", async () => {
    const before = await db.outboxMessage.count({ where: { companyId } });
    await db.notifyCursor.update({ where: { companyId }, data: { seq: await seqOf("h1") } });
    const run = await dispatchOnce();
    expect(run.events).toBeGreaterThan(0);
    expect(run.rows).toBe(0);
    expect(await db.outboxMessage.count({ where: { companyId } })).toBe(before);
    expect((await cursor()).seq).toBe(await seqOf("r1"));
  });

  it("skips a company whose lease another instance holds", async () => {
    await raise("r2");
    await db.notifyCursor.update({ where: { companyId }, data: { leaseUntil: new Date(Date.now() + 5 * 60_000) } });
    const run = await dispatchOnce();
    expect(run.skipped).toBeGreaterThan(0);
    expect(await rowsOf("notify:r2")).toEqual([]);

    await db.notifyCursor.update({ where: { companyId }, data: { leaseUntil: null } });
    await dispatchOnce();
    expect((await rowsOf("notify:r2")).length).toBe(ownerEmails.length);
    expect((await cursor()).leaseUntil).toBeNull();
  });

  it("plans nothing for a person who left (Q10.18)", async () => {
    const gone = ownerEmails[0];
    await db.user.updateMany({ where: { companyId, email: gone }, data: { active: false } });
    try {
      await raise("gone1");
      await dispatchOnce();
      const rows = await rowsOf("notify:gone1");
      expect(rows.map((r) => r.address)).not.toContain(gone);
      expect(rows.length).toBe(ownerEmails.length - 1);
    } finally {
      await db.user.updateMany({ where: { companyId, email: gone }, data: { active: true } });
    }
  });
});

describe("NTF old senders off", () => {
  beforeEach(async () => {
    await db.outboxMessage.deleteMany({});
    sent.length = 0;
  });

  it("a raise gives one raised mail from the outbox and the note on the case, and the resend reuses the row", async () => {
    await dispatchOnce(); // own the cursor: this describe must not depend on the one above having run
    await raise("r3");
    await dispatchOnce();
    await deliverOnce(later());
    expect(sent.map((m) => m.to).sort()).toEqual([...ownerEmails].sort());

    const noted = await db.caseEvent.findMany({ where: { companyId, idemKey: "notify:r3" } });
    expect(noted).toHaveLength(1);
    expect(noted[0].type).toBe("case.commented");

    const company = await db.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { id: true, stage: true, demoDay: true, seedJson: true, users: { select: { id: true, name: true, email: true } } },
    });
    const ev = await db.caseEvent.findFirstOrThrow({ where: { companyId, id: "r3" } });
    const result = await deliverRaisedNotice(
      companyId,
      buildRaisedNotice({
        slug: SLUG, eventId: "r3", caseId: ev.targetId ?? "", payload: ev.payload as never,
        seed: await companySeed(company), people: company.users, day: 0, baseUrl: "https://x.example",
      }),
    );
    expect(result).toEqual({ ok: true });
    expect(sent).toHaveLength(ownerEmails.length);
    expect(await db.outboxMessage.count({ where: { companyId, key: "notify:r3" } })).toBe(1);
  });

  it("nothing in src imports notifyCaseRaised or notifyLoop", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && /\b(notifyCaseRaised|notifyLoop)\b/.test(fs.readFileSync(p, "utf8"))) hits.push(p);
      }
    };
    walk(path.resolve(__dirname, "../../src"));
    expect(hits).toEqual([]);
    // Reads every file of src: 1 s warm, over 30 s cold on a lane just switched to its branch on a busy PC.
  }, 120_000);
});
