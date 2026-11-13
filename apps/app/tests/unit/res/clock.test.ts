// RES-E1 (B1): the reward reminder of the clock (D17), with the review's episode identity (12 Nov). Pure: state and today in, facts out.
// The project is the real reducer's (opened by a yes); the values RES-A1's reducer will set are written on it, so these tests do not wait for it.
import { describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed, type State } from "@/features/cases/reducer";
import { DEFAULT_CALENDAR, DEMO_CLOCK, type ClockSpec } from "@/features/clock";
import { dueNow, type Due, type SeatAbove } from "@/features/clock/due";
import { projectDues, REWARD_REMIND_DAYS, rewardEpisodeOf } from "@/features/clock/kinds/project";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import type { ReducedProject } from "@/features/projects/types";
import { clockDuePayload } from "@/server/scheduler/writers/shared";
import { writeProjectDue } from "@/server/scheduler/writers/project";

const WORKDAYS: ClockSpec = { mode: "workdays", calendar: DEFAULT_CALENDAR };
const seats: SeatRow[] = [
  { id: "seat_tv", roleId: "role_owner", label: "T. Vogel", userId: "u_tv", sort: 0 },
  { id: "seat_hs", roleId: "role_deputy", label: "H. Sander", userId: "u_hs", sort: 1 },
];
const routes = LOCAL_SEED.routes.map((x) => (x.id === "r1" ? { ...x, ownerSeatId: "seat_tv", ownerRoleId: "role_owner", deputySeatId: "seat_hs", deputyRoleId: "role_deputy" } : x));
const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats, clock: WORKDAYS };
const above: SeatAbove = () => null;

let n = 0;
const ev = (type: CaseEventType, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "w" + n++, ts: 0, type, actor: "L. Brandt", actorUserId: "u_lb", target: "p_one", payload, day });
const raised = ev("case.raised", { kind: "idea", title: "Idea", routeId: "r1", assignee: "T. Vogel" });
const yes = ev("case.decided", { answer: "yes", projectId: "p_one", lead: "L. Brandt", leadUserId: "u_lb", title: "P" });
const measured = ev("project.measured", { check: 30, value: 10 }, 18);
const confirmed = ev("project.measure.confirmed", { check: 30 }, 20);
const fact = (payload: EventPayload): CaseEvent => ({ ...ev("clock.due", payload), actor: "system:clock", actorUserId: null });

/** A project whose reward fell due on `rewardDueDay` (the confirmation's day), as the reducer will leave it. */
function due(patch: Partial<ReducedProject> = {}, extra: CaseEvent[] = [measured, confirmed], rules: Partial<State["rules"]> = {}, clock: ClockSpec = WORKDAYS): State {
  const s = reduce({ ...SEED, clock }, { events: [raised, yes], day: 0 });
  s.rules = { ...s.rules, ...rules };
  const p = s.projects[0];
  Object.assign(p, { status: "measured", startedDay: 5, rewardDue: true, rewardDueDay: 20, ...patch });
  p.history.push(...extra);
  return s;
}
const rewards = (s: State, today: number): Due[] => projectDues(s, today, above).filter((d) => d.kind === "reward");
const brief = (xs: Due[]) => xs.map(({ kind, dueDay, userId, toRoleHolderId, originEventId }) => ({ kind, dueDay, ...(userId ? { userId } : {}), ...(toRoleHolderId ? { toRoleHolderId } : {}), ...(originEventId ? { originEventId } : {}) }));

describe("RES clock", () => {
  it("writes one reward fact REWARD_REMIND_DAYS working days after the reward fell due: none on day 9 of 10, one on day 10", () => {
    expect(REWARD_REMIND_DAYS).toBe(10);
    const s = due();
    expect(rewards(s, 20 + 9)).toEqual([]);
    // No seat and no user: the recipients are the managers.
    expect(brief(rewards(s, 30))).toEqual([{ kind: "reward", dueDay: 30, originEventId: confirmed.id }]);
    expect(rewards(s, 30)[0].idemKey).toBe(`clk:reward:p_one:30:${confirmed.id}`);
    // A later run still names the same day, so the same key.
    expect(brief(rewards(s, 45))).toEqual([{ kind: "reward", dueDay: 30, originEventId: confirmed.id }]);
  });

  it("writes it once: a stored fact of the episode stops the next run", () => {
    const stored = due({}, [measured, confirmed, fact({ kind: "reward", dueDay: 30, originEventId: confirmed.id })]);
    expect(rewards(stored, 30)).toEqual([]);
    expect(rewards(stored, 60)).toEqual([]);
    // The scheduler stores it as a plain clock.due fact with the episode in it: no event of its own.
    const d = rewards(due(), 30)[0];
    expect(writeProjectDue(d, { state: due(), today: 30, companyId: "co" })).toBeNull();
    expect(clockDuePayload(d)).toEqual({ kind: "reward", dueDay: 30, originEventId: confirmed.id });
  });

  it("writes nothing for a reward that fell due before MOV's release day, so a live company gets no burst", () => {
    expect(rewards(due({}, undefined, { movSinceDay: 21 }), 60)).toEqual([]);
    expect(rewards(due({}, undefined, { movSinceDay: 20 }), 30)).toHaveLength(1);
  });

  it("writes nothing for a stopped or recognised project, a reward that is not due, or without a day", () => {
    expect(rewards(due({ status: "stopped" }), 60)).toEqual([]);
    expect(rewards(due({ status: "recognised", rewardDue: false, rewardDueDay: null }), 60)).toEqual([]);
    expect(rewards(due({ rewardDue: false }), 60)).toEqual([]); // paid or recorded, or the result was sent back
    expect(rewards(due({ rewardDueDay: null }), 60)).toEqual([]);
  });

  it("writes nothing in demo mode: the clock does not fire there", () => {
    expect(rewards(due({}, undefined, {}, DEMO_CLOCK), 60)).toEqual([]);
    expect(dueNow(due({}, undefined, {}, DEMO_CLOCK), 60, above).some((d) => d.kind === "reward")).toBe(false);
  });

  it("a new reward-due episode gets its own fresh reminder; the old one is no reason to stay silent", () => {
    // The first episode was reminded; a replacement measure was confirmed later, so the reward fell due again on day 40.
    const again = ev("project.measured", { check: 30, value: 8 }, 38);
    const reconfirmed = ev("project.measure.confirmed", { check: 30 }, 40);
    const s = due({ rewardDueDay: 40 }, [measured, confirmed, fact({ kind: "reward", dueDay: 30, originEventId: confirmed.id }), again, reconfirmed]);
    expect(rewardEpisodeOf(s.projects[0])).toBe(reconfirmed.id);
    expect(rewards(s, 49)).toEqual([]);
    expect(brief(rewards(s, 50))).toEqual([{ kind: "reward", dueDay: 50, originEventId: reconfirmed.id }]);
    // The same day with another episode behind it is another key.
    expect(rewards(s, 50)[0].idemKey).toBe(`clk:reward:p_one:50:${reconfirmed.id}`);
    // Once that one is stored, nothing more.
    const done = due({ rewardDueDay: 40 }, [measured, confirmed, again, reconfirmed, fact({ kind: "reward", dueDay: 50, originEventId: reconfirmed.id })]);
    expect(rewards(done, 80)).toEqual([]);
  });

  it("a replacement measure that is not confirmed yet suppresses the reminder (the reward is not due then)", () => {
    const again = ev("project.measured", { check: 30, value: 8 }, 38);
    expect(rewards(due({ rewardDue: false, rewardDueDay: null }, [measured, confirmed, again]), 60)).toEqual([]);
  });
});
