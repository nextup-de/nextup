import { expect, it, vi } from "vitest";
import type { ActDeps } from "@/components/dashboard/demo/act-deps";
import { projectActs } from "@/components/dashboard/demo/project-acts";
import { meFor } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { mayAppend } from "@/features/cases/permissions";
import { reduce } from "@/features/cases/reducer";
import { EVENT_BUDGET } from "@/features/projects/pages";
import { fieldsOf, type FormFieldInput } from "@/features/projects/types";
import { projectRequests } from "@/i18n/messages/projectRequests";
import { ev, logOf, project, SEATS, SEED, startedLog } from "../res/project-fixture";

const FIELDS: FormFieldInput[] = [
  { id: "f_what", kind: "long", label: "What do you need?", required: true },
  { id: "f_size", kind: "choice", label: "How big?", required: false, options: ["Small", "Large"] },
];
const saved = (payload: EventPayload = {}, day = 11): CaseEvent => ev("project.form.saved", "L. Brandt", "p_one", { formId: "fm", title: "Ask us", intro: "Why", fields: FIELDS, shared: true, ...payload }, day);
const answered = (payload: EventPayload = {}, id = "q1"): CaseEvent => ev("project.form.answered", "J. Schmidt", "p_one", { formId: "fm", formRev: 1, requestId: id, answers: { f_what: " A cart " }, ...payload }, 12);
const stepped = (payload: EventPayload = {}): CaseEvent => ev("project.request.stepped", "L. Brandt", "p_one", { requestId: "q1", step: { stepId: "s_r", text: "Build the cart", column: "todo" }, ...payload }, 13);
const log = (...extra: CaseEvent[]) => startedLog().concat(extra);
const stateOf = (events: CaseEvent[]) => reduce(SEED, logOf(events, 20));
const asUser = (userId: string | null, events: CaseEvent[], type: CaseEventType, payload: EventPayload) =>
  mayAppend({ role: "member", userId, me: meFor(userId, SEATS), name: "X", handle: null }, { type, target: "p_one", payload }, stateOf(events));
const team = (events: CaseEvent[], type: CaseEventType, payload: EventPayload) => asUser("u_lb", events, type, payload);

it("REQ scaffold form saves count the revision up and keep every revision's fields", () => {
  const p = project(stateOf(log(saved(), saved({ title: "Ask again", fields: [FIELDS[1]], shared: false }, 14))));
  expect(p.forms).toHaveLength(1);
  expect(p.forms[0]).toMatchObject({ id: "fm", title: "Ask again", rev: 2, shared: false });
  expect(p.forms[0].revisions.map((r) => r.rev)).toEqual([1, 2]);
  expect(fieldsOf(p.forms[0], 1).map((f) => f.id)).toEqual(["f_what", "f_size"]);
  expect(fieldsOf(p.forms[0], 2).map((f) => f.id)).toEqual(["f_size"]);
});

it("REQ scaffold an answer becomes a new request with its own revision and trimmed answers", () => {
  const p = project(stateOf(log(saved(), answered())));
  expect(p.requests).toEqual([{ id: "q1", formId: "fm", formRev: 1, answers: { f_what: "A cart" }, byUserId: "u_js", day: 12, state: "new", stepId: null, why: null }]);
});

it("REQ scaffold request.stepped adds its step and links it, declined and reopened toggle the state", () => {
  const p = project(stateOf(log(saved(), answered(), stepped({ step: { stepId: "s_r", text: "Build the cart", column: "doing", ownerUserId: "u_lb", dueDay: 30, note: "n" } }))));
  expect(p.requests[0]).toMatchObject({ state: "stepped", stepId: "s_r" });
  expect(p.steps.find((s) => s.id === "s_r")).toMatchObject({ text: "Build the cart", column: "doing", ownerUserId: "u_lb", dueDay: 30, note: "n", addedDay: 13 });
  const declined = project(stateOf(log(saved(), answered(), ev("project.request.declined", "L. Brandt", "p_one", { requestId: "q1", why: "Not now" }, 13))));
  expect(declined.requests[0]).toMatchObject({ state: "declined", why: "Not now" });
  const reopened = project(stateOf(log(saved(), answered(), ev("project.request.declined", "L. Brandt", "p_one", { requestId: "q1", why: "Not now" }, 13), ev("project.request.reopened", "L. Brandt", "p_one", { requestId: "q1" }, 14))));
  expect(reopened.requests[0]).toMatchObject({ state: "new", why: null, stepId: null });
});

