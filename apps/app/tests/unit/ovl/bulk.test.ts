// OVL-U1 (B1): the people side of a loaded desk (plan OVL, D3, D20, D21, D28): the triage banner, bulk pass and ask, and the desk rows of the Dashboard card.
// Fixed literal states of tests/unit/ovl/fixture.ts: the desk of role_owner has two holders (u_own, u_own2), the seat above it and the deputy desk is held by u_head.
import { expect, it } from "vitest";
import { meFor } from "@/features/auth/identity";
import { bulkEvents, deskRows, triageFor } from "@/features/overload/bulk";
import { deskLoads } from "@/features/overload/load";
import { above, NAME, raise, SEATS, stateOf } from "./fixture";

/** `n` open cases on the owner desk (two holders), raised on day 0 and looked at on day `day`. */
const loaded = (n: number, day = 3) => {
  const state = stateOf(day, Array.from({ length: n }, (_, i) => raise("c" + i, 0)));
  return { state, loads: deskLoads(state, day) };
};
const viewer = (userId: string, role = "leader") => ({ userId, role });

it("OVL bulk shows the triage banner to holders of a desk at triage", () => {
  const { loads } = loaded(20); // 20 open, two holders: 10 each
  expect(loads.find((l) => l.roleId === "role_owner")).toMatchObject({ perHolder: 10, level: "triage" });
  for (const holder of ["u_own", "u_own2"]) {
    expect(triageFor(loads, meFor(holder, SEATS)), holder).toEqual([{ roleId: "role_owner", open: 20, late: 0, level: "triage", key: "overload.inbox.triage", lateKey: null }]);
  }
  // not their desk: the seat above, another desk's holder and somebody with no seat see no banner
  for (const other of ["u_head", "u_dep", "u_ra"]) expect(triageFor(loads, meFor(other, SEATS)), other).toEqual([]);
  // below triage there is none, and at up or overflow it stays
  expect(triageFor(loaded(18).loads, meFor("u_own", SEATS))).toEqual([]);
  expect(triageFor(loaded(40).loads, meFor("u_own", SEATS))[0]).toMatchObject({ level: "up" });
  expect(triageFor(loaded(60).loads, meFor("u_own", SEATS))[0]).toMatchObject({ level: "overflow" });
  // late cases bring the banner below 10 per holder, and the banner says how many
  const late = loaded(8, 20); // due day 5 (promise), looked at on day 20: all late
  expect(triageFor(late.loads, meFor("u_own", SEATS))).toMatchObject([{ roleId: "role_owner", level: "triage", key: "overload.inbox.triage", lateKey: "overload.inbox.triageLate", late: 8 }]);
});

it("OVL bulk builds one pass per case with the one why", () => {
  const out = bulkEvents("pass", ["c1", "c2", "c3", "c2"], { why: "  Not ours: it belongs to the line lead  ", toSeatId: "s_dep", toLabel: "H. Sander" });
  expect(out).toEqual(["c1", "c2", "c3"].map((target) => ({ type: "case.handed", target, payload: { to: "H. Sander", toRoleHolderId: "s_dep", why: "Not ours: it belongs to the line lead" } })));
});

it("OVL bulk builds one ask per case with the one question", () => {
  const out = bulkEvents("ask", ["c1", "c2"], { question: " Which shift is it about? " });
  expect(out).toEqual(["c1", "c2"].map((target) => ({ type: "case.asked", target, payload: { text: "Which shift is it about?" } })));
  // each case gets its own payload: one event's change can never reach another's
  if (!Array.isArray(out)) throw new Error("expected events");
  expect(out[0].payload).not.toBe(out[1].payload);
});

it("OVL bulk refuses an empty why or question", () => {
  expect(bulkEvents("pass", ["c1"], { why: "", toSeatId: "s_dep" })).toEqual({ error: "shell.handSayWhy" });
  expect(bulkEvents("pass", ["c1"], { why: "   ", toSeatId: "s_dep" })).toEqual({ error: "shell.handSayWhy" });
  expect(bulkEvents("pass", ["c1"], { why: "A reason that is long enough" })).toEqual({ error: "shell.handPick" });
  expect(bulkEvents("ask", ["c1"], { question: "" })).toEqual({ error: "shell.typeQuestion" });
  expect(bulkEvents("ask", ["c1"], { question: "  \n " })).toEqual({ error: "shell.typeQuestion" });
});

