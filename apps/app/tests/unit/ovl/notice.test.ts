// OVL-N1 (B1): who is told when someone is away, when a desk carries too much, when a cover is appointed and when it is over, and when a seat has no holder
// (plan OVL, D3, D22, D30). The loop notices are asked directly (`loopNotices`, what `loopMails` sends) and through the composed planner for the switches.
// Literal States, no database. Flat tests (D32).
import { expect, it } from "vitest";
import type { CaseEvent } from "@/features/cases/events";
import type { State } from "@/features/cases/reducer";
import { loopMails, loopNotices, type NoticePerson } from "@/features/loop/notice";
import { isDuty } from "@/features/notify/channels";
import { gateOf, prefOf } from "@/features/notify/gate";
import { followsTemplate } from "@/features/notify/digest";
import { planNotices, type PlanCtx, type PlanPerson } from "@/features/notify/plan";
import { ev, raise, ROLES, SEATS, stateOf } from "./fixture";

const NAMES: Record<string, string> = { u_own: "T. Vogel", u_own2: "N. Keller", u_dep: "H. Sander", u_head: "K. Head", u_head2: "P. Boss", u_plant: "P. Plant", u_adm: "Ada Admin", u_adm2: "Ben Admin", u_x: "X. Alone" };
const ADMINS = ["u_adm", "u_adm2"];
const people: PlanPerson[] = Object.entries(NAMES).map(([id, name]) => ({ id, name, locale: "en", email: `${id}@x.test`, manager: ADMINS.includes(id) }));
const noticePeople: NoticePerson[] = people.map((p) => ({ id: p.id, name: p.name ?? "", email: p.email, manager: p.manager }));
const BASE = "https://app.test/acme";
const away = (by: string, userId: string, from: number, to: number, setBy: string = by) => ({ ...ev("person.away", by, null, { userId, from, to, awayId: "away1", setBy }, from) });
const overloaded = (level: 20 | 30, day = 5) => ev("desk.overloaded", null, "role_owner", { roleId: "role_owner", level, perHolder: level + 1, holders: 2 }, day);
const told = (last: CaseEvent, state: State): Record<string, { subject: string; text: string }> =>
  Object.fromEntries(loopNotices({ ev: last, state, people: noticePeople, baseUrl: BASE }).map((n) => [n.userId, { subject: n.subject, text: n.text }]));
const who = (m: Record<string, unknown>) => Object.keys(m).sort();
const SOLE = SEATS.filter((s) => s.id !== "s_own2");

it("OVL notices tells the person who set their away span", () => {
  const set = away("u_head", "u_own", 3, 8);
  const state = stateOf(5, [set]);
  const m = told(set, state);
  expect(m.u_own?.subject).toBe("You have been set away");
  expect(m.u_own?.text).toContain("K. Head set you away");
  expect(m.u_own?.text).toMatch(/\d{2}\/\d{2}\/\d{4}/); // the dates, not day numbers
  // The one who set it is not told, and neither is the person when they set their own absence.
  expect(m.u_head).toBeUndefined();
  const own = away("u_own", "u_own", 3, 8);
  expect(told(own, stateOf(5, [own])).u_own).toBeUndefined();
  // In German, in the reader's language and layout.
  const german = loopMails({ ev: set, state, people: noticePeople.map((p) => ({ ...p, email: p.email ?? "" })), baseUrl: BASE }, "de").find((x) => x.to === "u_own@x.test");
  expect(german?.subject).toBe("Sie wurden abwesend gesetzt");
  expect(german?.text).toMatch(/\d{2}\.\d{2}\.\d{4}/);
});

it("OVL notices tells the holders of each cover seat", () => {
  // u_x holds a seat of a role alone, next to u_own who holds the owner desk alone; with the deputy present the owner's cases go there, the other seat has
  // nobody to cover on its role and nobody in the deputy role of a route, so its cover is the seat above.
  const roles = [...ROLES, { id: "role_x", orgUnitId: "u", reportsToId: "role_head", title: "Gauge keeper" }];
  const seats = [...SOLE, { id: "s_x", roleId: "role_x", label: "X. Alone", userId: "u_own", sort: 9 }];
  const set = away("u_own", "u_own", 3, 8);
  const state = stateOf(5, [set], { seats, roles });
  const m = told(set, state);
  // The owner desk's cover is the deputy desk, the other seat's cover is the seat above (the two heads).
  expect(who(m)).toEqual(["u_dep", "u_head", "u_head2"]);
  expect(m.u_dep.subject).toBe("You answer for a colleague's seat");
  expect(m.u_dep.text).toContain("the seat Quality lead");
  expect(m.u_head.text).toContain("the seat Gauge keeper");
  // The person is not told that they are covered, and a seat with another holder has no cover notice at all.
  expect(m.u_own).toBeUndefined();
  const two = away("u_own", "u_own", 3, 8);
  expect(who(told(two, stateOf(5, [two])))).toEqual([]);
  // Nobody to cover: nobody is told.
  const alone = stateOf(5, [set, away("u_dep", "u_dep", 3, 8), away("u_head", "u_head", 3, 8), away("u_head2", "u_head2", 3, 8)], { seats: SOLE });
  expect(who(told(set, alone))).toEqual([]);
});