it("REQ scaffold reopening a stepped request removes an untouched step and keeps a moved one", () => {
  const reopen = ev("project.request.reopened", "L. Brandt", "p_one", { requestId: "q1" }, 15);
  const clean = project(stateOf(log(saved(), answered(), stepped(), reopen)));
  expect(clean.steps.some((s) => s.id === "s_r")).toBe(false);
  expect(clean.requests[0]).toMatchObject({ state: "new", stepId: null });
  const moved = project(stateOf(log(saved(), answered(), stepped(), ev("project.step.moved", "L. Brandt", "p_one", { stepId: "s_r", to: "doing" }, 14), reopen)));
  expect(moved.steps.some((s) => s.id === "s_r")).toBe(true);
  expect(moved.requests[0]).toMatchObject({ state: "stepped", stepId: "s_r" });
});

it("REQ scaffold a company member outside the team may answer a shared form and nothing else", () => {
  const events = log(saved(), answered());
  expect(asUser("u_js", events, "project.form.answered", { formId: "fm", formRev: 1, requestId: "q2", answers: { f_what: "x" } }).ok).toBe(true);
  expect(asUser(null, events, "project.form.answered", { formId: "fm", formRev: 1, requestId: "q2", answers: { f_what: "x" } }).ok).toBe(false);
  for (const [type, payload] of [
    ["project.form.saved", { formId: "fm", title: "T", intro: "", fields: FIELDS, shared: true }],
    ["project.request.declined", { requestId: "q1", why: "no" }],
    ["project.request.stepped", { requestId: "q1", step: { stepId: "s_x", text: "t", column: "todo" } }],
    ["project.request.reopened", { requestId: "q1" }],
    ["project.step.added", { stepId: "s_y", text: "t" }],
  ] as const) expect(asUser("u_js", events, type, payload).ok, type).toBe(false);
  const private_ = log(saved({ shared: false }));
  expect(asUser("u_js", private_, "project.form.answered", { formId: "fm", formRev: 1, requestId: "q2", answers: { f_what: "x" } }).ok).toBe(false);
  const stopped = events.concat(ev("project.stopped", "L. Brandt", "p_one", { why: "enough" }, 18));
  expect(asUser("u_js", stopped, "project.form.answered", { formId: "fm", formRev: 1, requestId: "q2", answers: { f_what: "x" } }).ok).toBe(false);
});

it("REQ scaffold an answer on an old revision is refused with permFormChanged", () => {
  const events = log(saved(), saved({ title: "New" }, 12));
  const verdict = asUser("u_js", events, "project.form.answered", { formId: "fm", formRev: 1, requestId: "q2", answers: { f_what: "x" } });
  expect(verdict).toEqual({ ok: false, error: projectRequests.en.permFormChanged });
});

it("REQ scaffold a second stepped, a decline after a step and a reopen of a moved step are refused", () => {
  const events = log(saved(), answered(), stepped());
  expect(team(events, "project.request.stepped", { requestId: "q1", step: { stepId: "s_2", text: "again", column: "todo" } })).toEqual({ ok: false, error: projectRequests.en.permRequestNotNew });
  expect(team(events, "project.request.declined", { requestId: "q1", why: "no" }).ok).toBe(false);
  expect(team(events, "project.request.reopened", { requestId: "q1" }).ok).toBe(true);
  const moved = events.concat(ev("project.step.moved", "L. Brandt", "p_one", { stepId: "s_r", to: "doing" }, 14));
  expect(team(moved, "project.request.reopened", { requestId: "q1" })).toEqual({ ok: false, error: projectRequests.en.permRequestStepMoved });
  expect(team(log(saved(), answered()), "project.request.reopened", { requestId: "q1" }).ok).toBe(false);
});

