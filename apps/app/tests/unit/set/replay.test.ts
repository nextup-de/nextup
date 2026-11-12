// Plan SET, SET-A1 (D5, D8): a log written before the project draft existed reduces to the same projects as before,
// with draft false and the lead taken. SNAPSHOT is what the reducer gave for this log before SET-A1 (taken from the
// reducer of SET-G1, which already had the draft fields at their empty values).
import { describe, expect, it } from "vitest";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import type { ReducedProject } from "@/features/projects/types";

const SEED: ReduceSeed = { cases: CASES, ideas: IDEAS, problems: PROBLEMS, routes: LOCAL_SEED.routes, promiseDays: PROMISE_DAYS, seats: LOCAL_SEED.seats };
const UID: Record<string, string> = { "L. Brandt": "u_lb", "T. Vogel": "u_tv", "Anonymous #4471": "u_js" };
let n = 0;
const ev = (type: CaseEventType, actor: string, target: string | null, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "r" + n++, ts: 0, type, actor, actorUserId: UID[actor] ?? null, target, payload, day });
const AUTHOR = "Anonymous #4471";
const raise = (id: string) => ev("case.raised", AUTHOR, id, { kind: "idea", title: "Idea " + id, body: "text", routeId: "r1", assignee: "T. Vogel" });
const yes = (caseId: string, projectId: string, day = 0) =>
  ev("case.decided", "T. Vogel", caseId, { answer: "yes", projectId, lead: "L. Brandt", leadUserId: "u_lb", title: "Shorter changeover" }, day);
const P = (type: CaseEventType, payload: EventPayload = {}, day = 0, target = "p_one") => ev(type, "L. Brandt", target, payload, day);

/** A yes with a lead, baseline, start, steps, done, a 30-day measure; and a second project that never started. */
const LOG = [
  raise("c_a"), yes("c_a", "p_one"),
  P("project.baseline", { metric: "Changeover time", unit: "min", value: 42, better: "down", source: "MES weekly" }),
  P("project.started", {}, 1),
  P("project.step.added", { stepId: "s1", text: "Pre-stage the tools" }, 1), P("project.step.added", { stepId: "s2", text: "Train the shift", dueDay: 5 }, 1),
  P("project.step.moved", { stepId: "s1", to: "done" }, 2), P("project.member", { userId: "u_x", name: "X. Member" }, 2),
  P("project.done", { note: "Live on line 3" }, 3), P("project.measured", { check: 30, value: 30 }, 33),
  raise("c_b"), yes("c_b", "p_two", 1),
];

// The fields plan RES added (RES-G1) are not part of what a log from before the draft reduced to: take them off before comparing.
const without = <T extends object>(o: T, keys: readonly string[]): T => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k))) as T;
const beforeRes = (p: ReducedProject): unknown => ({
  ...without(p, ["rewardDueDay", "helpAsks"]),
  baseline: p.baseline === null ? null : without(p.baseline, ["byUserId", "eventId", "confirmed"]),
  steps: p.steps.map((s) => without(s, ["dropped"])),
  measures: p.measures.map((m) => without(m, ["eventId", "sentBack", "reentered", "managerOnly", "questions", "previous"])),
});

describe("SET replay", () => {
  const projects = reduce(SEED, { events: LOG, day: 40 }).projects;

  it("a log from before the draft reduces to the same projects, draft false and the lead taken", () => {
    expect(projects).toHaveLength(2);
    for (const p of projects) {
      expect(p).toMatchObject({ draft: false, leadState: "taken", leadAskedDay: null, template: null, invites: [], sponsorUserId: null, followerUserIds: [], goal: null, startDay: null, approvalsPendingSince: null, raiserNote: "", deciderUserId: null });
    }
    expect(JSON.parse(JSON.stringify(projects.map(beforeRes)))).toEqual(SNAPSHOT);
  });

  it("gives the same projects whatever day it is replayed on", () => {
    const early = reduce(SEED, { events: LOG, day: 3 }).projects;
    expect(early.map((p) => [p.id, p.status, p.draft, p.leadState, p.startDay])).toEqual([["p_one", "measuring", false, "taken", null], ["p_two", "planning", false, "taken", null]]);
    // The start clock of a project without draft stays openedDay + promise days.
    expect(projects[1]).toMatchObject({ dueDay: 1 + PROMISE_DAYS, overdue: true });
    expect(early[1]).toMatchObject({ dueDay: 1 + PROMISE_DAYS, overdue: false, escalated: null });
  });
});

