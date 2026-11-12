// MOV-U2: a stalled project, a missing lead and a due weekly update reach the inbox (plan MOV, D14, D21, D28).
import { describe, expect, it } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed, type State } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR, type ClockSpec } from "@/features/clock";
import { workdayOf } from "@/features/clock/calendar";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { inboxItems, type InboxSourceInput } from "@/features/inbox";
import { projectMoveItems } from "@/features/inbox/sources/project-move";
import { projectDeskFor } from "@/features/projects/views";

const seats: SeatRow[] = [
  { id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
  { id: "seat_dep", roleId: "role_deputy", label: "H. Sander", userId: "u_hs", sort: 1 },
  { id: "seat_head", roleId: "role_head", label: "K. Head", userId: "u_head", sort: 2 },
];
const routes = LOCAL_SEED.routes.map((x) => (x.id === "r1" ? { ...x, ownerSeatId: "seat_tv", ownerRoleId: "role_owner", deputySeatId: "seat_dep", deputyRoleId: "role_deputy" } : x));
const CLOCK: ClockSpec = { mode: "workdays", calendar: DEFAULT_CALENDAR };
const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats, clock: CLOCK };
/** The working-day number of an ISO date (June 2026 has no public holiday in DE). */
const wd = (iso: string): number => workdayOf(new Date(`${iso}T12:00:00Z`), DEFAULT_CALENDAR);

const NAME: Record<string, string> = { u_tv: "T. Vogel", u_lb: "L. Brandt", u_hs: "H. Sander", u_ci: "C. Ilg", u_mr: "M. Roth", u_head: "K. Head" };
let n = 0;
const ev = (type: CaseEventType, target: string | null, payload: EventPayload, day: number, by: string | null): CaseEvent =>
  ({ id: "i" + n++, ts: 0, type, actor: by === null ? "system:clock" : NAME[by] ?? by, actorUserId: by, target, payload, day });
const P = (type: CaseEventType, payload: EventPayload = {}, day = 0, by: string | null = "u_lb") => ev(type, "p_one", payload, day, by);
const raise = (routeId: string | null = "r1") => ev("case.raised", "c_a", { kind: "idea", title: "Idea", body: "text", routeId, assignee: "T. Vogel" }, 0, "u_ci");
const yes = (more: EventPayload = {}) => ev("case.decided", "c_a", { answer: "yes", projectId: "p_one", lead: "L. Brandt", leadUserId: "u_lb", title: "Changeover", ...more }, 0, "u_tv");
const baseline = P("project.baseline", { metric: "Changeover", unit: "min", value: 42, better: "down", source: "MES" }, 0);
const stateOf = (events: CaseEvent[], day: number): State => reduce(SEED, { events, day });

/** What the person `userId` is asked, with the role they sign in with. */
const input = (state: State, userId: string, today: number, role: InboxSourceInput["role"] = "leader", flags = { projects: true, discussion: true }): InboxSourceInput =>
  ({ state, me: meFor(userId, seats), seats, today, demo: false, flags, role });
const idsFor = (state: State, userId: string, today: number, role?: InboxSourceInput["role"]) => projectMoveItems(input(state, userId, today, role)).map((i) => i.id);

