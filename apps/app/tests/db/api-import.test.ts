import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { parseCsv } from "@/features/api/csv";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { getDb } from "@/lib/db/client";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async () => viewer), getViewer: vi.fn(async () => null) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));

import { GET as exportFile } from "@/app/[company]/(app)/settings/import-export/export/[kind]/route";
import { applyImportAction, checkImportAction } from "@/server/actions/settings/import-export";

const db = getDb();
let co: { id: string; slug: string; admin: string; leader: string };

const asViewer = (userId: string, role: Viewer["role"]): Viewer => ({
  userId, companyId: co.id, companySlug: co.slug, name: "Admin", handle: null, role, epoch: 0, issuedAt: 0,
});
const form = (files: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(files)) f.set(k, new File([v], `${k}.csv`, { type: "text/csv" }));
  return f;
};
const counts = async () => ({
  units: await db.orgUnit.count({ where: { companyId: co.id } }),
  roles: await db.orgRole.count({ where: { companyId: co.id } }),
  seats: await db.orgRoleHolder.count({ where: { companyId: co.id } }),
  members: await db.user.count({ where: { companyId: co.id } }),
  routes: await db.routingRule.count({ where: { companyId: co.id } }),
});
const get = (kind: string) => exportFile(new Request("http://x"), { params: Promise.resolve({ company: co.slug, kind }) });

const FILES = {
  units: "key,name,kind,parent_key,headcount\nTEAM,Team Alpha,team,OPS,4\nOPS,Operations,dept,,20\n",
  roles: "unit_key,title,reports_to_unit_key,reports_to_title,seats,spend_limit_eur,decides\nOPS,Head,,,1,5000,approve;buy\nTEAM,Lead,OPS,Head,2,,\n",
  members: "name,email,department,app_role,language,seat_unit_key,seat_role_title\nAnn,ann@imp.example,Ops,leader,de,OPS,Head\nBo,bo@imp.example,Ops,member,en,TEAM,Lead\n",
  routes: "key,keywords,owner_unit_key,owner_role_title\nrepair,fix;broken,TEAM,Lead\n",
};

