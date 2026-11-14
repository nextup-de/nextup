// REQ-Z1 (plan REQ, D4), against Postgres through the real append action: a request made a step twice gives one step, a reopen removes an untouched
// step and is refused for a moved one, an answer on an old revision is refused while an old answer still reads with its own questions, and the
// largest form and answer that fit the event budget save while one character more is refused.
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { reduce } from "@/features/cases/reducer";
import type { Viewer } from "@/features/auth/session";
import { toSeedJson } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { EVENT_BUDGET } from "@/features/projects/pages";
import { fieldsOf, type FormField } from "@/features/projects/types";
import { getDb } from "@/lib/db/client";
import { loadLog } from "@/lib/db/events";

let viewer: Viewer | null = null;
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/features/auth/session", () => ({
  getViewer: vi.fn(async () => viewer),
  getViewerFor: vi.fn(async (slug: string) => (viewer && viewer.companySlug === slug ? viewer : null)),
}));

const { appendEventAction } = await import("@/server/actions/events");
const { seedFor } = await import("@/features/demo");

const db = getDb();
const SLUG = "reqz-a";
const PROJECT = "pj2";
const co = { id: "" };
const users: Record<string, string> = {};
const as = (key: "lead" | "ann", role: Viewer["role"]): Viewer => ({ userId: users[key], companyId: co.id, companySlug: SLUG, name: key, handle: null, role, epoch: 0, issuedAt: 0 });
const lead = () => as("lead", "manager");
const ann = () => as("ann", "member");
const send = (who: Viewer, type: string, payload: Record<string, unknown>, target: string | null = PROJECT) => {
  viewer = who;
  return appendEventAction({ slug: SLUG, id: crypto.randomUUID(), type: type as "project.form.saved", target, payload });
};
const ok = { ok: true };
const project = async () => reduce(await seedFor(SLUG), await loadLog(co.id)).projects.find((p) => p.id === PROJECT)!;
const base: FormField[] = [{ id: "q1", kind: "short", label: "What is in the way?", required: true }];
const saveForm = (formId: string, fields: FormField[], extra: Record<string, unknown> = {}) =>
  send(lead(), "project.form.saved", { formId, title: "Tell the team", intro: "", fields, shared: true, ...extra });
let n = 0;
const answerForm = (formId: string, formRev: number, answers: Record<string, string>, requestId = `req_t${++n}`) =>
  send(ann(), "project.form.answered", { formId, formRev, requestId, answers });
const step = (stepId: string) => ({ stepId, text: "Move the spare bench", column: "todo" });

beforeAll(async () => {
  process.env.AUTH_SECRET ??= "req-requests-test-secret-0123456789abcdef";
  await db.company.deleteMany({ where: { slug: SLUG } });
  co.id = (await db.company.create({ data: { slug: SLUG, name: SLUG, stage: "sandbox", seedJson: toSeedJson(SEED) as object } })).id;
  for (const [key, role] of [["lead", "manager"], ["ann", "member"]] as const) {
    users[key] = (await db.user.create({ data: { companyId: co.id, name: key, email: `${key}@reqz.example`, role } })).id;
  }
  expect(await saveForm("f-main", base)).toEqual(ok);
});
beforeEach(() => { viewer = null; });
afterAll(async () => {
  await db.company.deleteMany({ where: { slug: SLUG } });
  await db.$disconnect();
});

it("REQ requests on the server: a request made a step twice gives one step", async () => {
  expect(await answerForm("f-main", 1, { q1: "The bench blocks the aisle" }, "req_twice")).toEqual(ok);
  expect(await send(lead(), "project.request.stepped", { requestId: "req_twice", step: step("s_from_req") })).toEqual(ok);
  const again = await send(lead(), "project.request.stepped", { requestId: "req_twice", step: step("s_from_req_2") });
  expect(again).toMatchObject({ ok: false });
  const p = await project();
  expect(p.steps.filter((s) => s.id.startsWith("s_from_req"))).toHaveLength(1);
  expect(p.requests.find((r) => r.id === "req_twice")).toMatchObject({ state: "stepped", stepId: "s_from_req" });
});

it("REQ requests on the server: a reopen of an untouched step removes it and of a moved one is refused", async () => {
  expect(await answerForm("f-main", 1, { q1: "One" }, "req_untouched")).toEqual(ok);
  expect(await send(lead(), "project.request.stepped", { requestId: "req_untouched", step: step("s_untouched") })).toEqual(ok);
  expect(await send(lead(), "project.request.reopened", { requestId: "req_untouched" })).toEqual(ok);
  let p = await project();
  expect(p.steps.some((s) => s.id === "s_untouched")).toBe(false);
  expect(p.requests.find((r) => r.id === "req_untouched")?.state).toBe("new");

  expect(await answerForm("f-main", 1, { q1: "Two" }, "req_moved")).toEqual(ok);
  expect(await send(lead(), "project.request.stepped", { requestId: "req_moved", step: step("s_moved") })).toEqual(ok);
  expect(await send(lead(), "project.step.moved", { stepId: "s_moved", to: "doing" })).toEqual(ok);
  expect(await send(lead(), "project.request.reopened", { requestId: "req_moved" })).toMatchObject({ ok: false });
  p = await project();
  expect(p.steps.some((s) => s.id === "s_moved")).toBe(true);
  expect(p.requests.find((r) => r.id === "req_moved")?.state).toBe("stepped");
});

