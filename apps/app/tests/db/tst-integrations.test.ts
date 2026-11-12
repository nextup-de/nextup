// TST-I1: the integrations on a small Musterwerk (D6) against a real Postgres, each one switched on alone (D3):
// Jira (fake), Microsoft 365 search (the 21 recorded questions), API v1 (token, read, idempotent create), a signed
// webhook, SCIM with OIDC and SAML sign-in, and SuccessFactors (recorded pages). Then every integration is off and the
// core loop (raise, route, answer, decide) still passes. Nothing leaves the machine: Microsoft and SAP are stubbed
// fetches, Jira, the OIDC issuer, the SAML IdP and the webhook receiver are local.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// A cookie jar the test can read back; next/headers has no request here.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string, o?: { maxAge?: number }) => void (o?.maxAge === 0 || value === "" ? jar.delete(name) : jar.set(name, value)),
    delete: (arg: string | { name: string }) => void jar.delete(typeof arg === "string" ? arg : arg.name),
  }),
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.77" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); },
}));
vi.mock("@/i18n/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/i18n/server")>()),
  getT: async () => (k: string) => k,
  getLocale: vi.fn(async () => "en"),
}));
// The real sync runs (syncCompany); only the early-start kick is replaced.
vi.mock("@/server/jira-sync", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/server/jira-sync")>()), kickJira: vi.fn() }));

import { ApiV1Case, ApiV1CaseCreated, ApiV1CaseList, WebhookEnvelope, parseSignatureHeader, PUBLIC_CONTRACT_VERSION, type NotifyChannel } from "@nextup/contracts/public";
import type { Viewer } from "@/features/auth/session";
import { SESSION_COOKIE, verifySession } from "@/features/auth/cookie";
import type { Role } from "@/config/roles";
import type { EventPayload } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { integrationContext, seal, vaultContext } from "@/features/connectors/vault";
import { SF_SELECT } from "@/features/directory/successfactors";
import { SCIM_ENTERPRISE } from "@/features/scim";
import { companyOrigin } from "@/features/tenant/urls";
import { JIRA_ACTOR } from "@/features/integrations";
import { getDb } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { m365SearchOn, saveConnection, setM365Search } from "@/lib/db/connections";
import { loadDirectoryStatus, setDirectoryOn } from "@/lib/db/directory-run";
import { loadLog } from "@/lib/db/events";
import { getIntegration, JIRA, saveIntegration, setIntegrationOn } from "@/lib/db/integrations";
import { jiraHeadline } from "@/features/admin/jira-admin";
import { jiraStatusView } from "@/features/integrations/jira/view";
import { loadKnowledge } from "@/lib/db/knowledge";
import { createToken } from "@/lib/db/tokens";
import { samlAcsUrl, samlEntityId } from "@/server/identity/saml";
import { knowledgeSourcesFor } from "@/server/connectors/knowledge";
import { workTrackerFor } from "@/server/connectors/work";
import { runDirectoryOnce } from "@/server/directory/sync";
import { signBody } from "@/server/notify/sign";
import { deliverOnce } from "@/server/notify/deliver";
import { dispatchOnce } from "@/server/notify/dispatch";
import { registerChannel } from "@/server/notify/registry";
import { syncCompany } from "@/server/jira-sync";
import { GET as casesList, POST as casesCreate } from "@/app/api/v1/[company]/cases/route";
import { GET as casesGet } from "@/app/api/v1/[company]/cases/[id]/route";
import { GET as oidcStart } from "@/app/[company]/login/oidc/route";
import { GET as oidcCallback } from "@/app/[company]/login/oidc/callback/route";
import { GET as samlStart } from "@/app/[company]/login/saml/route";
import { POST as samlAcs } from "@/app/[company]/login/saml/acs/route";
import { POST as scimPost, GET as scimList } from "@/app/api/scim/[company]/v2/Users/route";
import { PATCH as scimPatch } from "@/app/api/scim/[company]/v2/Users/[id]/route";
import { generateMusterwerk } from "../../prisma/generators/musterwerk";
import { startFakeJira, EPIC_TYPE, TASK_TYPE } from "../fake-jira/fake-jira";
import { startFakeIssuer, type FakeIssuer } from "../fixtures/oidc/fake-issuer";
import { makeTestIdp, readAuthnRequest, type TestIdp } from "../fixtures/saml/idp";
import { canRead, ceilingFor, checkGroundTruth, loadFiles, loadQuestions, loadResponse } from "../fixtures/graph/fixtures";
import { fakeSuccessFactors } from "../fixtures/successfactors/fake-fetch";
import { makeTestKeys } from "../fixtures/successfactors/keys";

let viewer: Viewer | null = null;
vi.mock("@/features/auth/session", () => ({ getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));

const { appendEventAction } = await import("@/server/actions/events");
const { createWebhookAction, setWebhooksSendingAction } = await import("@/server/actions/settings/webhooks");
const {
  replaceScimTokenAction, saveOidcAction, saveSamlAction, setOidcOnAction, setSamlOnAction, setScimOnAction,
} = await import("@/server/actions/settings/sign-in");

const db = getDb();
const SLUG = "tst-integrations";
const TENANT = "11111111-2222-3333-4444-5555555555ee";
const VAULT_KEY = "ab".repeat(32);
const GENERATED = new Date("2026-11-03T09:00:00+01:00");
const ENV = { CONNECTOR_VAULT_KEY: VAULT_KEY, ENTRA_CLIENT_ID: "tst-client", ENTRA_CLIENT_SECRET: "tst-secret", AUTH_SECRET: "tst-integrations-secret-".repeat(3) } as const;
const savedEnv: Record<string, string | undefined> = {};
const PIA = "pia@tst-integrations.example";

type Person = { id: string; name: string; role: Role };
type J = Record<string, unknown>;
let companyId = "";
let route = { key: "", ownerSeatId: "" };
let people: { raiser: Person; owner: Person; manager: Person };
let n = 0;

const asViewer = (p: Person): Viewer => ({ userId: p.id, companyId, companySlug: SLUG, name: p.name, handle: p.role === "member" ? `Anonymous #${p.id.slice(-4)}` : null, role: p.role, epoch: 0, issuedAt: 0 });
async function send(as: Person, type: string, target: string, payload: EventPayload = {}) {
  viewer = asViewer(as);
  return appendEventAction({ slug: SLUG, id: crypto.randomUUID(), type: type as never, target, payload });
}
async function raise(id: string) {
  const r = await send(people.raiser, "case.raised", id, { title: `Integration ${id}`, body: "Line B stops twice a shift.", routeId: route.key, assignee: "Desk", fromDept: "Werk Nord", kind: "problem" });
  expect(r).toEqual({ ok: true });
}
const reduced = async () => {
  const row = await db.company.findUniqueOrThrow({ where: { id: companyId } });
  return reduce(await companySeed({ id: companyId, seedJson: row.seedJson, stage: row.stage }), await loadLog(companyId, new Date()));
};

const mailOut: unknown[] = [];
const capturedMail: NotifyChannel = {
  info: { kind: "NotifyChannel", id: "mail", contractVersion: PUBLIC_CONTRACT_VERSION },
  async send(m) {
    mailOut.push(m);
    return { ok: true, providerMessageId: null };
  },
};

beforeAll(async () => {
  for (const k of Object.keys(ENV)) savedEnv[k] = process.env[k];
  Object.assign(process.env, ENV);
  registerChannel("mail", capturedMail);
  await db.company.deleteMany({ where: { slug: SLUG } });
  companyId = (await generateMusterwerk(db, { slug: SLUG, people: 150, weeks: 2, seed: 11, now: GENERATED })).companyId;
  // The generator makes a sandbox company, where nothing is sent; webhooks and Microsoft calls need a pilot one.
  await db.company.update({ where: { id: companyId }, data: { stage: "pilot", entraTenantId: TENANT } });

  const k = await loadKnowledge(companyId);
  const users = await db.user.findMany({ where: { companyId, active: true }, orderBy: { id: "asc" }, select: { id: true, name: true, role: true } });
  const person = (id: string): Person => {
    const u = users.find((x) => x.id === id)!;
    return { id: u.id, name: u.name, role: u.role as Role };
  };
  const seated = new Set(k.holders.map((h) => h.userId));
  const rule = k.rules.find((r) => {
    const o = k.holders.find((h) => h.roleId === r.ownerRoleId);
    return o?.userId && r.deputyRoleId;
  })!;
  const ownerSeat = k.holders.find((h) => h.roleId === rule.ownerRoleId)!;
  route = { key: rule.key, ownerSeatId: ownerSeat.id };
  people = {
    raiser: person(users.find((u) => u.role === "member" && !seated.has(u.id))!.id),
    owner: person(ownerSeat.userId!),
    manager: person(users.find((u) => u.role === "manager")!.id),
  };
  viewer = asViewer(people.manager);
}, 240_000);

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await db.company.deleteMany({ where: { slug: SLUG } });
  await db.$disconnect();
});

