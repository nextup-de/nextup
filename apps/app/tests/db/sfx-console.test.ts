// SFX-C1 on the proof database: a console admin saves the SuccessFactors credentials (one audit row, the key as a
// secret field), tests the connection against the fake, switches the directory source and on (directory audit),
// runs it now, and a read-only support session is refused.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SF_SELECT } from "@/features/directory/successfactors";
import { getDb } from "@/lib/db/client";
import { loadDirectoryStatus } from "@/lib/db/directory-run";
import { getIntegration } from "@/lib/db/integrations";
import { fakeSuccessFactors } from "../fixtures/successfactors/fake-fetch";
import { makeTestKeys } from "../fixtures/successfactors/keys";

let via: string = "entra";
let guard: { companyId: string; slug: string } | null = null;
vi.mock("@/server/console-guard", () => ({ consoleCompany: vi.fn(async () => (guard ? { ...guard, via } : null)) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/admin-session", () => ({ adminActor: vi.fn(async () => "console-test") }));

import { saveSuccessFactorsAction, testSuccessFactorsAction } from "@/server/actions/successfactors-admin";
import { runDirectoryNowAction, setDirectoryAction } from "@/server/actions/directory-admin";

const db = getDb();
const HOST = "https://api4.example.test";
const AS = new Date().toISOString().slice(0, 10);
const keys = makeTestKeys();
const form = { apiHost: HOST, companyId: "Musterwerk", clientId: "client-abc", apiUserId: "NEXTUP_API", privateKey: keys.privateKeyPem };
const page = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, "../fixtures/successfactors/pages", `${name}.json`), "utf8"));
const url = (e: keyof typeof SF_SELECT, asOf?: string): string =>
  `${HOST}/odata/v2/${e}?$select=${SF_SELECT[e].join(",")}&$format=json&$top=500${asOf ? `&asOfDate=${asOf}` : ""}`;
const PAGES: Record<string, unknown> = {
  [`${HOST}/odata/v2/User?$top=1&$select=userId&$format=json`]: { d: { results: [{ userId: "u1" }] } },
  [url("User")]: page("full-user-1"),
  [`${HOST}/odata/v2/User?$skiptoken=u3`]: page("full-user-2"),
  [url("EmpEmployment")]: page("full-employment"),
  [url("EmpJob", AS)]: page("full-job-1"),
  [`${HOST}/odata/v2/EmpJob?$skiptoken=u3`]: page("full-job-2"),
  [url("FODepartment", AS)]: page("full-department"),
};

let acme = { id: "", slug: "sfxc-acme" };
let savedVault: string | undefined;
const rows = (action: string) => db.auditEvent.findMany({ where: { companyId: acme.id, action } });

beforeAll(async () => {
  savedVault = process.env.CONNECTOR_VAULT_KEY;
  process.env.CONNECTOR_VAULT_KEY = "cd".repeat(32);
  await db.company.deleteMany({ where: { slug: acme.slug } });
  acme = { ...acme, id: (await db.company.create({ data: { slug: acme.slug, name: "Acme", stage: "sandbox", seedJson: {} } })).id };
  guard = { companyId: acme.id, slug: acme.slug };
  for (const name of ["Produktion", "Einkauf", "Altes Lager"]) await db.orgUnit.create({ data: { companyId: acme.id, key: name.toLowerCase().replace(/ /g, "-"), name } });
});
beforeEach(async () => {
  via = "entra";
  await db.integration.deleteMany({ where: { companyId: acme.id } });
  await db.directoryRun.deleteMany({ where: { companyId: acme.id } });
  await db.auditEvent.deleteMany({ where: { companyId: acme.id } });
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  if (savedVault === undefined) delete process.env.CONNECTOR_VAULT_KEY;
  else process.env.CONNECTOR_VAULT_KEY = savedVault;
  await db.company.deleteMany({ where: { slug: acme.slug } });
  await db.$disconnect();
});

