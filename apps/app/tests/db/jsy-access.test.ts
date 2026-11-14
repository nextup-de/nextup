// JSY-C1 (plan JSY D23), against Postgres through the real action: what the Jira attachments of a project may show is decided before any cache
// is asked. Two companies, direct calls of the action as each viewer, and a fake Jira per company.
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import { integrationContext, seal } from "@/features/connectors/vault";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { getDb } from "@/lib/db/client";
import { appendEventRow } from "@/lib/db/events";
import { JIRA, saveIntegration, setIntegrationOn } from "@/lib/db/integrations";
import { startFakeJira, EPIC_TYPE, TASK_TYPE, type FakeJira } from "../fake-jira/fake-jira";

let viewer: Viewer | null = null;
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("@/features/auth/session", () => ({ getViewer: vi.fn(async () => viewer), getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)) }));

const { projectAttachmentsAction } = await import("@/server/actions/project-attachments");
const { clearAttachmentCache } = await import("@/server/jira/attachments");

const db = getDb();
const A = "jsy-a", B = "jsy-b", OFF = "jsy-off";
const PROJECT = "pj4";
const co: Record<string, string> = {};
const users: Record<string, string> = {};
const as = (key: string, slug: string): Viewer => ({ userId: users[key], companyId: co[slug], companySlug: slug, name: key, handle: null, role: "manager", epoch: 0, issuedAt: 0 });
let fakeA: FakeJira, fakeA2: FakeJira, fakeB: FakeJira, fakeOff: FakeJira;
let n = 0;
// An appended event projects the company's cases for who may see which; the test reads the whole log for every member, so the projection goes again.
const emit = async (slug: string, type: string, payload: Record<string, unknown>, target = PROJECT) => {
  const r = await appendEventRow(co[slug], { id: `e_jsy_${++n}_${crypto.randomUUID().slice(0, 6)}`, day: 0, type: type as "project.linked", actor: "Lead", targetId: target, payload });
  await db.caseView.deleteMany({ where: { companyId: co[slug] } });
  return r;
};
const settingsFor = (f: FakeJira) => ({ flavor: "cloud", siteUrl: f.url, email: f.email, projectKey: "JSY", epicTypeId: EPIC_TYPE.id, stepTypeId: TASK_TYPE.id, autoEpic: true, pullNewIssues: true, pullComments: true });
const connect = async (slug: string, f: FakeJira) => {
  await saveIntegration({ companyId: co[slug], system: JIRA, settings: settingsFor(f), secretSealed: seal("t", Buffer.from(process.env.CONNECTOR_VAULT_KEY as string, "hex"), integrationContext(co[slug], JIRA)), updatedBy: "test" });
  await setIntegrationOn(co[slug], JIRA, true, "test");
};
const link = async (slug: string) => {
  await emit(slug, "project.linked", { system: "jira", key: "JSY-1", url: "https://jira.example/browse/JSY-1", stepId: null });
  await emit(slug, "project.step.added", { stepId: "s_jsy_1", text: "Linked step", external: { system: "jira", key: "JSY-2" } });
  await emit(slug, "project.sync", { system: "jira", on: true });
};
const names = (a: Awaited<ReturnType<typeof projectAttachmentsAction>>) => (a.state === "ok" ? a.rows.map((r) => r.filename).sort() : a.state);

