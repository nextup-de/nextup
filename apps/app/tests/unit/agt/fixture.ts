// AGT-A1: a small company for the agent's tests: three seats, one route, a project of the real reducer in workdays mode.
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventLog, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed, type State } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR, type ClockSpec } from "@/features/clock";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import type { ReducedProject, Step } from "@/features/projects/types";

export const WORKDAYS: ClockSpec = { mode: "workdays", calendar: DEFAULT_CALENDAR };
export const SEATS: SeatRow[] = [
  { id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
  { id: "seat_lb", roleId: "role_lead", label: "L. Brandt", userId: "u_lb", sort: 1 },
  { id: "seat_hs", roleId: "role_deputy", label: "H. Sander", userId: "u_hs", sort: 2 },
  { id: "seat_ci", roleId: "role_prod", label: "C. Ilg", userId: "u_ci", sort: 3 },
];
const routes = LOCAL_SEED.routes.map((x) => (x.id === "r1" ? { ...x, ownerSeatId: "seat_tv", ownerRoleId: "role_owner", deputySeatId: "seat_hs", deputyRoleId: "role_deputy" } : x));
export const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats: SEATS, clock: WORKDAYS };

const USERS: Record<string, string> = { "T. Vogel": "u_tv", "L. Brandt": "u_lb", "H. Sander": "u_hs", "C. Ilg": "u_ci", "J. Schmidt": "u_js" };
let n = 0;
/** An event: `actor` is a seat label (its user id comes with it), "system:agent" and "system:clock" have none. */
export const ev = (type: CaseEventType, actor: string, target: string | null, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "a" + n++, ts: 0, type, actor, actorUserId: USERS[actor] ?? null, target, payload, day });

export const raised = (id = "c_a") => ev("case.raised", "J. Schmidt", id, { kind: "idea", title: "Idea", body: "text", routeId: "r1", assignee: "T. Vogel" });
export const yes = (caseId = "c_a", projectId = "p_one") =>
  ev("case.decided", "T. Vogel", caseId, { answer: "yes", projectId, lead: "L. Brandt", leadUserId: "u_lb", title: "Changeover cart" });
/** A raised idea, a yes with L. Brandt leading, a baseline and the start on day 10. */
export const startedLog = (): CaseEvent[] => [
  raised(), yes(), ev("project.baseline", "L. Brandt", "p_one", { metric: "Changeover", unit: "min", value: 42, better: "down", source: "MES" }, 9),
  ev("project.started", "L. Brandt", "p_one", {}, 10),
];
export const logOf = (events: CaseEvent[], day = 0): EventLog => ({ events, day });
export const stateOf = (events: CaseEvent[], day = 0): State => reduce(SEED, logOf(events, day));
export const project = (s: State): ReducedProject => s.projects.find((p) => p.id === "p_one")!;

export const step = (id: string, patch: Partial<Step> = {}): Step =>
  ({ id, text: id, owner: null, ownerUserId: null, dueDay: null, column: "doing", why: "", note: "", addedDay: 10, by: "L. Brandt", movedDay: 10, startedDay: 10, doneDay: null, external: null, ...patch });
