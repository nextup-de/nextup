// VIS-A1: the one visibility rule (features/cases/visibility), on the demo company's ids.
import { describe, expect, it } from "vitest";
import type { Role } from "@/config/roles";
import { meFor } from "@/features/auth/identity";
import { appendEvent, emptyLog, type EventLog, type EventPayload, type NewEvent } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { accessKeys, canOpen, unitsOf, viewerKeys, type VisCtx } from "@/features/cases/visibility";
import { LOCAL_SEED } from "@/features/demo";

const seats = LOCAL_SEED.seats;
const roles = LOCAL_SEED.roles ?? [];
// Test data only: the demo's people are found by label here; the rule itself never reads a label.
const seat = (label: string) => seats.find((s) => s.label === label)!;
const userOf = (label: string) => seat(label).userId!;

const RAISER = "J. Schmidt"; // Line 3, reports to T. Vogel
const MATE = "J. Klein"; // another member
const DESK = "H. Sander"; // Quality lead: the desk the cases land on
const LEADER = "T. Vogel"; // the raiser's leader, not on the desk
const OTHER_LEADER = "K. Adler";
const MANAGER = "B. Hartmann";

const raise = (id: string, payload: EventPayload = {}): NewEvent[] => [
  { type: "case.raised", actor: RAISER, actorUserId: userOf(RAISER), target: id,
    payload: { title: id, body: "b", routeId: null, assignee: DESK, assigneeRoleHolderId: seat(DESK).id, fromDept: "Production", ...payload } },
];
const run = (...evs: NewEvent[]): EventLog => evs.reduce((log, e) => appendEvent(log, e), emptyLog());

type Who = { label: string; role: Role };
const as = (label: string, role: Role): Who => ({ label, role });
const raiser = as(RAISER, "member"), mate = as(MATE, "member"), desk = as(DESK, "leader"), leader = as(LEADER, "leader"), otherLeader = as(OTHER_LEADER, "leader"), manager = as(MANAGER, "manager");

function check(log: EventLog, id: string) {
  const state = reduce(LOCAL_SEED, log);
  const c = state.cases.find((x) => x.id === id)!;
  const ctx: VisCtx = { seats, roles, projects: state.projects };
  const keys = accessKeys(c, ctx);
  return (w: Who): boolean => {
    const me = meFor(userOf(w.label), seats);
    const viewer = { me, role: w.role, unitIds: unitsOf(me, ctx) };
    const open = canOpen(c, viewer, ctx);
    const mine = viewerKeys(me, w.role, viewer.unitIds);
    expect(keys.some((k) => mine.includes(k))).toBe(open); // keys and the rule agree
    return open;
  };
}

describe("VIS visibility rule", () => {
  it("private: the raiser and the desk open it, another member does not, a manager does not", () => {
    const open = check(run(...raise("x1", { visibility: "private" })), "x1");
    expect(open(raiser)).toBe(true);
    expect(open(desk)).toBe(true);
    expect(open(mate)).toBe(false);
    expect(open(manager)).toBe(false);
    expect(open(leader)).toBe(false);
  });

  it("no choice: a manager opens it, the raiser's leader opens it, another leader and a member do not", () => {
    const open = check(run(...raise("x2")), "x2");
    expect(open(manager)).toBe(true);
    expect(open(leader)).toBe(true);
    expect(open(otherLeader)).toBe(false);
    expect(open(mate)).toBe(false);
    expect(open(raiser)).toBe(true);
    expect(open(desk)).toBe(true);
  });

  it("everyone: every viewer opens it", () => {
    const open = check(run(...raise("x3", { visibility: "everyone" })), "x3");
    for (const w of [mate, otherLeader, manager, leader]) expect(open(w)).toBe(true);
  });

  it("custom: a user in seenByUserIds opens it, a user of a unit in seenByUnitIds opens it, a shared label does not", () => {
    const mateUnit = roles.find((r) => r.id === seat("K. Adler").roleId)!.orgUnitId; // Finance
    const log = run(...raise("x4", { visibility: "custom", seenByUserIds: [userOf(MATE)], seenByUnitIds: [mateUnit], seenBy: [OTHER_LEADER + "-label"] }));
    const open = check(log, "x4");
    expect(open(mate)).toBe(true); // by user id
    expect(open(otherLeader)).toBe(true); // K. Adler sits in the picked unit
    expect(open(as("N. Kaya", "leader"))).toBe(false);
    expect(open(leader)).toBe(false); // custom is a choice: the leader rule does not apply
  });

  it("custom with labels only (an old raise): nobody but the raiser, the desk and managers", () => {
    const open = check(run(...raise("x5", { visibility: "custom", seenBy: [MATE, "Finance"] })), "x5");
    expect(open(mate)).toBe(false);
    expect(open(otherLeader)).toBe(false);
    expect(open(raiser) && open(desk) && open(manager)).toBe(true);
  });

  it("an invitee opens a private case", () => {
    const log = run(
      ...raise("x6", { visibility: "private" }),
      { type: "case.discussion", actor: DESK, actorUserId: userOf(DESK), target: "x6", payload: { invited: [MATE], invitedUserIds: [userOf(MATE)], missing: "m" } },
    );
    const open = check(log, "x6");
    expect(open(mate)).toBe(true);
    expect(open(otherLeader)).toBe(false);
  });

  it("a project member opens a private case that became a project", () => {
    const log = run(
      ...raise("x7", { visibility: "private" }),
      { type: "case.decided", actor: DESK, actorUserId: userOf(DESK), target: "x7", payload: { answer: "yes", projectId: "px", lead: DESK, leadUserId: userOf(DESK) } },
      { type: "project.member", actor: DESK, actorUserId: userOf(DESK), target: "px", payload: { name: MATE, userId: userOf(MATE), on: true } },
    );
    const open = check(log, "x7");
    expect(open(mate)).toBe(true);
    expect(open(otherLeader)).toBe(false);
  });

  it("the keys: u: raiser, r: desk role, m for managers unless private", () => {
    const state = reduce(LOCAL_SEED, run(...raise("x8")));
    const keys = accessKeys(state.cases.find((c) => c.id === "x8")!, { seats, roles, projects: state.projects });
    expect(keys).toContain("u:" + userOf(RAISER));
    expect(keys).toContain("r:" + seat(DESK).roleId);
    expect(keys).toContain("r:" + seat(LEADER).roleId);
    expect(keys).toContain("m");
  });
});
