import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { SETTINGS_SECTIONS } from "@/features/settings/sections";
import { de } from "@/i18n/de";
import { en } from "@/i18n/en";
import { getDb } from "@/lib/db/client";
import { listOutbox } from "@/lib/db/outbox";
import { createToken, listTokens, resolveToken, revokeToken } from "@/lib/db/tokens";
import { addSecret, keepNewestSecret, listSubscriptions, removeSubscription, saveSubscription, subscriptionsOf, updateSubscription } from "@/lib/db/webhooks";
import { RULES } from "@/server/throttle";

process.env.CONNECTOR_VAULT_KEY ??= "ab".repeat(32);

const db = getDb();
const co: Record<"a" | "b", { id: string; slug: string }> = { a: null as never, b: null as never };

async function makeCompany(slug: string) {
  const c = await db.company.create({ data: { slug, name: slug, seedJson: toSeedJson(SEED) as object } });
  return { id: c.id, slug };
}

beforeAll(async () => {
  await db.company.deleteMany({});
  co.a = await makeCompany("api-a");
  co.b = await makeCompany("api-b");
});
afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("API tables and helpers", () => {
  it("keeps createdBy and revokedAt on a token", async () => {
    const raw = await createToken(co.a.id, "made", ["cases:read"], { createdBy: "user-1" });
    const row = await db.apiToken.findFirstOrThrow({ where: { companyId: co.a.id, name: "made" } });
    expect(row.createdBy).toBe("user-1");
    expect(row.revokedAt).toBeNull();
    expect((await resolveToken(raw))?.id).toBe(row.id);
  });

  it("refuses a revoked token while an old n8n token still resolves", async () => {
    const old = await createToken(co.a.id, "n8n", ["events:read"]);
    const gone = await createToken(co.a.id, "gone", ["cases:read"]);
    const goneId = (await resolveToken(gone))!.id;
    expect(await revokeToken(co.a.id, goneId, new Date())).toBe(true);
    expect(await resolveToken(gone)).toBeNull();
    expect(await revokeToken(co.a.id, goneId, new Date())).toBe(false);
    expect((await resolveToken(old))?.scopes).toEqual(["events:read"]);
  });

  it("serves the old events route with an old token", async () => {
    const raw = await createToken(co.a.id, "n8n", ["events:read"]);
    const { GET } = await import("@/app/api/[company]/events/route");
    const res = await GET(new Request("http://localhost/api/api-a/events", { headers: { authorization: `Bearer ${raw}` } }), { params: Promise.resolve({ company: co.a.slug }) });
    expect(res?.status).toBe(200);
  });

  it("lists tokens and revokes them per company, without hashes", async () => {
    const list = await listTokens(co.a.id);
    expect(list.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(list)).not.toContain("hash");
    expect(list.some((t) => t.revokedAt !== null)).toBe(true);
    expect(await listTokens(co.b.id)).toEqual([]);
    const other = await createToken(co.b.id, "b-token", ["org:read"]);
    const id = (await resolveToken(other))!.id;
    expect(await revokeToken(co.a.id, id, new Date())).toBe(false);
    expect(await resolveToken(other)).not.toBeNull();
  });

  it("updates a subscription, gives it a second secret, keeps the newest and removes it", async () => {
    const id = await saveSubscription(co.a.id, { url: "https://a.example/hook", secrets: ["whsec_one"], events: ["case.raised"], on: true }, "u1");
    expect(await updateSubscription(co.a.id, id, { url: "https://a.example/new", events: ["case.decided"], on: false }, "u2")).toBe(true);
    expect(await updateSubscription(co.b.id, id, { url: "https://x.example", events: [], on: true }, "u2")).toBe(false);
    expect(await addSecret(co.a.id, id, "whsec_two", "u2")).toBe(true);
    let [s] = await subscriptionsOf(co.a.id);
    expect(s).toMatchObject({ url: "https://a.example/new", events: ["case.decided"], on: false, secrets: ["whsec_one", "whsec_two"] });
    const [summary] = await listSubscriptions(co.a.id);
    expect(summary.secretCount).toBe(2);
    expect(JSON.stringify(summary)).not.toContain("whsec");
    expect(await keepNewestSecret(co.a.id, id, "u3")).toBe(true);
    [s] = await subscriptionsOf(co.a.id);
    expect(s.secrets).toEqual(["whsec_two"]);
    expect(await removeSubscription(co.b.id, id)).toBe(false);
    expect(await removeSubscription(co.a.id, id)).toBe(true);
    expect(await listSubscriptions(co.a.id)).toEqual([]);
  });

  it("filters the outbox by channel with a limit, newest first", async () => {
    const base = { recipientUserId: null, address: null, locale: "en", subject: "s", text: "t", link: null, data: {}, status: "pending" as const, lastError: null };
    for (let i = 0; i < 3; i++) {
      await db.outboxMessage.create({ data: { ...base, companyId: co.a.id, channel: "webhook", key: `w${i}`, template: "t", createdAt: new Date(2026, 0, 1 + i) } });
    }
    await db.outboxMessage.create({ data: { ...base, companyId: co.a.id, channel: "mail", key: "m0", template: "t" } });
    expect((await listOutbox(co.a.id, { channel: "webhook" })).map((r) => r.key)).toEqual(["w0", "w1", "w2"]);
    expect((await listOutbox(co.a.id, { channel: "webhook", limit: 2 })).map((r) => r.key)).toEqual(["w2", "w1"]);
    expect(await listOutbox(co.b.id, { channel: "webhook" })).toEqual([]);
  });

  it("has apiV1 at 600 per minute", () => {
    expect(RULES.apiV1).toEqual({ limit: 600, windowMs: 60_000 });
  });

  it("lists importExport after members and webhooks and apiTokens after notifications, labelled in both catalogs", () => {
    const keys = SETTINGS_SECTIONS.map((s) => s.key);
    expect(keys.indexOf("importExport")).toBe(keys.indexOf("members") + 1);
    expect(keys.slice(keys.indexOf("notifications"), keys.indexOf("notifications") + 5)).toEqual(["notifications", "webhooks", "apiTokens", "signIn", "supportAccess"]);
    for (const k of ["importExport", "webhooks", "apiTokens"] as const) {
      const [ns, key] = SETTINGS_SECTIONS.find((s) => s.key === k)!.label.split(".") as [string, string];
      expect((en as Record<string, Record<string, string>>)[ns][key]).toBeTruthy();
      expect((de as Record<string, Record<string, string>>)[ns][key]).toBeTruthy();
    }
  });
});
