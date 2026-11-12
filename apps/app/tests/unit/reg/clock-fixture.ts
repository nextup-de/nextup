// REG-B1: fixed states for dueNow (workdays mode), written as literals. Never built with reduce() or from a seed, so a task
// that changes the reducer after this one cannot change the golden (REG/D5). Only the fields dueNow reads are set.
import type { SeatRow } from "@/features/auth/identity";
import type { State } from "@/features/cases/reducer";
import type { CaseEvent } from "@/features/cases/events";
import { DEFAULT_CALENDAR, DEMO_CLOCK } from "@/features/clock";
import type { SeatAbove } from "@/features/clock/due";

export const TODAY = 20;

export const SEATS: SeatRow[] = [
  { id: "seat_owner", roleId: "role_owner", label: "O. Owner", userId: "u_owner", sort: 0 },
  { id: "seat_dep", roleId: "role_dep", label: "D. Deputy", userId: "u_dep", sort: 1 },
  { id: "seat_vac", roleId: "role_vac", label: "V. Vacant", userId: null, sort: 2 },
  { id: "seat_lead", roleId: "role_lead", label: "L. Lead", userId: "u_lead", sort: 3 },
  { id: "seat_up", roleId: "role_up", label: "U. Up", userId: "u_up", sort: 4 },
  { id: "seat_exec", roleId: "role_exec", label: "E. Exec", userId: "u_exec", sort: 5 },
];

const ROUTES = [
  { id: "r1", type: "t", keys: [], owner: { name: "O. Owner", role: "Owner" }, deputy: "D. Deputy", buddy: "", wait: "", ownerRoleId: "role_owner", ownerSeatId: "seat_owner", deputyRoleId: "role_dep", deputySeatId: "seat_dep" },
  { id: "r2", type: "t", keys: [], owner: { name: "V. Vacant", role: "Vacant" }, deputy: "D. Deputy", buddy: "", wait: "", ownerRoleId: "role_vac", ownerSeatId: "seat_vac", deputyRoleId: "role_dep", deputySeatId: "seat_dep" },
];

/** The seat above a role, as the knowledge tables say it: a literal map, nobody above the top. */
const UP: Record<string, string> = { role_owner: "seat_up", role_vac: "seat_exec", role_lead: "seat_up", role_dep: "seat_owner" };
export const above: SeatAbove = (roleId, skip) => (skip.includes(roleId) ? null : UP[roleId] ?? null);

let n = 0;
const event = (type: string, actor: string, actorUserId: string | null, target: string, payload: Record<string, unknown>, day = 0): CaseEvent =>
  ({ id: "f" + n++, ts: 0, type, actor, actorUserId, target, payload, day }) as CaseEvent;
const fact = (target: string, payload: Record<string, unknown>) => event("clock.due", "system:clock", null, target, payload);

const yes = (target: string, id: string, leadUserId: string): CaseEvent =>
  ({ ...event("case.decided", "T. Decider", "u_dec", "c_" + target, { answer: "yes", projectId: target, lead: "L. Lead", leadUserId, draft: true }), id });

const rules = (deadlineHandover: boolean, escalationDays: number) => ({ deadlineHandover, escalationDays });

type Lit = Record<string, unknown>;
const kase = (c: Lit): Lit => ({ open: true, status: "open", route: ROUTES[0], assigneeSeatId: "seat_owner", assigneeRoleId: "role_owner", discussion: null, question: null, handed: [], raisedDay: 1, history: [], ...c });
const project = (p: Lit): Lit => ({
  status: "planning", draft: false, routeId: "r1", leadUserId: "u_lead", dueDay: null, checks: [], measures: [], stopped: null, history: [],
  leadState: "taken", leadAskedDay: null, invites: [], startDay: null, deciderUserId: "u_dec", ...p,
});
const state = (mode: "workdays" | "demo", r: ReturnType<typeof rules>, cases: Lit[], projects: Lit[]): State =>
  ({ day: TODAY, cases, projects, ideas: [], problems: [], ledger: {}, rules: r, seats: SEATS, routes: ROUTES, clock: mode === "workdays" ? { mode, calendar: DEFAULT_CALENDAR } : DEMO_CLOCK }) as unknown as State;

const dl = (id: string, dueDay: number) => fact(id, { kind: "deadline", dueDay, toRoleHolderId: "seat_dep" });

export type Fixture = { name: string; state: State; today: number };