beforeAll(async () => {
  process.env.AUTH_SECRET ??= "jsy-access-secret-0123456789abcdef0123456789";
  process.env.CONNECTOR_VAULT_KEY ??= "0".repeat(63) + "1";
  await db.company.deleteMany({ where: { slug: { in: [A, B, OFF] } } });
  const company = async (slug: string, stage: string) => (co[slug] = (await db.company.create({ data: { slug, name: slug, stage, seedJson: toSeedJson(SEED) as object } })).id);
  await company(A, "sandbox"); await company(B, "sandbox"); await company(OFF, "pilot");
  for (const [key, slug] of [["ann", A], ["bea", B], ["oli", OFF]] as const) users[key] = (await db.user.create({ data: { companyId: co[slug], name: key, email: `${key}@jsy.example`, role: "manager" } })).id;
  fakeA = await startFakeJira({ token: "t", projectKey: "JSY" });
  fakeA2 = await startFakeJira({ token: "t", projectKey: "JSY" });
  fakeB = await startFakeJira({ token: "t", projectKey: "JSY" });
  fakeOff = await startFakeJira({ token: "t", projectKey: "JSY" });
  for (const f of [fakeA, fakeA2, fakeB, fakeOff]) { f.human.createChild("JSY-1", "epic"); f.human.createChild("JSY-1", "step"); }
  fakeA.human.attach("JSY-1", { filename: "a-epic.pdf", size: 1 }); fakeA.human.attach("JSY-2", { filename: "a-step.pdf", size: 2 });
  fakeA2.human.attach("JSY-1", { filename: "moved-epic.pdf", size: 3 });
  fakeB.human.attach("JSY-1", { filename: "b-secret.pdf", size: 4 });
  fakeOff.human.attach("JSY-1", { filename: "off.pdf", size: 5 });
  await connect(A, fakeA); await connect(B, fakeB); await connect(OFF, fakeOff);
  await link(A); await link(OFF);
});
beforeEach(() => { viewer = null; clearAttachmentCache(); });
afterAll(async () => {
  await Promise.all([fakeA, fakeA2, fakeB, fakeOff].map((f) => f.close()));
  await db.company.deleteMany({ where: { slug: { in: [A, B, OFF] } } });
  await db.$disconnect();
});

it("JSY access: the viewer of the company reads the attachments of the project's linked issues, and a second read is the cached one", async () => {
  viewer = as("ann", A);
  expect(names(await projectAttachmentsAction(PROJECT))).toEqual(["a-epic.pdf", "a-step.pdf"]);
  const reads = fakeA.requests.length;
  expect(names(await projectAttachmentsAction(PROJECT))).toEqual(["a-epic.pdf", "a-step.pdf"]);
  expect(fakeA.requests.length).toBe(reads);
});

it("JSY access: after the cache is warm a signed-out caller, an unknown project and another company's viewer get nothing of company A's rows", async () => {
  viewer = as("ann", A);
  await projectAttachmentsAction(PROJECT);
  const reads = fakeA.requests.length;
  viewer = null;
  expect(await projectAttachmentsAction(PROJECT)).toEqual({ state: "no-access" });
  viewer = as("ann", A);
  expect(await projectAttachmentsAction("pj-nope")).toEqual({ state: "no-access" });
  expect(await projectAttachmentsAction("x".repeat(65))).toEqual({ state: "no-access" });
  // company B has a project with the same id and its own Jira: it reads its own site, never company A's cached answer
  viewer = as("bea", B);
  const theirs = JSON.stringify(await projectAttachmentsAction(PROJECT));
  expect(theirs).not.toMatch(/a-epic|a-step/);
  expect(fakeA.requests.length).toBe(reads);
});

it("JSY access: with the flag projectPages off the connector and the links do not matter", async () => {
  viewer = as("oli", OFF);
  expect(await projectAttachmentsAction(PROJECT)).toEqual({ state: "not-connected" });
});

it("JSY access: a project whose sync is stopped, a removed issue link, a disconnect and a changed connector are felt inside the minute", async () => {
  viewer = as("ann", A);
  expect(names(await projectAttachmentsAction(PROJECT))).toEqual(["a-epic.pdf", "a-step.pdf"]);
  // the step's issue is no longer linked (the step is removed): its files are gone at once, from a read the cache could not have served
  await emit(A, "project.step.edited", { stepId: "s_jsy_1", removed: true });
  expect(names(await projectAttachmentsAction(PROJECT))).toEqual(["a-epic.pdf"]);
  // the connector now points at another Jira: the new site answers, the old one is not asked again
  const before = fakeA.requests.length;
  await saveIntegration({ companyId: co[A], system: JIRA, settings: settingsFor(fakeA2), updatedBy: "test" });
  expect(names(await projectAttachmentsAction(PROJECT))).toEqual(["moved-epic.pdf"]);
  expect(fakeA.requests.length).toBe(before);
  // the project's sync is stopped
  await emit(A, "project.sync", { system: "jira", on: false });
  expect(await projectAttachmentsAction(PROJECT)).toEqual({ state: "not-connected" });
  await emit(A, "project.sync", { system: "jira", on: true });
  expect(names(await projectAttachmentsAction(PROJECT))).toEqual(["moved-epic.pdf"]);
  // the company disconnects Jira
  await setIntegrationOn(co[A], JIRA, false, "test");
  expect(await projectAttachmentsAction(PROJECT)).toEqual({ state: "not-connected" });
});
