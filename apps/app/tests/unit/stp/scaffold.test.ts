import { expect, it, vi } from "vitest";
import type { Actor } from "@/features/cases/permissions";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { APP_EVENT_TYPES } from "@/features/cases/persist";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { PROJECT_LOOP_TYPES } from "@/features/notify/areas/project";
import { kicksJira } from "@/features/projects/pages";
import { mayAppendProject } from "@/features/projects/permissions";
import { projectActs } from "@/components/dashboard/demo/project-acts";
import type { ActDeps } from "@/components/dashboard/demo/act-deps";
import { projectSteps } from "@/i18n/messages/projectSteps";
import { prepareProjectAppend } from "@/server/actions/append/project";
import type { AppendCtx } from "@/server/actions/append/shared";

const findUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ getDb: () => ({ user: { findFirst: findUser } }) }));

const seed: ReduceSeed = {
  cases: [], ideas: [], problems: [], routes: [], promiseDays: 5,
  projects: [{ id: "p", title: "Project", lead: "Lead", leadUserId: "lead", members: ["Member"], memberUserIds: ["member"], sources: [], authors: [], openedDay: 0, openedBy: "Lead" }],
};
const ev = (type: CaseEventType, payload: EventPayload, id = "event", day = 0, userId = "lead"): CaseEvent =>
  ({ id, ts: 0, type, target: "p", actor: userId, actorUserId: userId, payload, day });
const added = ev("project.step.added", { stepId: "s", text: "Test the gateway" }, "added");
const check = (op: EventPayload["op"], itemId: string, patch: EventPayload = {}, id = itemId + op) => ev("project.step.checklist", { stepId: "s", op, itemId, ...patch }, id);
const stateOf = (events: CaseEvent[] = []) => reduce(seed, { day: 5, events: [added, ...events] });
const who = (userId: string | null, role: Actor["role"] = "member"): Actor => ({ userId, role, name: "Lead", handle: null });

it("STP scaffold: checklist events preserve concurrent item changes and ignore unknown items", () => {
  const base = [check("add", "a", { text: "First" }), check("add", "b", { text: "Second" })];
  const a = check("toggle", "a", { done: true });
  const b = { ...check("toggle", "b", { done: true }), actorUserId: "member" };
  const forward = stateOf([...base, a, b]).projects[0].steps[0];
  expect(forward.checklist).toEqual([{ id: "a", text: "First", done: true }, { id: "b", text: "Second", done: true }]);
  expect(stateOf([...base, b, a]).projects[0].steps[0].checklist).toEqual(forward.checklist);
  const edits = stateOf([...base, check("edit", "a", { text: "Revised" }), check("remove", "b"), check("toggle", "b", { done: true }), check("edit", "unknown", { text: "Nothing" })]);
  expect(edits.projects[0].steps[0].checklist).toEqual([{ id: "a", text: "Revised", done: false }]);
  expect(stateOf([...base, base[0]]).projects[0].steps[0].checklist).toHaveLength(2);
});

it("STP scaffold: comments retain author and reply identity on the same step", () => {
  const comments = [
    ev("project.step.commented", { stepId: "s", text: "Question" }, "c1", 1),
    ev("project.step.commented", { stepId: "s", text: "Answer", replyTo: "c1" }, "c2", 2, "member"),
    ev("project.step.added", { stepId: "other", text: "Other" }, "other"),
    ev("project.step.commented", { stepId: "other", text: "Wrong step", replyTo: "c1" }, "c3"),
    ev("project.step.commented", { stepId: "s", text: "Wrong reply", replyTo: "future" }, "c4"),
  ];
  const [step, other] = stateOf(comments).projects[0].steps;
  expect(step.comments).toEqual([
    { id: "c1", text: "Question", by: "lead", byUserId: "lead", day: 1, replyTo: null },
    { id: "c2", text: "Answer", by: "member", byUserId: "member", day: 2, replyTo: "c1" },
  ]);
  expect(other.comments).toEqual([]);
});