beforeAll(async () => {
  await db.company.deleteMany({});
  const c = await db.company.create({ data: { slug: "api-import", name: "imp", seedJson: toSeedJson(SEED) as object } });
  const mk = (name: string, role: string) => db.user.create({ data: { companyId: c.id, name, email: `${name}@own.example`, role }, select: { id: true } });
  const [admin, leader] = [await mk("admin", "manager"), await mk("leader", "leader")];
  co = { id: c.id, slug: c.slug, admin: admin.id, leader: leader.id };
});
beforeEach(() => { viewer = null; });
afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("API structure import and export", () => {
  it("a non-admin is refused everywhere and nothing is written", async () => {
    const before = await counts();
    for (const v of [null, asViewer(co.leader, "leader")]) {
      viewer = v;
      expect(await checkImportAction(co.slug, form(FILES))).toEqual({ ok: false, error: "settingsImport.errForbidden" });
      expect(await applyImportAction(co.slug, form(FILES))).toEqual({ ok: false, error: "settingsImport.errForbidden" });
      expect((await get("members")).status).toBe(404);
    }
    expect(await counts()).toEqual(before);
    expect(await db.auditEvent.count({ where: { companyId: co.id, action: { in: ["audit.settings.import", "audit.settings.export"] } } })).toBe(0);
  });

  it("a set with one bad row writes nothing", async () => {
    viewer = asViewer(co.admin, "manager");
    const before = await counts();
    const bad = { ...FILES, members: FILES.members + "Cy,not-an-email,,member,en,,\n" };
    const checked = await checkImportAction(co.slug, form(bad));
    expect(checked).toMatchObject({ ok: true, result: { ok: false, errors: [{ file: "members", line: 4, column: "email" }] } });
    const r = await applyImportAction(co.slug, form(bad));
    expect(r).toMatchObject({ ok: false, error: "settingsImport.errNotClean", errors: [{ file: "members", line: 4 }] });
    expect(await counts()).toEqual(before);
  });

  it("a failure inside the transaction rolls every earlier write back", async () => {
    viewer = asViewer(co.admin, "manager");
    const before = await counts();
    // The check passes; the audit row then fails to write, which must undo the whole import.
    const audit = await import("@/server/audit/record");
    const spy = vi.spyOn(audit, "recordAudit").mockRejectedValueOnce(new Error("disk full"));
    const r = await applyImportAction(co.slug, form(FILES));
    spy.mockRestore();
    expect(r).toEqual({ ok: false, error: "settingsImport.errAudit" });
    expect(await counts()).toEqual(before);
  });

  it("applying the four files to an empty company creates units, roles with seats, members and routes", async () => {
    viewer = asViewer(co.admin, "manager");
    const r = await applyImportAction(co.slug, form(FILES));
    expect(r).toEqual({ ok: true, applied: {
      units: { added: 2, changed: 0 }, roles: { added: 2, changed: 0 }, members: { added: 2, changed: 0 }, routes: { added: 1, changed: 0 },
    } });

    const units = await db.orgUnit.findMany({ where: { companyId: co.id } });
    const ops = units.find((u) => u.key === "OPS")!;
    expect(units.find((u) => u.key === "TEAM")).toMatchObject({ name: "Team Alpha", kind: "team", headcount: 4, parentId: ops.id });
    const roles = await db.orgRole.findMany({ where: { companyId: co.id } });
    const head = roles.find((x) => x.title === "Head")!;
    const lead = roles.find((x) => x.title === "Lead")!;
    expect(head).toMatchObject({ orgUnitId: ops.id, spendLimitEur: 5000, decides: ["approve", "buy"], reportsToId: null });
    expect(lead.reportsToId).toBe(head.id);

    const ann = await db.user.findFirstOrThrow({ where: { companyId: co.id, email: "ann@imp.example" } });
    expect(ann).toMatchObject({ name: "Ann", dept: "Ops", role: "leader", locale: "de", loginCodeHash: null });
    const seats = await db.orgRoleHolder.findMany({ where: { companyId: co.id } });
    expect(seats.filter((s) => s.roleId === head.id)).toHaveLength(1);
    expect(seats.filter((s) => s.roleId === lead.id)).toHaveLength(2);
    expect(seats.find((s) => s.roleId === head.id)?.userId).toBe(ann.id);
    expect(seats.filter((s) => s.roleId === lead.id && s.userId !== null)).toHaveLength(1);

    const route = await db.routingRule.findFirstOrThrow({ where: { companyId: co.id, key: "repair" } });
    expect(route).toMatchObject({ keywords: ["fix", "broken"], ownerRoleId: lead.id });

    const audits = await db.auditEvent.findMany({ where: { companyId: co.id, action: "audit.settings.import" } });
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0].changes)).not.toMatch(/imp\.example|Ann/);

    // The same set again has nothing to do.
    const again = await checkImportAction(co.slug, form(FILES));
    expect(again).toMatchObject({ ok: true, result: { ok: true, plan: { units: [], roles: [], members: [], routes: [] } } });
  });

  it("applying an edited set changes matched rows and deletes nothing", async () => {
    viewer = asViewer(co.admin, "manager");
    const before = await counts();
    const edited = {
      units: "key,name,kind,parent_key,headcount\nTEAM,Team Beta,team,OPS,6\n",
      roles: "unit_key,title,reports_to_unit_key,reports_to_title,seats,spend_limit_eur,decides\nOPS,Head,,,1,9000,approve\n",
      members: "name,email,department,app_role,language,seat_unit_key,seat_role_title\nAnn Smith,ANN@imp.example,Ops,manager,en,,\n",
      routes: "key,keywords,owner_unit_key,owner_role_title\nrepair,fix;broken;leak,OPS,Head\n",
    };
    const r = await applyImportAction(co.slug, form(edited));
    expect(r).toEqual({ ok: true, applied: {
      units: { added: 0, changed: 1 }, roles: { added: 0, changed: 1 }, members: { added: 0, changed: 1 }, routes: { added: 0, changed: 1 },
    } });
    expect(await counts()).toEqual(before); // Bo, Lead and the second unit are not in the files and stay
    expect(await db.orgUnit.findFirstOrThrow({ where: { companyId: co.id, key: "TEAM" } })).toMatchObject({ name: "Team Beta", headcount: 6 });
    expect(await db.orgRole.findFirstOrThrow({ where: { companyId: co.id, title: "Head" } })).toMatchObject({ spendLimitEur: 9000, decides: ["approve"] });
    expect(await db.user.findFirstOrThrow({ where: { companyId: co.id, email: "ann@imp.example" } })).toMatchObject({ name: "Ann Smith", role: "manager", locale: "en" });
    const head = await db.orgRole.findFirstOrThrow({ where: { companyId: co.id, title: "Head" } });
    expect(await db.routingRule.findFirstOrThrow({ where: { companyId: co.id, key: "repair" } })).toMatchObject({ keywords: ["fix", "broken", "leak"], ownerRoleId: head.id });
    expect(await db.user.count({ where: { companyId: co.id, email: "bo@imp.example" } })).toBe(1);
  });

  it("the export gives the four files back with dated names, and a members export is audited", async () => {
    viewer = asViewer(co.admin, "manager");
    const day = new Date().toISOString().slice(0, 10);
    const body: Record<string, string> = {};
    for (const kind of ["units", "roles", "members", "routes"]) {
      const res = await get(kind);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/csv");
      expect(res.headers.get("content-disposition")).toBe(`attachment; filename="${co.slug}-${kind}-${day}.csv"`);
      body[kind] = await res.text();
    }
    expect((await get("nonsense")).status).toBe(404);
    expect(parseCsv(body.units).rows.map((r) => r[0]).sort()).toEqual(["OPS", "TEAM"]);
    expect(parseCsv(body.roles).rows.map((r) => r[1]).sort()).toEqual(["Head", "Lead"]);
    expect(parseCsv(body.members).rows.map((r) => r[1]).sort()).toEqual(["ann@imp.example", "admin@own.example", "bo@imp.example", "leader@own.example"].sort());
    expect(body.members).not.toMatch(/hash|secret|token/i);
    expect(parseCsv(body.routes).rows).toEqual([["repair", "fix;broken;leak", "OPS", "Head"]]);

    // What was exported imports clean and changes nothing.
    const back = await checkImportAction(co.slug, form(body));
    expect(back).toMatchObject({ ok: true, result: { ok: true, plan: { units: [], roles: [], members: [], routes: [] } } });

    // Only the members export is audited, once.
    const audits = await db.auditEvent.findMany({ where: { companyId: co.id, action: "audit.settings.export" } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorUserId: co.admin, targetKind: "members" });
  });
});