it("OVL bulk has no bulk no", () => {
  for (const action of ["no", "decide", "yes", "discuss", ""]) {
    expect(bulkEvents(action, ["c1", "c2"], { why: "A reason that is long enough", question: "A question?", toSeatId: "s_dep" }), action).toEqual({ error: "overload.inbox.refused" });
  }
  // and nothing it builds is a decision
  const events = [bulkEvents("pass", ["c1"], { why: "A reason that is long enough", toSeatId: "s_dep" }), bulkEvents("ask", ["c1"], { question: "Why?" })].flat();
  expect(events.every((e) => "type" in e && (e.type === "case.handed" || e.type === "case.asked"))).toBe(true);
});

it("OVL bulk shows desk rows to holders, the seat above and a manager only", () => {
  // the owner desk is loaded, and a case sits on the deputy desk too (u_dep is its one holder)
  const events = [...Array.from({ length: 20 }, (_, i) => raise("o" + i, 0)), raise("d1", 0, "u_ra", "s_dep")];
  const state = stateOf(3, events);
  const loads = deskLoads(state, 3);
  const roles = (userId: string, role = "leader") => deskRows(loads, viewer(userId, role), state, above).map((r) => r.roleId);
  expect(roles("u_own")).toEqual(["role_owner"]); // a holder sees their own desk
  expect(roles("u_dep")).toEqual(["role_deputy"]);
  expect(roles("u_head")).toEqual(["role_deputy", "role_owner"]); // the seat above both, in the order of their titles (Line lead, Quality lead)
  expect(roles("u_plant", "manager")).toEqual(["role_deputy", "role_owner"]); // a company admin sees every desk
  expect(roles("u_own2", "manager")).toEqual(["role_deputy", "role_owner"]);
  // titles are the roles' titles, in the order of the title and never of a count
  expect(deskRows(loads, viewer("u_head"), state, above).map((r) => [r.title, r.open])).toEqual([["Line lead", 1], ["Quality lead", 20]]);
});

it("OVL bulk returns nothing to a member who is neither holder nor above", () => {
  const { state, loads } = loaded(40);
  expect(deskRows(loads, viewer("u_ra", "member"), state, above)).toEqual([]);
  expect(deskRows(loads, viewer("u_plant"), state, above)).toEqual([]); // a leader on another desk who is not above this one
  expect(deskRows(loads, { userId: null, role: "member" }, state, above)).toEqual([]);
  expect(deskRows([], viewer("u_head"), state, above)).toEqual([]);
});

it("OVL bulk offers the share actions only at up or overflow", () => {
  const at = (n: number, userId: string, role = "leader") => deskRows(deskLoads(loaded(n).state, 3), viewer(userId, role), loaded(n).state, above).find((r) => r.roleId === "role_owner");
  expect(at(20, "u_head")).toMatchObject({ level: "triage", canShare: false }); // triage: the holders' own business
  expect(at(40, "u_head")).toMatchObject({ level: "up", canShare: true });
  expect(at(60, "u_head")).toMatchObject({ level: "overflow", canShare: true });
  expect(at(40, "u_plant", "manager")).toMatchObject({ level: "up", canShare: true });
  expect(at(20, "u_plant", "manager")).toMatchObject({ level: "triage", canShare: false });
  // a holder of the desk itself, however loaded, may not: only the seat above and the admins share (D28)
  expect(at(40, "u_own")).toMatchObject({ level: "up", canShare: false });
  expect(at(60, "u_own2")).toMatchObject({ level: "overflow", canShare: false });
});

it("OVL bulk puts no user id or name in a row", () => {
  const { state, loads } = loaded(40);
  const rows = deskRows(loads, viewer("u_head"), state, above);
  expect(rows.length).toBeGreaterThan(0);
  const text = JSON.stringify(rows);
  for (const [id, name] of Object.entries(NAME)) { expect(text).not.toContain(id); expect(text).not.toContain(name); }
  for (const s of SEATS) expect(text).not.toContain(s.label);
  expect(Object.keys(rows[0]).sort()).toEqual(["canShare", "late", "level", "open", "perHolder", "pinned", "roleId", "title"]);
  // and a triage line carries counts only
  expect(Object.keys(triageFor(loads, meFor("u_own", SEATS))[0]).sort()).toEqual(["key", "late", "lateKey", "level", "open", "roleId"]);
});
