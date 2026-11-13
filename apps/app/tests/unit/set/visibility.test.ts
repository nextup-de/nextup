// SET-F1: who sees a draft (D13) and what the raiser sees of it (D20). Projects are built from the SET-G1 types, so this
// does not wait for the reducer.
import { describe, expect, it } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed, type State } from "@/features/cases/reducer";
import { accessKeys, isPrivateIdea, type VisCtx } from "@/features/cases/visibility";
import { DEFAULT_CALENDAR } from "@/features/clock";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import type { Invite, ReducedProject } from "@/features/projects/types";
import { beingSetUpLine, isOpenDraft, mayReadDraft, raiserDraftPanel, visibleProjectsFor, type IdViewer } from "@/features/projects/views";

const seats: SeatRow[] = [
  { id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
  { id: "seat_lb", roleId: "role_lead", label: "L. Brandt", userId: "u_lb", sort: 1 },
  { id: "seat_h", roleId: "role_head", label: "K. Head", userId: "u_h", sort: 2 },
];
const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes: LOCAL_SEED.routes, promiseDays: PROMISE_DAYS, seats, clock: { mode: "workdays", calendar: DEFAULT_CALENDAR } };

let n = 0;
const ev = (type: CaseEventType, actor: string, actorUserId: string | null, target: string | null, payload: EventPayload = {}): CaseEvent =>
  ({ id: "v" + n++, ts: 0, type, actor, actorUserId, target, payload, day: 0 });
const raised = (visibility?: "private" | "everyone") =>
  ev("case.raised", "J. Schmidt", "u_js", "c_a", { kind: "idea", title: "Idea", routeId: "r1", assignee: "T. Vogel", ...(visibility ? { visibility } : {}) });
const yes = ev("case.decided", "T. Vogel", "u_tv", "c_a", { answer: "yes", projectId: "p_one", lead: "L. Brandt", leadUserId: "u_lb", title: "P", draft: true });
const invite = (id: string, userId: string, state: Invite["state"], role: Invite["role"] = "contributor"): Invite => ({ id, userId, role, state, day: 1, reason: "" });

/** One project from a yes (private or not), with the draft values SET sets on it. */
function world(patch: Partial<ReducedProject>, visibility?: "private" | "everyone"): State {
  const s = reduce(SEED, { events: [raised(visibility), yes], day: 0 });
  Object.assign(s.projects[0], { draft: true, deciderUserId: "u_tv", leadUserId: "u_lb", ...patch });
  return s;
}
const as = (userId: string | null, role: IdViewer["role"] = "member"): IdViewer => ({ role, userId });
const sees = (s: State, v: IdViewer) => visibleProjectsFor(s, v).map((p) => p.id);

