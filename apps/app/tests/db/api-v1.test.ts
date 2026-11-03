// API-Z1: acceptance of the API phase. Every v1 endpoint is called as a route handler with a Request; each body is
// parsed with its contract schema; no body names a person; the OpenAPI document validates; and a subscription made
// on the webhooks page receives the signed case.raised of a v1 POST at a local receiver.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiV1, ApiV1Error, WebhookEnvelope, parseSignatureHeader, signaturePayload } from "@nextup/contracts/public";
import type { Viewer } from "@/features/auth/session";
import { buildOpenApi, validateOpenApi } from "@/features/api/openapi";
import { EMPTY_SEED, LOCAL_SEED } from "@/features/demo";
import { toSeedJson } from "@/features/demo/parse";
import { rowsFromSeed } from "@/features/knowledge";
import { getDb } from "@/lib/db/client";
import { replaceKnowledge } from "@/lib/db/knowledge";
import { signBody } from "@/server/notify/sign";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/i18n/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/i18n/server")>()), getT: async () => (k: string) => k }));

import { createTokenAction } from "@/server/actions/settings/api-tokens";
import { createWebhookAction, setWebhooksSendingAction } from "@/server/actions/settings/webhooks";
import { dispatchOnce } from "@/server/notify/dispatch";
import { deliverOnce } from "@/server/notify/deliver";
import { GET as casesList, POST as casesCreate } from "@/app/api/v1/[company]/cases/route";
import { GET as casesGet } from "@/app/api/v1/[company]/cases/[id]/route";
import { GET as decisionsList } from "@/app/api/v1/[company]/decisions/route";
import { GET as projectsList } from "@/app/api/v1/[company]/projects/route";
import { GET as projectsGet } from "@/app/api/v1/[company]/projects/[id]/route";
import { GET as orgGet } from "@/app/api/v1/[company]/org/route";

const db = getDb();
const slug = "api-z1";
const SCOPES = ["cases:read", "cases:write", "decisions:read", "projects:read", "org:read"];
const PEOPLE = [
  { name: "Zelda Quillfeather", email: "zelda.quillfeather@zeta.example" },
  { name: "Orson Wexcombe", email: "orson.wexcombe@zeta.example" },
];

type Handler = (r: Request, c: { params: Promise<{ company: string; id: string }> }) => Promise<Response>;
const HANDLERS: Record<string, Handler> = {
  "cases.list": casesList as Handler,
  "cases.get": casesGet as Handler,
  "cases.create": casesCreate as Handler,
  "decisions.list": decisionsList as Handler,
  "projects.list": projectsList as Handler,
  "projects.get": projectsGet as Handler,
  "org.get": orgGet as Handler,
};

const memberIds: string[] = [];
let companyId = "", adminId = "", token = "";
let server: http.Server;
let receiverUrl = "";
let received: { signature: string; delivery: string; body: string }[] = [];
const savedKey = process.env.CONNECTOR_VAULT_KEY;

const ids = { case: "k-z1", project: "pj-z1" };
const concrete = (path: string) => path.replace("{id}", path.startsWith("/projects") ? ids.project : ids.case);

function call(id: string, over: { token?: string | null; query?: string; body?: unknown; rawId?: string } = {}) {
  const e = ApiV1.endpoints.find((x) => x.id === id)!;
  const path = over.rawId ? e.path.replace("{id}", over.rawId) : concrete(e.path);
  const t = over.token === undefined ? token : over.token;
  const init: RequestInit = {
    method: e.method,
    headers: { ...(t ? { authorization: `Bearer ${t}` } : {}), ...(e.method === "POST" ? { "content-type": "application/json" } : {}) },
  };
  if (e.method === "POST") init.body = JSON.stringify(over.body);
  return HANDLERS[id](new Request(`http://localhost/api/v1/${slug}${path}${over.query ?? ""}`, init), {
    params: Promise.resolve({ company: slug, id: over.rawId ?? (path.startsWith("/projects") ? ids.project : ids.case) }),
  });
}

const raise = (over: Record<string, unknown> = {}) => ({
  title: "Press 4 leaks oil", body: "Oil on the floor again.", kind: "problem", raisedByUserId: null, routeHint: null, externalId: null, ...over,
});

const event = (id: string, type: string, target: string, payload: object, minute: number) =>
  db.caseEvent.create({ data: { id, companyId, day: 0, type, actor: "x", actorUserId: null, targetId: target, payload, ts: new Date(Date.UTC(2026, 10, 1, 8, minute)) } });

