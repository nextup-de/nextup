import { expect, it } from "vitest";
import { reduce } from "@/features/cases/reducer";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { formSummaries, requestCounts, requestList, stepDraft, undoOf } from "@/features/projects/requests-view";
import type { FormFieldInput } from "@/features/projects/types";
import { ev, logOf, project, SEED, startedLog } from "../../../tests/unit/res/project-fixture";

const FIELDS: FormFieldInput[] = [
  { id: "f_what", kind: "short", label: "What do you need?", required: true },
  { id: "f_why", kind: "long", label: "Why?", required: false },
  { id: "f_size", kind: "choice", label: "How big?", required: false, options: ["Small", "Large"] },
];
const saved = (payload: EventPayload = {}, day = 11): CaseEvent => ev("project.form.saved", "L. Brandt", "p_one", { formId: "fm", title: "Ask us", intro: "", fields: FIELDS, shared: true, ...payload }, day);
const answered = (id: string, answers: Record<string, string>, formRev = 1, day = 12): CaseEvent => ev("project.form.answered", "J. Schmidt", "p_one", { formId: "fm", formRev, requestId: id, answers }, day);
const as = (type: CaseEventType, payload: EventPayload, day = 13): CaseEvent => ev(type, "L. Brandt", "p_one", payload, day);
const proj = (...extra: CaseEvent[]) => project(reduce(SEED, logOf(startedLog().concat(extra), 20)));

it("REQ inbox filters requests by New, Made into a step and Declined, newest first, with counts", () => {
  const p = proj(saved(), answered("q1", { f_what: "Cart" }, 1, 12), answered("q2", { f_what: "Lamp" }, 1, 14), answered("q3", { f_what: "Desk" }, 1, 13),
    as("project.request.stepped", { requestId: "q1", step: { stepId: "s_1", text: "Cart", column: "todo" } }),
    as("project.request.declined", { requestId: "q3", why: "No" }));
  expect(requestList(p, "new").map((r) => r.request.id)).toEqual(["q2"]);
  expect(requestList(p, "stepped").map((r) => r.request.id)).toEqual(["q1"]);
  expect(requestList(p, "declined").map((r) => r.request.id)).toEqual(["q3"]);
  expect(requestCounts(p)).toEqual({ new: 1, stepped: 1, declined: 1 });
  expect(formSummaries(p).map((s) => [s.answers, s.fresh])).toEqual([[3, 1]]);
  const two = proj(saved(), answered("a", { f_what: "A" }, 1, 12), answered("b", { f_what: "B" }, 1, 15));
  expect(requestList(two, "new").map((r) => r.request.id)).toEqual(["b", "a"]);
});

it("REQ inbox shows answers with the questions of the revision they answered", () => {
  const p = proj(saved(), answered("q1", { f_what: "Cart", f_size: "Large" }), saved({ fields: [{ ...FIELDS[0], label: "Which item?" }], title: "Ask v2" }, 13));
  const row = requestList(p, "new")[0];
  expect(row.answers.map((a) => [a.field.label, a.value])).toEqual([["What do you need?", "Cart"], ["How big?", "Large"]]);
  expect(p.forms[0].fields[0].label).toBe("Which item?");
});

it("REQ inbox prefills the step title from the form's first short answer, quoting the rest as details", () => {
  const p = proj(saved(), answered("q1", { f_what: "Cart", f_why: "Too slow", f_size: "Large" }), answered("q2", { f_why: "Only a reason" }));
  const [second, first] = requestList(p, "new");
  expect(stepDraft(first.request, first.form)).toEqual({ title: "Cart", column: "todo", note: "Why?\nToo slow\n\nHow big?\nLarge" });
  expect(stepDraft(second.request, second.form)).toMatchObject({ title: "Ask us", column: "todo" });
});

it("REQ inbox Make it a step sends one event: a stepped request is no longer new, so a retry is refused", () => {
  const events = [saved(), answered("q1", { f_what: "Cart" }), as("project.request.stepped", { requestId: "q1", step: { stepId: "s_1", text: "Cart", column: "todo" } })];
  const p = proj(...events, as("project.request.stepped", { requestId: "q1", step: { stepId: "s_2", text: "Cart again", column: "todo" } }, 14));
  expect(p.steps.filter((s) => s.id.startsWith("s_"))).toHaveLength(1);
  expect(p.requests[0].stepId).toBe("s_1");
});

it("REQ inbox Undo is offered only while a reopen would be accepted", () => {
  const base = [saved(), answered("q1", { f_what: "Cart" })];
  expect(undoOf(proj(...base), proj(...base).requests[0])).toBeNull();
  const declined = proj(...base, as("project.request.declined", { requestId: "q1", why: "No" }));
  expect(undoOf(declined, declined.requests[0])).toBe("reopen");
  const step = as("project.request.stepped", { requestId: "q1", step: { stepId: "s_1", text: "Cart", column: "todo" } });
  const clean = proj(...base, step);
  expect(undoOf(clean, clean.requests[0])).toBe("reopen");
  const moved = proj(...base, step, as("project.step.moved", { stepId: "s_1", to: "doing" }, 14));
  expect(undoOf(moved, moved.requests[0])).toBe("stepMoved");
  const commented = proj(...base, step, as("project.step.commented", { stepId: "s_1", text: "hi" }, 14));
  expect(undoOf(commented, commented.requests[0])).toBe("stepMoved");
});
