import { expect, it, vi } from "vitest";
import { meFor } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { mayAppend } from "@/features/cases/permissions";
import { projectActs } from "@/components/dashboard/demo/project-acts";
import type { ActDeps } from "@/components/dashboard/demo/act-deps";
import { projectPlan } from "@/i18n/messages/projectPlan";
import { ev, logOf, project, SEATS, SEED, startedLog, step } from "../res/project-fixture";
import { reduce } from "@/features/cases/reducer";

const log = (extra: CaseEvent[]) => startedLog().concat(extra);
const stateOf = (events: CaseEvent[]) => reduce(SEED, logOf(events, 20));
const withStep = (): CaseEvent[] => log([ev("project.step.added", "L. Brandt", "p_one", { stepId: "s1", text: "Build it" }, 11)]);
const as = (userId: string, name: string, events: CaseEvent[], type: CaseEventType, payload: EventPayload) =>
  mayAppend({ role: "member", userId, me: meFor(userId, SEATS), name, handle: null }, { type, target: "p_one", payload }, stateOf(events));
const ms = (payload: EventPayload = {}) => ev("project.milestone.added", "L. Brandt", "p_one", { milestoneId: "m1", title: "Pilot", dueDay: 30, ...payload }, 12);

it("PLN scaffold startDay and milestoneId on project.step.edited reduce, and null clears them", () => {
  const set = project(stateOf(withStep().concat(ms(), ev("project.step.edited", "L. Brandt", "p_one", { stepId: "s1", startDay: 14, milestoneId: "m1" }, 13)))).steps[0];
  expect(set.startDay).toBe(14);
  expect(set.milestoneId).toBe("m1");
  const cleared = project(stateOf(withStep().concat(ms(), ev("project.step.edited", "L. Brandt", "p_one", { stepId: "s1", startDay: 14, milestoneId: "m1" }, 13), ev("project.step.edited", "L. Brandt", "p_one", { stepId: "s1", startDay: null, milestoneId: null }, 14)))).steps[0];
  expect(cleared.startDay).toBeNull();
  expect(cleared.milestoneId).toBeNull();
  expect(project(stateOf(withStep().concat(ev("project.step.edited", "L. Brandt", "p_one", { stepId: "s1", milestoneId: "nope" }, 13)))).steps[0].milestoneId).toBeNull();
});

it("PLN scaffold milestone events reduce: add, edit, ship, and remove clears milestoneId on its steps", () => {
  const events = withStep().concat(ms({ startDay: 12, note: " first " }), ev("project.step.edited", "L. Brandt", "p_one", { stepId: "s1", milestoneId: "m1" }, 13));
  expect(project(stateOf(events)).milestones).toEqual([{ id: "m1", title: "Pilot", startDay: 12, dueDay: 30, note: "first", shipped: false, shippedDay: null }]);
  const edited = events.concat(ev("project.milestone.edited", "L. Brandt", "p_one", { milestoneId: "m1", title: "Pilot run", dueDay: 35, shipped: true }, 15));
  expect(project(stateOf(edited)).milestones[0]).toMatchObject({ title: "Pilot run", dueDay: 35, shipped: true, shippedDay: 15 });
  const removed = edited.concat(ev("project.milestone.edited", "L. Brandt", "p_one", { milestoneId: "m1", removed: true }, 16));
  const p = project(stateOf(removed));
  expect(p.milestones).toEqual([]);
  expect(p.steps[0].milestoneId).toBeNull();
});

it("PLN scaffold rights: the team may plan on a live project, others and a closed project are refused", () => {
  const events = withStep().concat(ms());
  expect(as("u_lb", "L. Brandt", events, "project.milestone.added", { milestoneId: "m2", title: "Go", dueDay: 40 }).ok).toBe(true);
  expect(as("u_lb", "L. Brandt", events, "project.step.edited", { stepId: "s1", startDay: 14, milestoneId: "m1" }).ok).toBe(true);
  expect(as("u_lb", "L. Brandt", events, "project.milestone.edited", { milestoneId: "m1", removed: true }).ok).toBe(true);
  expect(as("u_js", "J. Schmidt", events, "project.milestone.added", { milestoneId: "m2", title: "Go", dueDay: 40 }).ok).toBe(false);
  expect(as("u_js", "J. Schmidt", events, "project.step.edited", { stepId: "s1", startDay: 14 }).ok).toBe(false);
  const stopped = events.concat(ev("project.stopped", "L. Brandt", "p_one", { why: "enough" }, 18));
  expect(as("u_lb", "L. Brandt", stopped, "project.milestone.added", { milestoneId: "m2", title: "Go", dueDay: 40 }).ok).toBe(false);
});

it("PLN scaffold rights: titles, notes, dates and ids are checked", () => {
  const events = withStep().concat(ms());
  const add = (payload: EventPayload) => as("u_lb", "L. Brandt", events, "project.milestone.added", { milestoneId: "m2", title: "Go", dueDay: 40, ...payload }).ok;
  expect(add({ title: " " })).toBe(false);
  expect(add({ title: "x".repeat(81) })).toBe(false);
  expect(add({ note: "x".repeat(1001) })).toBe(false);
  expect(add({ startDay: 41 })).toBe(false);
  expect(add({ dueDay: undefined })).toBe(false);
  expect(add({ milestoneId: "m1" })).toBe(false);
  expect(as("u_lb", "L. Brandt", events, "project.milestone.edited", { milestoneId: "zz", title: "x" }).ok).toBe(false);
  expect(as("u_lb", "L. Brandt", events, "project.milestone.edited", { milestoneId: "m1", startDay: 99 }).ok).toBe(false);
  expect(as("u_lb", "L. Brandt", events, "project.step.edited", { stepId: "s1", milestoneId: "zz" }).ok).toBe(false);
  expect(as("u_lb", "L. Brandt", events, "project.step.edited", { stepId: "s1", startDay: 1.5 }).ok).toBe(false);
});

it("PLN scaffold acts append startDay, milestoneId and the milestone events", () => {
  const emit = vi.fn<ActDeps["emit"]>().mockResolvedValue({ ok: true });
  const act = projectActs({ emit } as unknown as ActDeps);
  const id = act.milestone.add("p", { title: "Pilot", dueDay: 30 });
  act.milestone.edit("p", id, { shipped: true });
  act.editStep("p", "s1", { startDay: 14, milestoneId: id });
  expect(emit.mock.calls.map((c) => c[0])).toEqual(["project.milestone.added", "project.milestone.edited", "project.step.edited"]);
  expect(emit.mock.calls[0][2]).toMatchObject({ milestoneId: id, title: "Pilot", dueDay: 30 });
  expect(emit.mock.calls[2][2]).toEqual({ stepId: "s1", startDay: 14, milestoneId: id });
});

it("PLN scaffold a pre-PLN log replays unchanged: steps keep their fields and there are no milestones", () => {
  const p = project(stateOf(withStep()));
  expect(p.milestones).toEqual([]);
  expect(p.steps[0]).toMatchObject({ id: "s1", text: "Build it", dueDay: null });
  expect(p.steps[0].startDay ?? null).toBeNull();
  expect(p.steps[0].milestoneId ?? null).toBeNull();
});

it("PLN scaffold strings: German has every English key and keeps its placeholders", () => {
  const { en, de } = projectPlan;
  expect(Object.keys(en).length).toBeGreaterThan(80);
  for (const key of Object.keys(en) as (keyof typeof en)[]) {
    const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    expect(holes(de[key]), key).toBe(holes(en[key]));
  }
});