beforeAll(async () => {
  process.env.CONNECTOR_VAULT_KEY = "ab".repeat(32);
  process.env.AUTH_SECRET ||= "test-secret-for-api-z1";
  await db.company.deleteMany({});
  companyId = (await db.company.create({ data: { slug, name: slug, mark: "Z", stage: "pilot", seedJson: toSeedJson(EMPTY_SEED) as object } })).id;
  let i = 0;
  await replaceKnowledge(companyId, rowsFromSeed(LOCAL_SEED, LOCAL_SEED.goals, () => "kr" + ++i));
  adminId = (await db.user.create({ data: { companyId, name: "Adm Inistrator", email: "admin@zeta.example", role: "manager", active: true } })).id;
  for (const p of PEOPLE) memberIds.push((await db.user.create({ data: { companyId, ...p, role: "member", active: true } })).id);
  // A decided case that started a project.
  await event("ez1", "case.raised", ids.case, { title: "Conveyor stops at night" }, 1);
  await event("ez2", "case.decided", ids.case, { answer: "yes", reason: "Go", projectId: ids.project, lead: PEOPLE[0].name }, 2);
  await event("ez3", "project.started", ids.project, { title: "Fix the conveyor", caseId: ids.case, lead: PEOPLE[0].name }, 3);

  viewer = { userId: adminId, companyId, companySlug: slug, name: "Adm Inistrator", handle: null, role: "manager", epoch: 0, issuedAt: 0 };
  const made = await createTokenAction(slug, { name: "acceptance", scopes: SCOPES, expiry: "never" });
  if (!made.ok) throw new Error("token creation failed: " + made.error);
  token = made.token;

  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({ signature: String(req.headers["x-nextup-signature"]), delivery: String(req.headers["x-nextup-delivery"]), body });
      res.statusCode = 200;
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  receiverUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
});

beforeEach(() => {
  received = [];
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await db.company.deleteMany({});
  if (savedKey === undefined) delete process.env.CONNECTOR_VAULT_KEY;
  else process.env.CONNECTOR_VAULT_KEY = savedKey;
  await db.$disconnect();
});

describe("API acceptance", () => {
  it("API acceptance: contract tests pass and a signed webhook arrives", async () => {
    const bodies: string[] = [];

    // 2. Every endpoint: a valid request parses with its response schema, a bad token and a bad query or body parse as ApiV1Error.
    for (const e of ApiV1.endpoints) {
      const valid = await call(e.id, { body: e.request ? raise({ externalId: "z1-first" }) : undefined });
      expect([200, 201], `${e.id} valid`).toContain(valid.status);
      expect(valid.headers.get("x-request-id")).toBeTruthy();
      const text = await valid.text();
      bodies.push(text);
      e.response.parse(JSON.parse(text));

      const unauth = await call(e.id, { token: "nxt_not-a-token", body: e.request ? raise() : undefined });
      expect(unauth.status, `${e.id} bad token`).toBe(401);
      const unauthText = await unauth.text();
      bodies.push(unauthText);
      expect(ApiV1Error.parse(JSON.parse(unauthText)).error.code).toBe("unauthorized");

      if (e.query || e.request) {
        const bad = await call(e.id, e.query ? { query: "?limit=0" } : { body: raise({ title: "" }) });
        expect(bad.status, `${e.id} bad request`).toBe(400);
        const badText = await bad.text();
        bodies.push(badText);
        expect(ApiV1Error.parse(JSON.parse(badText)).error.code).toBe("bad_request");
      }
    }

    // 3. No body names either member, by name or email.
    for (const text of bodies) {
      for (const p of PEOPLE) {
        expect(text).not.toContain(p.name);
        expect(text).not.toContain(p.email);
        expect(text).not.toContain(p.name.split(" ")[0]);
      }
    }

    // 4. The OpenAPI document validates and lists exactly the endpoints.
    const doc = buildOpenApi();
    expect(validateOpenApi(doc)).toEqual([]);
    const operationIds = Object.values((doc as { paths: Record<string, Record<string, { operationId: string }>> }).paths)
      .flatMap((p) => Object.values(p).map((op) => op.operationId))
      .sort();
    expect(operationIds).toEqual(ApiV1.endpoints.map((e) => e.id).sort());

    // 5. Sending on, a subscription from the webhooks page, a v1 POST, one signed delivery.
    expect((await setWebhooksSendingAction(slug, true)).ok).toBe(true);
    const created = await createWebhookAction(slug, { url: "https://hooks.example.com/in", events: ["case.raised"], on: true });
    if (!created.ok || !created.id || !created.secret) throw new Error("webhook creation failed");
    // The page only takes https; the receiver is local http, so point the stored subscription at it.
    await db.webhookSubscription.update({ where: { id: created.id }, data: { url: receiverUrl } });

    await dispatchOnce(); // starts the company's cursor at its newest event: history sends nothing
    const posted = await casesCreate(
      new Request(`http://localhost/api/v1/${slug}/cases`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(raise({ title: "Hook me up", externalId: "z1-hook" })),
      }),
      { params: Promise.resolve({ company: slug }) },
    );
    expect(posted.status).toBe(201);
    const caseId = ((await posted.json()) as { data: { id: string } }).data.id;

    await dispatchOnce();
    await deliverOnce();

    expect(received).toHaveLength(1);
    const got = received[0];
    const parsed = parseSignatureHeader(got.signature);
    if (!parsed) throw new Error("the signature header does not parse");
    expect(parsed.v1).toContain(signBody(created.secret, parsed.timestamp, got.body));
    expect(signaturePayload(parsed.timestamp, got.body)).toBe(`${parsed.timestamp}.${got.body}`);
    const envelope = WebhookEnvelope.parse(JSON.parse(got.body));
    expect(envelope.event.type).toBe("case.raised");
    expect(envelope.event.subject).toEqual({ kind: "case", id: caseId });
    expect(envelope.deliveryId).toBe(got.delivery);
    for (const p of PEOPLE) expect(got.body).not.toContain(p.name);
  });
});