describe("MOV inbox items", () => {
  describe("stalled", () => {
    const STARTED = 1;
    const base = [raise(), yes(), baseline, P("project.started", {}, STARTED), P("project.step.added", { stepId: "s1", text: "Step" }, 2)];
    const withSponsor = [...base, P("clock.due", { kind: "stalled", dueDay: 14, userId: "u_mr" }, 14, null)];
    const toSeat = [...base, P("clock.due", { kind: "stalled", dueDay: 14, toRoleHolderId: "seat_tv" }, 14, null)];

    it("the sponsor gets one stalled item to decide, due the fact's day", () => {
      const state = stateOf(withSponsor, 15);
      const [item, ...rest] = projectMoveItems(input(state, "u_mr", 15));
      expect(rest).toEqual([]);
      expect(item).toEqual({
        id: "move:stalled:p_one", ask: "decide", kind: "stalled", projectId: "p_one", title: "Changeover", href: "/projects/p_one", dueDay: 14, late: true, dueSoon: false, pinned: false, deskRoleId: null,
      });
      expect(projectMoveItems(input(state, "u_mr", 14))[0].late).toBe(false);
    });

    it("without a sponsor it is the stalled seat's desk: every holder of its role, not the lead, not a member", () => {
      const state = stateOf(toSeat, 15);
      const mine = projectMoveItems(input(state, "u_tv", 15));
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ kind: "stalled", ask: "decide", deskRoleId: "role_owner", dueDay: 14 });
      for (const other of ["u_lb", "u_ci", "u_hs", "u_head"]) expect(idsFor(state, other, 15), other).toEqual([]);
    });

    it("nobody else sees it, and it is gone once the project moved", () => {
      const state = stateOf(withSponsor, 15);
      for (const other of ["u_tv", "u_lb", "u_ci", "u_hs"]) expect(idsFor(state, other, 15), other).toEqual([]);
      const moved = stateOf([...withSponsor, P("project.step.moved", { stepId: "s1", to: "doing" }, 15)], 15);
      expect(idsFor(moved, "u_mr", 15)).toEqual([]);
    });

    it("needs the projects flag, and the inbox lists the project once for the seat's holder", () => {
      const state = stateOf(toSeat, 15);
      expect(projectMoveItems(input(state, "u_tv", 15, "leader", { projects: false, discussion: true }))).toEqual([]);
      const all = inboxItems(input(state, "u_tv", 15)).filter((i) => i.projectId === "p_one");
      expect(all.map((i) => i.kind)).toEqual(["stalled"]);
    });

    it("projectDeskFor no longer lists the stalled escalation, and still lists the lead's own move", () => {
      const state = stateOf(toSeat, 15);
      const desks = { routes: state.routes, seats: state.seats };
      const owner = meFor("u_tv", seats);
      expect(projectDeskFor(state.projects, 15, { role: "leader", userId: "u_tv", me: owner }, desks)).toEqual([]);
      const lead = meFor("u_lb", seats);
      expect(projectDeskFor(state.projects, 15, { role: "leader", userId: "u_lb", me: lead }, desks).map((d) => d.why)).toEqual(["lead"]);
      // A late start's escalation (another fact) is listed as before.
      const planning = stateOf([raise(), yes(), P("clock.due", { kind: "start", dueDay: 12, toRoleHolderId: "seat_tv" }, 13, null)], 13);
      expect(projectDeskFor(planning.projects, 13, { role: "leader", userId: "u_tv", me: owner }, { routes: planning.routes, seats: planning.seats }).map((d) => d.why)).toEqual(["escalated"]);
    });
  });

  describe("vacant", () => {
    // A draft led by L. Brandt with M. Roth as sponsor, started; L. Brandt leaves on day 6.
    const withSponsor = (...more: CaseEvent[]) => {
      const draft = yes({ draft: true });
      const invite = P("project.invited", { userId: "u_mr", role: "sponsor" }, 0, "u_lb");
      return [
        raise(), draft, P("project.lead.answered", { take: true }, 0), invite, P("project.invite.answered", { inviteId: invite.id, userId: "u_mr", take: true }, 0, "u_mr"),
        baseline, P("project.started", {}, 1), P("project.lead.vacated", { userId: "u_lb" }, 6, "system:directory"), ...more,
      ];
    };
    const fact = P("clock.due", { kind: "vacant", dueDay: 11, toRoleHolderId: "seat_tv" }, 11, null);

    it("whoever may name a new lead gets one vacant item to decide, due after VACANT_DAYS", () => {
      const state = stateOf(withSponsor(), 7);
      for (const who of ["u_mr", "u_tv", "u_hs"]) {
        const [item, ...rest] = projectMoveItems(input(state, who, 7));
        expect(rest, who).toEqual([]);
        expect(item, who).toMatchObject({ id: "move:vacant:p_one", ask: "decide", kind: "vacant", projectId: "p_one", dueDay: 11, late: false });
      }
      expect(projectMoveItems(input(state, "u_head", 7, "manager"))).toHaveLength(1);
      expect(projectMoveItems(input(state, "u_tv", 12))[0].late).toBe(true);
    });

    it("the decider and a manager see it without a sponsor or a route; a member and the raiser do not", () => {
      const state = stateOf(withSponsor().filter((e) => !e.type.startsWith("project.invite")), 7);
      expect(idsFor(state, "u_mr", 7)).toEqual([]);
      // A draft keeps the decider's id (a legacy project has none), so only the decider and a manager name the lead here.
      const noRoute = stateOf([raise(null), yes({ draft: true }), P("project.lead.answered", { take: true }, 0), baseline, P("project.started", {}, 1), P("project.lead.vacated", { userId: "u_lb" }, 6, "system:directory")], 7);
      expect(noRoute.projects[0]).toMatchObject({ routeId: null, leadUserId: null });
      expect(idsFor(noRoute, "u_tv", 7)).toEqual(["move:vacant:p_one"]); // the decider
      expect(idsFor(noRoute, "u_head", 7, "manager")).toEqual(["move:vacant:p_one"]);
      for (const other of ["u_hs", "u_ci", "u_head"]) expect(idsFor(noRoute, other, 7, "leader"), other).toEqual([]);
    });

    it("stays after the vacant fact for the same people, and ends when a lead is named", () => {
      const after = stateOf(withSponsor(fact), 12);
      expect(idsFor(after, "u_mr", 12)).toEqual(["move:vacant:p_one"]);
      expect(idsFor(after, "u_tv", 12)).toEqual(["move:vacant:p_one"]);
      expect(idsFor(after, "u_ci", 12)).toEqual([]);
      const named = stateOf(withSponsor(fact, P("project.lead.changed", { to: "C. Ilg", toUserId: "u_ci" }, 12, "u_mr")), 12);
      expect(idsFor(named, "u_mr", 12)).toEqual([]);
      expect(idsFor(named, "u_tv", 12)).toEqual([]);
    });

    it("a stopped project has none", () => {
      const state = stateOf(withSponsor(P("project.stopped", { why: "no" }, 7, "u_mr")), 8);
      expect(idsFor(state, "u_mr", 8)).toEqual([]);
    });
  });

  describe("update", () => {
    const STARTED = wd("2026-06-17"); // a Wednesday: the check-in weekday of this project
    const running = [raise(), yes(), baseline, P("project.started", {}, STARTED)];
    const CHECK_IN = wd("2026-06-24");

    it("the lead gets one update item to do their part, from the check-in day on", () => {
      const state = stateOf(running, CHECK_IN);
      const [item, ...rest] = projectMoveItems(input(state, "u_lb", CHECK_IN));
      expect(rest).toEqual([]);
      expect(item).toEqual({
        id: "move:update:p_one", ask: "part", kind: "update", projectId: "p_one", title: "Changeover", href: "/projects/p_one", dueDay: CHECK_IN + 2, late: false, dueSoon: false, pinned: false, deskRoleId: null,
      });
    });

    it("is late two working days after the check-in day", () => {
      const monday = wd("2026-06-22");
      const log = [...running, P("project.howwework", { checkInWeekday: 1 }, STARTED)];
      expect(projectMoveItems(input(stateOf(log, monday + 2), "u_lb", monday + 2))[0]).toMatchObject({ dueDay: monday + 2, late: false });
      expect(projectMoveItems(input(stateOf(log, monday + 3), "u_lb", monday + 3))[0]).toMatchObject({ dueDay: monday + 2, late: true });
    });

    it("not before the check-in day, not before the start, not for a week's update that was sent", () => {
      expect(idsFor(stateOf(running, CHECK_IN - 1), "u_lb", CHECK_IN - 1)).toEqual([]);
      expect(idsFor(stateOf([raise(), yes(), baseline], CHECK_IN), "u_lb", CHECK_IN)).toEqual([]);
      const sent = stateOf([...running, P("project.update", { text: "On track", week: CHECK_IN }, CHECK_IN)], CHECK_IN);
      expect(idsFor(sent, "u_lb", CHECK_IN)).toEqual([]);
      // The next week's check-in is due again, and an update for the week before does not answer it.
      const next = CHECK_IN + 5;
      expect(idsFor(stateOf([...running, P("project.update", { text: "On track", week: CHECK_IN }, CHECK_IN)], next), "u_lb", next)).toEqual(["move:update:p_one"]);
    });

    it("follows the weekday the lead set, and nobody but the lead gets it", () => {
      const monday = wd("2026-06-22");
      const state = stateOf([...running, P("project.howwework", { checkInWeekday: 1 }, STARTED)], monday);
      expect(idsFor(state, "u_lb", monday)).toEqual(["move:update:p_one"]);
      for (const other of ["u_tv", "u_hs", "u_ci", "u_head"]) expect(idsFor(state, other, monday, other === "u_head" ? "manager" : "leader"), other).toEqual([]);
    });

    it("a finished project has none", () => {
      const done = stateOf([...running, P("project.done", {}, STARTED + 1)], CHECK_IN);
      expect(idsFor(done, "u_lb", CHECK_IN)).toEqual([]);
    });
  });
});
