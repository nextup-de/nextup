import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db/client";

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));

const { consoleOverviewFacts } = await import("@/server/console-guard");

const db = getDb();
let a = "";
let b = "";
const HOUR = 3600_000;
const JIRA_SETTINGS = { flavor: "cloud", siteUrl: "https://x.atlassian.net", email: "bot@x.example", projectKey: "NUP", epicTypeId: "1", stepTypeId: "2" };
const grant = (companyId: string, expiresAt: Date, revokedAt: Date | null = null) =>
  db.supportGrant.create({ data: { companyId, codeHash: "s:h", expiresAt, revokedAt, openedBy: "Kim" } });

beforeAll(async () => {
  await db.supportGrant.deleteMany({});
  await db.company.deleteMany({});
  a = (await db.company.create({ data: { slug: "acme", name: "Acme", seedJson: {} } })).id;
  b = (await db.company.create({ data: { slug: "other", name: "Other", seedJson: {} } })).id;
});

beforeEach(async () => {
  await db.supportGrant.deleteMany({});
  for (const companyId of [a, b]) {
    await db.integration.deleteMany({ where: { companyId } });
    await db.companyConfig.deleteMany({ where: { companyId } });
    await db.user.deleteMany({ where: { companyId } });
  }
});

afterAll(async () => {
  await db.supportGrant.deleteMany({});
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("ITC console overview facts", () => {
  it("gives an open grant's end as support.until, and null for an expired or revoked one", async () => {
    expect((await consoleOverviewFacts(a)).support).toBeNull();
    const until = new Date(Date.now() + HOUR);
    await grant(a, until);
    expect((await consoleOverviewFacts(a)).support).toEqual({ until });
    await db.supportGrant.deleteMany({});
    await grant(a, new Date(Date.now() - HOUR));
    await grant(a, new Date(Date.now() + HOUR), new Date());
    expect((await consoleOverviewFacts(a)).support).toBeNull();
  });

  it("counts Jira, Microsoft 365 and the AI provider as connectors", async () => {
    expect((await consoleOverviewFacts(a)).connectors).toEqual({ jira: false, m365: false, ai: false });
    await db.integration.create({ data: { companyId: a, system: "jira", on: true, settings: JIRA_SETTINGS, secretSealed: "v1.a" } });
    await db.companyConfig.create({ data: { companyId: a, m365Search: true } });
    await db.integration.create({ data: { companyId: a, system: "ai", on: true, settings: { choice: "bedrock", model: "m" } } });
    const f = await consoleOverviewFacts(a);
    expect(f.connectors).toEqual({ jira: true, m365: true, ai: true });
    expect(f.jira).toBe(true);
  });

  it("ignores another company's admins, grants and connectors", async () => {
    await db.user.create({ data: { companyId: b, name: "Bo", email: "bo@x.example", role: "manager", isStackAdmin: true } });
    await grant(b, new Date(Date.now() + HOUR));
    await db.companyConfig.create({ data: { companyId: b, m365Search: true } });
    const f = await consoleOverviewFacts(a);
    expect(f.admins).toBe(0);
    expect(f.support).toBeNull();
    expect(f.connectors.m365).toBe(false);
    expect((await consoleOverviewFacts(b)).admins).toBe(1);
  });
});
