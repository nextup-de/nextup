import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reduce } from "@/features/cases/reducer";
import { templateWrites } from "@/features/demo/content";
import { toSeedJson } from "@/features/demo/parse";
import { SCIM_ENTERPRISE } from "@/features/scim";
import { getDb } from "@/lib/db/client";
import { loadSeed } from "@/lib/db/companies";
import { appendEventRow, loadLog } from "@/lib/db/events";
import { saveIntegration, setIntegrationOn } from "@/lib/db/integrations";
import { createToken } from "@/lib/db/tokens";
import { writeStructure } from "@/lib/db/structure-writes";
import { GET as listUsers, POST as postUser } from "@/app/api/scim/[company]/v2/Users/route";
import { DELETE as deleteOne, GET as getOne, PATCH as patchOne, PUT as putOne } from "@/app/api/scim/[company]/v2/Users/[id]/route";
import { GET as getGroups } from "@/app/api/scim/[company]/v2/Groups/route";
import { GET as getConfig } from "@/app/api/scim/[company]/v2/ServiceProviderConfig/route";

const db = getDb();
const A = "eid-scim-a";
const B = "eid-scim-b";
let companyId = "";
let otherId = "";
let token = "";
let otherToken = "";
let noScopeToken = "";
let tokenId = "";

type J = Record<string, unknown>;
const base = (slug: string) => `http://localhost/api/scim/${slug}/v2`;
const headers = (t: string) => ({ authorization: `Bearer ${t}`, "content-type": "application/scim+json" });
const call = async (fn: (r: Request, c: never) => Promise<Response>, slug: string, path: string, t: string, init: { method?: string; body?: unknown } = {}, id?: string) => {
  const res = await fn(
    new Request(base(slug) + path, { method: init.method ?? "GET", headers: headers(t), body: init.body === undefined ? undefined : JSON.stringify(init.body) }),
    { params: Promise.resolve({ company: slug, id }) } as never,
  );
  const text = await res.text();
  return { status: res.status, type: res.headers.get("content-type"), json: (text ? JSON.parse(text) : null) as J | null, text };
};
const post = (body: unknown, slug = A, t = token) => call(postUser, slug, "/Users", t, { method: "POST", body });
const patch = (id: string, ops: unknown[]) =>
  call(patchOne, A, `/Users/${id}`, token, { method: "PATCH", body: { schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"], Operations: ops } }, id);
const scimUser = (n: string, extra: J = {}, ext: J = {}): J => ({
  schemas: ["urn:ietf:params:scim:schemas:core:2.0:User", SCIM_ENTERPRISE],
  externalId: `ext-${n}`, userName: `${n}@eid-scim.example`, displayName: n, active: true,
  emails: [{ type: "work", value: `${n}@eid-scim.example`, primary: true }],
  [SCIM_ENTERPRISE]: { department: "Engineering", ...ext }, ...extra,
});
const auditRows = () => db.auditEvent.findMany({ where: { companyId, action: "audit.directory.scim" }, orderBy: [{ at: "asc" }, { id: "asc" }] });

beforeAll(async () => {
  process.env.CONNECTOR_VAULT_KEY ||= "ab".repeat(32);
  await db.company.deleteMany({ where: { slug: { in: [A, B] } } });
  const writes = templateWrites("demo", () => crypto.randomUUID());
  companyId = (await db.company.create({ data: { slug: A, name: "EID scim", seedJson: toSeedJson(writes.seedJson) as object } })).id;
  await writeStructure(companyId, writes, "test");
  otherId = (await db.company.create({ data: { slug: B, name: "EID scim b", seedJson: toSeedJson(writes.seedJson) as object } })).id;
  token = await createToken(companyId, "scim", ["scim"]);
  otherToken = await createToken(otherId, "scim", ["scim"]);
  noScopeToken = await createToken(companyId, "no scope", ["cases:read"]);
  tokenId = (await db.apiToken.findFirstOrThrow({ where: { companyId, name: "scim" } })).id;
  for (const id of [companyId, otherId]) {
    await saveIntegration({ companyId: id, system: "scim", settings: { tokenId }, updatedBy: null });
    await setIntegrationOn(id, "scim", true, null);
  }
});

afterAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: [A, B] } } });
  await db.$disconnect();
});