const SNAPSHOT: unknown = [
 {
  "id": "p_one",
  "number": 1,
  "title": "Shorter changeover",
  "sources": [
   "c_a"
  ],
  "authors": [
   "Anonymous #4471"
  ],
  "routeId": "r1",
  "lead": "L. Brandt",
  "members": [
   "X. Member"
  ],
  "leadUserId": "u_lb",
  "memberUserIds": [
   "u_x"
  ],
  "authorUserIds": [
   "u_js"
  ],
  "openedDay": 0,
  "openedBy": "T. Vogel",
  "seed": false,
  "startedDay": 1,
  "doneDay": 3,
  "doneNote": "Live on line 3",
  "stopped": null,
  "baseline": {
   "none": false,
   "metric": "Changeover time",
   "unit": "min",
   "value": 42,
   "better": "down",
   "source": "MES weekly",
   "day": 0,
   "by": "L. Brandt"
  },
  "steps": [
   {
    "id": "s2",
    "text": "Train the shift",
    "owner": null,
    "ownerUserId": null,
    "dueDay": 5,
    "column": "todo",
    "why": "",
    "note": "",
    "addedDay": 1,
    "by": "L. Brandt",
    "byUserId": "u_lb",
    "movedDay": 1,
    "startedDay": null,
    "doneDay": null,
    "external": null
   },
   {
    "id": "s1",
    "text": "Pre-stage the tools",
    "owner": null,
    "ownerUserId": null,
    "dueDay": null,
    "column": "done",
    "why": "",
    "note": "",
    "addedDay": 1,
    "by": "L. Brandt",
    "byUserId": "u_lb",
    "movedDay": 2,
    "startedDay": 2,
    "doneDay": 2,
    "external": null
   }
  ],
  "links": [],
  "sync": null,
  "measures": [
   {
    "check": 30,
    "value": 30,
    "source": "",
    "note": "",
    "day": 33,
    "by": "L. Brandt",
    "byUserId": "u_lb",
    "sourceKind": "typed",
    "sourceInfo": {
     "kind": "typed"
    },
    "impact": null,
    "confirmed": false,
    "confirmedByUserId": null,
    "confirmedDay": null,
    "verdict": "better",
    "changePct": -28.6
   }
  ],
  "checks": [
   {
    "check": 30,
    "opensDay": 33,
    "dueDay": 38,
    "measured": true,
    "late": false
   },
   {
    "check": 90,
    "opensDay": 93,
    "dueDay": 98,
    "measured": false,
    "late": false
   }
  ],
  "verdict": "better",
  "reward": null,
  "claimed": null,
  "status": "measuring",
  "closed": false,
  "rewardDue": false,
  "dueDay": 98,
  "overdue": false,
  "escalated": null,
  "history": [
   {
    "id": "r1",
    "ts": 0,
    "type": "case.decided",
    "actor": "T. Vogel",
    "actorUserId": "u_tv",
    "target": "c_a",
    "payload": {
     "answer": "yes",
     "projectId": "p_one",
     "lead": "L. Brandt",
     "leadUserId": "u_lb",
     "title": "Shorter changeover"
    },
    "day": 0
   },
   {
    "id": "r2",
    "ts": 0,
    "type": "project.baseline",
    "actor": "L. Brandt",
    "actorUserId": "u_lb",
    "target": "p_one",
    "payload": {
     "metric": "Changeover time",
     "unit": "min",
     "value": 42,
     "better": "down",
     "source": "MES weekly"
    },
    "day": 0
   },
   {
    "id": "r3",
    "ts": 0,
    "type": "project.started",
    "actor": "L. Brandt",
    "actorUserId": "u_lb",
    "target": "p_one",
    "payload": {},
    "day": 1
   },
   {
    "id": "r4",
    "ts": 0,
    "type": "project.step.added",
    "actor": "L. Brandt",
    "actorUserId": "u_lb",
    "target": "p_one",
    "payload": {
     "stepId": "s1",
     "text": "Pre-stage the tools"
    },
    "day": 1
   },
   {
    "id": "r5",
    "ts": 0,
    "type": "project.step.added",
    "actor": "L. Brandt",
    "actorUserId": "u_lb",
    "target": "p_one",
    "payload": {
     "stepId": "s2",
     "text": "Train the shift",
     "dueDay": 5
    },
    "day": 1
   },
   {
    "id": "r6",
    "ts": 0,
    "type": "project.step.moved",
    "actor": "L. Brandt",
    "actorUserId": "u_lb",
    "target": "p_one",
    "payload": {
     "stepId": "s1",
     "to": "done"
    },
    "day": 2
   },
   {
    "id": "r7",
    "ts": 0,
    "type": "project.member",
    "actor": "L. Brandt",
    "actorUserId": "u_lb",
    "target": "p_one",
    "payload": {
     "userId": "u_x",
     "name": "X. Member"
    },
    "day": 2
   },
   {
    "id": "r8",
    "ts": 0,
    "type": "project.done",
    "actor": "L. Brandt",
    "actorUserId": "u_lb",
    "target": "p_one",
    "payload": {
     "note": "Live on line 3"
    },
    "day": 3
   },
   {
    "id": "r9",
    "ts": 0,
    "type": "project.measured",
    "actor": "L. Brandt",
    "actorUserId": "u_lb",
    "target": "p_one",
    "payload": {
     "check": 30,
     "value": 30
    },
    "day": 33
   }
  ],
  "draft": false,
  "leadState": "taken",
  "leadAskedDay": null,
  "template": null,
  "invites": [],
  "sponsorUserId": null,
  "followerUserIds": [],
  "goal": null,
  "startDay": null,
  "approvalsPendingSince": null,
  "raiserNote": "",
  "deciderUserId": null,
  "doneBy": 31,
  "doneByMoves": [],
  "pausedUntil": null,
  "pauseWhy": "",
  "lastActivityDay": 2,
  "checkInWeekday": null,
  "howWeWorkNote": "",
  "leadVacatedDay": null,
  "latestUpdate": null
 },
 {
  "id": "p_two",
  "number": 2,
  "title": "Shorter changeover",
  "sources": [
   "c_b"
  ],
  "authors": [
   "Anonymous #4471"
  ],
  "routeId": "r1",
  "lead": "L. Brandt",
  "members": [],
  "leadUserId": "u_lb",
  "memberUserIds": [],
  "authorUserIds": [
   "u_js"
  ],
  "openedDay": 1,
  "openedBy": "T. Vogel",
  "seed": false,
  "startedDay": null,
  "doneDay": null,
  "doneNote": "",
  "stopped": null,
  "baseline": null,
  "steps": [],
  "links": [],
  "sync": null,
  "measures": [],
  "checks": [],
  "verdict": null,
  "reward": null,
  "claimed": null,
  "status": "planning",
  "closed": false,
  "rewardDue": false,
  "dueDay": 6,
  "overdue": true,
  "escalated": {
   "to": "T. Vogel",
   "toSeatId": "local-28",
   "toRoleId": "local-27",
   "from": "L. Brandt",
   "day": 7,
   "live": true,
   "what": "start"
  },
  "history": [
   {
    "id": "r11",
    "ts": 0,
    "type": "case.decided",
    "actor": "T. Vogel",
    "actorUserId": "u_tv",
    "target": "c_b",
    "payload": {
     "answer": "yes",
     "projectId": "p_two",
     "lead": "L. Brandt",
     "leadUserId": "u_lb",
     "title": "Shorter changeover"
    },
    "day": 1
   }
  ],
  "draft": false,
  "leadState": "taken",
  "leadAskedDay": null,
  "template": null,
  "invites": [],
  "sponsorUserId": null,
  "followerUserIds": [],
  "goal": null,
  "startDay": null,
  "approvalsPendingSince": null,
  "raiserNote": "",
  "deciderUserId": null,
  "doneBy": null,
  "doneByMoves": [],
  "pausedUntil": null,
  "pauseWhy": "",
  "lastActivityDay": null,
  "checkInWeekday": null,
  "howWeWorkNote": "",
  "leadVacatedDay": null,
  "latestUpdate": null
 }
];
