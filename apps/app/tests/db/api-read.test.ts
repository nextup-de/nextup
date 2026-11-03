// API-A1 (D15): the six v1 read endpoints, called as route handlers with a Request.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiV1Case, ApiV1CaseList, ApiV1DecisionList, ApiV1Error, ApiV1Org, ApiV1Project, ApiV1ProjectList } from "@nextup/contracts/public";
import type { ZodType } from "zod";
import { rowsFromSeed } from "@/features/knowledge";
import { EMPTY_SEED, LOCAL_SEED } from "@/features/demo";
import { toSeedJson } from "@/features/demo/parse";
import { getDb } from "@/lib/db/client";
import { replaceKnowledge } from "@/lib/db/knowledge";
import { createToken, revokeToken } from "@/lib/db/tokens";
import { RULES } from "@/server/throttle";
import { GET as casesList } from "@/app/api/v1/[company]/cases/route";
import { GET as casesGet } from "@/app/api/v1/[company]/cases/[id]/route";
import { GET as decisionsList } from "@/app/api/v1/[company]/decisions/route";
import { GET as projectsList } from "@/app/api/v1/[company]/projects/route";
import { GET as projectsGet } from "@/app/api/v1/[company]/projects/[id]/route";
import { GET as orgGet } from "@/app/api/v1/[company]/org/route";

const db = getDb();
const co = { a: { id: "", slug: "api-r-a" }, b: { id: "", slug: "api-r-b" } };
let all = "", casesOnly = "", other = "";