it("STP scaffold: waiting-on is normalized, survives a reorder and clears on leaving Blocked", () => {
  const blocked = ev("project.step.moved", { stepId: "s", to: "blocked", why: "Needs a reply", waitingOn: { kind: "outside", name: " Supplier " } });
  const reorder = ev("project.step.moved", { stepId: "s", to: "blocked", before: null });
  expect(stateOf([blocked, reorder]).projects[0].steps[0]).toMatchObject({ why: "Needs a reply", waitingOn: { kind: "outside", name: "Supplier", userId: null } });
  expect(stateOf([blocked, ev("project.step.moved", { stepId: "s", to: "doing" })]).projects[0].steps[0].waitingOn).toBeNull();
  expect(stateOf([ev("project.baseline", { none: true, why: "No number" }), ev("project.started", {}), blocked, ev("project.done", { openSteps: [{ stepId: "s", end: "done" }] })]).projects[0].steps[0].waitingOn).toBeNull();
  for (const waitingOn of [{ kind: "person", userId: "member" }, { kind: "nobody" }] as const) {
    expect(stateOf([ev("project.step.moved", { stepId: "s", to: "blocked", waitingOn })]).projects[0].steps[0].waitingOn).toMatchObject(waitingOn);
  }
});

it("STP scaffold: team rights match adding steps, sponsors may comment, and closed projects refuse", () => {
  const state = stateOf();
  state.projects[0].sponsorUserId = "sponsor";
  const checklist = check("add", "a", { text: "First" });
  const comment = ev("project.step.commented", { stepId: "s", text: "Question" });
  for (const actor of [who("lead"), who("member"), who("manager", "manager"), who("stranger"), who(null)]) {
    const add = mayAppendProject(actor, { ...added, payload: { ...added.payload, stepId: "new" } }, state).ok;
    expect(mayAppendProject(actor, checklist, state).ok).toBe(add);
    expect(mayAppendProject(actor, comment, state).ok).toBe(add);
  }
  expect(mayAppendProject(who("sponsor"), comment, state).ok).toBe(true);
  expect(mayAppendProject(who("sponsor"), checklist, state).ok).toBe(false);
  Object.assign(state.projects[0], { draft: true, leadState: "pending", deciderUserId: "decider" });
  expect(mayAppendProject(who("decider"), checklist, state).ok).toBe(true);
  for (const status of ["stopped", "recognised"] as const) {
    state.projects[0].status = status;
    expect(mayAppendProject(who("lead"), checklist, state).ok).toBe(false);
    expect(mayAppendProject(who("sponsor"), comment, state).ok).toBe(false);
  }
});

it("STP scaffold: enforces item, comment, reply and waiting-on limits", () => {
  const state = stateOf();
  const allow = (type: CaseEventType, payload: EventPayload) => mayAppendProject(who("lead"), ev(type, { stepId: "s", ...payload }), state).ok;
  for (const length of [0, 201]) expect(allow("project.step.checklist", { op: "add", itemId: "i", text: "x".repeat(length) })).toBe(false);
  expect(allow("project.step.checklist", { op: "add", itemId: "i", text: "x".repeat(200) })).toBe(true);
  for (const length of [0, 2001]) expect(allow("project.step.commented", { text: "x".repeat(length) })).toBe(false);
  expect(allow("project.step.commented", { text: "x".repeat(2000) })).toBe(true);
  expect(allow("project.step.commented", { text: "Reply", replyTo: "missing" })).toBe(false);
  expect(allow("project.step.checklist", { op: "toggle", itemId: "missing", done: true })).toBe(true);
  state.projects[0].steps[0].checklist = Array.from({ length: 30 }, (_, i) => ({ id: `i${i}`, text: "Item", done: false }));
  expect(allow("project.step.checklist", { op: "add", itemId: "extra", text: "Item" })).toBe(false);
  expect(allow("project.step.checklist", { op: "toggle", itemId: "i0" })).toBe(false);
  expect(allow("project.step.checklist", { op: "edit", itemId: "i0", text: " " })).toBe(false);
  for (const waitingOn of [{ kind: "person" }, { kind: "outside", name: "" }, { kind: "outside", name: "x".repeat(81) } ] as const) {
    expect(allow("project.step.moved", { to: "blocked", why: "Question", waitingOn })).toBe(false);
  }
  expect(allow("project.step.moved", { to: "blocked", why: "Question", waitingOn: { kind: "outside", name: "x".repeat(80) } })).toBe(true);
  expect(allow("project.step.moved", { to: "blocked", why: "Question" })).toBe(true);
  expect(allow("project.step.moved", { to: "blocked", waitingOn: { kind: "nobody" } })).toBe(false);
  const many = Array.from({ length: 31 }, (_, i) => check("add", `i${i}`, { text: "Item" }));
  expect(stateOf(many).projects[0].steps[0].checklist).toHaveLength(30);
});

