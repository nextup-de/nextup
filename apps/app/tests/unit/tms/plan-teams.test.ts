import { describe, expect, it } from "vitest";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { planNotices, type PlanCtx, type PlanPerson } from "@/features/notify/plan";

const seats: SeatRow[] = [
  { id: "s_own1", roleId: "role_owner", label: "Owner One", userId: "u_o1", sort: 0 },
  { id: "s_own2", roleId: "role_owner", label: "Owner Two", userId: "u_o2", sort: 1 },
  { id: "s_dep", roleId: "role_deputy", label: "Deputy", userId: "u_dep", sort: 2 },
  { id: "s_raiser", roleId: "role_member", label: "Raiser", userId: "u_raiser", sort: 3 },
];
const routes = LOCAL_SEED.routes.map((r) =>
  r.id === "r2" ? { ...r, ownerRoleId: "role_owner", ownerSeatId: "s_own1", deputyRoleId: "role_deputy", deputySeatId: "s_dep" } : r,
);
const seed: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats };

const people: PlanPerson[] = [
  { id: "u_o1", email: "o1@x.test", locale: "en", name: "Owner One", teams: true },
  { id: "u_o2", email: null, locale: "de", name: "Owner Two", teams: true },
  { id: "u_dep", email: "dep@x.test", locale: "en", name: "Deputy" },
  { id: "u_raiser", email: "raiser@x.test", locale: "en", name: "Raiser" },
];

let n = 0;
const ev = (type: CaseEventType, actor: string, actorUserId: string | null, target: string | null, payload: EventPayload = {}): CaseEvent =>
  ({ id: "t" + n++, ts: 0, day: 0, type, actor, actorUserId, target, payload });
const raise = () =>
  ev("case.raised", "Raiser", "u_raiser", "c_a", { kind: "problem", title: "Printer broken", routeId: "r2", assignee: "Owner One", assigneeRoleHolderId: "s_own1" });

const ctx = (events: CaseEvent[], over: Partial<PlanCtx> = {}): PlanCtx => ({
  companyId: "co1", state: reduce(seed, { events, day: 1 }), people, prefs: [],
  company: { stage: "pilot", notifications: true, n8n: true }, subscriptions: [], baseUrl: "https://app.test/acme", teamsOn: true, ...over,
});
const plan = (events: CaseEvent[], over: Partial<PlanCtx> = {}) => planNotices(events[events.length - 1], ctx(events, over));
const channels = (d: { recipientUserId: string | null; channel: string }[]) => Object.fromEntries(d.map((x) => [x.recipientUserId, x.channel]));

describe("TMS planner", () => {
  it("a person with a Teams chat gets a teams row, everyone else mail, when Teams works", () => {
    const events = [ev("case.raised", "Raiser", "u_raiser", "c_a", { title: "T", routeId: "r2", assignee: "x", assigneeRoleHolderId: "s_own1" }), ev("clock.due", "system:clock", null, "c_a", { kind: "deadline", dueDay: 3, toRoleHolderId: "s_dep" })];
    const d = plan(events);
    expect(channels(d)).toEqual({ u_o1: "teams", u_o2: "teams", u_dep: "mail" });
    expect(d.find((x) => x.channel === "teams")?.address).toBeNull();
    expect(d.find((x) => x.channel === "mail")?.address).toBe("dep@x.test");
  });

  it("everyone gets mail when Teams does not work", () => {
    expect(Object.values(channels(plan([raise()], { teamsOn: false }))).every((c) => c === "mail")).toBe(true);
    expect(Object.values(channels(plan([raise()], { teamsOn: undefined }))).every((c) => c === "mail")).toBe(true);
  });

  it("a Teams person without an email gets a row; a mail person without one gets a failed one", () => {
    expect(channels(plan([raise()]))).toEqual({ u_o1: "teams", u_o2: "teams" });
    expect(channels(plan([raise()], { teamsOn: false }))).toEqual({ u_o1: "mail", u_o2: "mail" });
    expect(plan([raise()], { teamsOn: false }).find((x) => x.recipientUserId === "u_o2")).toMatchObject({ status: "failed", address: null });
  });

  it("never two rows for one notice, and the keys do not change with the channel", () => {
    const r = raise();
    const on = plan([r]);
    const off = plan([r], { teamsOn: false });
    expect(new Set(on.map((x) => x.key)).size).toBe(on.length);
    expect(on[0].key).toBe(off[0].key);
  });
});
