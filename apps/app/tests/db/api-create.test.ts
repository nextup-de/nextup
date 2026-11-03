// API-B1 (D15): POST /api/v1/<company>/cases, called as a route handler with a Request.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiV1CaseCreated, ApiV1Error } from "@nextup/contracts/public";
import { rowsFromSeed } from "@/features/knowledge";
import { EMPTY_SEED, LOCAL_SEED, seedFor } from "@/features/demo";
import { toSeedJson } from "@/features/demo/parse";
import { getDb } from "@/lib/db/client";
import { replaceKnowledge } from "@/lib/db/knowledge";
import { createToken } from "@/lib/db/tokens";
import { POST } from "@/app/api/v1/[company]/cases/route";

const db = getDb();
const slug = "api-c-a";
let companyId = "", writer = "", reader = "", userId = "", gone = "";
let routeKey = "", seatRole: string | null = null;

const post = (body: unknown, token: string | null, raw = false) =>
  POST(
    new Request(`http://localhost/api/v1/${slug}/cases`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: raw ? (body as string) : JSON.stringify(body),
    }),
    { params: Promise.resolve({ company: slug }) },
  );
const valid = (over: Record<string, unknown> = {}) => ({
  title: "Press 4 leaks oil", body: "Oil on the floor again.", kind: "problem", raisedByUserId: null, routeHint: null, externalId: null, ...over,
});
async function fails(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  const body = ApiV1Error.parse(await res.json());
  expect(body.error.code).toBe(code);
}
const count = () => db.caseEvent.count({ where: { companyId, type: "case.raised" } });

beforeAll(async () => {
  await db.company.deleteMany({});
  companyId = (await db.company.create({ data: { slug, name: slug, seedJson: toSeedJson(EMPTY_SEED) as object } })).id;
  let i = 0;
  await replaceKnowledge(companyId, rowsFromSeed(LOCAL_SEED, LOCAL_SEED.goals, () => "kr" + ++i));
  const route = (await seedFor(slug)).routes.find((r) => r.ownerSeatId);
  if (!route) throw new Error("the fixture needs a route with an owner seat");
  routeKey = route.id;
  seatRole = route.ownerRoleId ?? null;
  userId = (await db.user.create({ data: { companyId, name: "Ann", email: "ann@example.test", role: "member" } })).id;
  gone = (await db.user.create({ data: { companyId, name: "Bob", email: "bob@example.test", role: "member", active: false } })).id;
  writer = await createToken(companyId, "w", ["cases:write", "cases:read"]);
  reader = await createToken(companyId, "r", ["cases:read"]);
});
afterAll(async () => {
  await db.company.deleteMany({});
  await db.$disconnect();
});

describe("API v1 case creation", () => {
  it("creates a case by system:api, routed like an app raise, and answers 201", async () => {
    const res = await post(valid({ routeHint: routeKey, raisedByUserId: userId }), writer);
    expect(res.status).toBe(201);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    const { data } = ApiV1CaseCreated.parse(await res.json());
    expect(data.companyId).toBe(companyId);
    expect(data.routeKey).toBe(routeKey);
    expect(data.ownerRoleId).toBe(seatRole);
    expect(data.state).toBe("open");
    const row = await db.caseEvent.findFirstOrThrow({ where: { companyId, targetId: data.id } });
    expect(row.actor).toBe("system:api");
    expect(row.source).toBe("api");
    expect(row.actorUserId).toBe(userId);
    const payload = row.payload as { visibility?: string; proposal?: unknown; assigneeRoleHolderId?: string | null };
    expect(payload.visibility).toBe("everyone");
    expect(payload.proposal).toBeTruthy();
    expect(payload.assigneeRoleHolderId).toBeTruthy();
  });

  it("falls back to the proposal when the routeHint names no route, and mints random ids without externalId", async () => {
    const a = ApiV1CaseCreated.parse(await (await post(valid({ routeHint: "no-such-route" }), writer)).json());
    const b = ApiV1CaseCreated.parse(await (await post(valid(), writer)).json());
    expect(a.data.id).not.toBe(b.data.id);
    expect(a.data.routeKey).not.toBe("no-such-route");
  });

  it("answers the same externalId again with 200 and the first case, and writes nothing", async () => {
    const first = await post(valid({ externalId: "ticket-42" }), writer);
    expect(first.status).toBe(201);
    const one = ApiV1CaseCreated.parse(await first.json());
    const before = await count();
    const again = await post(valid({ externalId: "ticket-42", title: "Changed title" }), writer);
    expect(again.status).toBe(200);
    const two = ApiV1CaseCreated.parse(await again.json());
    expect(two.data).toEqual(one.data);
    expect(await count()).toBe(before);
    expect(one.data.id).toMatch(/^c_api_[0-9a-f]{24}$/);
  });

  it("answers 400 for an unknown or inactive raisedByUserId and for an invalid body", async () => {
    const before = await count();
    await fails(await post(valid({ raisedByUserId: "nobody" }), writer), 400, "bad_request");
    await fails(await post(valid({ raisedByUserId: gone }), writer), 400, "bad_request");
    await fails(await post(valid({ title: "" }), writer), 400, "bad_request");
    await fails(await post(valid({ kind: "question" }), writer), 400, "bad_request");
    await fails(await post("not json", writer, true), 400, "bad_request");
    expect(await count()).toBe(before);
  });

  it("answers 403 for a token without cases:write and 401 without a token", async () => {
    const before = await count();
    await fails(await post(valid(), reader), 403, "forbidden");
    await fails(await post(valid(), null), 401, "unauthorized");
    expect(await count()).toBe(before);
  });
});
