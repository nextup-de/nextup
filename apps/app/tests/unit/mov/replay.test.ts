// MOV-A1 (D6): a log written before MOV reduces to the same projects as before, apart from the MOV fields and the one
// intended difference, D24: a project done without a baseline number now closes.
import { describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import type { ReducedProject } from "@/features/projects/types";

const seats: SeatRow[] = [
  { id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
  { id: "seat_dep", roleId: "role_deputy", label: "H. Sander", userId: "u_hs", sort: 1 },
];
const routes = LOCAL_SEED.routes.map((x) => (x.id === "r1" ? { ...x, ownerSeatId: "seat_tv", ownerRoleId: "role_owner", deputySeatId: "seat_dep", deputyRoleId: "role_deputy" } : x));
const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats };

const NAME: Record<string, string> = { u_tv: "T. Vogel", u_lb: "L. Brandt", u_hs: "H. Sander", u_ci: "C. Ilg", u_mr: "M. Roth" };
let n = 0;
const ev = (type: CaseEventType, target: string | null, payload: EventPayload, day: number, by: string): CaseEvent =>
  ({ id: "y" + n++, ts: 0, type, actor: NAME[by], actorUserId: by, target, payload, day });
const raise = (id: string) => ev("case.raised", id, { kind: "idea", title: "Idea " + id, body: "text", routeId: "r1", assignee: "T. Vogel" }, 0, "u_ci");
const on = (project: string, by = "u_lb") => (type: CaseEventType, payload: EventPayload = {}, day = 0) => ev(type, project, payload, day, by);

// A legacy yes: led by L. Brandt, a member, steps added, moved and edited, a member removed the old way, done, measured and confirmed.
const one = on("p_one");
const legacy = [
  raise("c_a"),
  ev("case.decided", "c_a", { answer: "yes", projectId: "p_one", lead: "L. Brandt", leadUserId: "u_lb", title: "Changeover" }, 0, "u_tv"),
  one("project.member", { userId: "u_hs", name: "H. Sander", on: true }, 0),
  one("project.member", { userId: "u_mr", name: "M. Roth", on: true }, 0),
  one("project.baseline", { metric: "Changeover", unit: "min", value: 42, better: "down", source: "MES" }, 1),
  one("project.started", {}, 2),
  one("project.step.added", { stepId: "s1", text: "Pre-stage tools", owner: "M. Roth", ownerUserId: "u_mr", dueDay: 9 }, 3),
  one("project.step.added", { stepId: "s2", text: "Retime the line", owner: "H. Sander", ownerUserId: "u_hs" }, 3),
  one("project.step.moved", { stepId: "s1", to: "doing" }, 4),
  one("project.step.edited", { stepId: "s2", note: "Needs a slot" }, 5),
  // Removed the old way: no unassign, so their step keeps its owner.
  one("project.member", { userId: "u_mr", name: "M. Roth", on: false }, 6),
  one("project.step.moved", { stepId: "s1", to: "done" }, 7),
  one("project.done", { note: "Live" }, 8),
  one("project.measured", { check: 30, value: 30, source: "MES" }, 38),
  ev("project.measure.confirmed", "p_one", { check: 30 }, 39, "u_tv"),
];
// A draft from SET: led by the decider, with a goal, a sponsor and a follower, not started.
const two = on("p_two", "u_tv");
const draft = [
  raise("c_b"),
  ev("case.decided", "c_b", { answer: "yes", projectId: "p_two", lead: "T. Vogel", leadUserId: "u_tv", title: "Quote process", draft: true }, 1, "u_tv"),
  two("project.goal", { goal: "Quote in a day", doneWhen: "Median under 24 hours", doneBy: 55 }, 2),
  ev("project.invited", "p_two", { userId: "u_hs", role: "sponsor" }, 2, "u_tv"),
  two("project.invited", { userId: "u_ci", role: "follower" }, 2),
];
const MOV_FIELDS = ["doneBy", "doneByMoves", "pausedUntil", "pauseWhy", "lastActivityDay", "checkInWeekday", "howWeWorkNote", "leadVacatedDay", "latestUpdate"] as const;
// What plan RES added on top (declared in RES-G1): the project's own fields, and the fields of its baseline, steps and measures.
const RES_FIELDS = ["rewardDueDay", "helpAsks"] as const;
const RES_MEASURE_FIELDS = ["eventId", "sentBack", "reentered", "managerOnly", "questions", "previous"] as const;
const without = <T extends object>(o: T, keys: readonly string[]): T => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k))) as T;
/** Every field the project had before MOV, as plain data: the history as its event ids. */
const before = (p: ReducedProject) => {
  const { history, ...rest } = p;
  for (const k of [...MOV_FIELDS, ...RES_FIELDS, "pages", "removed", "merges"] as const) delete (rest as Partial<ReducedProject>)[k];
  return {
    ...rest,
    baseline: rest.baseline === null ? null : without(rest.baseline, ["byUserId", "eventId", "confirmed"]),
    steps: rest.steps.map((s) => without(s, ["dropped"])),
    measures: rest.measures.map((m) => without(m, RES_MEASURE_FIELDS)),
    history: history.map((e) => e.id.replace(/^y\d+$/, "y")),
  };
};