it("REQ scaffold the limits of D4 hold", () => {
  const save = (payload: EventPayload) => team(log(), "project.form.saved", { formId: "fm", title: "T", intro: "", fields: FIELDS, shared: true, ...payload }).ok;
  const field = (n: number): FormFieldInput[] => Array.from({ length: n }, (_, k) => ({ id: "f" + k, kind: "short", label: "q", required: false }));
  expect(save({})).toBe(true);
  expect(save({ title: "x".repeat(81) })).toBe(false);
  expect(save({ intro: "x".repeat(1001) })).toBe(false);
  expect(save({ fields: [] })).toBe(false);
  expect(save({ fields: field(20) })).toBe(true);
  expect(save({ fields: field(21) })).toBe(false);
  expect(save({ fields: [{ ...FIELDS[0], label: "x".repeat(201) }] })).toBe(false);
  expect(save({ fields: [{ id: "c", kind: "choice", label: "q", required: false, options: ["only"] }] })).toBe(false);
  expect(save({ fields: [{ id: "c", kind: "choice", label: "q", required: false, options: Array.from({ length: 13 }, (_, k) => "o" + k) }] })).toBe(false);
  expect(save({ fields: [{ id: "c", kind: "choice", label: "q", required: false, options: ["a", "x".repeat(81)] }] })).toBe(false);
  expect(save({ fields: [FIELDS[0], FIELDS[0]] })).toBe(false);
  const dates: FormFieldInput[] = [{ id: "d", kind: "date", label: "When", required: false }, { id: "s", kind: "short", label: "S", required: false }];
  const events = log(saved({ fields: [...FIELDS, ...dates] }));
  const answer = (answers: Record<string, string>) => asUser("u_js", events, "project.form.answered", { formId: "fm", formRev: 1, requestId: "q9", answers }).ok;
  expect(answer({})).toBe(false);
  expect(answer({ f_what: "x".repeat(4000) })).toBe(true);
  expect(answer({ f_what: "x".repeat(4001) })).toBe(false);
  expect(answer({ f_what: "x", s: "y".repeat(301) })).toBe(false);
  expect(answer({ f_what: "x", f_size: "Huge" })).toBe(false);
  expect(answer({ f_what: "x", f_size: "Large" })).toBe(true);
  expect(answer({ f_what: "x", d: "tomorrow" })).toBe(false);
  expect(answer({ f_what: "x", d: "42" })).toBe(true);
  expect(answer({ f_what: "x", nope: "y" })).toBe(false);
  const asked = log(saved(), answered());
  const decline = (why: string) => team(asked, "project.request.declined", { requestId: "q1", why }).ok;
  expect(decline("x".repeat(400))).toBe(true);
  expect(decline("x".repeat(401))).toBe(false);
  expect(decline(" ")).toBe(false);
});

it("REQ scaffold the event budget holds for forms, answers and steps", () => {
  const big = "x".repeat(EVENT_BUDGET);
  expect(team(log(), "project.form.saved", { formId: "fm", title: "T", intro: big.slice(0, 1000), fields: Array.from({ length: 20 }, (_, k) => ({ id: "f" + k, kind: "choice" as const, label: big.slice(0, 200), required: false, options: Array.from({ length: 12 }, () => big.slice(0, 80)) })), shared: true }).ok).toBe(false);
  expect(team(log(saved(), answered()), "project.request.stepped", { requestId: "q1", step: { stepId: "s_b", text: "t", column: "todo", note: big } }).ok).toBe(false);
});

it("REQ scaffold the acts append the five events and return the minted ids", async () => {
  const emit = vi.fn<ActDeps["emit"]>().mockResolvedValue({ ok: true });
  const act = projectActs({ emit } as unknown as ActDeps);
  const formId = act.form.save("p", { title: "Ask", intro: "", fields: FIELDS, shared: true });
  const requestId = act.form.answer("p", formId, 1, { f_what: "x" });
  const outcome = await act.request.step("p", requestId, { text: "Do", column: "todo" });
  expect(outcome).toEqual({ ok: true, stepId: expect.any(String) });
  const stepId = outcome.stepId;
  act.request.decline("p", requestId, "no");
  act.request.reopen("p", requestId);
  expect(emit.mock.calls.map((c) => c[0])).toEqual(["project.form.saved", "project.form.answered", "project.request.stepped", "project.request.declined", "project.request.reopened"]);
  expect(emit.mock.calls[1][2]).toEqual({ formId, formRev: 1, requestId, answers: { f_what: "x" } });
  expect(emit.mock.calls[2][2]).toEqual({ requestId, step: { stepId, text: "Do", column: "todo" } });
});

it("REQ scaffold a pre-REQ log replays unchanged: no forms, no requests, steps as before", () => {
  const p = project(stateOf(log(ev("project.step.added", "L. Brandt", "p_one", { stepId: "s1", text: "Build it" }, 11))));
  expect(p.forms).toEqual([]);
  expect(p.requests).toEqual([]);
  expect(p.steps).toHaveLength(1);
  expect(p.steps[0]).toMatchObject({ id: "s1", text: "Build it", column: "todo", dueDay: null });
});

it("REQ scaffold strings: German has every English key and keeps its placeholders", () => {
  const { en, de } = projectRequests;
  expect(Object.keys(en).length).toBeGreaterThan(80);
  for (const key of Object.keys(en) as (keyof typeof en)[]) {
    const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    expect(holes(de[key]), key).toBe(holes(en[key]));
  }
});
