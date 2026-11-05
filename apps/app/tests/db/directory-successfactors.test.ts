// SFX acceptance (plan SFX, SFX-Z1): a company whose directory source is SuccessFactors reads recorded OData pages
// through the real adapter and the real loop. fetch is injected (a fake SuccessFactors that also verifies the signed
// assertion at /oauth/token); nothing is live. The credentials are saved through the console action.
//
//   day 1 (2026-11-03)        full read, then a delta later the same day
//   day 2 (2026-11-11)        full read: the move dated 2026-11-10 and the end date 2026-11-10 have taken effect
//   then the source is off    the core loop (code sign-in, a raise) is unchanged and SAP is not asked again
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { generateLoginCode, hashLoginCode } from "@/features/auth/login-code";
import { reduce } from "@/features/cases/reducer";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { SF_SELECT } from "@/features/directory/successfactors";
import { getDb } from "@/lib/db/client";
import { loadSeed } from "@/lib/db/companies";
import { loadDirectoryStatus } from "@/lib/db/directory-run";
import { appendEventRow, loadLog } from "@/lib/db/events";
import { saveArea } from "@/lib/db/floor";
import { writeStructure } from "@/lib/db/structure-writes";
import { fakeSuccessFactors } from "../fixtures/successfactors/fake-fetch";
import { makeTestKeys } from "../fixtures/successfactors/keys";

