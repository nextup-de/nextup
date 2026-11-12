// INB-G1: the migration gives CompanyConfig a notice-channel rule per group and OutboxMessage a read mark.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";

const db = getDb();
const slug = `inb-tables-${Date.now().toString(36)}`;
let companyId = "";

beforeAll(async () => {
  companyId = (await db.company.create({ data: { slug, name: slug, stage: "pilot", seedJson: {} } })).id;
});

afterAll(async () => {
  await db.company.delete({ where: { id: companyId } });
});

describe("INB tables", () => {
  it("gives a new CompanyConfig row empty notice channels", async () => {
    const config = await db.companyConfig.create({ data: { companyId } });
    expect(config.noticeChannels).toEqual({});
  });

  it("stores an in-app notice that is unread until readAt is set", async () => {
    const row = await db.outboxMessage.create({
      data: { companyId, channel: "inapp", key: "inb-g1-1", recipientUserId: "u_x", template: "raised", locale: "en", subject: "s", text: "t", status: "sent", sentAt: new Date() },
    });
    expect((await db.outboxMessage.findUniqueOrThrow({ where: { id: row.id } })).readAt).toBeNull();
    const readAt = new Date("2026-12-15T10:00:00Z");
    await db.outboxMessage.update({ where: { id: row.id }, data: { readAt } });
    expect((await db.outboxMessage.findUniqueOrThrow({ where: { id: row.id } })).readAt?.toISOString()).toBe(readAt.toISOString());
  });
});
