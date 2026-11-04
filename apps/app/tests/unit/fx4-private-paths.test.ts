// FX4: a case whose raiser chose its audience stays inside that audience. PILOT_CHECK D3, E2, E3, E4.
import { describe, expect, it } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import { isPrivate } from "@/features/api/map";
import { appendEvent, emptyLog, type EventPayload } from "@/features/cases/events";
import { mayAppend, type Actor } from "@/features/cases/permissions";
import { reduce, type State } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { audienceOf } from "@/features/ideas/audience";
import { planNotices, type PlanCtx, type PlanEvent } from "@/features/notify/plan";

const seats: SeatRow[] = [
  { id: "s-desk", roleId: "r-desk", label: "Desk", userId: "u-desk", sort: 0 },
  { id: "s-boss", roleId: "r-boss", label: "Boss", userId: "u-boss", sort: 1 },
  { id: "s-raiser", roleId: "r-line", label: "Raiser", userId: "u-raiser", sort: 2 },
  { id: "s-mate", roleId: "r-line", label: "Mate", userId: "u-mate", sort: 3 },
];
const roles = [
  { id: "r-boss", orgUnitId: "top", reportsToId: null },
  { id: "r-desk", orgUnitId: "qa", reportsToId: "r-boss" },
  { id: "r-line", orgUnitId: "prod", reportsToId: "r-desk" },
];
const access = { roles };

function stateOf(payload: EventPayload = {}): State {
  const log = appendEvent(emptyLog(), {
    type: "case.raised", actor: "Raiser", actorUserId: "u-raiser", target: "c1",
    payload: { title: "c1", body: "b", routeId: null, assignee: "Desk", assigneeRoleHolderId: "s-desk", fromDept: "PRD", kind: "problem", ...payload },
  });
  return reduce({ ...LOCAL_SEED, seats }, log);
}
const kaseOf = (s: State) => s.cases.find((c) => c.id === "c1")!;
const actor = (userId: string, role: Actor["role"] = "member"): Actor => ({ role, name: userId, handle: null, userId, me: meFor(userId, seats) });
const comment = (a: Actor, s: State, type = "case.commented") => mayAppend(a, { type, target: "c1", payload: { text: "hi" } }, s, "en", access).ok;

describe("FX4 the API", () => {
  it("keeps a private and a custom case out, and lets the others through", () => {
    expect(isPrivate(kaseOf(stateOf({ visibility: "private" })))).toBe(true);
    expect(isPrivate(kaseOf(stateOf({ visibility: "custom", seenByUserIds: ["u-mate"] })))).toBe(true);
    expect(isPrivate(kaseOf(stateOf({ visibility: "everyone" })))).toBe(false);
    expect(isPrivate(kaseOf(stateOf()))).toBe(false);
  });
});

describe("FX4 webhooks", () => {
  const subscribed = (state: State): PlanCtx => ({
    companyId: "co", state, people: [], prefs: [], baseUrl: "https://x.example",
    company: { stage: "pilot", notifications: true, n8n: false },
    subscriptions: [{ id: "wh1", events: ["case.raised", "case.decided", "project.started"], on: true }],
  });
  const raised = (payload: EventPayload): PlanEvent => ({ id: "e1", ts: 1, type: "case.raised", actor: "Raiser", actorUserId: "u-raiser", target: "c1", payload });
  const hooks = (payload: EventPayload) => {
    const state = stateOf(payload);
    return planNotices(raised(payload), subscribed(state)).filter((d) => d.channel === "webhook");
  };

  it("send nothing for a private or a custom case", () => {
    expect(hooks({ visibility: "private" })).toEqual([]);
    expect(hooks({ visibility: "custom", seenByUserIds: ["u-mate"] })).toEqual([]);
  });

  it("still fire for a case with no such choice", () => {
    expect(hooks({ visibility: "everyone" })).toHaveLength(1);
    expect(hooks({})).toHaveLength(1);
  });
});

describe("FX4 who may comment or back a case", () => {
  const types = ["case.commented", "case.affected", "case.unaffected"];

  it.each(types)("%s is refused on a private case for someone who cannot open it", (type) => {
    const s = stateOf({ visibility: "private" });
    expect(comment(actor("u-mate"), s, type)).toBe(false);
    expect(comment(actor("u-boss", "leader"), s, type)).toBe(false);
  });

  it("is allowed for the raiser and the desk", () => {
    const s = stateOf({ visibility: "private" });
    expect(comment(actor("u-raiser"), s)).toBe(true);
    expect(comment(actor("u-desk", "leader"), s)).toBe(true);
  });

  it("follows a custom audience: the person picked yes, a third person no", () => {
    const s = stateOf({ visibility: "custom", seenByUserIds: ["u-mate"] });
    expect(comment(actor("u-mate"), s)).toBe(true);
    expect(comment(actor("u-other"), s)).toBe(false);
  });

  it("is open to everyone on an everyone case", () => {
    expect(comment(actor("u-other"), stateOf({ visibility: "everyone" }))).toBe(true);
  });

  it("with no choice, lets the raiser's leader and a manager in, and not a colleague", () => {
    const s = stateOf();
    expect(comment(actor("u-desk", "leader"), s)).toBe(true);
    expect(comment(actor("u-boss", "manager"), s)).toBe(true);
    expect(comment(actor("u-mate"), s)).toBe(false);
  });

  it("does not say whether a case it refuses exists", () => {
    const refused = mayAppend(actor("u-mate"), { type: "case.commented", target: "c1", payload: {} }, stateOf({ visibility: "private" }), "en", access);
    const missing = mayAppend(actor("u-mate"), { type: "case.commented", target: "nope", payload: {} }, stateOf({ visibility: "private" }), "en", access);
    expect(refused).toEqual(missing);
  });
});

describe("FX4 the raise page's choice", () => {
  it("sends a private or a custom choice", () => {
    expect(audienceOf({ vis: "private", visTo: [] })).toEqual({ visibility: "private" });
    expect(audienceOf({ vis: "custom", visTo: ["Mate", "Quality"] })).toEqual({ visibility: "custom", seenBy: ["Mate", "Quality"] });
  });

  it("sends no choice for Public, the default, so the raiser's leader rule stands", () => {
    expect(audienceOf({ vis: "public", visTo: [] })).toEqual({});
  });

  it("treats a custom choice with nobody picked as private, not as open", () => {
    expect(audienceOf({ vis: "custom", visTo: [] })).toEqual({ visibility: "private" });
  });
});
