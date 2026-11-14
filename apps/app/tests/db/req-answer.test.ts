// REQ-C1 (plan REQ, D3), against Postgres: a shared form is read and answered by any signed-in person of the same company, who sees only the
// form, whom it asks and their own requests; never another company's, an unshared one, a stopped project's or a company with the flag off. Every
// call is made as that user's session: the mock below is the only place a user or a company comes from.
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { Viewer } from "@/features/auth/session";
import type { FormField } from "@/features/projects/types";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { getDb } from "@/lib/db/client";
import { appendEventRow } from "@/lib/db/events";

let viewer: Viewer | null = null;
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/features/auth/session", () => ({
  getViewer: vi.fn(async () => viewer),
  getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)),
}));

const { appendEventAction } = await import("@/server/actions/events");
const { answerFormAction } = await import("@/app/[company]/(app)/forms/[formId]/actions");
const { formForAnswer, myRequests } = await import("@/server/forms");

const db = getDb();
const A = "req-a", B = "req-b", OFF = "req-off";
const co: Record<string, string> = {};
const users: Record<string, string> = {};
const as = (key: string, slug: string): Viewer => ({ userId: users[key], companyId: co[slug], companySlug: slug, name: key, handle: null, role: "member", epoch: 0, issuedAt: 0 });
const fields: FormField[] = [
  { id: "q1", kind: "short", label: "What is in the way?", required: true },
  { id: "q2", kind: "choice", label: "How often?", required: false, options: ["daily", "weekly"] },
];
const save = (slug: string, project: string, formId: string, extra: Record<string, unknown> = {}) => appendEventRow(co[slug], {
  id: crypto.randomUUID(), day: 0, type: "project.form.saved", actor: "Lead", targetId: project,
  payload: { formId, title: "Tell the team", intro: "Two questions.", fields, shared: true, ...extra },
});
const answers = { q1: "The spare bench blocks the aisle", q2: "weekly" };
const answer = (formId: string, formRev = 1, given: Record<string, string> = answers) => answerFormAction({ formId, formRev, answers: given });

beforeAll(async () => {
  process.env.AUTH_SECRET ??= "req-answer-test-secret-0123456789abcdef";
  await db.company.deleteMany({ where: { slug: { in: [A, B, OFF] } } });
  const company = async (slug: string, stage: string) => (co[slug] = (await db.company.create({ data: { slug, name: slug, stage, seedJson: toSeedJson(SEED) as object } })).id);
  await company(A, "sandbox"); await company(B, "sandbox"); await company(OFF, "pilot");
  const user = async (key: string, slug: string) => { users[key] = (await db.user.create({ data: { companyId: co[slug], name: key, email: `${key}@req.example`, role: "member" } })).id; };
  await user("ann", A); await user("bob", A); await user("cleo", B); await user("dan", OFF);
  await save(A, "pj2", "f-shared");
  await save(A, "pj2", "f-draft", { shared: false });
  await save(A, "pj3", "f-stopped");
  await appendEventRow(co[A], { id: crypto.randomUUID(), day: 0, type: "project.stopped", actor: "Lead", targetId: "pj3", payload: { why: "Not needed any more" } });
  await save(B, "pj2", "f-other");
  await save(OFF, "pj2", "f-off");
});
beforeEach(() => { viewer = null; });
afterAll(async () => {
  await db.company.deleteMany({ where: { slug: { in: [A, B, OFF] } } });
  await db.$disconnect();
});

it("REQ answer: a member outside the project reads only the title of the project and the form, and can answer it", async () => {
  viewer = as("ann", A);
  expect(await formForAnswer("f-shared")).toEqual({
    projectTitle: "Offline job sheets for field service",
    form: { title: "Tell the team", intro: "Two questions.", fields, rev: 1 },
  });
  expect(await answer("f-shared")).toEqual({ ok: true });
  const stored = await db.caseEvent.findFirstOrThrow({ where: { companyId: co[A], type: "project.form.answered" } });
  expect(stored.actorUserId).toBe(users.ann);
  expect(stored.targetId).toBe("pj2");
});

