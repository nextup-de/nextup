import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SF_SELECT } from "@/features/directory/successfactors";
import { successFactorsDirectory } from "@/server/directory/successfactors";
import { successFactorsClient } from "@/server/directory/successfactors/client";
import { fakeSuccessFactors } from "../../fixtures/successfactors/fake-fetch";
import { makeTestKeys } from "../../fixtures/successfactors/keys";

const HOST = "https://api4.example.test";
const settings = { apiHost: HOST, companyId: "Musterwerk", clientId: "client-abc", apiUserId: "NEXTUP_API" };
const page = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, "../../fixtures/successfactors/pages", `${name}.json`), "utf8"));
const NOW = new Date("2026-11-03T12:00:00Z");
const AS = "2026-11-03";
const ENTITIES = Object.keys(SF_SELECT);
type Entity = keyof typeof SF_SELECT;

function url(entity: Entity, q: { filter?: string; asOf?: string } = {}): string {
  let u = `${HOST}/odata/v2/${entity}?$select=${SF_SELECT[entity].join(",")}&$format=json&$top=500`;
  if (q.filter) u += `&$filter=${q.filter}`;
  if (q.asOf) u += `&asOfDate=${q.asOf}`;
  return u;
}

const FULL_PAGES: Record<string, unknown> = {
  [url("User")]: page("full-user-1"),
  [`${HOST}/odata/v2/User?$skiptoken=u3`]: page("full-user-2"),
  [url("EmpEmployment")]: page("full-employment"),
  [url("EmpJob", { asOf: AS })]: page("full-job-1"),
  [`${HOST}/odata/v2/EmpJob?$skiptoken=u3`]: page("full-job-2"),
  [url("FODepartment", { asOf: AS })]: page("full-department"),
};
const SINCE = "lastModifiedDateTime gt datetimeoffset'2026-10-20T07:55:00.000Z'";
const U3 = "userId eq 'u3'";
const U1 = "userId eq 'u1'";
const DELTA_PAGES: Record<string, unknown> = {
  [url("EmpEmployment", { filter: SINCE })]: page("delta-employment"),
  [url("EmpJob", { filter: SINCE, asOf: AS })]: page("delta-job"),
  [url("User", { filter: SINCE })]: page("delta-user"),
  [url("User", { filter: U3 })]: page("delta-chunk-user"),
  [url("EmpEmployment", { filter: U3 })]: page("delta-chunk-employment"),
  [url("EmpJob", { filter: U3, asOf: AS })]: page("delta-chunk-job"),
  [url("FODepartment", { asOf: AS })]: page("full-department"),
  [url("EmpEmployment", { filter: U1 })]: page("delta-manager-employment"),
};

describe("SFX read", () => {
  const keys = makeTestKeys();
  const setup = (pages: Record<string, unknown>, cursorIn: string | null) => {
    const sf = fakeSuccessFactors({ pages, cert: keys.certPem });
    const client = successFactorsClient({ settings, privateKeyPem: keys.privateKeyPem, fetch: sf.fetch, now: () => NOW });
    const source = successFactorsDirectory({ client, cursorIn, now: NOW });
    const reads = () => sf.requests.filter((r) => !r.url.endsWith("/oauth/token"));
    return { source, reads };
  };

  function expectAllowListed(urls: string[]) {
    for (const raw of urls) {
      const u = new URL(raw);
      if (u.searchParams.has("$skiptoken")) continue;
      const entity = u.pathname.replace("/odata/v2/", "");
      expect(ENTITIES).toContain(entity);
      expect(u.searchParams.get("$select")).toBe(SF_SELECT[entity as Entity].join(","));
      expect(u.searchParams.get("$format")).toBe("json");
      expect(u.searchParams.get("$top")).toBe("500");
    }
  }

  it("reads everything with asOfDate on the first run of a day and stores watermark and fullDay", async () => {
    const { source, reads } = setup(FULL_PAGES, null);
    expect(source.info.id).toBe("successfactors-directory");
    expect(source.deltaLink()).toBeNull();
    const result = await source.delta({ companyId: "c", cursor: null });
    expect(result.nextCursor).toBeNull();
    expect(result.entries).toHaveLength(5);
    expect(result.groups).toHaveLength(3);
    expect(source.skipped()).toBe(1);
    const urls = reads().map((r) => r.url);
    expect(urls).toHaveLength(6);
    expectAllowListed(urls);
    const dated = urls.filter((u) => u.includes("/EmpJob?") || u.includes("/FODepartment?"));
    expect(dated.filter((u) => !u.includes("skiptoken")).every((u) => u.includes(`asOfDate=${AS}`))).toBe(true);
    expect(reads().every((r) => r.method === "GET")).toBe(true);
    expect(JSON.parse(source.deltaLink() ?? "null")).toEqual({
      v: 1,
      watermark: "2026-10-20T08:00:00.000Z",
      fullDay: AS,
    });
  });

  it("does a full read again when the stored fullDay is an earlier day", async () => {
    const cursor = JSON.stringify({ v: 1, watermark: "2026-11-02T10:00:00.000Z", fullDay: "2026-11-02" });
    const { source, reads } = setup(FULL_PAGES, cursor);
    await source.delta({ companyId: "c", cursor: null });
    expect(reads().some((r) => r.url.includes("EmpEmployment") && !r.url.includes("filter"))).toBe(true);
    expect(JSON.parse(source.deltaLink() ?? "null").fullDay).toBe(AS);
  });

  it("reads only changes since the watermark minus 5 minutes, then the changed users", async () => {
    const cursor = JSON.stringify({ v: 1, watermark: "2026-10-20T08:00:00.000Z", fullDay: AS });
    const { source, reads } = setup(DELTA_PAGES, cursor);
    const result = await source.delta({ companyId: "c", cursor: null });
    const urls = reads().map((r) => decodeURIComponent(r.url.replace(/\+/g, " ")));
    expectAllowListed(urls);
    expect(urls[0]).toContain("/EmpEmployment?");
    expect(urls[1]).toContain("/EmpJob?");
    expect(urls[2]).toContain("/User?");
    expect(urls.slice(0, 3).every((u) => u.includes(SINCE))).toBe(true);
    expect(urls.filter((u) => u.includes(U3))).toHaveLength(3); // User, EmpEmployment, EmpJob of the mover
    expect(urls.some((u) => u.includes("/FODepartment?") && !u.includes("$filter"))).toBe(true);
    expect(result.entries).toEqual([
      {
        externalId: "1003",
        employeeId: "1003",
        displayName: "Carla Vogt",
        email: "carla.vogt@musterwerk.example",
        department: "Produktion",
        jobTitle: "Einkäuferin",
        managerExternalId: "1001", // the unchanged manager is looked up
        groupExternalIds: ["D100"],
        active: true,
      },
    ]);
    expect(JSON.parse(source.deltaLink() ?? "null")).toEqual({
      v: 1,
      watermark: "2026-11-03T09:30:00.000Z",
      fullDay: AS,
    });
  });

  it("keeps the cursor when the run fails", async () => {
    const cursor = JSON.stringify({ v: 1, watermark: "2026-10-20T08:00:00.000Z", fullDay: AS });
    const { source } = setup({}, cursor);
    await expect(source.delta({ companyId: "c", cursor: null })).rejects.toThrow("SuccessFactors request failed: 404");
    expect(source.deltaLink()).toBeNull();
  });
});
