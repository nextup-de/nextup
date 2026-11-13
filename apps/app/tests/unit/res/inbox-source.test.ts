// RES-E1 (B3): the inbox items of a result that closes properly: an open help ask and a baseline that waits for a second person (D16, D19, D20).
import { describe, expect, it } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import { reduce, type ReduceSeed, type State } from "@/features/cases/reducer";
import type { CaseEvent, CaseEventType, EventPayload } from "@/features/cases/events";
import { LOCAL_SEED } from "@/features/demo";
import { PROBLEMS, PROMISE_DAYS } from "@/features/demo/seed";
import { inboxItems } from "@/features/inbox";
import { mayConfirmBaseline } from "@/features/inbox/sources/project-result";
import type { InboxItem } from "@/features/inbox/types";
import type { HelpAsk, ReducedProject } from "@/features/projects/types";

const seats: SeatRow[] = [
  { id: "s_own", roleId: "role_owner", label: "Owner", userId: "u_own", sort: 0 },
  { id: "s_dep", roleId: "role_deputy", label: "Deputy", userId: "u_dep", sort: 1 },
  { id: "s_dep2", roleId: "role_deputy", label: "Deputy Two", userId: "u_dep2", sort: 2 },
];
const routes = LOCAL_SEED.routes.map((r) => (r.id === "r1" ? { ...r, ownerRoleId: "role_owner", ownerSeatId: "s_own", deputyRoleId: "role_deputy", deputySeatId: "s_dep" } : r));
const SEED: ReduceSeed = { cases: [], ideas: [], problems: PROBLEMS, routes, promiseDays: PROMISE_DAYS, seats };

let n = 0;
const ev = (type: CaseEventType, by: string, target: string, payload: EventPayload = {}): CaseEvent => ({ id: "n" + n++, ts: 0, type, actor: by, actorUserId: by, target, payload, day: 0 });
const raised = ev("case.raised", "u_au", "c_a", { kind: "idea", title: "Idea", body: "text", routeId: "r1", assignee: "Owen" });
const yes = ev("case.decided", "u_own", "c_a", { answer: "yes", projectId: "p_one", lead: "Lena Lead", leadUserId: "u_lead", title: "Shorter changeover" });

const ask = (patch: Partial<HelpAsk> = {}): HelpAsk => ({ id: "ask1", stepId: "s1", text: "Need budget", day: 4, byUserId: "u_lead", toUserId: "u_sp", toRoleId: null, answeredDay: null, ...patch });
const baseline = { none: false, metric: "Changeover", unit: "min", value: 42, better: "down", source: "stopwatch", day: 1, by: "Lena Lead", byUserId: "u_typist", confirmed: null } as ReducedProject["baseline"];

function state(patch: Partial<ReducedProject> = {}, rewardRule = true): State {
  const s = reduce(SEED, { events: [raised, yes], day: 4 });
  s.rules = { ...s.rules, measure: true, recognition: true, reward: { kind: rewardRule ? "thanks" : "none", amount: null, sharePct: null, capEur: null } };
  const p = s.projects[0];
  Object.assign(p, { leadUserId: "u_lead", seed: false, status: "planning", baseline, sponsorUserId: null, helpAsks: [], ...patch });
  return s;
}
const itemsFor = (s: State, userId: string, role: "manager" | "leader" | "member" = "leader", projects = true): InboxItem[] =>
  inboxItems({ state: s, me: meFor(userId, seats), seats, today: s.day, demo: false, role, flags: { projects, discussion: false } } as Parameters<typeof inboxItems>[0]);
const kinds = (items: InboxItem[], kind: InboxItem["kind"]) => items.filter((i) => i.kind === kind);