describe("SFX console", () => {
  it("saves the credentials with one audit row and the key as a secret field", async () => {
    expect(await saveSuccessFactorsAction(form)).toEqual({ ok: true });
    const row = await getIntegration(acme.id, "successfactors");
    expect(row).toMatchObject({ on: true, hasSecret: true, settings: { apiHost: HOST, companyId: "Musterwerk", clientId: "client-abc", apiUserId: "NEXTUP_API" } });
    const audit = await rows("audit.connector.saved");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ targetKind: "connector", targetId: "successfactors", changes: { key: { before: null, after: "set" } } });
    expect(JSON.stringify(audit[0])).not.toContain("PRIVATE KEY");
    // an empty key keeps the saved one
    expect(await saveSuccessFactorsAction({ ...form, privateKey: "", clientId: "client-xyz" })).toEqual({ ok: true });
    expect((await getIntegration(acme.id, "successfactors"))?.hasSecret).toBe(true);
  });

  it("refuses a key that does not parse, a missing key and bad settings", async () => {
    expect(await saveSuccessFactorsAction({ ...form, privateKey: "not a pem" })).toMatchObject({ ok: false, code: "invalid" });
    expect(await saveSuccessFactorsAction({ ...form, privateKey: "" })).toMatchObject({ ok: false, code: "no-token" });
    expect(await saveSuccessFactorsAction({ ...form, apiHost: "http://nope" })).toMatchObject({ ok: false, code: "invalid" });
    expect(await getIntegration(acme.id, "successfactors")).toBeNull();
  });

  it("reports ok against the fake and an error line otherwise, never data", async () => {
    await saveSuccessFactorsAction(form);
    const sf = fakeSuccessFactors({ pages: PAGES, cert: keys.certPem });
    vi.stubGlobal("fetch", sf.fetch);
    expect(await testSuccessFactorsAction()).toEqual({ ok: true, detail: "ok" });
    expect(sf.requests.every((r) => r.method === "GET" || new URL(r.url).pathname === "/oauth/token")).toBe(true);
    const other = makeTestKeys("someone-else");
    vi.stubGlobal("fetch", fakeSuccessFactors({ pages: PAGES, cert: other.certPem }).fetch);
    const bad = await testSuccessFactorsAction();
    expect(bad.ok).toBe(false);
    expect(bad.detail).toContain("400");
    expect(bad.detail).not.toContain("u1");
  });

  it("says 'not configured' when nothing is saved", async () => {
    expect(await testSuccessFactorsAction()).toEqual({ ok: false, detail: "not configured" });
  });

  it("writes the directory audit when the source and on are switched, and Run now runs SuccessFactors", async () => {
    await saveSuccessFactorsAction(form);
    expect(await runDirectoryNowAction()).toEqual({ ok: false, code: "switch-on-first" });
    expect(await setDirectoryAction(true, "successfactors")).toEqual({ ok: true });
    expect(await loadDirectoryStatus(acme.id)).toMatchObject({ on: true, source: "successfactors" });
    vi.stubGlobal("fetch", fakeSuccessFactors({ pages: PAGES, cert: keys.certPem }).fetch);
    expect(await runDirectoryNowAction()).toEqual({ ok: true });
    const status = await loadDirectoryStatus(acme.id);
    expect(status.lastError).toBeNull();
    expect(status.counts.added).toBeGreaterThan(0);
    expect(await setDirectoryAction(false, "successfactors")).toEqual({ ok: true });
    expect(await rows("audit.directory.on")).toHaveLength(1);
    expect(await rows("audit.directory.off")).toHaveLength(1);
  });

  it("refuses a read-only support session on every action", async () => {
    via = "support";
    expect(await saveSuccessFactorsAction(form)).toEqual({ ok: false, code: "support-read-only" });
    expect(await testSuccessFactorsAction()).toEqual({ ok: false, detail: "support-read-only" });
    expect(await setDirectoryAction(true, "graph")).toEqual({ ok: false, code: "support-read-only" });
    expect(await runDirectoryNowAction()).toEqual({ ok: false, code: "support-read-only" });
    expect(await getIntegration(acme.id, "successfactors")).toBeNull();
    expect(await db.directoryRun.count({ where: { companyId: acme.id } })).toBe(0);
  });
});