export const FIXTURES: Fixture[] = [
  {
    // Every case kind in one state, then every project kind: the order across cases and projects shows.
    name: "all kinds, handover on",
    today: TODAY,
    state: state("workdays", rules(true, 0), [
      kase({ id: "c_deadline", dueDay: 10 }), // deadline to the deputy's seat
      kase({ id: "c_deadline_vacant", dueDay: 11, route: ROUTES[1], assigneeSeatId: "seat_dep", assigneeRoleId: "role_dep" }), // the owner's role has nobody on it
      kase({ id: "c_checkin", dueDay: 12, status: "discussion", discussion: { ready: false } }),
      kase({ id: "c_handover", dueDay: 9, history: [dl("c_handover", 9)] }), // the deadline handover, a run after its fact
      kase({ id: "c_vacant_desk", dueDay: 30, route: ROUTES[1], assigneeSeatId: "seat_vac", assigneeRoleId: "role_vac" }), // a desk nobody sits at
      kase({ id: "c_triage", dueDay: 30, route: null, raisedDay: 18 }),
      kase({ id: "c_question", dueDay: 30, open: false, status: "asked", question: { day: 16, answer: null } }),
      kase({ id: "c_unanswered", dueDay: 30, open: false, status: "asked", question: { day: 10, answer: null } }),
      kase({ id: "c_done", dueDay: 3, open: false }), // closed: nothing
    ], [
      project({ id: "p_start", status: "planning", dueDay: 12 }), // a legacy project past its start day
      project({ id: "p_measure", status: "measuring", checks: [{ check: 1, dueDay: 15, measured: false }, { check: 2, dueDay: 25, measured: false }] }),
      project({ id: "p_confirm", status: "measured", measures: [{ check: 1, day: 5, confirmed: false, sourceKind: "typed", byUserId: "u_lead" }] }), // at the desk and above
      project({ id: "p_lead_lapse", draft: true, leadState: "pending", leadAskedDay: 15, leadUserId: "u_lead", history: [yes("p_lead_lapse", "y_lapse", "u_lead")] }),
      project({ id: "p_lead_remind", draft: true, leadState: "pending", leadAskedDay: 17, leadUserId: "u_lead", history: [yes("p_lead_remind", "y_remind", "u_lead")] }),
      project({
        // two roles for one user: one reminder, one lapse
        id: "p_invites", draft: true, status: "running", startDay: null,
        invites: [
          { id: "inv_sponsor", userId: "u_x", role: "sponsor", state: "pending", day: 17, reason: "" },
          { id: "inv_contrib", userId: "u_x", role: "contributor", state: "pending", day: 14, reason: "" },
          { id: "inv_done", userId: "u_y", role: "member", state: "accepted", day: 10, reason: "" },
        ],
        history: [yes("p_invites", "y_inv", "u_lead")],
      }),
      project({ id: "p_draft", draft: true, leadState: "taken", startDay: 16, history: [yes("p_draft", "y_draft", "u_lead")] }), // start day, and check 3
    ]),
  },
  {
    name: "second level off, deadline handover off: the escalation fact",
    today: TODAY,
    state: state("workdays", rules(false, 3), [kase({ id: "c_esc", dueDay: 5, history: [dl("c_esc", 5)] })], []),
  },
  {
    name: "second level: its handover a run after the fact",
    today: TODAY,
    state: state("workdays", rules(false, 3), [
      kase({ id: "c_esc_handover", dueDay: 5, history: [dl("c_esc_handover", 5), fact("c_esc_handover", { kind: "escalation", dueDay: 5, toRoleHolderId: "seat_up" })] }),
    ], []),
  },
  {
    name: "reminders already stored: only the second draft fact is left",
    today: TODAY,
    state: state("workdays", rules(true, 0), [
      kase({ id: "c_stored", dueDay: 10, history: [dl("c_stored", 10), fact("c_stored", { kind: "escalation", dueDay: 10 })], status: "answered", open: false }),
    ], [
      project({ id: "p_lead_stored", draft: true, leadState: "pending", leadAskedDay: 17, leadUserId: "u_lead", history: [yes("p_lead_stored", "y_s1", "u_lead"), fact("p_lead_stored", { kind: "lead", dueDay: 19, userId: "u_lead", askId: "y_s1" })] }),
      project({ id: "p_draft_stored", draft: true, leadState: "taken", startDay: 16, history: [yes("p_draft_stored", "y_s2", "u_lead"), fact("p_draft_stored", { kind: "draft", dueDay: 16, toRoleHolderId: "seat_up" })] }),
    ]),
  },
  {
    name: "demo mode: nothing",
    today: TODAY,
    state: state("demo", rules(true, 3), [kase({ id: "c_demo", dueDay: 3 })], [project({ id: "p_demo", dueDay: 3 })]),
  },
];