it("REQ requests on the server: an answer on an old revision is refused and an old answer reads with its own questions", async () => {
  expect(await saveForm("f-rev", [{ id: "a", kind: "short", label: "Old question", required: true }])).toEqual(ok);
  expect(await answerForm("f-rev", 1, { a: "Old answer" }, "req_old")).toEqual(ok);
  expect(await saveForm("f-rev", [{ id: "a", kind: "short", label: "Reworded question", required: true }, { id: "b", kind: "short", label: "New", required: false }])).toEqual(ok);
  expect(await answerForm("f-rev", 1, { a: "Late" }, "req_late")).toMatchObject({ ok: false });
  expect(await answerForm("f-rev", 2, { a: "Fresh" }, "req_fresh")).toEqual(ok);
  const p = await project();
  const form = p.forms.find((f) => f.id === "f-rev")!;
  expect(form.rev).toBe(2);
  expect(p.requests.some((r) => r.id === "req_late")).toBe(false);
  expect(fieldsOf(form, p.requests.find((r) => r.id === "req_old")!.formRev).map((f) => f.label)).toEqual(["Old question"]);
  expect(fieldsOf(form, 2).map((f) => f.label)).toEqual(["Reworded question", "New"]);
});

/** A form payload whose JSON is exactly `size` characters: choice questions with full options, then padding in the intro and the labels. */
function formOfSize(formId: string, size: number): { fields: FormField[]; intro: string } {
  const choice = (i: number): FormField => ({ id: `c${i}`, kind: "choice", label: "c", required: false, options: Array.from({ length: 12 }, (_, o) => String(o).padStart(2, "0") + "x".repeat(78)) });
  const short = (i: number): FormField => ({ id: `s${i}`, kind: "short", label: "y".repeat(100), required: false });
  const len = (fields: FormField[], intro: string) => JSON.stringify({ formId, title: "Tell the team", intro, fields, shared: true }).length;
  let choices = 0;
  const make = (k: number) => [...Array.from({ length: k }, (_, i) => choice(i)), ...Array.from({ length: 20 - k }, (_, i) => short(i))];
  while (choices < 20 && len(make(choices + 1), "") <= size) choices++;
  const fields = make(choices);
  let intro = "";
  let missing = size - len(fields, intro);
  const grow = Math.min(missing, 1000);
  intro = "i".repeat(grow);
  missing -= grow;
  for (const f of fields) {
    if (missing === 0) break;
    if (f.kind !== "short") continue;
    const add = Math.min(missing, 100);
    f.label += "y".repeat(add);
    missing -= add;
  }
  expect(missing).toBe(0);
  expect(len(fields, intro)).toBe(size);
  return { fields, intro };
}

it("REQ requests on the server: the largest form that fits saves and one character more is refused", async () => {
  const fits = formOfSize("f-big", EVENT_BUDGET);
  expect(await saveForm("f-big", fits.fields, { intro: fits.intro })).toEqual(ok);
  const over = formOfSize("f-over", EVENT_BUDGET);
  const longer = over.fields.find((f) => f.kind === "short" && f.label.length < 200) as FormField;
  longer.label += "z";
  expect(JSON.stringify({ formId: "f-over", title: "Tell the team", intro: over.intro, fields: over.fields, shared: true }).length).toBe(EVENT_BUDGET + 1);
  expect(await saveForm("f-over", over.fields, { intro: over.intro })).toMatchObject({ ok: false });
  expect((await project()).forms.map((f) => f.id)).toContain("f-big");
  expect((await project()).forms.map((f) => f.id)).not.toContain("f-over");
});

it("REQ requests on the server: the largest answer that fits saves and one character more is refused", async () => {
  const long = (id: string): FormField => ({ id, kind: "long", label: id, required: false });
  expect(await saveForm("f-long", [long("a"), long("b"), long("c")])).toEqual(ok);
  const envelope = (answers: Record<string, string>) => JSON.stringify({ formId: "f-long", formRev: 1, requestId: "req_large_one", answers }).length;
  const answersOf = (third: number) => ({ a: "a".repeat(4000), b: "b".repeat(4000), c: "c".repeat(third) });
  let third = 0;
  while (envelope(answersOf(third + 1)) <= EVENT_BUDGET) third++;
  expect(envelope(answersOf(third))).toBe(EVENT_BUDGET);
  expect(third).toBeLessThanOrEqual(4000);
  expect(await answerForm("f-long", 1, answersOf(third + 1), "req_large_one")).toMatchObject({ ok: false });
  expect(await answerForm("f-long", 1, answersOf(third), "req_large_one")).toEqual(ok);
  expect((await project()).requests.find((r) => r.id === "req_large_one")?.answers.c).toHaveLength(third);
});
