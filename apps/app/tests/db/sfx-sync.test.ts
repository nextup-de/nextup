// The directory sync loop picks the company's source: SuccessFactors from its Integration row, Graph as before,
// and starts without an Entra app (plan SFX-S1, D9, D11). A fake SuccessFactors serves the pages of SFX-M1.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { integrationContext, seal } from "@/features/connectors/vault";
import { SF_SELECT } from "@/features/directory/successfactors";
import { getDb } from "@/lib/db/client";
import { loadDirectoryRun, loadDirectoryStatus, setDirectoryOn } from "@/lib/db/directory-run";
import { saveIntegration, setIntegrationOn } from "@/lib/db/integrations";
import { NO_ENTRA_APP, NO_TENANT, runDirectoryOnce, startDirectorySync } from "@/server/directory/sync";
import { fakeSuccessFactors } from "../fixtures/successfactors/fake-fetch";
import { makeTestKeys } from "../fixtures/successfactors/keys";

const db = getDb();
const HOST = "https://api4.example.test";
const SF = "successfactors";
const NOW = new Date("2026-11-03T12:00:00Z");
const AS = "2026-11-03";
const VAULT = "ef".repeat(32);
const settings = { apiHost: HOST, companyId: "Musterwerk", clientId: "client-abc", apiUserId: "NEXTUP_API" };
const page = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, "../fixtures/successfactors/pages", `${name}.json`), "utf8"));
type Entity = keyof typeof SF_SELECT;
const url = (e: Entity, asOf?: string): string =>
  `${HOST}/odata/v2/${e}?$select=${SF_SELECT[e].join(",")}&$format=json&$top=500${asOf ? `&asOfDate=${asOf}` : ""}`;
const PAGES: Record<string, unknown> = {
  [url("User")]: page("full-user-1"),
  [`${HOST}/odata/v2/User?$skiptoken=u3`]: page("full-user-2"),
  [url("EmpEmployment")]: page("full-employment"),
  [url("EmpJob", AS)]: page("full-job-1"),
  [`${HOST}/odata/v2/EmpJob?$skiptoken=u3`]: page("full-job-2"),
  [url("FODepartment", AS)]: page("full-department"),
};

const keys = makeTestKeys();
let a: { id: string; slug: string };
let savedVault: string | undefined;

async function row(sealedKey: string | null, on = true, s: unknown = settings) {
  await saveIntegration({ companyId: a.id, system: SF, settings: s, secretSealed: sealedKey, updatedBy: null });
  await setIntegrationOn(a.id, SF, on, null);
}
const sealedKey = () => seal(keys.privateKeyPem, Buffer.from(VAULT, "hex"), integrationContext(a.id, SF));