it("REQ answer: a person sees only their own requests, with their state and the reason of a decline", async () => {
  viewer = as("bob", A);
  expect(await myRequests("f-shared")).toEqual([]);
  expect(await answer("f-shared")).toEqual({ ok: true });
  viewer = as("ann", A);
  const mine = await myRequests("f-shared");
  expect(mine).toHaveLength(1);
  expect(mine[0]).toMatchObject({ state: "new", reason: null });
  await appendEventRow(co[A], { id: crypto.randomUUID(), day: 0, type: "project.request.declined", actor: "Lead", targetId: "pj2", payload: { requestId: mine[0].id, why: "Already planned for May" } });
  expect(await myRequests("f-shared")).toMatchObject([{ id: mine[0].id, state: "declined", reason: "Already planned for May" }]);
  viewer = as("bob", A);
  expect(await myRequests("f-shared")).toMatchObject([{ state: "new", reason: null }]);
});

it("REQ answer: an unshared form, another company's form, a stopped project and a company with the flag off give nothing", async () => {
  viewer = as("ann", A);
  expect(await formForAnswer("f-draft")).toBeNull();
  expect(await formForAnswer("f-stopped")).toBeNull();
  expect(await formForAnswer("f-other")).toBeNull();
  expect(await formForAnswer("f-off")).toBeNull();
  expect(await formForAnswer("nope")).toBeNull();
  for (const id of ["f-draft", "f-stopped", "f-other", "f-off"]) expect(await answer(id)).toMatchObject({ ok: false });
  viewer = as("cleo", B);
  expect(await formForAnswer("f-shared")).toBeNull();
  expect(await myRequests("f-shared")).toEqual([]);
  viewer = as("dan", OFF);
  expect(await formForAnswer("f-off")).toBeNull();
  expect(await myRequests("f-off")).toEqual([]);
  viewer = null;
  expect(await formForAnswer("f-shared")).toBeNull();
});

it("REQ answer: the append action refuses another company's session, a signed-out call and a user who is not the session's", async () => {
  const send = (slug: string, id = crypto.randomUUID()) => appendEventAction({ slug, id, type: "project.form.answered", target: "pj2", payload: { formId: "f-shared", formRev: 1, requestId: "req_direct_" + id.slice(0, 6), answers } });
  viewer = as("cleo", B);
  expect(await send(A)).toMatchObject({ ok: false });
  viewer = null;
  expect(await send(A)).toMatchObject({ ok: false });
  // The person is the session's, whatever the payload says: a made-up actor id in it never becomes the actor.
  viewer = as("bob", A);
  const id = crypto.randomUUID();
  expect(await appendEventAction({ slug: A, id, type: "project.form.answered", target: "pj2", payload: { formId: "f-shared", formRev: 1, requestId: "req_sess_1", answers, actorUserId: users.ann } as never })).toEqual({ ok: true });
  expect((await db.caseEvent.findFirstOrThrow({ where: { id, companyId: co[A] } })).actorUserId).toBe(users.bob);
  // And the read functions take one argument: the form. No user and no company comes from the caller.
  expect(formForAnswer.length).toBe(1);
  expect(myRequests.length).toBe(1);
});

it("REQ answer: a missing required field and an old form revision are refused, and the old revision is answered with the new questions", async () => {
  viewer = as("ann", A);
  expect(await answer("f-shared", 1, { q2: "daily" })).toMatchObject({ ok: false });
  expect(await answer("f-shared", 1, { q1: "   " })).toMatchObject({ ok: false });
  const before = await db.caseEvent.count({ where: { companyId: co[A], type: "project.form.answered" } });
  await save(A, "pj2", "f-shared", { title: "Tell the team (v2)", fields: [fields[0], { id: "q3", kind: "long", label: "Anything else?", required: false }] });
  const refused = await answer("f-shared", 1);
  expect(refused).toMatchObject({ ok: false, changed: { form: { rev: 2, title: "Tell the team (v2)" } } });
  expect(await db.caseEvent.count({ where: { companyId: co[A], type: "project.form.answered" } })).toBe(before);
  expect(await answer("f-shared", 2, { q1: "Still the bench" })).toEqual({ ok: true });
});