describe("EID SCIM users", () => {
  it("creates a user with unit and manager, finds it by filter, moves it and never returns the personnel number", async () => {
    const boss = await post(scimUser("boss"));
    expect(boss.status).toBe(201);
    expect(boss.type).toContain("application/scim+json");
    const bossId = boss.json!.id as string;

    const made = await post(scimUser("anna", { title: "Lead" }, { manager: { value: bossId }, employeeNumber: "P-4711" }));
    expect(made.status).toBe(201);
    const annaId = made.json!.id as string;
    const row = await db.user.findFirstOrThrow({ where: { id: annaId, companyId } });
    expect(row).toMatchObject({ dept: "ENG", managerId: bossId, line: "Lead", role: "member", employeeId: "P-4711", email: "anna@eid-scim.example" });
    expect(made.text).not.toContain("P-4711");
    expect(made.json).toMatchObject({ externalId: "ext-anna", userName: "anna@eid-scim.example", active: true });
    expect((made.json![SCIM_ENTERPRISE] as J).manager).toEqual({ value: bossId });

    const found = await call(listUsers, A, `/Users?filter=${encodeURIComponent('externalId eq "ext-anna"')}`, token);
    expect(found.status).toBe(200);
    expect(found.json).toMatchObject({ totalResults: 1, startIndex: 1, itemsPerPage: 1 });
    expect((found.json!.Resources as J[])[0].id).toBe(annaId);
    const byName = await call(listUsers, A, `/Users?filter=${encodeURIComponent('USERNAME eq "ANNA@eid-scim.example"')}`, token);
    expect(byName.json).toMatchObject({ totalResults: 1 });
    expect((await call(listUsers, A, `/Users?filter=${encodeURIComponent('userName eq "nobody"')}`, token)).json).toMatchObject({ totalResults: 0, Resources: [] });
    const bad = await call(listUsers, A, `/Users?filter=${encodeURIComponent('title co "x"')}`, token);
    expect(bad.status).toBe(400);
    expect(bad.json).toMatchObject({ status: "400", scimType: "invalidFilter" });

    const dup = await post(scimUser("anna"));
    expect(dup.status).toBe(409);

    const moved = await patch(annaId, [
      { op: "Replace", path: `${SCIM_ENTERPRISE}:department`, value: "Quality" },
      { op: "Replace", path: "title", value: "Head" },
    ]);
    expect(moved.status).toBe(200);
    expect(moved.text).not.toContain("P-4711");
    const after = await db.user.findFirstOrThrow({ where: { id: annaId, companyId } });
    expect(after).toMatchObject({ dept: "QUA", line: "Head", managerId: bossId, employeeId: "P-4711", active: true });

    const got = await call(getOne, A, `/Users/${annaId}`, token, {}, annaId);
    expect(got.status).toBe(200);
    expect(got.text).not.toMatch(/employeeNumber|P-4711/);
    const put = await call(putOne, A, `/Users/${annaId}`, token, { method: "PUT", body: scimUser("anna", { title: "Chief" }, { department: "Quality" }) }, annaId);
    expect(put.status).toBe(200);
    // PUT without a manager removes it.
    expect((await db.user.findFirstOrThrow({ where: { id: annaId, companyId } }))).toMatchObject({ line: "Chief", managerId: null });
    expect((await call(getOne, A, "/Users/nope", token, {}, "nope")).status).toBe(404);
    expect((await call(getOne, A, `/Users/${annaId}`, token, {}, annaId)).text).not.toContain("P-4711");
  });

  it("deactivates with active false and with DELETE, vacates the seat and hands the case", async () => {
    const leaver = (await post(scimUser("leaver"))).json!.id as string;
    const stayer = (await post(scimUser("stayer"))).json!.id as string;
    const third = (await post(scimUser("third"))).json!.id as string;
    const roth = await db.orgRoleHolder.findFirstOrThrow({ where: { companyId, name: "M. Roth" } });
    await db.orgRoleHolder.update({ where: { id: roth.id, companyId }, data: { userId: stayer } });
    const last = await db.orgRoleHolder.aggregate({ where: { companyId }, _max: { sort: true } });
    const seat = await db.orgRoleHolder.create({ data: { companyId, roleId: roth.roleId, name: "Leaver Lead", userId: leaver, sort: (last._max.sort ?? 0) + 1 } });
    await appendEventRow(companyId, {
      id: crypto.randomUUID(), day: 0, type: "case.raised", actor: "someone", targetId: "scim-case-1",
      payload: { title: "Open on the leaver seat", assigneeRoleHolderId: seat.id, assignee: "Leaver Lead" },
    });

    const off = await patch(leaver, [{ op: "replace", value: { active: "False" } }]);
    expect(off.status).toBe(200);
    expect(off.json).toMatchObject({ active: false });
    expect(await db.user.findFirstOrThrow({ where: { id: leaver, companyId } })).toMatchObject({ active: false });
    expect((await db.orgRoleHolder.findFirstOrThrow({ where: { id: seat.id, companyId } })).userId).toBeNull();
    const state = reduce((await loadSeed(A))!, await loadLog(companyId));
    expect(state.cases.find((c) => c.id === "scim-case-1")?.assigneeSeatId).toBe(roth.id);
    const handed = (await auditRows()).at(-1)!.changes as Record<string, { after: number }>;
    expect(handed).toMatchObject({ deactivated: { after: 1 }, handed: { after: 1 } });

    const del = await call(deleteOne, A, `/Users/${third}`, token, { method: "DELETE" }, third);
    expect(del.status).toBe(204);
    expect(await db.user.findFirstOrThrow({ where: { id: third, companyId } })).toMatchObject({ active: false });
    expect(await db.user.count({ where: { id: third, companyId } })).toBe(1); // deactivated, never deleted
    expect((await call(deleteOne, A, `/Users/${third}`, token, { method: "DELETE" }, third)).status).toBe(204);
  });

  it("links an existing member instead of duplicating it", async () => {
    const mine = await db.user.create({ data: { companyId, name: "Old Member", email: "old@eid-scim.example", role: "member", dept: "ENG" } });
    const before = await db.user.count({ where: { companyId } });
    const res = await post(scimUser("old"));
    expect(res.status).toBe(201);
    expect(res.json!.id).toBe(mine.id);
    expect(await db.user.count({ where: { companyId } })).toBe(before);
    expect(await db.externalIdentity.findFirstOrThrow({ where: { companyId, userId: mine.id, provider: "scim" } })).toMatchObject({ subject: "ext-old" });
  });

  it("refuses another company's token, a token without the scope, and a missing or unknown token", async () => {
    expect((await post(scimUser("x1"), A, otherToken)).status).toBe(403);
    expect((await post(scimUser("x2"), A, noScopeToken)).status).toBe(403);
    expect((await call(listUsers, A, "/Users", "nxt_unknown")).status).toBe(401);
    expect(await db.user.count({ where: { companyId, email: { in: ["x1@eid-scim.example", "x2@eid-scim.example"] } } })).toBe(0);
    const g = await call(getGroups, A, "/Groups", token);
    expect(g.status).toBe(404);
    expect(g.json).toMatchObject({ status: "404" });
    expect((await call(getConfig, A, "/ServiceProviderConfig", token)).json).toMatchObject({ patch: { supported: true } });
  });

  it("answers 403 with the switch off and writes nothing", async () => {
    await setIntegrationOn(companyId, "scim", false, null);
    const before = await db.user.count({ where: { companyId } });
    const res = await post(scimUser("off"));
    expect(res.status).toBe(403);
    expect((await call(listUsers, A, "/Users", token)).status).toBe(403);
    expect(await db.user.count({ where: { companyId } })).toBe(before);
    await setIntegrationOn(companyId, "scim", true, null);
    expect((await call(listUsers, A, "/Users", token)).status).toBe(200);
  });

  it("writes one audit.directory.scim row per change, with counts and no names", async () => {
    const rows = await auditRows();
    // boss, anna, anna moved, anna PUT, leaver, stayer, third, leaver off, third deleted, old linked: each one row
    const before = rows.length;
    expect(before).toBeGreaterThanOrEqual(10);
    const one = await post(scimUser("audit-one"));
    expect(one.status).toBe(201);
    const after = await auditRows();
    expect(after.length).toBe(before + 1);
    const row = after.at(-1)!;
    expect(row).toMatchObject({ actorKind: "api-token", source: "api" });
    expect(row.changes).toMatchObject({ added: { after: 1 }, apiTokenId: { after: tokenId } });
    expect(JSON.stringify(row.changes)).not.toMatch(/audit-one|eid-scim\.example/);
    // a read and a change that changes nothing write no row
    await call(listUsers, A, "/Users", token);
    await patch(one.json!.id as string, [{ op: "replace", path: "title", value: "" }]);
    expect((await auditRows()).length).toBe(before + 1);
    const run = await db.integration.findFirstOrThrow({ where: { companyId, system: "scim" } });
    expect(run.lastOkAt).not.toBeNull();
  });
});
