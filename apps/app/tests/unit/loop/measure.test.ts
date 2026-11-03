// LOOP-M1: a measured result counts only when confirmed by a second person; a reward falls due only on 'better'.
import { describe, expect, it } from "vitest";
import type { CaseEvent, CaseEventType, EventLog, EventPayload } from "@/features/cases/events";
import { mayAppend, type Actor } from "@/features/cases/permissions";
import { reduce, type ReduceSeed, type State } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { CASES, IDEAS, PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { readImpact, readSource } from "@/features/projects/measure-source";

const DEPUTY_ROLE = "role_deputy";
const ROUTES = LOCAL_SEED.routes.map((r) => (r.id === "r1" ? { ...r, deputyRoleId: DEPUTY_ROLE } : r));
const SEED: ReduceSeed = { cases: CASES, ideas: IDEAS, problems: PROBLEMS, routes: ROUTES, promiseDays: PROMISE_DAYS, seats: LOCAL_SEED.seats };

const UID: Record<string, string> = { "L. Brandt": "u_lb", "T. Vogel": "u_tv", "B. Hartmann": "u_bh", "C. Ilg": "u_ci", "M. Roth": "u_mr", "J. Schmidt": "u_js", "Anonymous #4471": "u_js" };
let n = 0;
const ev = (type: CaseEventType, actor: string, target: string | null, payload: EventPayload = {}, day = 0): CaseEvent =>
  ({ id: "m" + n++, ts: 0, type, actor, actorUserId: UID[actor] ?? null, target, payload, day });
const P = (type: CaseEventType, payload: EventPayload = {}, day = 0, actor = "L. Brandt") => ev(type, actor, "p_one", payload, day);
const AUTHOR = "Anonymous #4471";
const log = (day: number, ...more: CaseEvent[]): EventLog => ({
  day,
  events: [
    ev("case.raised", AUTHOR, "c_a", { kind: "idea", title: "Idea", body: "text", routeId: "r1", assignee: "T. Vogel" }),
    ev("case.decided", "T. Vogel", "c_a", { answer: "yes", projectId: "p_one", lead: "L. Brandt", leadUserId: "u_lb", title: "Shorter changeover" }),
    P("project.baseline", { metric: "Changeover time", unit: "min", value: 42, better: "down", source: "MES" }),
    P("project.started"),
    P("project.done", { note: "Live" }, 2),
    ...more,
  ],
});

const actor = (name: string, role: Actor["role"] = "leader", roleIds: string[] = []): Actor => {
  const userId = UID[name] ?? null;
  return { role, name, handle: null, userId, me: { userId, seatIds: [], roleIds } };
};
const q = (type: string, payload: Record<string, unknown> = {}) => ({ type, target: "p_one", payload });
const typed = (check: number, value: number, day: number, source: EventPayload["source"] = "MES export", extra: EventPayload = {}, by = "L. Brandt") =>
  P("project.measured", { check, value, source, ...extra }, day, by);
const confirm = (check: number, day: number, by = "B. Hartmann") => P("project.measure.confirmed", { check }, day, by);
const proj = (S: State) => S.projects[0];

describe("LOOP measure counts", () => {
  it("a better typed measure is unconfirmed and no reward is due", () => {
    const p = proj(reduce(SEED, log(92, typed(30, 30, 32), typed(90, 30, 92))));
    expect(p.measures[0]).toMatchObject({ sourceKind: "typed", confirmed: false, byUserId: "u_lb", verdict: "better" });
    expect(p.rewardDue).toBe(false);
  });

  it("an uploaded import is unverified provenance and needs confirmation", () => {
    const src = { kind: "import" as const, file: "export.csv", sha256: "ab12", rows: 12 };
    const S = reduce(SEED, log(92, typed(30, 30, 32, src), typed(90, 30, 92, src)));
    const p = proj(S);
    expect(p.measures[0]).toMatchObject({ sourceKind: "import", source: "export.csv", confirmed: false });
    expect(p.rewardDue).toBe(false);
    expect(mayAppend(actor("B. Hartmann", "manager"), q("project.measure.confirmed", { check: 90 }), S).ok).toBe(true);
  });

  it("the lead and the recorder cannot confirm; another manager can, then the reward is due", () => {
    const base = [typed(30, 30, 32), typed(90, 30, 92)];
    const S = reduce(SEED, log(92, ...base));
    expect(mayAppend(actor("L. Brandt"), q("project.measure.confirmed", { check: 90 }), S).ok).toBe(false);
    // a manager who typed it is its recorder
    const byManager = reduce(SEED, log(92, typed(30, 30, 32, "x", {}, "B. Hartmann"), typed(90, 30, 92, "x", {}, "B. Hartmann")));
    expect(mayAppend(actor("B. Hartmann", "manager"), q("project.measure.confirmed", { check: 90 }), byManager).ok).toBe(false);
    expect(mayAppend(actor("C. Ilg", "manager"), q("project.measure.confirmed", { check: 90 }), byManager).ok).toBe(true);
    const done = proj(reduce(SEED, log(93, ...base, confirm(90, 93))));
    expect(done.measures[1]).toMatchObject({ confirmed: true, confirmedByUserId: "u_bh", confirmedDay: 93 });
    expect(done.rewardDue).toBe(true);
  });

  it("a holder of the deputy role may confirm; a member may not; nothing to confirm is refused", () => {
    const S = reduce(SEED, log(92, typed(30, 30, 32), typed(90, 30, 92)));
    expect(mayAppend(actor("M. Roth", "member", [DEPUTY_ROLE]), q("project.measure.confirmed", { check: 90 }), S).ok).toBe(true);
    expect(mayAppend(actor("M. Roth", "member"), q("project.measure.confirmed", { check: 90 }), S).ok).toBe(false);
    expect(mayAppend(actor("C. Ilg", "manager"), q("project.measure.confirmed", { check: 45 }), S).ok).toBe(false);
    const after = reduce(SEED, log(93, typed(30, 30, 32), typed(90, 30, 92), confirm(90, 93)));
    expect(mayAppend(actor("C. Ilg", "manager"), q("project.measure.confirmed", { check: 90 }), after).ok).toBe(false);
  });

  it("a client-supplied system source is refused", () => {
    const S = reduce(SEED, log(32));
    const sys = { kind: "system" as const, system: "mes", ref: "r1" };
    expect(mayAppend(actor("L. Brandt"), q("project.measured", { check: 30, value: 30, source: sys }), S).ok).toBe(false);
    const forced = proj(reduce(SEED, log(32, P("project.measured", { check: 30, value: 30, source: sys }, 32))));
    expect(forced.measures).toHaveLength(0);
    expect(mayAppend(actor("L. Brandt"), q("project.measured", { check: 30, value: 30, source: { kind: "typed", note: "ok" } }), S).ok).toBe(true);
  });

  it("a confirmed same or worse latest verdict gives no reward and closes", () => {
    for (const v of [42, 60]) {
      const p = proj(reduce(SEED, log(93, typed(30, v, 32), typed(90, v, 92), confirm(90, 93))));
      expect(p.status).toBe("measured");
      expect(p.rewardDue).toBe(false);
      expect(p.closed).toBe(true);
    }
  });

  it("an old string source reads as typed with that note", () => {
    expect(readSource("MES export")).toEqual({ kind: "typed", note: "MES export" });
    expect(readSource(undefined)).toEqual({ kind: "typed" });
    const p = proj(reduce(SEED, log(32, typed(30, 30, 32, "MES export"))));
    expect(p.measures[0]).toMatchObject({ sourceKind: "typed", source: "MES export", sourceInfo: { kind: "typed", note: "MES export" } });
  });

  it("impact is kept; a negative figure is refused", () => {
    const p = proj(reduce(SEED, log(32, typed(30, 30, 32, "x", { impact: { co2KgPerYear: 1200 } }))));
    expect(p.measures[0].impact).toEqual({ co2KgPerYear: 1200 });
    expect(readImpact({ co2KgPerYear: -1 })).toBeNull();
    expect(readImpact({ bogus: 1 })).toBeNull();
    const S = reduce(SEED, log(32));
    expect(mayAppend(actor("L. Brandt"), q("project.measured", { check: 30, value: 30, impact: { co2KgPerYear: -1 } }), S).ok).toBe(false);
    expect(mayAppend(actor("L. Brandt"), q("project.measured", { check: 30, value: 30, impact: { co2KgPerYear: 1200 } }), S).ok).toBe(true);
  });
});

describe("LOOP project steps off", () => {
  it("measure off: done opens no checks, status measured, no verdict, closed", () => {
    const p = proj(reduce({ ...SEED, loop: { measure: false } }, log(2)));
    expect(p.checks).toEqual([]);
    expect(p.status).toBe("measured");
    expect(p.verdict).toBeNull();
    expect(p.rewardDue).toBe(false);
    expect(p.closed).toBe(true);
  });

  it("recognition off: a confirmed better measure gives no reward due", () => {
    const p = proj(reduce({ ...SEED, loop: { recognition: false } }, log(93, typed(30, 30, 32), typed(90, 30, 92), confirm(90, 93))));
    expect(p.status).toBe("measured");
    expect(p.verdict).toBe("better");
    expect(p.rewardDue).toBe(false);
    expect(p.closed).toBe(true);
  });
});