it("OVL notices tells the seat above at 20", () => {
  const event = overloaded(20);
  const state = stateOf(5, [event]);
  const m = told(event, state);
  expect(who(m)).toEqual(["u_head", "u_head2"]); // the holders of the seat above, never the desk itself or the deputy
  expect(m.u_head.subject).toBe("A desk below you is loaded: Quality lead");
  expect(m.u_head.text).toContain("2 present colleagues");
  expect(m.u_head.text).not.toMatch(/T\. Vogel|N\. Keller/); // the desk, never its people
});

it("OVL notices tells the seat above and the deputy holders at 30", () => {
  const event = overloaded(30);
  const state = stateOf(5, [event]);
  const m = told(event, state);
  expect(who(m)).toEqual(["u_dep", "u_head", "u_head2"]);
  expect(m.u_dep.subject).toBe("New cases for Quality lead now come to Line lead");
  expect(m.u_dep.text).toContain("until it eases");
  expect(m.u_head.subject).toBe("A desk below you is loaded: Quality lead");
  // A deputy desk that is itself full takes nothing: its holders are not told that cases come to them.
  const full = stateOf(5, [event, ...Array.from({ length: 6 }, (_, i) => raise(`d${i}`, 0, "u_ra", "s_dep"))], {}, { overloadAt: { triage: 2, up: 4, overflow: 6, late: 9 } });
  expect(who(told(event, full))).toEqual(["u_head", "u_head2"]);
});

it("OVL notices tells the cover seat of desk.covered", () => {
  const covered = ev("desk.covered", "u_head", "role_owner", { roleId: "role_owner", seatId: "s_plant" }, 6);
  const state = stateOf(6, [overloaded(30, 5), covered]);
  const m = told(covered, state);
  expect(who(m)).toEqual(["u_plant"]); // the one who appointed it is not told
  expect(m.u_plant.subject).toBe("You cover the desk Quality lead");
  expect(m.u_plant.text).toContain("Plant manager");
});

it("OVL notices tells the same people once when the desk is cleared", () => {
  const covered = ev("desk.covered", "u_head", "role_owner", { roleId: "role_owner", seatId: "s_plant" }, 6);
  const cleared = ev("desk.cleared", null, "role_owner", { roleId: "role_owner" }, 9);
  const state = stateOf(9, [overloaded(30, 5), covered, cleared]);
  const list = loopNotices({ ev: cleared, state, people: noticePeople, baseUrl: BASE });
  // The seat above, the desk the overflow went to and the cover, each once.
  expect(list.map((n) => n.userId).sort()).toEqual(["u_dep", "u_head", "u_head2", "u_plant"]);
  expect(new Set(list.map((n) => n.userId)).size).toBe(list.length);
  expect(list.every((n) => n.subject === "The desk Quality lead is eased")).toBe(true);
  // An episode at 20 without a cover told only the seat above, and clears only for them.
  const small = stateOf(9, [overloaded(20, 5), ev("desk.cleared", null, "role_owner", { roleId: "role_owner" }, 9)]);
  expect(who(told(ev("desk.cleared", null, "role_owner", { roleId: "role_owner" }, 9), small))).toEqual(["u_head", "u_head2"]);
});

it("OVL notices tells the company admins of a vacant seat as a duty", () => {
  const vacant = ev("org.seat.vacant", null, "s_own", { seatId: "s_own", roleId: "role_owner", userId: "u_own" }, 7);
  vacant.actor = "system:directory";
  const state = stateOf(7, [vacant], { seats: SEATS.map((s) => (s.id === "s_own" ? { ...s, userId: null } : s)) });
  const m = told(vacant, state);
  expect(who(m)).toEqual(ADMINS);
  expect(m.u_adm.subject).toBe("A seat has no holder: Quality lead");
  expect(m.u_adm.text).toContain(`${BASE}/settings/org`);
  expect(m.u_head).toBeUndefined();
  // A duty notice: a person's switch, the company's switch and "everything off" do not stop it; a sandbox sends no mail (as every notice).
  expect(isDuty("loop.org.seat.vacant")).toBe(true);
  const off = prefOf([{ userId: "u_adm", template: "*", on: false }, { userId: "u_adm", template: "loop.case.decided", on: false }], "u_adm", "loop.org.seat.vacant", followsTemplate("loop.org.seat.vacant"));
  expect(gateOf({ stage: "pilot", notifications: false, n8n: false }, "mail", "loop.org.seat.vacant", off)).toEqual({ send: true });
  expect(gateOf({ stage: "sandbox", notifications: true, n8n: false }, "mail", "loop.org.seat.vacant", off)).toEqual({ send: false, reason: "sandbox" });
});

