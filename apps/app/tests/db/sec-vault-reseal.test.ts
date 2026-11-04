// SEC-V1 (D8): resealAll against a real Postgres, two companies, every sealed column.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEED } from "@/features/demo/seed";
import { toSeedJson } from "@/features/demo/parse";
import { totpContext } from "@/features/auth/totp";
import { integrationContext, open, openWith, seal, vaultContext } from "@/features/connectors/vault";
import { getDb } from "@/lib/db/client";
import { resealAll } from "@/lib/db/vault-reseal";
import { webhookContext } from "@/lib/db/webhooks";

const db = getDb();
const oldKey = Buffer.from("11".repeat(32), "hex");
const newKey = Buffer.from("22".repeat(32), "hex");

type Co = { id: string; userId: string; connId: string; jiraId: string; aiId: string; hookId: string };
const cos: Co[] = [];

async function company(slug: string): Promise<Co> {
  const c = await db.company.create({ data: { slug, name: slug, seedJson: toSeedJson(SEED) as object } });
  const u = await db.user.create({
    data: { companyId: c.id, name: slug, email: `${slug}@x.example`, role: "member", totpSecretSealed: seal(`totp-${slug}`, oldKey, totpContext(c.id, "pending")) },
    select: { id: true },
  });
  await db.user.update({ where: { id: u.id, companyId: c.id }, data: { totpSecretSealed: seal(`totp-${slug}`, oldKey, totpContext(c.id, u.id)) } });
  const conn = await db.connection.create({
    data: { companyId: c.id, userId: u.id, provider: "m365", scopes: [], refreshTokenSealed: seal(`rt-${slug}`, oldKey, vaultContext(c.id, u.id)) },
    select: { id: true },
  });
  const jira = await db.integration.create({
    data: {
      companyId: c.id,
      system: "jira",
      settings: {},
      secretSealed: seal(`jira-${slug}`, oldKey, integrationContext(c.id, "jira")),
      webhookSecretSealed: seal(`hook-${slug}`, oldKey, integrationContext(c.id, "jira")),
    },
    select: { id: true },
  });
  const ai = await db.integration.create({
    data: { companyId: c.id, system: "ai", settings: {}, secretSealed: seal(`ai-${slug}`, oldKey, integrationContext(c.id, "ai")) },
    select: { id: true },
  });
  const hook = await db.webhookSubscription.create({
    data: { companyId: c.id, url: "https://x.example/h", events: [], secrets: [seal(`w1-${slug}`, oldKey, webhookContext(c.id)), seal(`w2-${slug}`, newKey, webhookContext(c.id))] },
    select: { id: true },
  });
  return { id: c.id, userId: u.id, connId: conn.id, jiraId: jira.id, aiId: ai.id, hookId: hook.id };
}

beforeAll(async () => {
  await db.company.deleteMany({});
  cos.push(await company("acme"), await company("globex"));
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

async function opensWithNew(): Promise<boolean[]> {
  const out: boolean[] = [];
  for (const [i, slug] of ["acme", "globex"].entries()) {
    const c = cos[i];
    const user = await db.user.findFirstOrThrow({ where: { id: c.userId, companyId: c.id } });
    const conn = await db.connection.findFirstOrThrow({ where: { id: c.connId, companyId: c.id } });
    const jira = await db.integration.findFirstOrThrow({ where: { id: c.jiraId, companyId: c.id } });
    const ai = await db.integration.findFirstOrThrow({ where: { id: c.aiId, companyId: c.id } });
    const hook = await db.webhookSubscription.findFirstOrThrow({ where: { id: c.hookId, companyId: c.id } });
    out.push(
      openWith(user.totpSecretSealed ?? "", newKey, totpContext(c.id, c.userId)) === `totp-${slug}`,
      openWith(conn.refreshTokenSealed, newKey, vaultContext(c.id, c.userId)) === `rt-${slug}`,
      openWith(jira.secretSealed ?? "", newKey, integrationContext(c.id, "jira")) === `jira-${slug}`,
      openWith(jira.webhookSecretSealed ?? "", newKey, integrationContext(c.id, "jira")) === `hook-${slug}`,
      openWith(ai.secretSealed ?? "", newKey, integrationContext(c.id, "ai")) === `ai-${slug}`,
      openWith(hook.secrets[0], newKey, webhookContext(c.id)) === `w1-${slug}`,
      openWith(hook.secrets[1], newKey, webhookContext(c.id)) === `w2-${slug}`,
    );
  }
  return out;
}

describe("SEC vault re-seal", () => {
  it("re-seals every value of both companies, then a second run changes nothing, and a broken value is failed and untouched", async () => {
    expect((await opensWithNew()).every(Boolean)).toBe(false);

    const failedRows: string[] = [];
    const first = await resealAll({ current: newKey, previous: oldKey }, db, (m, id) => failedRows.push(`${m}:${id}`));
    // per company: totp, connection, 2 jira secrets, ai, 1 old webhook secret re-sealed; 1 webhook secret already current
    expect(first).toEqual({ resealed: 12, left: 2, failed: 0 });
    expect(failedRows).toEqual([]);
    expect((await opensWithNew()).every(Boolean)).toBe(true);

    const second = await resealAll({ current: newKey, previous: oldKey }, db);
    expect(second).toEqual({ resealed: 0, left: 14, failed: 0 });

    const stranger = Buffer.from("33".repeat(32), "hex");
    const c = cos[0];
    const broken = seal("lost", stranger, integrationContext(c.id, "jira"));
    await db.integration.update({ where: { id: c.jiraId, companyId: c.id }, data: { secretSealed: broken } });
    const third = await resealAll({ current: newKey, previous: oldKey }, db, (m, id) => failedRows.push(`${m}:${id}`));
    expect(third).toEqual({ resealed: 0, left: 13, failed: 1 });
    expect(failedRows).toEqual([`Integration:${c.jiraId}`]);
    const after = await db.integration.findFirstOrThrow({ where: { id: c.jiraId, companyId: c.id } });
    expect(after.secretSealed).toBe(broken);
    expect(open(broken, newKey, integrationContext(c.id, "jira"))).toBeNull();
  });
});