describe("SET visibility", () => {
  const s = world({ invites: [invite("i1", "u_p", "pending"), invite("i2", "u_a", "accepted"), invite("i3", "u_d", "declined"), invite("i4", "u_l", "lapsed")], sponsorUserId: "u_sp", followerUserIds: ["u_f"] });

  it("a draft is listed for its decider, lead, invited people (pending or accepted), sponsor, followers and members", () => {
    for (const u of ["u_tv", "u_lb", "u_p", "u_a", "u_sp", "u_f"]) expect(sees(s, as(u)), u).toEqual(["p_one"]);
    expect(sees(world({ memberUserIds: ["u_m"] }), as("u_m"))).toEqual(["p_one"]);
  });

  it("not for another member who can open the idea, a declined or lapsed invitee, a leader or nobody", () => {
    for (const u of ["u_js", "u_other", "u_d", "u_l", null]) expect(sees(s, as(u)), String(u)).toEqual([]);
    expect(sees(s, as("u_leader", "leader"))).toEqual([]);
    // the raiser of the case is not on the draft either: they get the line and the panel, not the project
    expect(sees(s, as("u_js"))).toEqual([]);
  });

  it("managers see it unless the idea is private", () => {
    expect(sees(s, as("u_mgr", "manager"))).toEqual(["p_one"]);
    const priv = world({}, "private");
    expect(isPrivateIdea(priv.cases[0])).toBe(true);
    expect(sees(priv, as("u_mgr", "manager"))).toEqual([]);
    // ... unless they are on it
    expect(sees(world({ invites: [invite("i1", "u_mgr", "pending")] }, "private"), as("u_mgr", "manager"))).toEqual(["p_one"]);
    expect(mayReadDraft(priv.projects[0], as("u_mgr", "manager"), true)).toBe(false);
  });

  it("a legacy planning project keeps today's rule, and so does a started draft", () => {
    const legacy = world({ draft: false, deciderUserId: null, leadUserId: "u_lb", authorUserIds: ["u_js"] });
    expect(sees(legacy, as("u_js"))).toEqual(["p_one"]);
    expect(sees(legacy, as("u_leader", "leader"))).toEqual(["p_one"]);
    expect(sees(legacy, as("u_other"))).toEqual([]); // a member who is not on it, as today
    const started = world({ status: "running", authorUserIds: ["u_js"] });
    expect(isOpenDraft(started.projects[0])).toBe(false);
    expect(sees(started, as("u_js"))).toEqual(["p_one"]);
    expect(sees(started, as("u_leader", "leader"))).toEqual(["p_one"]);
  });

  it("beingSetUpLine gives the lead's role and the start day", () => {
    const p = world({ startDay: 14 }).projects[0];
    const title = (roleId: string) => ({ role_lead: "Line lead" })[roleId] ?? "";
    expect(beingSetUpLine(p, seats, title)).toEqual({ role: "Line lead", startDay: 14 });
    expect(beingSetUpLine({ ...p, startDay: null }, seats, title).startDay).toBeNull();
    expect(beingSetUpLine({ ...p, leadUserId: "u_nobody" }, seats, title).role).toBe("");
  });

  it("the raiser, not on the draft, gets its goal, done-when and brief and a comment box; nobody else does", () => {
    const goal = { goal: "Faster changeover", doneWhen: "Under 30 minutes", doneBy: 40, brief: "Why and what." };
    const p = world({ goal }).projects[0];
    expect(raiserDraftPanel(p, "u_js", "u_js")).toEqual({ show: true, goal: "Faster changeover", doneWhen: "Under 30 minutes", brief: "Why and what.", canComment: true });
    expect(raiserDraftPanel({ ...p, goal: null }, "u_js", "u_js")).toEqual({ show: true, goal: null, doneWhen: null, brief: null, canComment: true });
    for (const u of ["u_other", "u_tv", "u_lb", null]) expect(raiserDraftPanel(p, u, "u_js"), String(u)).toMatchObject({ show: false, goal: null, brief: null, canComment: false });
    // a raiser who was invited is on the draft: they see the draft itself
    expect(raiserDraftPanel({ ...p, invites: [invite("i1", "u_js", "pending")] }, "u_js", "u_js").show).toBe(false);
    // started or legacy: no panel
    expect(raiserDraftPanel({ ...p, status: "running" }, "u_js", "u_js").show).toBe(false);
    expect(raiserDraftPanel({ ...p, draft: false }, "u_js", "u_js").show).toBe(false);
  });

  it("an invited person and a follower get the case's keys; a declined or lapsed one does not", () => {
    const st = world({ invites: [invite("i1", "u_p", "pending"), invite("i2", "u_a", "accepted"), invite("i3", "u_d", "declined"), invite("i4", "u_l", "lapsed")], followerUserIds: ["u_f"] });
    const ctx: VisCtx = { seats, roles: [], projects: st.projects };
    const keys = accessKeys(st.cases[0], ctx);
    for (const u of ["u_p", "u_a", "u_f", "u_lb"]) expect(keys, u).toContain("u:" + u);
    for (const u of ["u_d", "u_l", "u_other"]) expect(keys, u).not.toContain("u:" + u);
    // a private idea stays private: the keys of the invited are added, "m" is not
    const priv = world({ invites: [invite("i1", "u_p", "pending")] }, "private");
    const k = accessKeys(priv.cases[0], { seats, roles: [], projects: priv.projects });
    expect(k).toContain("u:u_p");
    expect(k).not.toContain("m");
  });

  // D15, D22: the seat a late draft went to keeps it, so its holder reads it whatever their app role and whether or not the idea is private.
  describe("the holder of a late draft's escalated seat", () => {
    const escalated = (over: Partial<NonNullable<ReducedProject["escalated"]>> = {}): Partial<ReducedProject> => ({
      escalated: { to: "K. Head", toSeatId: "seat_h", toRoleId: "role_head", from: "L. Brandt", day: 15, live: true, what: "draft", ...over },
    });
    const holder = (role: IdViewer["role"] = "member"): IdViewer => ({ role, userId: "u_h", me: meFor("u_h", seats) });

    it("reads the draft, as a member, a leader or a manager of a private idea", () => {
      const s = world(escalated());
      expect(sees(s, holder("member"))).toEqual(["p_one"]);
      expect(sees(s, holder("leader"))).toEqual(["p_one"]);
      expect(mayReadDraft(s.projects[0], holder("member"), false)).toBe(true);
      const priv = world(escalated(), "private");
      expect(sees(priv, holder("manager"))).toEqual(["p_one"]);
      expect(sees(priv, holder("member"))).toEqual(["p_one"]);
    });

    it("does not once the escalation ended, for another kind of escalation, for another seat or without a seat", () => {
      expect(sees(world(escalated({ live: false })), holder())).toEqual([]);
      expect(sees(world(escalated({ what: "start" })), holder())).toEqual([]);
      expect(sees(world(escalated({ toSeatId: "seat_tv" })), holder())).toEqual([]);
      expect(sees(world(escalated({ toSeatId: null })), holder())).toEqual([]);
      expect(sees(world({ escalated: null }), holder())).toEqual([]);
      // the same person without their seats (a viewer built from a role and an id alone) is not the holder
      expect(sees(world(escalated()), as("u_h"))).toEqual([]);
      // someone who does not hold the seat
      expect(sees(world(escalated()), { role: "member", userId: "u_other", me: meFor("u_other", seats) })).toEqual([]);
    });

    it("reads only an open draft: a started project is as before, and the raiser's panel stays theirs", () => {
      expect(sees(world({ ...escalated(), status: "running" }), holder("member"))).toEqual([]);
      const p = world(escalated()).projects[0];
      expect(raiserDraftPanel(p, "u_h", "u_js").show).toBe(false);
    });
  });
});
