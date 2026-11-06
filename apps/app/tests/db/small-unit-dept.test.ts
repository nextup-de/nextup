// The department next to a handle, against Postgres: blanked when the raise is written, and blanked on the way
// out for a raise stored before, wherever events leave the server (the log and the token endpoint).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { getDb } from "@/lib/db/client";
import { appendEventRow, loadLog } from "@/lib/db/events";
import { loadUnitPeople } from "@/lib/db/pseudonymise";
import { createToken } from "@/lib/db/tokens";

let viewer: Viewer | null = null;
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));

const { appendEventAction } = await import("@/server/actions/events");
const { GET } = await import("@/app/api/[company]/events/route");

const db = getDb();
const SLUG = "dept-co";
const ids = { company: "", small: "", big: "", inBig: "", inSmall: "", noUnit: "", lead: "" };
let token = "";

const as = (userId: string, name: string, handle: string | null, role: Viewer["role"] = "member"): Viewer => ({
  userId, companyId: ids.company, companySlug: SLUG, name, handle, role, epoch: 0, issuedAt: 0,
});
const raise = async (who: Viewer, caseId: string, fromDept: string) => {
  viewer = who;
  const r = await appendEventAction({ slug: SLUG, id: crypto.randomUUID(), type: "case.raised", target: caseId, payload: { title: caseId, body: "b", routeId: null, assignee: "Desk", fromDept, kind: "problem" } });
  expect(r).toEqual({ ok: true });
};
const stored = async (caseId: string) => db.caseEvent.findFirstOrThrow({ where: { companyId: ids.company, type: "case.raised", targetId: caseId } });
const deptOf = async (caseId: string) => ((await stored(caseId)).payload as { fromDept?: string }).fromDept;
const inLog = async (caseId: string) => (await loadLog(ids.company)).events.find((e) => e.type === "case.raised" && e.target === caseId)!.payload.fromDept;
async function inApi(caseId: string) {
  const res = (await GET(new Request(`http://x/api/${SLUG}/events?since=0&limit=500`, { headers: { authorization: `Bearer ${token}` } }), { params: Promise.resolve({ company: SLUG }) }))!;
  expect(res.status).toBe(200);
  const body = (await res.json()) as { events: { type: string; target: string | null; payload: { fromDept?: string } }[] };
  return body.events.find((e) => e.type === "case.raised" && e.target === caseId)!.payload.fromDept;
}

beforeAll(async () => {
  process.env.AUTH_SECRET ??= "small-unit-dept-secret-0123456789";
  await db.company.deleteMany({});
  ids.company = (await db.company.create({ data: { slug: SLUG, name: "Dept", stage: "pilot", seedJson: toSeedJson(SEED) as object } })).id;
  ids.big = (await db.orgUnit.create({ data: { companyId: ids.company, key: "ASM", name: "Assembly" } })).id;
  ids.small = (await db.orgUnit.create({ data: { companyId: ids.company, key: "TLR", name: "Tool room" } })).id;
  const user = async (name: string, dept: string, handle: string | null, role = "member") =>
    (await db.user.create({ data: { companyId: ids.company, name, email: name.replace(/\W/g, "") + "@dept.example", role, dept, handle } })).id;
  // Assembly: five people. Tool room: three members and the lead on its seat, four people.
  ids.inBig = await user("Ada Big", "ASM", "Anonymous #1001");
  for (const n of [2, 3, 4, 5]) await user(`Assembly ${n}`, "ASM", null);
  ids.inSmall = await user("Sam Small", "TLR", "Anonymous #1002");
  for (const n of [2, 3]) await user(`Tool ${n}`, "Tool room", null);
  ids.lead = await user("Lea Lead", "", null, "leader");
  const role = await db.orgRole.create({ data: { companyId: ids.company, orgUnitId: ids.small, title: "Tool room lead" } });
  await db.orgRoleHolder.create({ data: { companyId: ids.company, roleId: role.id, name: "Lea Lead", userId: ids.lead } });
  ids.noUnit = await user("Nora Nowhere", "Somewhere else", "Anonymous #1003");
  token = await createToken(ids.company, "dept", ["events:read"]);
});

beforeEach(() => {
  viewer = null;
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("the department on a raise under a handle", () => {
  it("the server counts the raiser's own unit", async () => {
    const people = await loadUnitPeople(ids.company);
    expect([people.ofUnit(ids.big), people.ofUnit(ids.small)]).toEqual([5, 4]);
    expect([people.ofUser(ids.inBig), people.ofUser(ids.inSmall), people.ofUser(ids.lead), people.ofUser(ids.noUnit)]).toEqual([5, 4, 4, null]);
  });

  it("is stored for a unit of five, blanked for a unit of four and for no unit, whatever the browser sent", async () => {
    await raise(as(ids.inBig, "Ada Big", "Anonymous #1001"), "c-big", "Assembly");
    await raise(as(ids.inSmall, "Sam Small", "Anonymous #1002"), "c-small", "Assembly"); // the label is not what decides
    await raise(as(ids.noUnit, "Nora Nowhere", "Anonymous #1003"), "c-none", "Assembly");
    expect([await deptOf("c-big"), await deptOf("c-small"), await deptOf("c-none")]).toEqual(["Assembly", "", ""]);
    expect(await stored("c-small")).toMatchObject({ actor: "Anonymous #1002", actorUserId: ids.inSmall });
  });

  it("stays as sent for a raiser who appears by name", async () => {
    await raise(as(ids.lead, "Lea Lead", null, "leader"), "c-lead", "Tool room");
    expect(await deptOf("c-lead")).toBe("Tool room");
    expect(await inLog("c-lead")).toBe("Tool room");
  });

  it("a raise stored before leaves the server without it, in the log and through the token endpoint; the row is untouched", async () => {
    const old = { title: "Old", body: "b", routeId: null, assignee: "Desk", fromDept: "Tool room", kind: "problem" };
    await appendEventRow(ids.company, { id: "old-small", day: 0, type: "case.raised", actor: "Anonymous #1002", targetId: "c-old-small", payload: old } as never, { actorUserId: ids.inSmall });
    await appendEventRow(ids.company, { id: "old-big", day: 0, type: "case.raised", actor: "Anonymous #1001", targetId: "c-old-big", payload: { ...old, fromDept: "Assembly" } } as never, { actorUserId: ids.inBig });
    expect([await inLog("c-old-small"), await inLog("c-old-big")]).toEqual(["", "Assembly"]);
    expect([await inApi("c-old-small"), await inApi("c-old-big")]).toEqual(["", "Assembly"]);
    expect(await deptOf("c-old-small")).toBe("Tool room");
  });

  it("follows the org: with a fifth person in the unit the stored department shows again", async () => {
    await db.user.create({ data: { companyId: ids.company, name: "Tool 4", email: "tool4@dept.example", role: "member", dept: "TLR" } });
    expect(await inLog("c-old-small")).toBe("Tool room");
    expect(await inLog("c-small")).toBe(""); // blanked when it was written: there is nothing to show
  });
});
