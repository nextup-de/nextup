// A company's integrations against a real Postgres (lib/db/integrations.ts): one row per company and
// system, secrets that never come back out of the ordinary reads, an atomic lease, and rows that go
// with the company.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEED } from "@/features/demo/seed";
import { toSeedJson } from "@/features/demo/parse";
import { getDb, TenantScopeError } from "@/lib/db/client";
import {
  claimLease,
  companiesWithIntegrationOn,
  deleteIntegration,
  getIntegration,
  integrationSecrets,
  JIRA,
  recordRun,
  releaseLease,
  saveIntegration,
  setIntegrationOn,
} from "@/lib/db/integrations";

const db = getDb();
let acme: { id: string };
let globex: { id: string };

const SETTINGS = { flavor: "cloud", siteUrl: "https://x.atlassian.net", email: "bot@x.example", projectKey: "NUP", epicTypeId: "1", stepTypeId: "2" };

beforeAll(async () => {
  await db.company.deleteMany({});
  acme = await db.company.create({ data: { slug: "acme", name: "Acme", seedJson: toSeedJson(SEED) as object } });
  globex = await db.company.create({ data: { slug: "globex", name: "Globex", seedJson: toSeedJson(SEED) as object } });
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("saving", () => {
  it("has nothing until it is saved, then one row that starts off", async () => {
    expect(await getIntegration(acme.id, JIRA)).toBeNull();
    await saveIntegration({ companyId: acme.id, system: JIRA, settings: SETTINGS, secretSealed: "v1.a", updatedBy: "B. Hartmann" });
    const row = await getIntegration(acme.id, JIRA);
    expect(row).toMatchObject({ on: false, enabledAt: null, settings: SETTINGS, hasSecret: true, hasWebhookSecret: false, pushedSeq: 0, updatedBy: "B. Hartmann" });
    expect(await getIntegration(globex.id, JIRA)).toBeNull();
  });

  it("never hands the sealed values to an ordinary read", async () => {
    const row = await getIntegration(acme.id, JIRA);
    expect(JSON.stringify(row)).not.toContain("v1.a");
    expect(await integrationSecrets(acme.id, JIRA)).toEqual({ secretSealed: "v1.a", webhookSecretSealed: null });
  });

  it("saving again keeps the token unless a new one comes, and null removes it", async () => {
    await saveIntegration({ companyId: acme.id, system: JIRA, settings: { ...SETTINGS, projectKey: "OPS" }, updatedBy: "B. Hartmann" });
    expect((await integrationSecrets(acme.id, JIRA))?.secretSealed).toBe("v1.a");
    expect((await getIntegration(acme.id, JIRA))?.settings).toMatchObject({ projectKey: "OPS" });
    await saveIntegration({ companyId: acme.id, system: JIRA, settings: SETTINGS, secretSealed: "v1.b", webhookSecretSealed: "v1.w", updatedBy: null });
    expect(await integrationSecrets(acme.id, JIRA)).toEqual({ secretSealed: "v1.b", webhookSecretSealed: "v1.w" });
    await saveIntegration({ companyId: acme.id, system: JIRA, settings: SETTINGS, webhookSecretSealed: null, updatedBy: null });
    expect(await integrationSecrets(acme.id, JIRA)).toEqual({ secretSealed: "v1.b", webhookSecretSealed: null });
    expect(await db.integration.count({ where: { companyId: acme.id } })).toBe(1);
  });

  it("a saved change clears the last error", async () => {
    await recordRun(acme.id, JIRA, { error: "401 Unauthorized" });
    expect((await getIntegration(acme.id, JIRA))?.lastError).toBe("401 Unauthorized");
    await saveIntegration({ companyId: acme.id, system: JIRA, settings: SETTINGS, secretSealed: "v1.c", updatedBy: null });
    expect((await getIntegration(acme.id, JIRA))?.lastError).toBeNull();
  });

  it("refuses a query that does not name a company", async () => {
    await expect(db.integration.findMany({})).rejects.toBeInstanceOf(TenantScopeError);
  });
});

describe("switching on and off", () => {
  it("does nothing without a row", async () => {
    expect(await setIntegrationOn(globex.id, JIRA, true, "x")).toBe(false);
    expect(await getIntegration(globex.id, JIRA)).toBeNull();
  });

  it("switching on stamps enabledAt once; switching off and on again stamps the new moment", async () => {
    const t1 = new Date("2026-10-29T10:00:00Z");
    const t2 = new Date("2026-10-29T12:00:00Z");
    expect(await setIntegrationOn(acme.id, JIRA, true, "B. Hartmann", t1)).toBe(true);
    expect(await setIntegrationOn(acme.id, JIRA, true, "B. Hartmann", t2)).toBe(true); // already on: no new stamp
    expect(await getIntegration(acme.id, JIRA)).toMatchObject({ on: true, enabledAt: t1 });
    await setIntegrationOn(acme.id, JIRA, false, "B. Hartmann");
    expect(await getIntegration(acme.id, JIRA)).toMatchObject({ on: false, enabledAt: t1 });
    await setIntegrationOn(acme.id, JIRA, true, "B. Hartmann", t2);
    expect((await getIntegration(acme.id, JIRA))?.enabledAt).toEqual(t2);
  });

  it("the loop walks only the companies that have it on", async () => {
    await saveIntegration({ companyId: globex.id, system: JIRA, settings: SETTINGS, secretSealed: "v1.g", updatedBy: null });
    expect((await companiesWithIntegrationOn(JIRA)).map((c) => c.slug)).toEqual(["acme"]);
    await setIntegrationOn(globex.id, JIRA, true, null);
    expect((await companiesWithIntegrationOn(JIRA)).map((c) => c.slug).sort()).toEqual(["acme", "globex"]);
    await setIntegrationOn(globex.id, JIRA, false, null);
    expect(await companiesWithIntegrationOn("azure")).toEqual([]);
  });
});

describe("the lease", () => {
  const t0 = new Date("2026-10-29T10:00:00Z");
  const after = (ms: number) => new Date(t0.getTime() + ms);

  it("goes to one runner at a time, and again once it expires or is released", async () => {
    await releaseLease(acme.id, JIRA);
    expect(await claimLease(acme.id, JIRA, 60_000, t0)).toBe(true);
    expect(await claimLease(acme.id, JIRA, 60_000, after(1_000))).toBe(false);
    expect(await claimLease(acme.id, JIRA, 60_000, after(61_000))).toBe(true); // the first runner died
    await releaseLease(acme.id, JIRA);
    expect(await claimLease(acme.id, JIRA, 60_000, after(62_000))).toBe(true);
    expect((await getIntegration(acme.id, JIRA))?.lastRunAt).toEqual(after(62_000));
  });

  it("two claims at once give it to exactly one", async () => {
    await releaseLease(acme.id, JIRA);
    const results = await Promise.all([1, 2, 3, 4].map(() => claimLease(acme.id, JIRA, 60_000, t0)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("is not given for an integration that is off or missing, and switching off drops it", async () => {
    expect(await claimLease(globex.id, JIRA, 60_000, t0)).toBe(false); // off
    expect(await claimLease(acme.id, "azure", 60_000, t0)).toBe(false); // no such row
    await setIntegrationOn(acme.id, JIRA, false, null);
    expect((await getIntegration(acme.id, JIRA))?.leaseUntil).toBeNull();
    await setIntegrationOn(acme.id, JIRA, true, null);
  });
});

describe("recording a round", () => {
  it("a good round moves the cursors, stores the account and clears the error", async () => {
    await recordRun(acme.id, JIRA, { error: "502 Bad Gateway" });
    const now = new Date("2026-10-29T10:10:00Z");
    const pulledAt = new Date("2026-10-29T10:09:30Z");
    await recordRun(acme.id, JIRA, { pushedSeq: 42, pulledAt, account: { id: "acc-1", name: "NextUp bot" } }, now);
    expect(await getIntegration(acme.id, JIRA)).toMatchObject({
      pushedSeq: 42, pulledAt, lastOkAt: now, lastError: null, account: { id: "acc-1", name: "NextUp bot" },
    });
  });

  it("a failed round says why and moves nothing", async () => {
    const before = await getIntegration(acme.id, JIRA);
    await recordRun(acme.id, JIRA, { error: "x".repeat(900), pushedSeq: 99 });
    const after = await getIntegration(acme.id, JIRA);
    expect(after?.lastError).toHaveLength(500);
    expect(after).toMatchObject({ pushedSeq: before?.pushedSeq, lastOkAt: before?.lastOkAt });
  });
});

describe("removing", () => {
  it("deleting the integration removes the row and its secrets; deleting the company removes the rest", async () => {
    expect(await deleteIntegration(globex.id, JIRA)).toBe(true);
    expect(await deleteIntegration(globex.id, JIRA)).toBe(false);
    expect(await integrationSecrets(globex.id, JIRA)).toBeNull();
    await db.company.delete({ where: { id: acme.id } });
    expect(await db.integration.count({ where: { companyId: acme.id } })).toBe(0);
  });
});
