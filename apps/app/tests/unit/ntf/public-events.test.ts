import { describe, expect, it } from "vitest";
import { PublicEvent } from "@nextup/contracts/public";
import type { SeatRow } from "@/features/auth/identity";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { toPublicEvents } from "@/features/notify/public-events";

const seats: SeatRow[] = [
  { id: "s_own", roleId: "role_owner", label: "Owner Label", userId: "u_own", sort: 0 },
  { id: "s_raiser", roleId: "role_member", label: "Raiser Label", userId: "u_raiser", sort: 1 },
];
const routes = LOCAL_SEED.routes.map((r) => (r.id === "r2" ? { ...r, ownerRoleId: "role_owner", ownerSeatId: "s_own" } : r));
const seed: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats };

let n = 0;
const ev = (type: CaseEventType, actor: string, actorUserId: string | null, target: string | null, payload: EventPayload = {}): CaseEvent =>
  ({ id: "e" + n++, ts: Date.UTC(2026, 10, 2, 9), day: 0, type, actor, actorUserId, target, payload });

const raise = ev("case.raised", "Raiser Label", "u_raiser", "c_a", { kind: "problem", title: "Secret Title", routeId: "r2", assignee: "Owner Label", assigneeRoleHolderId: "s_own" });
const handed = ev("case.handed", "Owner Label", "u_own", "c_a", { to: "Somebody Else", toRoleHolderId: "s_raiser", why: "Because Bob said so" });
const answered = ev("case.answered", "Owner Label", "u_own", "c_a", { text: "Free text with a name" });
const yes = ev("case.decided", "Owner Label", "u_own", "c_a", { answer: "yes", projectId: "p_one", lead: "Lead Label", leadUserId: "u_raiser", title: "P" });
const no = ev("case.decided", "Owner Label", "u_own", "c_a", { answer: "no", reason: "Free reason" });
const started = ev("project.started", "Raiser Label", "u_raiser", "p_one");
const done = ev("project.done", "Raiser Label", "u_raiser", "p_one", { note: "Free note" });
const stopped = ev("project.stopped", "Raiser Label", "u_raiser", "p_one", { why: "Free why" });
const commented = ev("case.commented", "Raiser Label", "u_raiser", "c_a", { text: "hello" });

const state = (...events: CaseEvent[]) => reduce(seed, { events, day: 1 });
const map = (e: CaseEvent, ...log: CaseEvent[]) => toPublicEvents(e, state(raise, ...log, e), "co1");

describe("NTF public events", () => {
  it("a raise maps to case.raised with ids, the actor's role and typeVersion 1", () => {
    const [p] = map(raise);
    expect(p).toMatchObject({
      id: raise.id, type: "case.raised", typeVersion: 1, companyId: "co1", occurredAt: "2026-11-02T09:00:00.000Z",
      actor: { userId: "u_raiser", roleId: "role_member" }, subject: { kind: "case", id: "c_a" },
      data: { routeId: "r2", kind: "problem", seatId: "s_own" },
    });
  });

  it("a hand-over and an answer map to one event each", () => {
    expect(map(handed).map((p) => [p.type, p.data])).toEqual([["case.handed", { toSeatId: "s_raiser" }]]);
    expect(map(answered).map((p) => p.type)).toEqual(["case.answered"]);
  });

  it("a yes that opens a project gives two public events; a no gives one", () => {
    const yesEvents = map(yes);
    expect(yesEvents.map((p) => [p.type, p.subject])).toEqual([
      ["case.decided", { kind: "case", id: "c_a" }],
      ["project.started", { kind: "project", id: "p_one" }],
    ]);
    expect(new Set(yesEvents.map((p) => p.id)).size).toBe(2);
    expect(map(no).map((p) => [p.type, p.data])).toEqual([["case.decided", { answer: "no", projectId: null }]]);
  });

  it("project started, done and stopped map to project events", () => {
    expect(map(started, yes).map((p) => [p.type, p.subject.kind, p.typeVersion])).toEqual([["project.started", "project", 1]]);
    expect(map(done, yes, started).map((p) => p.type)).toEqual(["project.done"]);
    expect(map(stopped, yes).map((p) => p.type)).toEqual(["project.stopped"]);
  });

  it("an event with no public counterpart maps to nothing", () => {
    expect(map(commented)).toEqual([]);
  });

  it("every result parses with PublicEvent and carries no label of the seed", () => {
    const all = [
      ...map(raise), ...map(handed), ...map(answered), ...map(yes), ...map(no),
      ...map(started, yes), ...map(done, yes, started), ...map(stopped, yes),
    ];
    expect(all.length).toBe(9);
    for (const p of all) expect(() => PublicEvent.parse(p)).not.toThrow();
    const json = JSON.stringify(all);
    const labels = [
      ...seats.map((s) => s.label),
      ...LOCAL_SEED.people.flatMap((p) => [p.name]),
      ...LOCAL_SEED.routes.flatMap((r) => [r.owner.name, r.deputy]),
      "Secret Title", "Somebody Else", "Bob", "Free ", "Lead Label",
    ].filter(Boolean);
    for (const label of labels) expect(json).not.toContain(label);
  });
});
