// GDP-G1: the six privacy tables, the audit helpers and recordAudit, against a real Postgres.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { appendAudit, countAudit, listAudit, type AuditClient, type AuditDraft } from "@/lib/db/audit";
import { SYSTEM_ACTOR, recordAudit, settingsActor, type AuditEntry } from "@/server/audit/record";
import { SETTINGS_SECTIONS } from "@/features/settings/sections";

const db = getDb();
let a: string;
let b: string;

const draft = (companyId: string, over: Partial<AuditDraft> = {}): AuditDraft => ({
  companyId, actorKind: "admin", actorUserId: "u1", action: "audit.member.role", targetKind: "member", targetId: "u2",
  changes: { role: { before: "member", after: "leader" } }, source: "settings", ...over,
});
const pause = () => new Promise((r) => setTimeout(r, 5));

beforeAll(async () => {
  await db.company.deleteMany({});
  const mk = (slug: string) => db.company.create({ data: { slug, name: slug, stage: "pilot", seedJson: {} } });
  a = (await mk("gdp-a")).id;
  b = (await mk("gdp-b")).id;
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("GDP tables", () => {
  it("holds one row in each of the six tables and removes them with the company", async () => {
    const c = (await db.company.create({ data: { slug: "gdp-tmp", name: "tmp", stage: "pilot", seedJson: {} } })).id;
    await appendAudit(draft(c));
    await db.dataExport.create({ data: { companyId: c, kind: "company", requestedByUserId: "u1", deliverTo: "admin", expiresAt: new Date(Date.now() + 1000) } });
    await db.retentionRule.create({ data: { companyId: c, kind: "assist_turns", keepDays: 90 } });
    await db.retentionRun.create({ data: { companyId: c } });
    await db.privacyPolicy.create({ data: { companyId: c } });
    await db.pseudonym.create({ data: { companyId: c, userId: "u9", number: 1, label: "Person 1" } });
    const count = () =>
      Promise.all([
        db.auditEvent.count({ where: { companyId: c } }),
        db.dataExport.count({ where: { companyId: c } }),
        db.retentionRule.count({ where: { companyId: c } }),
        db.retentionRun.count({ where: { companyId: c } }),
        db.privacyPolicy.count({ where: { companyId: c } }),
        db.pseudonym.count({ where: { companyId: c } }),
      ]);
    expect(await count()).toEqual([1, 1, 1, 1, 1, 1]);
    expect((await db.privacyPolicy.findUniqueOrThrow({ where: { companyId: c } })).reportScreenshots).toBe(true);
    await db.company.delete({ where: { id: c } });
    expect(await count()).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("listAudit gives the company's rows newest first, filtered by area, actor kind and person", async () => {
    await appendAudit(draft(a, { targetId: "first" }));
    await pause();
    await appendAudit(draft(a, { actorKind: "console", actorUserId: null, action: "audit.connector.on", targetKind: "connector", targetId: "second", source: "console" }));
    await pause();
    await appendAudit(draft(a, { actorUserId: "u7", action: "audit.settings.rules", targetId: "third", source: "settings" }));
    await appendAudit(draft(b, { targetId: "other" }));

    expect((await listAudit(a, { take: 50 })).map((r) => r.targetId)).toEqual(["third", "second", "first"]);
    expect((await listAudit(b, { take: 50 })).map((r) => r.targetId)).toEqual(["other"]);
    expect(await countAudit(a, {})).toBe(3);
    expect((await listAudit(a, { take: 50, actions: ["audit.connector.on"] })).map((r) => r.targetId)).toEqual(["second"]);
    expect((await listAudit(a, { take: 50, actorKinds: ["console"] })).map((r) => r.targetId)).toEqual(["second"]);
    expect((await listAudit(a, { take: 50, actorUserId: "u7" })).map((r) => r.targetId)).toEqual(["third"]);
    expect(await countAudit(a, { actorKinds: ["admin"] })).toBe(2);

    const page1 = await listAudit(a, { take: 2 });
    const last = page1[1];
    const page2 = await listAudit(a, { take: 2, cursor: { at: last.at, id: last.id } });
    expect([...page1, ...page2].map((r) => r.targetId)).toEqual(["third", "second", "first"]);
  });

  it("recordAudit writes a row and refuses an unknown action", async () => {
    const row = await recordAudit(a, {
      actor: settingsActor({ userId: "u1" }), action: "audit.company.saved", target: { kind: "company", id: a },
      changes: { name: { before: "x", after: "y" } }, source: "settings",
    });
    expect(row).toMatchObject({ actorKind: "admin", actorUserId: "u1", action: "audit.company.saved" });
    const bad = { actor: SYSTEM_ACTOR, action: "audit.member.ranked", source: "scheduler" } as unknown as AuditEntry;
    await expect(recordAudit(a, bad)).rejects.toThrow(/unknown action/);
  });

  it("recordAudit rejects when the database client fails, and rolls back with its transaction", async () => {
    const broken = { auditEvent: { create: () => Promise.reject(new Error("db down")) } } as unknown as AuditClient;
    const retention: AuditEntry = { actor: SYSTEM_ACTOR, action: "audit.privacy.retention_run", source: "scheduler" };
    await expect(recordAudit(a, retention, broken)).rejects.toThrow("db down");

    const before = await countAudit(a, {});
    await expect(
      db.$transaction(async (tx) => {
        await tx.company.update({ where: { id: a }, data: { name: "changed" } });
        await recordAudit(a, retention, tx);
        await recordAudit(a, retention, broken);
      }),
    ).rejects.toThrow("db down");
    expect(await countAudit(a, {})).toBe(before);
    expect((await db.company.findUniqueOrThrow({ where: { id: a } })).name).toBe("gdp-a");
  });

  it("SETTINGS_SECTIONS ends with privacy and audit", () => {
    expect(SETTINGS_SECTIONS.slice(-2).map((s) => s.key)).toEqual(["privacy", "audit"]);
  });
});