// The console actions and the code login read the session, headers and redirect; replace those edges.
vi.mock("@/server/console-guard", () => ({ consoleCompany: vi.fn(async () => guard) }));
vi.mock("@/server/admin-session", () => ({ adminActor: vi.fn(async () => "sfx-acceptance") }));
vi.mock("@/server/issue-session", () => ({ issueSession: vi.fn(async () => {}), clearSession: vi.fn(), secureCookies: () => false }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

let guard: { companyId: string; slug: string; via: string } | null = null;

const { saveSuccessFactorsAction } = await import("@/server/actions/successfactors-admin");
const { runDirectoryNowAction, setDirectoryAction } = await import("@/server/actions/directory-admin");
const { runDirectoryOnce } = await import("@/server/directory/sync");
const { codeLogin } = await import("@/server/actions/auth");
const { raiseFromFloor } = await import("@/server/floor/raise");
const { forgive } = await import("@/server/throttle");

const db = getDb();
const SLUG = "sfx-acceptance";
const HOST = "https://api4.example.test";
const DAY1 = new Date("2026-11-03T12:00:00Z");
const DAY1_LATER = new Date("2026-11-03T15:00:00Z");
const DAY2 = new Date("2026-11-11T12:00:00Z");
const AS1 = "2026-11-03";
const AS2 = "2026-11-11";
const VAULT = "9a".repeat(32);
const FIXTURES = join(__dirname, "../fixtures/successfactors/pages");
type Row = Record<string, unknown>;
type Pg = { d: { results: Row[]; __next?: string } };
const page = (name: string): Pg => JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8")) as Pg;
type Entity = keyof typeof SF_SELECT;

// ---- the recorded pages, adjusted so the two days differ ----
const MS_NOV_10 = 1794268800000; // 2026-11-10T00:00Z
// Dieter (u4) leaves with the end date 2026-11-10: still employed on day 1, gone on day 2.
const employment = (): Pg => {
  const p = page("full-employment");
  for (const r of p.d.results) if (r.userId === "u4") r.endDate = `/Date(${MS_NOV_10})/`;
  return p;
};
// Anna (u1) has a job in force and one dated 2026-11-10 (jobs-future-move): Produktion, then Einkauf.
// `carlaMoved` is the delta of day 1: Carla (u3) is in Produktion under Anna instead of Einkauf under Bernd.
const jobsOne = (carlaMoved: boolean): Pg => {
  const p = page("full-job-1");
  const future = page("jobs-future-move").d.results;
  const moved = page("delta-job").d.results[0]!;
  p.d.results = [
    ...future,
    ...p.d.results.filter((r) => r.userId !== "u1" && !(carlaMoved && r.userId === "u3")),
    ...(carlaMoved ? [moved] : []),
  ];
  return p;
};

const url = (e: Entity, q: { filter?: string; asOf?: string } = {}): string =>
  `${HOST}/odata/v2/${e}?$select=${SF_SELECT[e].join(",")}&$format=json&$top=500${q.filter ? `&$filter=${q.filter}` : ""}${q.asOf ? `&asOfDate=${q.asOf}` : ""}`;
const fullPages = (asOf: string, carlaMoved: boolean): Record<string, unknown> => ({
  [url("User")]: page("full-user-1"),
  [`${HOST}/odata/v2/User?$skiptoken=u3`]: page("full-user-2"),
  [url("EmpEmployment")]: employment(),
  [url("EmpJob", { asOf })]: jobsOne(carlaMoved),
  [`${HOST}/odata/v2/EmpJob?$skiptoken=u3`]: page("full-job-2"),
  [url("FODepartment", { asOf })]: page("full-department"),
});
// Anna's dated job was last changed on 2026-10-25, the highest watermark of the full read.
const SINCE = "lastModifiedDateTime gt datetimeoffset'2026-10-25T07:55:00.000Z'";
const deltaPages = (): Record<string, unknown> => ({
  [url("EmpEmployment", { filter: SINCE })]: page("delta-employment"),
  [url("EmpJob", { filter: SINCE, asOf: AS1 })]: page("delta-job"),
  [url("User", { filter: SINCE })]: page("delta-user"),
  [url("User", { filter: "userId eq 'u3'" })]: page("delta-chunk-user"),
  [url("EmpEmployment", { filter: "userId eq 'u3'" })]: page("delta-chunk-employment"),
  [url("EmpJob", { filter: "userId eq 'u3'", asOf: AS1 })]: page("delta-chunk-job"),
  [url("FODepartment", { asOf: AS1 })]: page("full-department"),
  [url("EmpEmployment", { filter: "userId eq 'u1'" })]: page("delta-manager-employment"),
});

const keys = makeTestKeys();
let companyId = "";
let savedVault: string | undefined;
let oldSeat = "";
let rothSeat = "";
let dieterId = "";
let rolfId = "";
let rolfCode = "";
let roleId = "";
let unitId = "";
const sapRequests: { method: string; url: string; body: string | null }[] = [];

/** Serve `pages` as SuccessFactors; every request is kept for the allow-list check. */
function sap(pages: Record<string, unknown>): void {
  const sf = fakeSuccessFactors({ pages, cert: keys.certPem });
  vi.stubGlobal("fetch", async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const u = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    sapRequests.push({ method: init?.method ?? "GET", url: u, body: init?.body == null ? null : String(init.body) });
    return sf.fetch(input, init);
  });
}
const userByEmail = (email: string) => db.user.findFirstOrThrow({ where: { companyId, email } });
const reads = () => sapRequests.filter((r) => new URL(r.url).pathname !== "/oauth/token");

beforeAll(async () => {
  savedVault = process.env.CONNECTOR_VAULT_KEY;
  process.env.CONNECTOR_VAULT_KEY = VAULT;
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-0123456789";
  await db.company.deleteMany({ where: { slug: SLUG } });
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const c = await db.company.create({
    data: { openedAt: new Date(), slug: SLUG, name: "SFX acceptance", stage: "sandbox", seedJson: toSeedJson(writes.seedJson) as object },
  });
  companyId = c.id;
  guard = { companyId, slug: SLUG, via: "entra" };
  await writeStructure(companyId, writes, "test");
  // Units named like the fixture departments.
  for (const name of ["Produktion", "Einkauf", "Altes Lager"]) {
    await db.orgUnit.create({ data: { companyId, key: name.toLowerCase().replace(/ /g, "-"), name } });
  }
  // Rolf holds the Engineering lead seat of M. Roth and signs in with a code. Dieter, an existing member known to
  // SAP only by email, holds a second seat of the same role with an open case on it.
  rolfCode = generateLoginCode(SLUG);
  const roth = await db.orgRoleHolder.findFirstOrThrow({ where: { companyId, name: "M. Roth" } });
  roleId = roth.roleId;
  rothSeat = roth.id;
  unitId = (await db.orgRole.findFirstOrThrow({ where: { id: roleId, companyId } })).orgUnitId;
  rolfId = (
    await db.user.create({
      data: { companyId, name: "Rolf Roth", email: "rolf.roth@musterwerk.example", role: "leader", dept: "ENG", loginCodeHash: hashLoginCode(rolfCode) },
      select: { id: true },
    })
  ).id;
  await db.orgRoleHolder.update({ where: { id: roth.id, companyId }, data: { userId: rolfId } });
  dieterId = (
    await db.user.create({
      data: { companyId, name: "Dieter Huber", email: "dieter.huber@musterwerk.example", role: "leader", dept: "ENG" },
      select: { id: true },
    })
  ).id;
  const last = await db.orgRoleHolder.aggregate({ where: { companyId }, _max: { sort: true } });
  oldSeat = (await db.orgRoleHolder.create({ data: { companyId, roleId, name: "Dieter Lead", userId: dieterId, sort: (last._max.sort ?? 0) + 1 } })).id;
  await appendEventRow(companyId, {
    id: crypto.randomUUID(), day: 0, type: "case.raised", actor: "someone", targetId: "sfx-acc-case",
    payload: { title: "Rig time", routeId: "r2", assigneeRoleHolderId: oldSeat, assignee: "Dieter Lead" },
  });
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  if (savedVault === undefined) delete process.env.CONNECTOR_VAULT_KEY;
  else process.env.CONNECTOR_VAULT_KEY = savedVault;
  await db.company.deleteMany({ where: { slug: SLUG } });
  await db.$disconnect();
});

describe("SFX acceptance: SuccessFactors pages add, move and deactivate users", () => {
  it("adds, matches, moves and deactivates from recorded pages across two days, then runs with the source off", async () => {
    // The admin saves the credentials and switches the directory on through the console actions.
    expect(
      await saveSuccessFactorsAction({ apiHost: HOST, companyId: "Musterwerk", clientId: "client-abc", apiUserId: "NEXTUP_API", privateKey: keys.privateKeyPem }),
    ).toEqual({ ok: true });
    expect(await setDirectoryAction(true, "successfactors")).toEqual({ ok: true });
    const usersBefore = await db.user.count({ where: { companyId } });

    // ---- day 1, full read ----
    sap(fullPages(AS1, false));
    await runDirectoryOnce(DAY1);
    let status = await loadDirectoryStatus(companyId);
    expect(status).toMatchObject({ on: true, source: "successfactors", lastError: null });
    // New employees with unit and manager: Anna (Produktion, manager Bernd), Bernd (no manager), Carla (Einkauf).
    const anna = await userByEmail("anna.meier@musterwerk.example");
    const bernd = await userByEmail("bernd.keller@musterwerk.example");
    const carla = await userByEmail("carla.vogt@musterwerk.example"); // SAP's mixed-case email, matched in lower case
    expect(anna).toMatchObject({ name: "Anna Meier", dept: "produktion", managerId: bernd.id, line: "Schichtleiterin", active: true });
    expect(bernd).toMatchObject({ dept: "produktion", managerId: null, active: true });
    expect(carla).toMatchObject({ dept: "einkauf", managerId: bernd.id, active: true });
    expect(await userByEmail("eva.brandt@musterwerk.example")).toMatchObject({ dept: "altes-lager", active: true });
    // u6 has no personnel number and was skipped.
    expect(await db.user.count({ where: { companyId, email: "fritz.lang@musterwerk.example" } })).toBe(0);
    // The existing member is matched by email once: no second Dieter, the personnel number is attached.
    expect(await db.user.count({ where: { companyId, email: "dieter.huber@musterwerk.example" } })).toBe(1);
    const dieter1 = await db.user.findFirstOrThrow({ where: { companyId, id: dieterId } });
    expect(dieter1).toMatchObject({ employeeId: "1004", active: true, dept: "einkauf", role: "leader" });
    expect(await db.orgRoleHolder.findFirstOrThrow({ where: { id: oldSeat, companyId } })).toMatchObject({ userId: dieterId });
    expect(status.counts.added).toBe(4);
    expect(await db.user.count({ where: { companyId } })).toBe(usersBefore + 4);
    // The move dated 2026-11-10 is not applied early.
    expect(anna.dept).toBe("produktion");

    // ---- day 1 later, delta: Carla moves to Produktion under Anna ----
    sap({ ...fullPages(AS1, false), ...deltaPages() });
    const before = sapRequests.length;
    await runDirectoryOnce(DAY1_LATER);
    expect((await loadDirectoryStatus(companyId)).lastError).toBeNull();
    const deltaReads = sapRequests.slice(before).filter((r) => new URL(r.url).pathname !== "/oauth/token");
    expect(deltaReads.some((r) => decodeURIComponent(r.url.replaceAll("+", " ")).includes("lastModifiedDateTime gt datetimeoffset'2026-10-25T07:55:00.000Z'"))).toBe(true);
    expect(deltaReads.some((r) => new URL(r.url).pathname.endsWith("/EmpEmployment") && !r.url.includes("filter"))).toBe(false);
    expect(await userByEmail("carla.vogt@musterwerk.example")).toMatchObject({ dept: "produktion", managerId: anna.id, active: true });
    expect(await userByEmail("anna.meier@musterwerk.example")).toMatchObject({ dept: "produktion" });
    expect((await db.user.findFirstOrThrow({ where: { companyId, id: dieterId } })).active).toBe(true);
    expect(await db.user.count({ where: { companyId } })).toBe(usersBefore + 4);

    // ---- day 2, full read: the move and the end date, both dated 2026-11-10, have taken effect ----
    sap(fullPages(AS2, true));
    await runDirectoryOnce(DAY2);
    status = await loadDirectoryStatus(companyId);
    expect(status.lastError).toBeNull();
    expect(await userByEmail("anna.meier@musterwerk.example")).toMatchObject({ dept: "einkauf", managerId: bernd.id, line: "Einkaufsleiterin", active: true });
    expect(await userByEmail("carla.vogt@musterwerk.example")).toMatchObject({ dept: "produktion", managerId: anna.id });
    // The leaver is deactivated, their seat vacated and their open case handed to the other seat of the role.
    const dieter2 = await db.user.findFirstOrThrow({ where: { companyId, id: dieterId } });
    expect(dieter2.active).toBe(false);
    expect(dieter2.deactivatedAt).not.toBeNull();
    expect(await db.orgRoleHolder.findFirstOrThrow({ where: { id: oldSeat, companyId } })).toMatchObject({ userId: null });
    expect(status.counts).toMatchObject({ deactivated: 1, handed: 1 });
    const state = reduce((await loadSeed(SLUG))!, await loadLog(companyId));
    expect(state.cases.find((x) => x.id === "sfx-acc-case")?.assigneeSeatId).toBe(rothSeat);
    // Another read of the same day changes nothing.
    const usersOf = async () => (await db.user.findMany({ where: { companyId }, orderBy: { id: "asc" } })).map((u) => ({ ...u, directorySyncedAt: null }));
    const [snap, events] = [await usersOf(), await db.caseEvent.count({ where: { companyId } })];
    await runDirectoryOnce(new Date("2026-11-11T18:00:00Z"));
    expect(await usersOf()).toEqual(snap);
    expect(await db.caseEvent.count({ where: { companyId } })).toBe(events);

    // ---- what was asked: D3's allow-list, GET only, no field of its own ----
    expect(reads().length).toBeGreaterThan(0);
    for (const r of sapRequests) {
      const u = new URL(r.url);
      expect(u.origin).toBe(HOST);
      if (u.pathname === "/oauth/token") {
        expect(r.method).toBe("POST");
        continue;
      }
      expect(r.method).toBe("GET");
      if (u.searchParams.has("$skiptoken")) continue;
      const entity = u.pathname.replace("/odata/v2/", "");
      expect(Object.keys(SF_SELECT)).toContain(entity);
      expect(u.searchParams.get("$select")).toBe(SF_SELECT[entity as Entity].join(","));
      expect(u.searchParams.get("$format")).toBe("json");
      const filter = u.searchParams.get("$filter");
      if (filter) {
        expect(filter).toMatch(/^(lastModifiedDateTime gt datetimeoffset'[^']+'|userId eq '[^']+'( or userId eq '[^']+')*)$/);
      }
      // no query option beyond the ones NextUp writes
      for (const k of u.searchParams.keys()) expect(["$select", "$format", "$top", "$filter", "asOfDate"]).toContain(k);
    }

    // ---- the personnel number is in no page data ----
    const seedJson = JSON.stringify(await loadSeed(SLUG));
    for (const n of ["1001", "1002", "1003", "1004", "1005"]) {
      expect(seedJson).not.toContain(`"${n}"`);
      expect(JSON.stringify(status)).not.toContain(n);
    }
    expect(seedJson).not.toContain("employeeId");
    expect(JSON.stringify(await db.auditEvent.findMany({ where: { companyId } }))).not.toMatch(/"100[1-5]"/);

    // ---- the source off (D11): SAP is not asked, nothing changes, sign-in and a raise work ----
    expect(await setDirectoryAction(false, "successfactors")).toEqual({ ok: true });
    const asked = sapRequests.length;
    const snapOff = await usersOf();
    await runDirectoryOnce(new Date("2026-11-12T12:00:00Z"));
    expect(await runDirectoryNowAction()).toEqual({ ok: false, code: "switch-on-first" });
    expect(sapRequests.length).toBe(asked);
    expect(await usersOf()).toEqual(snapOff);

    forgive("loginCode", `203.0.113.7|${SLUG}`);
    const f = new FormData();
    f.set("slug", SLUG);
    f.set("code", rolfCode);
    await expect(codeLogin({}, f)).rejects.toThrow(/^REDIRECT /);

    await saveArea(companyId, { key: "line1", name: "Line 1", unitId, roleId, anonymous: false }, null);
    const raised = await raiseFromFloor(
      SLUG,
      { area: "line1", kind: "problem", title: "Oil on the floor", body: "Near the press", nonce: "sfxnonce00000001" },
      { userId: rolfId },
      { key: "a:sfx-device-1", deviceId: null },
    );
    expect(raised).toMatchObject({ ok: true });
    expect(await db.caseEvent.count({ where: { companyId, type: "case.raised", actor: { not: "system:directory" } } })).toBeGreaterThan(1);
  });
});
