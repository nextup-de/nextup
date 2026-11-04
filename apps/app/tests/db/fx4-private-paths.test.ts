// FX4 against Postgres: a picked audience reaches the people picked and nobody else, and the token endpoint
// hands out nothing from a case whose raiser chose who sees it. PILOT_CHECK D3, E2, E3.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { getDb } from "@/lib/db/client";
import { createToken } from "@/lib/db/tokens";
import { visibleTo } from "@/lib/db/projections/visible";

let viewer: Viewer | null = null;
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));

const { appendEventAction } = await import("@/server/actions/events");
const { GET } = await import("@/app/api/[company]/events/route");

const db = getDb();
const SLUG = "fx4-co";
const ids = { company: "", unit: "", other: "", raiser: "", mate: "", third: "", qa: "", desk: "", seat: "" };
let token = "";

const as = (userId: string, name: string, role: Viewer["role"] = "member"): Viewer => ({
  userId, companyId: ids.company, companySlug: SLUG, name, handle: null, role, epoch: 0, issuedAt: 0,
});
const raised = (title: string, extra: Record<string, unknown>) => ({ title, body: "b", routeId: null, assignee: "Desk", fromDept: "PRD", kind: "problem", ...extra });
const raise = async (id: string, extra: Record<string, unknown>) => {
  viewer = as(ids.raiser, "Raiser");
  const r = await appendEventAction({ slug: SLUG, id: crypto.randomUUID(), type: "case.raised", target: id, payload: raised(id, extra) });
  expect(r).toEqual({ ok: true });
};
const stored = async (caseId: string) =>
  (await db.caseEvent.findFirstOrThrow({ where: { companyId: ids.company, type: "case.raised", targetId: caseId } })).payload as Record<string, unknown>;
const keysOf = async (caseId: string) => (await db.caseView.findFirstOrThrow({ where: { companyId: ids.company, caseId }, select: { accessKeys: true } })).accessKeys;
const opens = async (userId: string, caseId: string) => {
  const [mine, keys] = await Promise.all([visibleTo(ids.company, userId), keysOf(caseId)]);
  return keys.some((k) => mine.includes(k));
};
async function poll(since = 0) {
  const res = (await GET(new Request(`http://x/api/${SLUG}/events?since=${since}&limit=500`, { headers: { authorization: `Bearer ${token}` } }), { params: Promise.resolve({ company: SLUG }) }))!;
  expect(res.status).toBe(200);
  return (await res.json()) as { cursor: number; count: number; events: { type: string; target: string | null; actorUserId?: unknown }[] };
}

beforeAll(async () => {
  process.env.AUTH_SECRET ??= "fx4-private-paths-secret-0123456789";
  await db.company.deleteMany({});
  ids.company = (await db.company.create({ data: { slug: SLUG, name: "FX4", stage: "pilot", seedJson: toSeedJson(SEED) as object } })).id;
  ids.unit = (await db.orgUnit.create({ data: { companyId: ids.company, key: "PRD", name: "Production" } })).id;
  ids.other = (await db.orgUnit.create({ data: { companyId: ids.company, key: "QUA", name: "Quality" } })).id;
  const user = async (name: string, dept: string, role = "member") =>
    (await db.user.create({ data: { companyId: ids.company, name, email: name.replace(/\W/g, "") + "@fx4.example", role, dept } })).id;
  ids.raiser = await user("Raiser", "PRD");
  ids.mate = await user("Mate Picked", "PRD");
  ids.third = await user("Third Person", "PRD");
  ids.qa = await user("Quality Person", "QUA");
  ids.desk = await user("Desk Lead", "QUA", "leader");
  const role = await db.orgRole.create({ data: { companyId: ids.company, orgUnitId: ids.other, title: "Lead" } });
  ids.seat = (await db.orgRoleHolder.create({ data: { companyId: ids.company, roleId: role.id, name: "Desk Lead", userId: ids.desk } })).id;
  token = await createToken(ids.company, "fx4", ["events:read"]);
});

beforeEach(() => {
  viewer = null;
});

afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("FX4 a picked audience", () => {
  it("is stored by id, whatever the browser sent as ids", async () => {
    await raise("c-custom", { visibility: "custom", seenBy: ["Mate Picked"], seenByUserIds: [ids.third], seenByUnitIds: [ids.other] });
    const p = await stored("c-custom");
    expect(p.seenByUserIds).toEqual([ids.mate]);
    expect(p.seenByUnitIds).toEqual([]);
  });

  it("opens the case for the person picked, and not for a third person", async () => {
    expect(await opens(ids.mate, "c-custom")).toBe(true);
    expect(await opens(ids.third, "c-custom")).toBe(false);
  });

  it("reaches everyone in a department picked by name", async () => {
    await raise("c-dept", { visibility: "custom", seenBy: ["Quality"] });
    expect((await stored("c-dept")).seenByUnitIds).toEqual([ids.other]);
    expect(await opens(ids.qa, "c-dept")).toBe(true);
    expect(await opens(ids.third, "c-dept")).toBe(false);
  });

  it("drops a name it cannot match instead of opening the case wider", async () => {
    await raise("c-unknown", { visibility: "custom", seenBy: ["Nobody Here"] });
    expect(await stored("c-unknown")).toMatchObject({ seenByUserIds: [], seenByUnitIds: [] });
    expect(await opens(ids.third, "c-unknown")).toBe(false);
  });
});

describe("FX4 commenting through the action", () => {
  it("is refused for someone who cannot open the case, and leaves no event", async () => {
    await raise("c-private", { visibility: "private" });
    viewer = as(ids.third, "Third Person");
    const r = await appendEventAction({ slug: SLUG, id: crypto.randomUUID(), type: "case.commented", target: "c-private", payload: { text: "hi" } });
    expect(r.ok).toBe(false);
    expect(await db.caseEvent.count({ where: { companyId: ids.company, type: "case.commented", targetId: "c-private" } })).toBe(0);
  });

  it("works for someone picked", async () => {
    viewer = as(ids.mate, "Mate Picked");
    const r = await appendEventAction({ slug: SLUG, id: crypto.randomUUID(), type: "case.commented", target: "c-custom", payload: { text: "hi" } });
    expect(r).toEqual({ ok: true });
  });
});

describe("FX4 the token endpoint", () => {
  it("hands out nothing from a private or a custom case, and everything else", async () => {
    await raise("c-open", { visibility: "everyone" });
    await raise("c-nochoice", {});
    const { events } = await poll();
    const targets = new Set(events.map((e) => e.target));
    expect(targets.has("c-private")).toBe(false);
    expect(targets.has("c-custom")).toBe(false);
    expect(targets.has("c-dept")).toBe(false);
    expect(targets.has("c-open")).toBe(true);
    expect(targets.has("c-nochoice")).toBe(true);
    expect(events.every((e) => e.actorUserId === undefined || e.actorUserId === null)).toBe(true);
  });

  it("still moves its cursor past what it held back, and counts what it returned", async () => {
    const all = await db.caseEvent.findMany({ where: { companyId: ids.company }, orderBy: { seq: "asc" }, select: { seq: true } });
    const page = await poll();
    expect(page.cursor).toBe(all[all.length - 1].seq);
    expect(page.count).toBe(page.events.length);
    expect((await poll(page.cursor)).count).toBe(0);
  });
});
