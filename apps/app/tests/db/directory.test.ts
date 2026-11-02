// DIR acceptance (plan DIR, D14): a company with the sync on reads the recorded Graph pages through the real
// adapter and the real loop. fetch is injected and serves tests/fixtures/graph-directory; nothing is live.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reduce } from "@/features/cases/reducer";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { getDb } from "@/lib/db/client";
import { loadSeed } from "@/lib/db/companies";
import { loadDirectoryRun, loadDirectoryStatus, setDirectoryOn } from "@/lib/db/directory-run";
import { appendEventRow, loadLog } from "@/lib/db/events";
import { writeStructure } from "@/lib/db/structure-writes";
import { graphDirectory } from "@/server/directory/graph";
import { runDirectoryOnce } from "@/server/directory/sync";

const db = getDb();
const SLUG = "dir-acceptance";
const TENANT = "11111111-2222-4333-8444-555555555555";
const DIR = join(__dirname, "../fixtures/graph-directory");
const fixture = (name: string): string => readFileSync(join(DIR, name), "utf8");

const OID = (n: number) => `a0000000-0000-4000-8000-00000000000${n}`;
const MIRA = OID(1);
const NOEL = OID(2);
const OLGA = OID(3);
const PIA = OID(4);
const QUIN = OID(5);
const RUNE = OID(6);

const DELTA = "https://graph.microsoft.com/v1.0/users/delta?";
/** Graph as the fixtures recorded it: token, full round (two pages), then the delta round. */
const FIXTURE_BY_URL: Record<string, string> = {
  [`${DELTA}$skiptoken=fixtureSkipToken1`]: "full-2.json",
  [`${DELTA}$deltatoken=fixtureDeltaToken1`]: "delta.json",
  // The cursor stored after the delta round serves the same delta page again.
  [`${DELTA}$deltatoken=fixtureDeltaToken2`]: "delta.json",
};
const calls: string[] = [];
const fakeFetch: typeof fetch = async (input) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  calls.push(url);
  const json = (body: string) => new Response(body, { status: 200, headers: { "content-type": "application/json" } });
  if (url.startsWith("https://login.microsoftonline.com/")) return json(fixture("token.json"));
  if (url.startsWith(`${DELTA}$select=`)) return json(fixture("full-1.json"));
  const name = FIXTURE_BY_URL[url];
  return name ? json(fixture(name)) : new Response("{}", { status: 404 });
};
const source = () => graphDirectory({ tenantId: TENANT, app: { clientId: "fixture-client", clientSecret: "fixture-secret" }, fetch: fakeFetch });

let companyId = "";
let firstSeat = "";
let secondSeat = "";
let miraUser = "";
let quinUser = "";

const userBy = (entraOid: string) => db.user.findFirstOrThrow({ where: { companyId, entraOid } });

beforeAll(async () => {
  await db.company.deleteMany({ where: { slug: SLUG } });
  const writes = templateWrites("demo", () => crypto.randomUUID());
  const c = await db.company.create({
    data: { slug: SLUG, name: "DIR acceptance", stage: "sandbox", entraTenantId: TENANT, seedJson: toSeedJson(writes.seedJson) as object },
  });
  companyId = c.id;
  await writeStructure(companyId, writes, "test");
  const mk = (n: string, email: string, oid: string) => db.user.create({
    data: { companyId, name: n, email, role: "leader", dept: "ENG", entraOid: oid }, select: { id: true },
  });
  // Two holders of the Engineering lead role, bound to the fixtures' object ids: Quin (disabled in the full
  // round) on a fresh seat that carries an open case on r2, Mira on the seat of M. Roth.
  quinUser = (await mk("Quin Disabled", "quin.disabled@contoso-fixture.example", QUIN)).id;
  miraUser = (await mk("Mira Example", "mira.example@contoso-fixture.example", MIRA)).id;
  const roth = await db.orgRoleHolder.findFirstOrThrow({ where: { companyId, name: "M. Roth" } });
  secondSeat = roth.id;
  await db.orgRoleHolder.update({ where: { id: roth.id, companyId }, data: { userId: miraUser } });
  const last = await db.orgRoleHolder.aggregate({ where: { companyId }, _max: { sort: true } });
  firstSeat = (await db.orgRoleHolder.create({
    data: { companyId, roleId: roth.roleId, name: "Quin Lead", userId: quinUser, sort: (last._max.sort ?? 0) + 1 },
  })).id;
  await appendEventRow(companyId, {
    id: crypto.randomUUID(), day: 0, type: "case.raised", actor: "someone", targetId: "dir-acc-case",
    payload: { title: "Rig time", routeId: "r2", assigneeRoleHolderId: firstSeat, assignee: "Quin Lead" },
  });
  await setDirectoryOn(companyId, true, "graph", null);
});

