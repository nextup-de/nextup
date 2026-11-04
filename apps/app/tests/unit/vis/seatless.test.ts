// FX3: a directory member holds no seat. Their unit comes from their department and their leader from
// their manager, so the rule treats them like anyone else (D2, D3, D4 in PILOT_CHECK).
import { describe, expect, it } from "vitest";
import { meFor, type SeatRow } from "@/features/auth/identity";
import { appendEvent, emptyLog, type EventPayload } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { accessKeys, canOpen, membersForViewer, unitsOf, type VisCtx, type VisMember } from "@/features/cases/visibility";
import { LOCAL_SEED } from "@/features/demo";

const roles = [
  { id: "head", orgUnitId: "prod", reportsToId: "boss" },
  { id: "line", orgUnitId: "prod", reportsToId: "head" },
  { id: "boss", orgUnitId: "top", reportsToId: null },
  { id: "qual", orgUnitId: "qa", reportsToId: "boss" },
];
const seats: SeatRow[] = [
  { id: "s-head", roleId: "head", label: "Head", userId: "u-head", sort: 0 },
  { id: "s-qual", roleId: "qual", label: "Quality", userId: "u-qual", sort: 1 },
  { id: "s-seated", roleId: "line", label: "Seated", userId: "u-seated", sort: 2 },
];
const members: VisMember[] = [
  { userId: "u-managed", unitId: "prod", managerId: "u-boss" },
  { userId: "u-plain", unitId: "prod", managerId: null },
  { userId: "u-qa", unitId: "qa", managerId: null },
];
const ctx: VisCtx = { seats, roles, projects: [], members };

function raised(userId: string, payload: EventPayload = {}) {
  const log = appendEvent(emptyLog(), {
    type: "case.raised", actor: "x", actorUserId: userId, target: "c1",
    payload: { title: "c1", body: "b", routeId: null, assignee: "", fromDept: "PRD", kind: "problem", ...payload },
  });
  return reduce({ ...LOCAL_SEED, seats: [] }, log).cases.find((c) => c.id === "c1")!;
}
const keysOf = (userId: string, payload?: EventPayload) => accessKeys(raised(userId, payload), ctx);

describe("FX3 a person without a seat", () => {
  it("counts as a member of their department's unit", () => {
    expect(unitsOf(meFor("u-managed", seats), ctx)).toEqual(["prod"]);
    expect(unitsOf(meFor("u-nobody", seats), ctx)).toEqual([]);
  });

  it("keeps a seated person's units as they are", () => {
    expect(unitsOf(meFor("u-seated", seats), ctx)).toEqual(["prod"]);
    expect(unitsOf(meFor("u-qual", seats), ctx)).toEqual(["qa"]);
  });

  it("is reached by a custom audience of their unit", () => {
    const c = raised("u-seated", { visibility: "custom", seenByUnitIds: ["qa"] });
    const me = meFor("u-qa", seats);
    expect(canOpen(c, { me, role: "member", unitIds: unitsOf(me, ctx) }, ctx)).toBe(true);
  });

  it("with no choice, shows the case to their manager", () => {
    expect(keysOf("u-managed")).toContain("u:u-boss");
  });

  it("with no choice and no manager, shows the case to the head of their unit, not to anyone else's", () => {
    const keys = keysOf("u-plain");
    expect(keys).toContain("r:head");
    expect(keys).not.toContain("r:line");
    expect(keys).not.toContain("r:qual");
  });

  it("a private case stays private", () => {
    const keys = keysOf("u-managed", { visibility: "private" });
    expect(keys).not.toContain("u:u-boss");
    expect(keys).not.toContain("r:head");
  });

  it("does not change who sees a seated raiser's case", () => {
    const keys = keysOf("u-seated");
    expect(keys).toContain("r:head");
    expect(keys).not.toContain("u:u-boss");
  });

  it("ships a viewer only the rows their own view needs", () => {
    const seen = (userId: string) => membersForViewer(members, meFor(userId, seats), ctx).map((m) => m.userId).sort();
    expect(seen("u-boss")).toEqual(["u-managed"]);
    expect(seen("u-head")).toEqual(["u-plain"]);
    expect(seen("u-qa")).toEqual(["u-qa"]);
    expect(seen("u-qual")).toEqual(["u-qa"]);
  });

  it("the browser reaches the server's answer with only those rows", () => {
    const c = raised("u-managed");
    const boss = meFor("u-boss", seats);
    const bossCtx: VisCtx = { ...ctx, members: membersForViewer(members, boss, ctx) };
    expect(canOpen(c, { me: boss, role: "leader", unitIds: unitsOf(boss, bossCtx) }, bossCtx)).toBe(true);
    const other = meFor("u-head", seats);
    const otherCtx: VisCtx = { ...ctx, members: membersForViewer(members, other, ctx) };
    expect(canOpen(c, { me: other, role: "leader", unitIds: unitsOf(other, otherCtx) }, otherCtx)).toBe(false);
  });
});