describe("RES inbox", () => {
  it("lists an open help ask for the asked sponsor, due the promise after the ask, and for nobody else", () => {
    const s = state({ status: "running", sponsorUserId: "u_sp", helpAsks: [ask()] });
    const [item] = kinds(itemsFor(s, "u_sp"), "help");
    expect(item).toMatchObject({ id: "help:ask1", ask: "part", kind: "help", projectId: "p_one", href: "/projects/p_one", dueDay: 4 + PROMISE_DAYS, title: "Shorter changeover" });
    for (const [user, role] of [["u_lead", "leader"], ["u_au", "member"], ["u_dep", "leader"], ["u_m1", "manager"]] as const) expect(kinds(itemsFor(s, user, role), "help"), user).toEqual([]);
  });

  it("lists an ask for a role to every holder of it, and nothing once it is answered", () => {
    const s = state({ status: "running", helpAsks: [ask({ toUserId: null, toRoleId: "role_deputy" })] });
    for (const user of ["u_dep", "u_dep2"]) expect(kinds(itemsFor(s, user), "help")).toMatchObject([{ id: "help:ask1", deskRoleId: "role_deputy" }]);
    expect(kinds(itemsFor(s, "u_own"), "help")).toEqual([]);
    const answered = state({ status: "running", sponsorUserId: "u_sp", helpAsks: [ask({ answeredDay: 5 })] });
    expect(kinds(itemsFor(answered, "u_sp"), "help")).toEqual([]);
    // A stopped project asks for nothing.
    expect(kinds(itemsFor(state({ status: "stopped", sponsorUserId: "u_sp", helpAsks: [ask()] }), "u_sp"), "help")).toEqual([]);
  });

  it("lists a waiting baseline for the sponsor and the deputy's holders, never the lead or who typed it", () => {
    const s = state({ sponsorUserId: "u_sp" });
    expect(kinds(itemsFor(s, "u_sp"), "baseline")).toEqual([{ id: "baseline:p_one", ask: "confirm", kind: "baseline", projectId: "p_one", title: "Shorter changeover", href: "/projects/p_one", dueDay: null, late: false, dueSoon: false, pinned: false, deskRoleId: null }]);
    expect(kinds(itemsFor(s, "u_dep"), "baseline")).toHaveLength(1);
    expect(kinds(itemsFor(s, "u_dep2"), "baseline")).toHaveLength(1);
    for (const [user, role] of [["u_lead", "leader"], ["u_typist", "leader"], ["u_own", "leader"], ["u_au", "member"], ["u_m1", "manager"]] as const) expect(kinds(itemsFor(s, user, role), "baseline"), user).toEqual([]);
    // Typed by the sponsor: the sponsor is not the second person.
    expect(kinds(itemsFor(state({ sponsorUserId: "u_sp", baseline: { ...baseline!, byUserId: "u_sp" } as ReducedProject["baseline"] }), "u_sp"), "baseline")).toEqual([]);
  });

  it("asks a manager only when there is no sponsor and nobody holds the deputy role", () => {
    const empty = (s: State) => { s.seats = s.seats.filter((x) => x.roleId !== "role_deputy"); return s; };
    expect(mayConfirmBaseline(state().projects[0], state(), meFor("u_m1", seats), true)).toBe(false); // the deputy desk is held
    const noDesk = empty(state());
    expect(mayConfirmBaseline(noDesk.projects[0], noDesk, meFor("u_m1", noDesk.seats), true)).toBe(true);
    expect(mayConfirmBaseline(noDesk.projects[0], noDesk, meFor("u_m1", noDesk.seats), false)).toBe(false);
    const withSponsor = empty(state({ sponsorUserId: "u_sp" }));
    expect(mayConfirmBaseline(withSponsor.projects[0], withSponsor, meFor("u_m1", withSponsor.seats), true)).toBe(false);
  });

  it("lists no baseline once it is confirmed, once the project started, without a reward possible or without a number", () => {
    const confirmed = { ...baseline!, confirmed: { byUserId: "u_sp", day: 3 } } as ReducedProject["baseline"];
    expect(kinds(itemsFor(state({ sponsorUserId: "u_sp", baseline: confirmed }), "u_sp"), "baseline")).toEqual([]);
    expect(kinds(itemsFor(state({ sponsorUserId: "u_sp", status: "running" }), "u_sp"), "baseline")).toEqual([]);
    // No reward rule: the start needs no second person, so nothing waits.
    expect(kinds(itemsFor(state({ sponsorUserId: "u_sp" }, false), "u_sp"), "baseline")).toEqual([]);
    const none = { none: true, why: "No number", day: 1, by: "Lena Lead", byUserId: "u_typist", confirmed: null } as ReducedProject["baseline"];
    expect(kinds(itemsFor(state({ sponsorUserId: "u_sp", baseline: none }), "u_sp"), "baseline")).toEqual([]);
    expect(kinds(itemsFor(state({ sponsorUserId: "u_sp", baseline: null }), "u_sp"), "baseline")).toEqual([]);
  });

  it("needs the projects flag", () => {
    const s = state({ status: "running", sponsorUserId: "u_sp", helpAsks: [ask()] });
    expect(kinds(itemsFor(s, "u_sp", "leader", false), "help")).toEqual([]);
  });
});
