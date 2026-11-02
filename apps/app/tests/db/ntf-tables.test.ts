// NTF-G1: the outbox, webhook subscription and preference tables with their helpers, against a real Postgres.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { claimDue, enqueue, listOutbox, type OutboxDraft } from "@/lib/db/outbox";
import { prefsOf, setPref } from "@/lib/db/notify-prefs";
import { saveSubscription, subscriptionsOf } from "@/lib/db/webhooks";

const db = getDb();
const savedKey = process.env.CONNECTOR_VAULT_KEY;
let a: string;
let b: string;

const draft = (key: string, over: Partial<OutboxDraft> = {}): OutboxDraft => ({
  channel: "mail", key, recipientUserId: null, address: "x@ntf.example", template: "raised", locale: "en",
  subject: "s", text: "t", link: null, data: {}, status: "pending", lastError: null, ...over,
});

beforeAll(async () => {
  process.env.CONNECTOR_VAULT_KEY = "ab".repeat(32);
  await db.company.deleteMany({});
  const mk = (slug: string) => db.company.create({ data: { slug, name: slug, stage: "pilot", seedJson: {} } });
  a = (await mk("ntf-a")).id;
  b = (await mk("ntf-b")).id;
});

afterAll(async () => {
  await db.company.deleteMany({});
  if (savedKey === undefined) delete process.env.CONNECTOR_VAULT_KEY;
  else process.env.CONNECTOR_VAULT_KEY = savedKey;
  await db.$disconnect();
});

describe("NTF outbox tables", () => {
  it("two enqueues of the same key write one row", async () => {
    expect(await enqueue(a, [draft("k1")])).toBe(1);
    expect(await enqueue(a, [draft("k1"), draft("k2")])).toBe(1);
    expect((await listOutbox(a, { key: "k1" })).length).toBe(1);
    expect(await enqueue(a, [])).toBe(0);
  });

  it("another company's rows are not in listOutbox", async () => {
    await enqueue(b, [draft("kb", { template: "digest" })]);
    expect((await listOutbox(a)).map((r) => r.key)).toEqual(["k1", "k2"]);
    expect((await listOutbox(b)).map((r) => r.key)).toEqual(["kb"]);
    expect((await listOutbox(a, { template: "digest" })).length).toBe(0);
    expect((await listOutbox(b, { status: "skipped" })).length).toBe(0);
  });

  it("claimDue from two concurrent calls returns each row once", async () => {
    const now = new Date(Date.now() + 60_000); // after the rows' nextAt default
    await enqueue(a, Array.from({ length: 6 }, (_, i) => draft(`c${i}`, { template: "claim" })));
    await db.outboxMessage.deleteMany({ where: { template: { not: "claim" } } });
    const [x, y] = await Promise.all([claimDue(now, 10), claimDue(now, 10)]);
    const ids = [...x, ...y].map((r) => r.id);
    expect(ids.length).toBe(6);
    expect(new Set(ids).size).toBe(6);
    expect([...x, ...y].every((r) => r.attempt === 1)).toBe(true);
  });

  it("a saved subscription's stored secret is not the plain secret and subscriptionsOf gives the plain one back", async () => {
    const id = await saveSubscription(a, { url: "https://hook.example/in", secrets: ["s3cret-one", "s3cret-two"], events: ["case.raised"], on: true }, "u1");
    const row = await db.webhookSubscription.findUniqueOrThrow({ where: { id } });
    expect(row.secrets.length).toBe(2);
    expect(row.secrets.join("")).not.toContain("s3cret");
    const subs = await subscriptionsOf(a);
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ id, url: "https://hook.example/in", secrets: ["s3cret-one", "s3cret-two"], on: true, updatedBy: "u1" });
    expect(await subscriptionsOf(b)).toEqual([]);
    // A secret moved to another company does not open there: it is dropped.
    await db.webhookSubscription.update({ where: { id }, data: { companyId: b } });
    expect((await subscriptionsOf(b))[0].secrets).toEqual([]);
  });

  it("prefs are per company", async () => {
    await setPref(a, "u1", "digest", true);
    await setPref(a, "u1", "digest", false);
    await setPref(b, "u1", "*", true);
    expect(await prefsOf(a, ["u1"])).toEqual([{ userId: "u1", template: "digest", on: false }]);
    expect(await prefsOf(b, ["u1"])).toEqual([{ userId: "u1", template: "*", on: true }]);
    expect(await prefsOf(a, [])).toEqual([]);
  });
});