type Handler = (r: Request, c: { params: Promise<{ company: string; id: string }> }) => Promise<Response>;
const call = (h: Handler, path: string, token: string | null, slug = co.a.slug, id = "") =>
  h(new Request(`http://localhost/api/v1/${slug}/${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} }), { params: Promise.resolve({ company: slug, id }) });

async function ok<T>(res: Response, schema: ZodType<T>): Promise<T> {
  expect(res.status).toBe(200);
  expect(res.headers.get("x-request-id")).toBeTruthy();
  return schema.parse(await res.json());
}
async function fails(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  const body = ApiV1Error.parse(await res.json());
  expect(body.error.code).toBe(code);
  expect(body.error.requestId).toBe(res.headers.get("x-request-id"));
  return res;
}

const event = (companyId: string, id: string, type: string, target: string, payload: object, minute: number, actorUserId?: string | null) =>
  db.caseEvent.create({ data: { id, companyId, day: 0, type, actor: "x", actorUserId: actorUserId ?? null, targetId: target, payload, ts: new Date(Date.UTC(2026, 10, 1, 8, minute)) } });

beforeAll(async () => {
  await db.company.deleteMany({});
  for (const c of [co.a, co.b]) c.id = (await db.company.create({ data: { slug: c.slug, name: c.slug, seedJson: toSeedJson(EMPTY_SEED) as object } })).id;
  let i = 0;
  await replaceKnowledge(co.a.id, rowsFromSeed(LOCAL_SEED, LOCAL_SEED.goals, () => "kr" + ++i));
  for (let k = 1; k <= 5; k++) await event(co.a.id, `e${k}`, "case.raised", `k${k}`, { title: `Case ${k}` }, k);
  await event(co.a.id, "ep", "case.raised", "kp", { title: "Hidden", visibility: "private" }, 9);
  await event(co.a.id, "ed", "case.decided", "k2", { answer: "yes", reason: "Go", projectId: "pjx", lead: "Lee" }, 10);
  await event(co.a.id, "ed2", "case.decided", "kp", { answer: "no" }, 11);
  await event(co.b.id, "eb", "case.raised", "kb", { title: "Other company" }, 1);
  all = await createToken(co.a.id, "all", ["cases:read", "decisions:read", "projects:read", "org:read"]);
  casesOnly = await createToken(co.a.id, "cases", ["cases:read"]);
  other = await createToken(co.b.id, "b", ["cases:read", "org:read"]);
});
afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("API v1 read endpoints", () => {
  it("lists cases newest first, pages with the cursor and hides private ones", async () => {
    const first = await ok(await call(casesList, "cases?limit=3", all), ApiV1CaseList);
    expect(first.data.map((c) => c.id)).toEqual(["k5", "k4", "k3"]);
    expect(first.page.nextCursor).toBeTruthy();
    const second = await ok(await call(casesList, `cases?limit=3&cursor=${first.page.nextCursor}`, all), ApiV1CaseList);
    expect(second.data.map((c) => c.id)).toEqual(["k2", "k1"]);
    expect(second.page.nextCursor).toBeNull();
    const everything = await ok(await call(casesList, "cases", all), ApiV1CaseList);
    expect(everything.data.map((c) => c.id)).not.toContain("kp");
    expect(everything.data.find((c) => c.id === "k2")?.state).toBe("decided");
    expect(everything.data.every((c) => c.companyId === co.a.id)).toBe(true);
  });

  it("gets one case, and answers 404 for a private, unknown or other company's case", async () => {
    const one = await ok(await call(casesGet, "cases/k1", all, co.a.slug, "k1"), ApiV1Case);
    expect(one.data.id).toBe("k1");
    await fails(await call(casesGet, "cases/kp", all, co.a.slug, "kp"), 404, "not_found");
    await fails(await call(casesGet, "cases/nope", all, co.a.slug, "nope"), 404, "not_found");
    await fails(await call(casesGet, "cases/kb", all, co.a.slug, "kb"), 404, "not_found");
  });

  it("lists decisions without the private case and without a person", async () => {
    const list = await ok(await call(decisionsList, "decisions", all), ApiV1DecisionList);
    expect(list.data).toHaveLength(1);
    expect(list.data[0]).toMatchObject({ caseId: "k2", answer: "yes", reason: "Go", projectId: "pjx", decidedByUserId: null });
  });

  it("lists and gets projects", async () => {
    const list = await ok(await call(projectsList, "projects", all), ApiV1ProjectList);
    expect(list.data.map((p) => p.id)).toEqual(["pjx"]);
    const one = await ok(await call(projectsGet, "projects/pjx", all, co.a.slug, "pjx"), ApiV1Project);
    expect(one.data).toMatchObject({ id: "pjx", caseId: "k2", state: "planned" });
    await fails(await call(projectsGet, "projects/zzz", all, co.a.slug, "zzz"), 404, "not_found");
  });

  it("answers the org chart", async () => {
    const org = await ok(await call(orgGet, "org", all), ApiV1Org);
    expect(org.data.units.length).toBeGreaterThan(0);
    expect(org.data.roles.length).toBeGreaterThan(0);
    expect(org.data.units.every((u) => u.companyId === co.a.id)).toBe(true);
  });

  it("answers 401 without, with an unknown or with a revoked token", async () => {
    await fails(await call(casesList, "cases", null), 401, "unauthorized");
    await fails(await call(casesList, "cases", "nxt_nope"), 401, "unauthorized");
    const gone = await createToken(co.a.id, "gone", ["cases:read"]);
    const row = await db.apiToken.findFirstOrThrow({ where: { companyId: co.a.id, name: "gone" } });
    await revokeToken(co.a.id, row.id, new Date());
    await fails(await call(casesList, "cases", gone), 401, "unauthorized");
  });

  it("answers 403 for another company's token and for a missing scope", async () => {
    await fails(await call(casesList, "cases", other), 403, "forbidden");
    await fails(await call(orgGet, "org", other, co.a.slug), 403, "forbidden");
    await fails(await call(orgGet, "org", casesOnly), 403, "forbidden");
    await fails(await call(decisionsList, "decisions", casesOnly), 403, "forbidden");
  });

  it("answers 400 for a bad limit or cursor", async () => {
    await fails(await call(casesList, "cases?limit=0", all), 400, "bad_request");
    await fails(await call(casesList, "cases?limit=500", all), 400, "bad_request");
    await fails(await call(casesList, "cases?cursor=garbage", all), 400, "bad_request");
  });

  it("answers 429 with retry-after after 600 hits on the token's counter", async () => {
    const raw = await createToken(co.a.id, "busy", ["cases:read"]);
    const row = await db.apiToken.findFirstOrThrow({ where: { companyId: co.a.id, name: "busy" } });
    await db.rateCounter.create({ data: { key: `apiV1|${row.id}`, count: RULES.apiV1.limit, resetAt: new Date(Date.now() + 60_000) } });
    const res = await fails(await call(casesList, "cases", raw), 429, "rate_limited");
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("marks the token used after a 200", async () => {
    const row = await db.apiToken.findFirstOrThrow({ where: { companyId: co.a.id, name: "all" } });
    expect(row.lastUsedAt).not.toBeNull();
  });
});
