// Plan SET, SET-Y1 (B1): the payload of a yes that opens a draft (D10), and which open projects it may join.
import { describe, expect, it } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import type { CaseEvent } from "@/features/cases/events";
import { mayAppend } from "@/features/cases/permissions";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { acceptPayload, joinableProjects, RAISER_NOTE_MAX } from "@/features/projects/accept";

const seats: SeatRow[] = [
  { id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
  { id: "seat_lb", roleId: "role_lead", label: "L. Brandt", userId: "u_lb", sort: 1 },
];
const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes: LOCAL_SEED.routes, promiseDays: PROMISE_DAYS, seats, clock: { mode: "workdays", calendar: DEFAULT_CALENDAR } };
const decider = { userId: "u_tv", name: "T. Vogel" };

let n = 0;
const ev = (type: CaseEvent["type"], target: string, payload: CaseEvent["payload"], by = "u_tv", name = "T. Vogel"): CaseEvent =>
  ({ id: "y" + n++, ts: 0, type, actor: name, actorUserId: by, target, payload, day: 0 });
const raise = (id: string) => ev("case.raised", id, { kind: "idea", title: "Idea " + id, body: "text", routeId: "r1", assignee: "T. Vogel" }, "u_ci", "C. Ilg");

describe("SET accept payload", () => {
  it("is a yes that opens a draft: draft true, the case title, a new project id, the decider as lead by default", () => {
    const p = acceptPayload({ caseTitle: "Changeover cart", decider, newProjectId: "p_new" });
    expect(p).toEqual({ answer: "yes", draft: true, projectId: "p_new", lead: "T. Vogel", leadUserId: "u_tv", title: "Changeover cart" });
    // an id is minted when none is given, and is a project id the rules take
    const minted = acceptPayload({ caseTitle: "X", decider });
    expect(minted.projectId).toMatch(/^p_[A-Za-z0-9]+$/);
    expect(acceptPayload({ caseTitle: "X", decider }).projectId).not.toBe(minted.projectId);
  });

  it("names the person who sets it up, by user id, with the label", () => {
    const p = acceptPayload({ caseTitle: "X", decider, lead: { userId: "u_lb", name: "L. Brandt" }, newProjectId: "p_new" });
    expect(p).toMatchObject({ lead: "L. Brandt", leadUserId: "u_lb", draft: true });
    // a lead without a user id (a seed seat nobody holds) carries only the label
    expect(acceptPayload({ caseTitle: "X", decider, lead: { userId: null, name: "Seed Lead" }, newProjectId: "p" })).not.toHaveProperty("leadUserId");
  });

  it("joins the chosen open project instead of a new id, and carries the raiser line trimmed", () => {
    const p = acceptPayload({ caseTitle: "X", decider, join: "p_open", raiserNote: "  Thanks, please lead it  ", newProjectId: "p_new" });
    expect(p).toMatchObject({ projectId: "p_open", raiserNote: "Thanks, please lead it", draft: true });
    expect(acceptPayload({ caseTitle: "X", decider, raiserNote: "   ", newProjectId: "p" })).not.toHaveProperty("raiserNote");
    expect(String(acceptPayload({ caseTitle: "X", decider, raiserNote: "a".repeat(500), newProjectId: "p" }).raiserNote).length).toBe(RAISER_NOTE_MAX);
  });

  it("is a yes the rules take, and the reducer opens a draft from it", () => {
    const s0 = reduce(SEED, { events: [raise("c_a")], day: 0 });
    const payload = acceptPayload({ caseTitle: "Idea c_a", decider, lead: { userId: "u_lb", name: "L. Brandt" }, raiserNote: "Please lead it", newProjectId: "p_one" });
    const actor = { role: "manager" as const, userId: "u_tv", me: meFor("u_tv", seats), name: "T. Vogel", handle: "" };
    expect(mayAppend(actor, { type: "case.decided", target: "c_a", payload }, s0)).toEqual({ ok: true }); // a manager decides anywhere: the yes payload itself is what is under test
    const s = reduce(SEED, { events: [raise("c_a"), ev("case.decided", "c_a", payload)], day: 0 });
    expect(s.projects[0]).toMatchObject({ id: "p_one", draft: true, title: "Idea c_a", leadUserId: "u_lb", leadState: "pending", deciderUserId: "u_tv", raiserNote: "Please lead it" });
  });

  it("offers to join only open projects the decider leads or is on the team of", () => {
    const events = [raise("c_a"), raise("c_b"), raise("c_c"), raise("c_d"),
      ev("case.decided", "c_a", acceptPayload({ caseTitle: "A", decider, newProjectId: "p_mine" })),
      ev("case.decided", "c_b", acceptPayload({ caseTitle: "B", decider, lead: { userId: "u_lb", name: "L. Brandt" }, newProjectId: "p_theirs" })),
      ev("case.decided", "c_c", acceptPayload({ caseTitle: "C", decider: { userId: "u_lb", name: "L. Brandt" }, newProjectId: "p_stopped" }), "u_lb", "L. Brandt"),
      ev("project.stopped", "p_stopped", { why: "no" }, "u_lb", "L. Brandt"),
      ev("project.member", "p_theirs", { userId: "u_tv", name: "T. Vogel", on: true }, "u_lb", "L. Brandt")];
    const s = reduce(SEED, { events, day: 0 });
    // u_tv decided p_mine and leads it; p_theirs is led by u_lb and u_tv is added to its team
    const mine = joinableProjects(s.projects, "u_tv", false).map((p) => p.id);
    expect(mine).toContain("p_mine");
    expect(mine).not.toContain("p_stopped");
    expect(joinableProjects(s.projects, "u_lb", false).map((p) => p.id)).toEqual(expect.arrayContaining(["p_theirs"]));
    expect(joinableProjects(s.projects, "u_lb", false).map((p) => p.id)).not.toContain("p_mine");
    expect(joinableProjects(s.projects, null)).toEqual([]);
  });
});