beforeAll(async () => {
  savedVault = process.env.CONNECTOR_VAULT_KEY;
  process.env.CONNECTOR_VAULT_KEY = VAULT;
  await db.company.deleteMany({});
  a = await db.company.create({ data: { slug: "sfxs-a", name: "A", stage: "sandbox", seedJson: {} } });
  for (const name of ["Produktion", "Einkauf", "Altes Lager"]) await db.orgUnit.create({ data: { companyId: a.id, key: name.toLowerCase().replace(/ /g, "-"), name } });
});
beforeEach(async () => {
  await db.integration.deleteMany({ where: { companyId: a.id } });
  await db.directoryRun.deleteMany({ where: { companyId: a.id } });
  await db.user.deleteMany({ where: { companyId: a.id } });
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  if (savedVault === undefined) delete process.env.CONNECTOR_VAULT_KEY;
  else process.env.CONNECTOR_VAULT_KEY = savedVault;
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("SFX sync", () => {
  it("reads the recorded pages of a company with source successfactors, applies them and stores the cursor", async () => {
    await row(sealedKey());
    await setDirectoryOn(a.id, true, "successfactors", null);
    const sf = fakeSuccessFactors({ pages: PAGES, cert: keys.certPem });
    vi.stubGlobal("fetch", sf.fetch);
    await runDirectoryOnce(NOW);
    const status = await loadDirectoryStatus(a.id);
    expect(status.lastError).toBeNull();
    expect(status.counts.added).toBe(4);
    expect(await db.user.count({ where: { companyId: a.id } })).toBe(4);
    const cursor = JSON.parse((await loadDirectoryRun(a.id))?.cursor ?? "null");
    expect(cursor).toMatchObject({ v: 1, fullDay: AS });
  });

  it.each([
    ["the row is off", async () => row(sealedKey(), false)],
    ["there is no row", async () => undefined],
    ["the settings are broken", async () => row(sealedKey(), true, { apiHost: "not a url" })],
    ["the key does not open", async () => row("v1.garbage")],
    ["there is no key", async () => row(null)],
  ])("records 'no adapter for successfactors' when %s", async (_n, setup) => {
    await setup();
    await setDirectoryOn(a.id, true, "successfactors", null);
    const sf = fakeSuccessFactors({ pages: PAGES, cert: keys.certPem });
    vi.stubGlobal("fetch", sf.fetch);
    await runDirectoryOnce(NOW);
    expect((await loadDirectoryStatus(a.id)).lastError).toBe("no adapter for successfactors");
    expect(sf.requests).toEqual([]);
    expect(await db.user.count({ where: { companyId: a.id } })).toBe(0);
  });

  it("runs a Graph company as before: without a tenant it says so, and SAP is never asked", async () => {
    await row(sealedKey());
    await setDirectoryOn(a.id, true, "graph", null);
    const sf = fakeSuccessFactors({ pages: PAGES, cert: keys.certPem });
    vi.stubGlobal("fetch", sf.fetch);
    await runDirectoryOnce(NOW);
    expect((await loadDirectoryStatus(a.id)).lastError).toBe(NO_TENANT);
    expect(sf.requests).toEqual([]);
  });

  it("says the server has no Entra app when a Graph company has a tenant but the app is not set", async () => {
    const saved = { id: process.env.ENTRA_CLIENT_ID, secret: process.env.ENTRA_CLIENT_SECRET };
    delete process.env.ENTRA_CLIENT_ID;
    delete process.env.ENTRA_CLIENT_SECRET;
    await db.company.update({ where: { id: a.id }, data: { entraTenantId: "72f988bf-86f1-41af-91ab-2d7cd011db47" } });
    try {
      await setDirectoryOn(a.id, true, "graph", null);
      await runDirectoryOnce(NOW);
      expect((await loadDirectoryStatus(a.id)).lastError).toBe(NO_ENTRA_APP);
    } finally {
      await db.company.update({ where: { id: a.id }, data: { entraTenantId: null } });
      if (saved.id !== undefined) process.env.ENTRA_CLIENT_ID = saved.id;
      if (saved.secret !== undefined) process.env.ENTRA_CLIENT_SECRET = saved.secret;
    }
  });

  it("starts the loop without an Entra app", async () => {
    const g = globalThis as unknown as { __nextupDirectorySync?: ReturnType<typeof setInterval> };
    const saved = { id: process.env.ENTRA_CLIENT_ID, secret: process.env.ENTRA_CLIENT_SECRET, int: process.env.DIRECTORY_INTERVAL_MS };
    delete process.env.ENTRA_CLIENT_ID;
    delete process.env.ENTRA_CLIENT_SECRET;
    process.env.DIRECTORY_INTERVAL_MS = "3600000";
    if (g.__nextupDirectorySync) clearInterval(g.__nextupDirectorySync);
    g.__nextupDirectorySync = undefined;
    try {
      startDirectorySync();
      expect(g.__nextupDirectorySync).toBeDefined();
    } finally {
      if (g.__nextupDirectorySync) clearInterval(g.__nextupDirectorySync);
      g.__nextupDirectorySync = undefined;
      if (saved.id !== undefined) process.env.ENTRA_CLIENT_ID = saved.id;
      if (saved.secret !== undefined) process.env.ENTRA_CLIENT_SECRET = saved.secret;
      if (saved.int === undefined) delete process.env.DIRECTORY_INTERVAL_MS;
      else process.env.DIRECTORY_INTERVAL_MS = saved.int;
    }
  });
});