describe("MOV replay", () => {
  const S = reduce(SEED, { events: [...legacy, ...draft], day: 40 });
  const [p1, p2] = S.projects;

  it("a log from before MOV reduces to the same fields as before, MOV fields aside", () => {
    expect(before(p1)).toMatchInlineSnapshot(`
      {
        "approvalsPendingSince": null,
        "authorUserIds": [
          "u_ci",
        ],
        "authors": [
          "C. Ilg",
        ],
        "baseline": {
          "better": "down",
          "by": "L. Brandt",
          "day": 1,
          "metric": "Changeover",
          "none": false,
          "source": "MES",
          "unit": "min",
          "value": 42,
        },
        "checks": [
          {
            "check": 30,
            "dueDay": 43,
            "late": false,
            "measured": true,
            "opensDay": 38,
          },
          {
            "check": 90,
            "dueDay": 103,
            "late": false,
            "measured": false,
            "opensDay": 98,
          },
        ],
        "claimed": null,
        "closed": false,
        "deciderUserId": null,
        "doneDay": 8,
        "doneNote": "Live",
        "draft": false,
        "dueDay": 103,
        "escalated": null,
        "followerUserIds": [],
        "goal": null,
        "history": [
          "y",
          "y",
          "y",
          "y",
          "y",
          "y",
          "y",
          "y",
          "y",
          "y",
          "y",
          "y",
          "y",
          "y",
        ],
        "id": "p_one",
        "invites": [],
        "lead": "L. Brandt",
        "leadAskedDay": null,
        "leadState": "taken",
        "leadUserId": "u_lb",
        "links": [],
        "measures": [
          {
            "by": "L. Brandt",
            "byUserId": "u_lb",
            "changePct": -28.6,
            "check": 30,
            "confirmed": true,
            "confirmedByUserId": "u_tv",
            "confirmedDay": 39,
            "day": 38,
            "impact": null,
            "note": "",
            "source": "MES",
            "sourceInfo": {
              "kind": "typed",
              "note": "MES",
            },
            "sourceKind": "typed",
            "value": 30,
            "verdict": "better",
          },
        ],
        "memberUserIds": [
          "u_hs",
        ],
        "members": [
          "H. Sander",
        ],
        "number": 1,
        "openedBy": "T. Vogel",
        "openedDay": 0,
        "overdue": false,
        "raiserNote": "",
        "reward": null,
        "rewardDue": false,
        "routeId": "r1",
        "seed": false,
        "sources": [
          "c_a",
        ],
        "sponsorUserId": null,
        "startDay": null,
        "startedDay": 2,
        "status": "measuring",
        "steps": [
          {
            "addedDay": 3,
            "by": "L. Brandt",
            "byUserId": "u_lb",
            "column": "todo",
            "doneDay": null,
            "dueDay": null,
            "external": null,
            "id": "s2",
            "movedDay": 3,
            "note": "Needs a slot",
            "owner": "H. Sander",
            "ownerUserId": "u_hs",
            "startedDay": null,
            "text": "Retime the line",
            "why": "",
          },
          {
            "addedDay": 3,
            "by": "L. Brandt",
            "byUserId": "u_lb",
            "column": "done",
            "doneDay": 7,
            "dueDay": 9,
            "external": null,
            "id": "s1",
            "movedDay": 7,
            "note": "",
            "owner": "M. Roth",
            "ownerUserId": "u_mr",
            "startedDay": 4,
            "text": "Pre-stage tools",
            "why": "",
          },
        ],
        "stopped": null,
        "sync": null,
        "template": null,
        "title": "Changeover",
        "verdict": "better",
      }
    `);
    expect(before(p2)).toMatchInlineSnapshot(`
      {
        "approvalsPendingSince": null,
        "authorUserIds": [
          "u_ci",
        ],
        "authors": [
          "C. Ilg",
        ],
        "baseline": null,
        "checks": [],
        "claimed": null,
        "closed": false,
        "deciderUserId": "u_tv",
        "doneDay": null,
        "doneNote": "",
        "draft": true,
        "dueDay": 11,
        "escalated": {
          "day": 12,
          "from": "T. Vogel",
          "live": true,
          "to": "M. Roth",
          "toRoleId": "role_deputy",
          "toSeatId": "seat_dep",
          "what": "draft",
        },
        "followerUserIds": [
          "u_ci",
        ],
        "goal": {
          "brief": "",
          "doneBy": 55,
          "doneWhen": "Median under 24 hours",
          "goal": "Quote in a day",
        },
        "history": [
          "y",
          "y",
          "y",
          "y",
        ],
        "id": "p_two",
        "invites": [
          {
            "day": 2,
            "id": "y18",
            "reason": "",
            "role": "sponsor",
            "state": "pending",
            "userId": "u_hs",
          },
        ],
        "lead": "T. Vogel",
        "leadAskedDay": null,
        "leadState": "taken",
        "leadUserId": "u_tv",
        "links": [],
        "measures": [],
        "memberUserIds": [],
        "members": [],
        "number": 2,
        "openedBy": "T. Vogel",
        "openedDay": 1,
        "overdue": true,
        "raiserNote": "",
        "reward": null,
        "rewardDue": false,
        "routeId": "r1",
        "seed": false,
        "sources": [
          "c_b",
        ],
        "sponsorUserId": null,
        "startDay": 11,
        "startedDay": null,
        "status": "planning",
        "steps": [],
        "stopped": null,
        "sync": null,
        "template": null,
        "title": "Quote process",
        "verdict": null,
      }
    `);
  });

  it("the MOV fields hold their derived values", () => {
    expect(p1).toMatchObject({
      doneBy: 32, doneByMoves: [], pausedUntil: null, pauseWhy: "", lastActivityDay: 7, checkInWeekday: null, howWeWorkNote: "", leadVacatedDay: null, latestUpdate: null,
    });
    expect(p2).toMatchObject({ doneBy: null, lastActivityDay: null, doneByMoves: [], latestUpdate: null });
  });

  it("a member removed the old way keeps the steps they own", () => {
    expect(p1.steps.find((s) => s.id === "s1")).toMatchObject({ owner: "M. Roth", ownerUserId: "u_mr", column: "done" });
    expect(p1.memberUserIds).toEqual(["u_hs"]);
  });

  it("the one intended difference: a project done without a baseline number under a reward rule now closes", () => {
    const none = [
      raise("c_c"),
      ev("case.decided", "c_c", { answer: "yes", projectId: "p_three", lead: "L. Brandt", leadUserId: "u_lb", title: "Safety walk" }, 0, "u_tv"),
      ev("project.baseline", "p_three", { none: true, why: "No metric" }, 1, "u_lb"),
      ev("project.started", "p_three", {}, 2, "u_lb"),
      ev("project.done", "p_three", {}, 3, "u_lb"),
    ];
    const seed: ReduceSeed = { ...SEED, loop: { reward: { kind: "thanks", amount: null, sharePct: null, capEur: null } } };
    const p = reduce(seed, { events: none, day: 4 }).projects[0];
    expect(p).toMatchObject({ status: "measured", verdict: "not measured", rewardDue: false, closed: true });
    // The same project under the default rules (no reward possible) was closed before as well.
    expect(reduce(SEED, { events: none, day: 4 }).projects[0].closed).toBe(true);
  });

  it("a later day moves no MOV field", () => {
    const later = reduce(SEED, { events: [...legacy, ...draft], day: 400 }).projects;
    const mov = (p: ReducedProject) => MOV_FIELDS.map((k) => p[k]);
    expect(later.map(mov)).toEqual([p1, p2].map(mov));
  });
});