it("STP scaffold: person targets must be active members of this company at append time", async () => {
  const context = { type: "project.step.moved", companyId: "company", locale: "en", payload: { to: "blocked", waitingOn: { kind: "person", userId: "member" } } } as AppendCtx;
  findUser.mockResolvedValueOnce(null);
  expect((await prepareProjectAppend(context)).ok).toBe(false);
  expect(findUser).toHaveBeenCalledWith({ where: { id: "member", companyId: "company", active: true }, select: { id: true } });
  findUser.mockResolvedValueOnce({ id: "member" });
  expect((await prepareProjectAppend(context)).ok).toBe(true);
});

it("STP scaffold: acts append one item or comment event and the optional waiting-on payload", () => {
  const emit = vi.fn().mockResolvedValue({ ok: true });
  const acts = projectActs({ emit, S: stateOf() } as unknown as ActDeps);
  acts.stepCheck("p", "s", "add", "a", "First");
  acts.stepCheck("p", "s", "toggle", "a", undefined, true);
  acts.stepComment("p", "s", "Answer", "c1");
  acts.moveStep("p", "s", "blocked", "Question", null, { kind: "person", userId: "member" });
  expect(emit.mock.calls).toEqual([
    ["project.step.checklist", "p", { stepId: "s", op: "add", itemId: "a", text: "First" }],
    ["project.step.checklist", "p", { stepId: "s", op: "toggle", itemId: "a", done: true }],
    ["project.step.commented", "p", { stepId: "s", text: "Answer", replyTo: "c1" }],
    ["project.step.moved", "p", { stepId: "s", to: "blocked", why: "Question", before: null, waitingOn: { kind: "person", userId: "member" } }],
  ]);
  for (const type of ["project.step.checklist", "project.step.commented"] as const) {
    expect(APP_EVENT_TYPES).toContain(type);
    expect(PROJECT_LOOP_TYPES).not.toContain(type);
    expect(kicksJira(type)).toBe(false);
  }
  expect(kicksJira("project.step.moved")).toBe(true);
});

it("STP scaffold: replays a pre-STP demo log with its existing values unchanged and empty new fields", () => {
  const log = { events: LOCAL_SEED.projects?.flatMap((p) => (p.seedEvents ?? []).map((e, i) => ({ ...e, id: `${p.id}:${i}`, target: p.id, ts: 0 } as CaseEvent))) ?? [], day: 20 };
  const first = reduce(LOCAL_SEED, log);
  const replay = reduce(LOCAL_SEED, JSON.parse(JSON.stringify(log)));
  expect(replay).toEqual(first);
  const steps = first.projects.flatMap((p) => p.steps);
  expect(steps.length).toBeGreaterThan(0);
  for (const step of steps) expect(step).toMatchObject({ checklist: [], comments: [], waitingOn: null });
  const simple = stateOf([ev("project.step.moved", { stepId: "s", to: "doing", why: "Started" }, "move", 3)]).projects[0].steps[0];
  expect(simple).toEqual({ id: "s", text: "Test the gateway", owner: null, ownerUserId: null, dueDay: null, column: "doing", why: "Started", note: "", addedDay: 0, movedDay: 3, by: "lead", byUserId: "lead", startedDay: 3, doneDay: null, external: null, dropped: null, checklist: [], comments: [], waitingOn: null });
  expect(Object.keys(projectSteps.en).sort()).toEqual(Object.keys(projectSteps.de).sort());
});