describe("TST integrations", () => {
  it("Jira: a decided case becomes an epic on the fake Jira, and a human's move and comment come back", async () => {
    const token = "tst-jira-token";
    const jira = await startFakeJira({ flavor: "cloud", token });
    try {
      await saveIntegration({
        companyId, system: JIRA,
        settings: { flavor: "cloud", siteUrl: jira.url, email: jira.email, projectKey: jira.projectKey, epicTypeId: EPIC_TYPE.id, stepTypeId: TASK_TYPE.id, autoEpic: true, pullNewIssues: true, pullComments: true },
        secretSealed: seal(token, Buffer.from(VAULT_KEY, "hex"), integrationContext(companyId, JIRA)),
        account: null, updatedBy: "tst-i1",
      });
      expect(await setIntegrationOn(companyId, JIRA, true, "tst-i1")).toBe(true);
      await new Promise((r) => setTimeout(r, 25)); // events must come after the switch-on

      const projectId = "pj-tst-i1";
      await raise("int-jira");
      expect(await send(people.owner, "case.decided", "int-jira", { answer: "yes", reason: "Go", projectId, lead: people.owner.name, leadUserId: people.owner.id, title: "Steady line B" })).toEqual({ ok: true });
      expect(await send(people.owner, "project.step.added", projectId, { stepId: "s1", text: "Pre-stage the tools" })).toEqual({ ok: true });

      await syncCompany({ id: companyId, slug: SLUG });
      const epic = [...jira.issues.values()].find((i) => i.labels.includes(`nextup-${projectId}`));
      expect(epic, "the decided case's project is an epic").toBeTruthy();
      expect(epic!.typeId).toBe(EPIC_TYPE.id);
      expect(epic!.summary).toBe("Steady line B");
      expect(await getIntegration(companyId, JIRA)).toMatchObject({ on: true, lastError: null });
      const child = [...jira.issues.values()].find((i) => i.parentKey === epic!.key);
      expect(child, "the step is a child issue").toBeTruthy();

      await new Promise((r) => setTimeout(r, 1100)); // Jira stamps whole milliseconds
      jira.human.move(child!.key, "In Progress");
      jira.human.comment(epic!.key, "Parts arrive Friday.");
      const before = (await loadLog(companyId)).events.length;
      await syncCompany({ id: companyId, slug: SLUG }, new Date());
      const log = await loadLog(companyId);
      const pulled = log.events.slice(before);
      expect(pulled.length).toBeGreaterThan(0);
      expect(pulled.every((e) => e.actor === JIRA_ACTOR)).toBe(true);
      expect(pulled.some((e) => e.type === "project.commented" && String(e.payload.text).includes("Parts arrive Friday."))).toBe(true);
      const project = (await reduced()).projects.find((p) => p.id === projectId);
      expect(project?.steps.find((s) => s.id === "s1")?.column).toBe("doing");
      expect((await workTrackerFor(companyId))?.info.id).toBe("jira-cloud");
    } finally {
      await setIntegrationOn(companyId, JIRA, false, "tst-i1").catch(() => undefined);
      await jira.close();
    }
  });

  it("Jira G8: a revoked token shows the admin 'Token expired' and moves nothing; a new token resumes the sync", async () => {
    // Its own project key and ids: the first Jira test's links and comment keys are still in this company's log.
    const jira = await startFakeJira({ flavor: "cloud", token: "g8-token-1", projectKey: "GEE", idBase: 4000 });
    const sealed = (t: string) => seal(t, Buffer.from(VAULT_KEY, "hex"), integrationContext(companyId, JIRA));
    const settings = { flavor: "cloud", siteUrl: jira.url, email: jira.email, projectKey: jira.projectKey, epicTypeId: EPIC_TYPE.id, stepTypeId: TASK_TYPE.id, autoEpic: true, pullNewIssues: true, pullComments: true };
    const row = async () => (await db.integration.findUniqueOrThrow({ where: { companyId_system: { companyId, system: JIRA } } }));
    const headline = async () => jiraHeadline(jiraStatusView(await getIntegration(companyId, JIRA)), new Date());
    try {
      await saveIntegration({ companyId, system: JIRA, settings, secretSealed: sealed("g8-token-1"), account: null, updatedBy: "tst-g8" });
      expect(await setIntegrationOn(companyId, JIRA, true, "tst-g8")).toBe(true);
      await new Promise((r) => setTimeout(r, 25));
      const projectId = "pj-tst-g8";
      await raise("int-jira-g8");
      expect(await send(people.owner, "case.decided", "int-jira-g8", { answer: "yes", reason: "Go", projectId, lead: people.owner.name, leadUserId: people.owner.id, title: "Token test" })).toEqual({ ok: true });
      expect(await send(people.owner, "project.step.added", projectId, { stepId: "s1", text: "Pre-stage the tools" })).toEqual({ ok: true });
      await syncCompany({ id: companyId, slug: SLUG });
      const epic = [...jira.issues.values()].find((i) => i.labels.includes(`nextup-${projectId}`))!;
      const step = [...jira.issues.values()].find((i) => i.parentKey === epic.key)!;
      expect(step).toBeTruthy();
      const good = await row();
      expect(good.lastError).toBeNull();
      expect((await headline()).tone).toBe("ok");

      // Revoked in Atlassian. Meanwhile a person moves the step in NextUp, and people work in Jira.
      jira.setToken("g8-token-2");
      await new Promise((r) => setTimeout(r, 1100));
      expect(await send(people.owner, "project.step.moved", projectId, { stepId: "s1", to: "doing" })).toEqual({ ok: true });
      jira.human.comment(epic.key, "Parts arrive Friday.");
      const child = jira.human.createChild(epic.key, "Check the torque wrench");
      for (let i = 0; i < 2; i++) await syncCompany({ id: companyId, slug: SLUG }, new Date());

      const bad = await row();
      expect(bad.lastError).toMatch(/^401 /);
      expect(bad).toMatchObject({ on: true, pushedSeq: good.pushedSeq, pulledAt: good.pulledAt, lastOkAt: good.lastOkAt, leaseUntil: null });
      expect(await headline()).toEqual({ tone: "bad", text: "Token expired - Jira refused it. Enter a new API token and save." });
      expect(jira.get(step.key).status.name).toBe("To Do");

      // The admin enters the new token: what saveConsoleJira writes for a typed token (new sealed secret, account
      // forgotten so the next round asks /myself; saving clears lastError).
      await saveIntegration({ companyId, system: JIRA, settings, secretSealed: sealed("g8-token-2"), account: null, updatedBy: "tst-g8" });
      await syncCompany({ id: companyId, slug: SLUG }, new Date());
      const after = await row();
      expect(after.lastError).toBeNull();
      expect(after.lastOkAt!.getTime()).toBeGreaterThan(good.lastOkAt!.getTime());
      expect(after.pushedSeq).toBeGreaterThan(good.pushedSeq);
      expect(after.account).toMatchObject({ id: jira.accountId });
      expect((await headline()).tone).toBe("ok");
      expect(jira.get(step.key).status.name).toBe("In Progress");
      const project = (await reduced()).projects.find((p) => p.id === projectId)!;
      expect(project.steps.find((s) => s.id === "jira-" + child)?.text).toBe("Check the torque wrench");
      expect(project.history.some((e) => e.type === "project.commented" && String(e.payload.text).includes("Parts arrive Friday."))).toBe(true);
    } finally {
      await setIntegrationOn(companyId, JIRA, false, "tst-g8").catch(() => undefined);
      await jira.close();
    }
  });

  it("Microsoft 365: the 21 recorded questions pass as ground truth and no persona is shown a file they may not read", async () => {
    const questions = loadQuestions();
    expect(questions).toHaveLength(21);
    const personas = [...new Set(questions.map((q) => q.asPersona))];
    const members = await db.user.findMany({ where: { companyId, active: true, role: "member" }, orderBy: { id: "asc" }, take: personas.length, select: { id: true } });
    const userIdOf = new Map(personas.map((p, i) => [p, members[i].id]));
    const personaOf = new Map([...userIdOf].map(([p, id]) => [id, p]));
    const vault = Buffer.from(VAULT_KEY, "hex");
    for (const [, userId] of userIdOf) {
      await saveConnection({ companyId, userId, scopes: ["Files.Read.All", "offline_access"], refreshTokenSealed: seal(`rt-${userId}`, vault, vaultContext(companyId, userId)) });
    }
    expect(await m365SearchOn(companyId)).toBe(false);
    expect(await knowledgeSourcesFor(companyId)).toEqual([]);
    await setM365Search(companyId, true);

    let current = "";
    let tokenUsers: string[] = [];
    const real = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`)) {
        const userId = (new URLSearchParams(String(init?.body)).get("refresh_token") ?? "").replace(/^rt-/, "");
        if (!personaOf.has(userId)) return Response.json({ error: "invalid_grant" }, { status: 400 });
        return Response.json({ access_token: `at-${userId}`, expires_in: 3600 });
      }
      if (url === "https://graph.microsoft.com/v1.0/search/query" && init?.method === "POST") {
        tokenUsers.push(personaOf.get((new Headers(init.headers).get("authorization") ?? "").replace(/^Bearer at-/, "")) ?? "unknown");
        const fixture = loadResponse(current);
        return Response.json(fixture.body, { status: fixture.status });
      }
      if (/^https:\/\/(login\.microsoftonline|graph\.microsoft)\.com\//.test(url)) throw new Error(`unexpected Microsoft call: ${url}`);
      return real(input, init);
    });

    try {
      const [source] = await knowledgeSourcesFor(companyId);
      expect(source?.info.id).toBe("m365");
      const files = loadFiles();
      const results = [];
      for (const q of questions) {
        current = q.id;
        tokenUsers = [];
        const hits = await source.search({ companyId, userId: userIdOf.get(q.asPersona)!, text: q.question, ceiling: ceilingFor(q), size: 10 });
        results.push(checkGroundTruth(q, hits, tokenUsers));
        // Independent of the checker: every file shown is one this persona's groups may read.
        for (const h of hits) {
          const url = decodeURIComponent(h.url);
          const file = files.find((f) => url.endsWith(f.path));
          if (file) expect(canRead(q.asPersona, file), `${q.id}: ${file.path} shown to ${q.asPersona}`).toBe(true);
        }
      }
      const failed = results.filter((r) => !r.pass);
      expect(failed.length, failed.map((r) => `${r.id}: missing=${JSON.stringify(r.missing)} leaked=${JSON.stringify(r.leaked)} aboveCeiling=${JSON.stringify(r.aboveCeiling)} foreignToken=${r.foreignToken}`).join("\n")).toBe(0);
      expect(results.filter((r) => r.pass)).toHaveLength(21);
    } finally {
      await setM365Search(companyId, false);
    }
  });

  it("API v1: a token reads the cases and creates one, and the same externalId again changes nothing", async () => {
    const raw = await createToken(companyId, "tst-i1", ["cases:read", "cases:write"]);
    const call = (h: (r: Request, c: never) => Promise<Response>, path: string, init: RequestInit = {}, id = "") =>
      h(new Request(`http://localhost/api/v1/${SLUG}/${path}`, { ...init, headers: { authorization: `Bearer ${raw}`, "content-type": "application/json" } }), { params: Promise.resolve({ company: SLUG, id }) } as never);
    const list = ApiV1CaseList.parse(await (await call(casesList, "cases?limit=5")).json());
    expect(list.data.length).toBeGreaterThan(0);
    expect(list.data.every((c) => c.companyId === companyId)).toBe(true);

    const body = JSON.stringify({ title: "Press 4 leaks oil", body: "Oil on the floor again.", kind: "problem", raisedByUserId: null, routeHint: route.key, externalId: "tst-i1-ticket-1" });
    const first = await call(casesCreate, "cases", { method: "POST", body });
    expect(first.status).toBe(201);
    const one = ApiV1CaseCreated.parse(await first.json());
    expect(one.data.routeKey).toBe(route.key);
    const count = () => db.caseEvent.count({ where: { companyId, type: "case.raised", targetId: one.data.id } });
    expect(await count()).toBe(1);
    const again = await call(casesCreate, "cases", { method: "POST", body: body.replace("Press 4", "Press 5") });
    expect(again.status).toBe(200);
    expect(ApiV1CaseCreated.parse(await again.json()).data).toEqual(one.data);
    expect(await count()).toBe(1);

    const got = ApiV1Case.parse(await (await call(casesGet, `cases/${one.data.id}`, {}, one.data.id)).json());
    expect(got.data.id).toBe(one.data.id);
    expect((await call(casesList, "cases", { headers: {} })).status).toBe(200);
    const anon = await casesList(new Request(`http://localhost/api/v1/${SLUG}/cases`), { params: Promise.resolve({ company: SLUG }) } as never);
    expect(anon.status).toBe(401);
  });

  it("webhook: a subscription gets one signed case.raised for a raise, and it verifies with the secret", async () => {
    const received: { signature: string; delivery: string; body: string }[] = [];
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push({ signature: String(req.headers["x-nextup-signature"]), delivery: String(req.headers["x-nextup-delivery"]), body });
        res.statusCode = 200;
        res.end();
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    try {
      viewer = asViewer(people.manager);
      expect((await setWebhooksSendingAction(SLUG, true)).ok).toBe(true);
      const created = await createWebhookAction(SLUG, { url: "https://hooks.example.com/in", events: ["case.raised"], on: true });
      if (!created.ok || !created.id || !created.secret) throw new Error("webhook creation failed");
      // The page only takes https; the receiver is local http.
      await db.webhookSubscription.update({ where: { id: created.id }, data: { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook` } });
      await dispatchOnce(); // the cursor starts at the newest event: history sends nothing
      await deliverOnce();
      received.length = 0;

      await raise("int-hook");
      await dispatchOnce();
      await deliverOnce();
      const mine = received.filter((r) => (JSON.parse(r.body) as { event: { subject: { id: string } } }).event.subject.id === "int-hook");
      expect(mine).toHaveLength(1);
      const got = mine[0];
      const parsed = parseSignatureHeader(got.signature);
      if (!parsed) throw new Error("the signature header does not parse");
      expect(parsed.v1).toContain(signBody(created.secret, parsed.timestamp, got.body));
      const envelope = WebhookEnvelope.parse(JSON.parse(got.body));
      expect(envelope.event.type).toBe("case.raised");
      expect(envelope.deliveryId).toBe(got.delivery);
      // A second pass sends nothing more for the same event.
      await dispatchOnce();
      await deliverOnce();
      expect(received.filter((r) => r.body.includes("int-hook"))).toHaveLength(1);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  describe("SCIM, OIDC and SAML", () => {
    const ctx = { params: Promise.resolve({ company: SLUG }) };
    let idp: FakeIssuer;
    let saml: TestIdp;
    let scimToken = "";
    let piaId = "";

    const scim = async (fn: (r: Request, c: never) => Promise<Response>, path: string, init: { method?: string; body?: unknown } = {}, id?: string) => {
      const res = await fn(
        new Request(`http://localhost/api/scim/${SLUG}/v2${path}`, {
          method: init.method ?? "GET",
          headers: { authorization: `Bearer ${scimToken}`, "content-type": "application/scim+json" },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
        }),
        { params: Promise.resolve({ company: SLUG, id }) } as never,
      );
      const text = await res.text();
      return { status: res.status, json: (text ? JSON.parse(text) : null) as J | null };
    };
    const sessionUser = () => verifySession(jar.get(SESSION_COOKIE), process.env.AUTH_SECRET ?? "")?.uid;
    async function oidcSignIn(): Promise<string> {
      idp.claims = { sub: "pia-oidc", email: PIA };
      const first = await oidcStart(new NextRequest(`http://localhost:3000/${SLUG}/login/oidc`), ctx);
      const hop = await fetch(first.headers.get("location")!, { redirect: "manual" });
      const back = new URL(hop.headers.get("location")!);
      const done = await oidcCallback(new NextRequest(`http://localhost:3000/${SLUG}/login/oidc/callback${back.search}`), ctx);
      const to = new URL(done.headers.get("location")!);
      return to.pathname + to.search;
    }
    async function samlSignIn(): Promise<string> {
      const origin = companyOrigin(SLUG);
      const sp = { entityId: samlEntityId(origin, SLUG), acsUrl: samlAcsUrl(origin, SLUG) };
      const first = await samlStart(new NextRequest(`http://localhost:3000/${SLUG}/login/saml`), ctx);
      const req = readAuthnRequest(first.headers.get("location")!);
      const body = new URLSearchParams({ SAMLResponse: saml.response({ requestId: req.id, sp, email: PIA }), RelayState: req.relayState });
      const res = await samlAcs(
        new NextRequest(`http://localhost:3000/${SLUG}/login/saml/acs`, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } }),
        ctx,
      );
      const to = new URL(res.headers.get("location")!);
      return to.pathname + to.search;
    }

    beforeAll(async () => {
      idp = await startFakeIssuer();
      saml = await makeTestIdp();
    });
    afterAll(async () => {
      await idp.stop();
      await saml.stop();
    });

    it("provisions a person through SCIM who signs in through OIDC and SAML as one user, then SCIM deactivates them and neither sign-in works", async () => {
      viewer = asViewer(people.manager);
      const unitName = (await db.orgUnit.findFirstOrThrow({ where: { companyId, parentId: { not: null } }, orderBy: { id: "asc" } })).name;
      const made = await replaceScimTokenAction(SLUG);
      if (!made.ok || !made.token) throw new Error("no SCIM token");
      scimToken = made.token;
      expect(await setScimOnAction(SLUG, true)).toEqual({ ok: true });
      expect(await saveOidcAction(SLUG, { buttonText: "OIDC", issuer: idp.issuer, clientId: idp.clientId, clientSecret: idp.clientSecret })).toEqual({ ok: true });
      expect(await setOidcOnAction(SLUG, true)).toEqual({ ok: true });
      expect(await saveSamlAction(SLUG, { buttonText: "SAML", source: "file", metadataXml: saml.metadataXml })).toEqual({ ok: true });
      expect(await setSamlOnAction(SLUG, true)).toEqual({ ok: true });

      const created = await scim(scimPost, "/Users", { method: "POST", body: {
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:User", SCIM_ENTERPRISE], externalId: "ext-pia", userName: PIA,
        displayName: "Pia Integration", active: true, emails: [{ type: "work", value: PIA, primary: true }],
        [SCIM_ENTERPRISE]: { department: unitName },
      } });
      expect(created.status, JSON.stringify(created.json)).toBe(201);
      piaId = created.json!.id as string;
      expect(await db.user.findFirstOrThrow({ where: { id: piaId, companyId } })).toMatchObject({ active: true, email: PIA });

      expect(await oidcSignIn()).not.toContain("sso_error");
      expect(sessionUser()).toBe(piaId);
      jar.clear();
      expect(await samlSignIn()).not.toContain("sso_error");
      expect(sessionUser()).toBe(piaId);

      const off = await scim(scimPatch, `/Users/${piaId}`, { method: "PATCH", body: { schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"], Operations: [{ op: "replace", value: { active: "False" } }] } }, piaId);
      expect(off.status).toBe(200);
      expect(await db.user.findFirstOrThrow({ where: { id: piaId, companyId } })).toMatchObject({ active: false });
      jar.clear();
      expect(await oidcSignIn()).toBe(`/${SLUG}/login?sso_error=inactive`);
      expect(jar.has(SESSION_COOKIE)).toBe(false);
      expect(await samlSignIn()).toContain("sso_error=inactive");
      expect(jar.has(SESSION_COOKIE)).toBe(false);
    });
  });

  it("SuccessFactors: the recorded pages add their people to the company and the cursor is stored", async () => {
    const HOST = "https://api4.example.test";
    const keys = makeTestKeys();
    const page = (name: string): unknown => JSON.parse(readFileSync(join(__dirname, "../fixtures/successfactors/pages", `${name}.json`), "utf8"));
    type Entity = keyof typeof SF_SELECT;
    const url = (e: Entity, asOf?: string): string => `${HOST}/odata/v2/${e}?$select=${SF_SELECT[e].join(",")}&$format=json&$top=500${asOf ? `&asOfDate=${asOf}` : ""}`;
    const AS = "2026-11-03";
    const pages: Record<string, unknown> = {
      [url("User")]: page("full-user-1"),
      [`${HOST}/odata/v2/User?$skiptoken=u3`]: page("full-user-2"),
      [url("EmpEmployment")]: page("full-employment"),
      [url("EmpJob", AS)]: page("full-job-1"),
      [`${HOST}/odata/v2/EmpJob?$skiptoken=u3`]: page("full-job-2"),
      [url("FODepartment", AS)]: page("full-department"),
    };
    for (const name of ["Produktion", "Einkauf", "Altes Lager"]) {
      await db.orgUnit.create({ data: { companyId, key: `sf-${name.toLowerCase().replace(/ /g, "-")}`, name } });
    }
    await saveIntegration({
      companyId, system: "successfactors", settings: { apiHost: HOST, companyId: "Musterwerk", clientId: "client-abc", apiUserId: "NEXTUP_API" },
      secretSealed: seal(keys.privateKeyPem, Buffer.from(VAULT_KEY, "hex"), integrationContext(companyId, "successfactors")), updatedBy: null,
    });
    await setIntegrationOn(companyId, "successfactors", true, null);
    await setDirectoryOn(companyId, true, "successfactors", null);
    const sf = fakeSuccessFactors({ pages, cert: keys.certPem });
    vi.stubGlobal("fetch", sf.fetch);
    const before = await db.user.count({ where: { companyId } });
    const activeBefore = await db.user.count({ where: { companyId, active: true } });
    await runDirectoryOnce(new Date("2026-11-03T12:00:00Z"));
    try {
      const status = await loadDirectoryStatus(companyId);
      expect(status).toMatchObject({ on: true, source: "successfactors", lastError: null });
      expect(status.counts.added).toBe(4);
      expect(await db.user.count({ where: { companyId } })).toBe(before + 4);
      // People the feed does not name stay as they were.
      expect(await db.user.count({ where: { companyId, active: true } })).toBe(activeBefore + 4);
      expect(sf.requests.every((r) => new URL(r.url).origin === HOST)).toBe(true);
    } finally {
      await setDirectoryOn(companyId, false, "successfactors", null);
      await setIntegrationOn(companyId, "successfactors", false, null);
    }
  });

  it("with every integration off, the core loop (raise, route, answer, decide) passes and no integration is called", async () => {
    viewer = asViewer(people.manager);
    // Everything off through the same switches the admin uses.
    expect(await setOidcOnAction(SLUG, false)).toEqual({ ok: true });
    expect(await setSamlOnAction(SLUG, false)).toEqual({ ok: true });
    expect(await setScimOnAction(SLUG, false)).toEqual({ ok: true });
    expect((await setWebhooksSendingAction(SLUG, false)).ok).toBe(true);
    await setM365Search(companyId, false);
    await setIntegrationOn(companyId, JIRA, false, "tst-i1");
    expect((await getIntegration(companyId, JIRA))?.on).toBe(false);
    expect(await knowledgeSourcesFor(companyId)).toEqual([]);
    expect(await workTrackerFor(companyId)).toBeNull();

    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      calls.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      throw new Error("no outside call while every integration is off");
    });
    const outboxBefore = await db.outboxMessage.count({ where: { companyId, channel: "webhook" } });

    const id = `int-off-${++n}`;
    await raise(id);
    expect((await reduced()).cases.find((c) => c.id === id)!.assigneeSeatId).toBe(route.ownerSeatId);
    expect(await send(people.owner, "case.asked", id, { text: "Which line?" })).toEqual({ ok: true });
    expect(await send(people.raiser, "case.answered", id, { text: "Line B." })).toEqual({ ok: true });
    expect(await send(people.owner, "case.decided", id, { answer: "no", category: "no-fit", reason: "Covered by the yard system and the maintenance plan that is already running." })).toEqual({ ok: true });
    expect((await reduced()).cases.find((c) => c.id === id)!.decided).toMatchObject({ answer: "no" });

    // SCIM answers 403, the sign-in buttons are gone, the exporters and dispatcher send nothing.
    const res = await scimList(new Request(`http://localhost/api/scim/${SLUG}/v2/Users`, { headers: { authorization: "Bearer x" } }), { params: Promise.resolve({ company: SLUG }) } as never);
    expect([401, 403]).toContain(res.status);
    await dispatchOnce();
    await deliverOnce();
    expect(calls).toEqual([]);
    // Sending is off: the dispatcher records a webhook row as skipped and nothing leaves.
    const hooks = await db.outboxMessage.findMany({ where: { companyId, channel: "webhook" }, select: { status: true } });
    expect(hooks.filter((h) => h.status === "pending" || h.status === "failed")).toEqual([]);
    expect(hooks.filter((h) => h.status === "sent")).toHaveLength(outboxBefore);
  });
});