afterAll(async () => {
  await db.company.deleteMany({ where: { slug: SLUG } });
  await db.$disconnect();
});

describe("DIR acceptance: delta sync adds, moves and deactivates users", () => {
  it("reads the full round, then the delta round, then the same delta again", async () => {
    // Round 1: the full round, two pages. Quin is disabled: inactive, seat vacated, the case moves to Mira's seat.
    await runDirectoryOnce(new Date(), () => source());
    expect((await loadDirectoryRun(companyId))?.cursor).toBe(`${DELTA}$deltatoken=fixtureDeltaToken1`);
    const quin = await db.user.findFirstOrThrow({ where: { companyId, id: quinUser } });
    expect(quin.active).toBe(false);
    expect(quin.deactivatedAt).not.toBeNull();
    expect(await db.orgRoleHolder.findFirstOrThrow({ where: { companyId, id: firstSeat } })).toMatchObject({ userId: null });
    expect((await db.orgRoleHolder.findFirstOrThrow({ where: { companyId, id: secondSeat } })).userId).toBe(miraUser);
    expect(await userBy(NOEL)).toMatchObject({ dept: "ENG", managerId: miraUser });
    expect((await userBy(PIA)).dept).toBe("FIN");
    expect(await userBy(OLGA)).toMatchObject({ active: true, email: "olga.placeholder@contoso-fixture.onmicrosoft.com" });
    expect((await loadDirectoryStatus(companyId)).counts).toMatchObject({ added: 3, deactivated: 1, handed: 1 });

    // Round 2: the delta round from the stored cursor.
    await runDirectoryOnce(new Date(), () => source());
    expect(await userBy(RUNE)).toMatchObject({ dept: "FIN", employeeId: "P-10006", active: true, managerId: null, line: "Analyst" });
    expect(await userBy(PIA)).toMatchObject({ dept: "ENG", managerId: miraUser, line: "Developer" });
    const olga = await userBy(OLGA);
    expect(olga.active).toBe(false);
    expect(olga.deactivatedAt).not.toBeNull();
    expect((await userBy(MIRA)).employeeId).toBe("P-10001");

    const state = reduce((await loadSeed(SLUG))!, await loadLog(companyId));
    expect(state.cases.find((x) => x.id === "dir-acc-case")?.assigneeSeatId).toBe(secondSeat);

    const status = await loadDirectoryStatus(companyId);
    expect(status).toMatchObject({ on: true, source: "graph", lastError: null });
    expect(status.lastOkAt).not.toBeNull();
    expect(status.counts).toEqual({ added: 1, updated: 1, deactivated: 1, handed: 0 });
    expect(JSON.stringify(status)).not.toContain("fixtureDeltaToken");

    // D5: the personnel number is not part of the seed.
    const seedJson = JSON.stringify(await loadSeed(SLUG));
    expect(seedJson).not.toContain("P-10001");
    expect(seedJson).not.toContain("P-10006");

    // Round 3: the same delta again changes nothing.
    const usersOf = async () =>
      (await db.user.findMany({ where: { companyId }, orderBy: { id: "asc" } })).map((u) => ({ ...u, directorySyncedAt: null }));
    const seatsOf = () => db.orgRoleHolder.findMany({ where: { companyId }, orderBy: { id: "asc" } });
    const [usersBefore, seatsBefore, eventsBefore] = [await usersOf(), await seatsOf(), await db.caseEvent.count({ where: { companyId } })];
    await runDirectoryOnce(new Date(), () => source());
    expect(await usersOf()).toEqual(usersBefore);
    expect(await seatsOf()).toEqual(seatsBefore);
    expect(await db.caseEvent.count({ where: { companyId } })).toBe(eventsBefore);
    expect((await loadDirectoryStatus(companyId)).counts).toEqual({ added: 0, updated: 0, deactivated: 0, handed: 0 });

    // Only the two Microsoft hosts were asked.
    expect(calls.every((u) => u.startsWith("https://graph.microsoft.com/") || u.startsWith("https://login.microsoftonline.com/"))).toBe(true);
  });
});