it("OVL notices lets the loop switch of a person silence the overload mails", () => {
  const company = { stage: "pilot", notifications: true, n8n: false };
  const ctx = (state: State, over: Partial<PlanCtx> = {}): PlanCtx => ({ companyId: "co1", state, people, prefs: [], company, subscriptions: [], baseUrl: BASE, noticeChannels: { loop: "mail" }, ...over });
  const mailsOf = (e: CaseEvent, state: State, over: Partial<PlanCtx> = {}) => planNotices(e, ctx(state, over)).filter((d) => d.channel === "mail");
  const event = overloaded(20);
  const state = stateOf(5, [event]);
  const off = [{ userId: "u_head", template: "loop.case.decided", on: false }];
  const rows = mailsOf(event, state, { prefs: off });
  expect(rows.map((d) => [d.recipientUserId, d.template, d.status, d.lastError]).sort()).toEqual([
    ["u_head", "loop.desk.overloaded", "skipped", "opted out"], ["u_head2", "loop.desk.overloaded", "pending", null],
  ]);
  // The same switch covers away, covered and cleared.
  const set = away("u_head", "u_own", 3, 8);
  expect(mailsOf(set, stateOf(5, [set]), { prefs: [{ userId: "u_own", template: "loop.case.decided", on: false }] }).map((d) => [d.template, d.status])).toEqual([["loop.person.away", "skipped"]]);
  // The vacant seat is a duty: the admin who switched the loop group off still gets it.
  const vacant = ev("org.seat.vacant", null, "s_own", { seatId: "s_own", roleId: "role_owner", userId: "u_own" }, 7);
  const vacantRows = mailsOf(vacant, stateOf(7, [vacant]), { prefs: [{ userId: "u_adm", template: "loop.case.decided", on: false }, { userId: "u_adm", template: "*", on: false }] });
  expect(vacantRows.map((d) => [d.recipientUserId, d.template, d.status]).sort()).toEqual([["u_adm", "loop.org.seat.vacant", "pending"], ["u_adm2", "loop.org.seat.vacant", "pending"]]);
});

it("OVL notices names no reason and lists no people by count", () => {
  const covered = ev("desk.covered", "u_head", "role_owner", { roleId: "role_owner", seatId: "s_plant" }, 6);
  const cleared = ev("desk.cleared", null, "role_owner", { roleId: "role_owner" }, 9);
  const vacant = ev("org.seat.vacant", null, "s_own", { seatId: "s_own", roleId: "role_owner", userId: "u_own" }, 7);
  const set = away("u_head", "u_own", 3, 8);
  const own = stateOf(5, [set, overloaded(30), covered, cleared, vacant]);
  const cases: [CaseEvent, State][] = [
    [set, stateOf(5, [set], { seats: SOLE })], [overloaded(20), stateOf(5, [overloaded(20)])], [overloaded(30), stateOf(5, [overloaded(30)])],
    [covered, stateOf(6, [overloaded(30, 5), covered])], [cleared, stateOf(9, [overloaded(30, 5), covered, cleared])], [vacant, own],
  ];
  const all = cases.flatMap(([e, s]) => loopNotices({ ev: e, state: s, people: noticePeople, baseUrl: BASE }));
  expect(all.length).toBeGreaterThan(8);
  for (const n of all) {
    // No reason of an absence, no comparison or ranking, and no person named as part of a desk's load.
    expect(n.text, n.subject).not.toMatch(/\b(reason|because|why|ranking|ranked|slowest|fastest|worst|best|most|least)\b/i);
    expect(n.text, n.subject).not.toMatch(/sick|holiday|vacation|illness|leave of/i);
  }
  // A desk's load is a count of open items for a number of colleagues; the mails to the seat above name no colleague of that desk.
  for (const n of loopNotices({ ev: overloaded(20), state: stateOf(5, [overloaded(20)]), people: noticePeople, baseUrl: BASE })) {
    expect(n.text).not.toMatch(/T\. Vogel|N\. Keller|u_own/);
  }
});
