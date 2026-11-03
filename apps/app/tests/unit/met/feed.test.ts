import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCAL_SEED } from "@/features/demo";
import type { CaseEvent, CaseEventType, EventLog, EventPayload } from "@/features/cases/events";
import { latestActivity, siteFilters, sortFeed, supportSummary, unitFilters } from "@/features/cases/feed";

const SEED = LOCAL_SEED;
// H. Sander holds the Quality lead desk (route r3), M. Roth the Engineering lead desk (the deputy).
const quality = SEED.routes.find((r) => r.id === "r3")!;
const qualitySeat = SEED.seats.find((s) => s.id === quality.ownerSeatId)!;
const eng = SEED.routes.find((r) => r.id === "r2")!;
const engSeat = SEED.seats.find((s) => s.id === eng.ownerSeatId)!;

let n = 0;
const ev = (type: CaseEventType, day: number, actor: string, actorUserId: string | null, target: string, payload: EventPayload = {}): CaseEvent =>
  ({ id: "e" + n++, ts: n, day, type, actor, actorUserId, target, payload });
const logOf = (events: CaseEvent[]): EventLog => ({ events, day: Math.max(0, ...events.map((e) => e.day)) });
const raised = (id: string, day = 1) => ev("case.raised", day, "Anonymous Falcon", "demo-u-9", id, { title: "t", assigneeRoleHolderId: qualitySeat.id });

const titleOf = (roleId: string | null) => SEED.routes.find((r) => r.ownerRoleId === roleId)?.owner.role;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe("MET feed on real events", () => {
  it("a case answered yes by a desk holder gives yes with the desk's role title", () => {
    const log = logOf([raised("k1"), ev("case.decided", 4, qualitySeat.label, qualitySeat.userId, "k1", { answer: "yes" })]);
    const a = latestActivity("k1", log, SEED.seats)!;
    expect(a).toMatchObject({ kind: "yes", role: qualitySeat.roleId, label: null, day: 4 });
    expect(titleOf(a.role)).toBe("Quality lead");
  });

  it("someone who does not hold the desk keeps their event label", () => {
    const log = logOf([raised("k1"), ev("case.decided", 4, engSeat.label, engSeat.userId, "k1", { answer: "no" })]);
    expect(latestActivity("k1", log, SEED.seats)).toMatchObject({ kind: "no", role: null, label: engSeat.label });
  });

  it("a raised-only case gives raised, and the raiser's handle stays a handle", () => {
    const a = latestActivity("k1", logOf([raised("k1", 2)]), SEED.seats)!;
    expect(a).toEqual({ kind: "raised", role: null, label: "Anonymous Falcon", day: 2 });
    expect(latestActivity("nothing", logOf([raised("k1")]), SEED.seats)).toBeNull();
  });

  it("a case escalated by a clock.due deadline gives escalated with the escalation role", () => {
    const log = logOf([raised("k1"), ev("clock.due", 7, "system:clock", null, "k1", { kind: "deadline", dueDay: 6, toRoleHolderId: engSeat.id })]);
    const a = latestActivity("k1", log, SEED.seats)!;
    expect(a).toMatchObject({ kind: "escalated", role: engSeat.roleId, label: null, day: 7 });
    expect(titleOf(a.role)).toBe("Engineering lead");
  });

  it("a hand-over names where it went and moves the desk", () => {
    const log = logOf([raised("k1"), ev("case.handed", 3, qualitySeat.label, qualitySeat.userId, "k1", { to: engSeat.label, toRoleHolderId: engSeat.id }),
      ev("case.read", 5, engSeat.label, engSeat.userId, "k1")]);
    expect(latestActivity("k1", log, SEED.seats)).toMatchObject({ kind: "read", role: engSeat.roleId, label: null });
    expect(latestActivity("k1", { ...log, events: log.events.slice(0, 2) }, SEED.seats)).toMatchObject({ kind: "handed", role: engSeat.roleId });
  });

  it("the latest sort orders by lastDay", () => {
    const list = [{ id: "a", backers: 9, raisedDay: 1, comments: 0, lastDay: 2 }, { id: "b", backers: 0, raisedDay: 0, comments: 0, lastDay: 8 }, { id: "c", backers: 1, raisedDay: 3, comments: 0, lastDay: 5 }];
    expect(sortFeed(list, "latest").map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it("the site filters equal the first-level units, the unit filters the children of a site", () => {
    expect(siteFilters(SEED)).toEqual(SEED.depts.map((d) => ({ id: d.id, name: d.name })));
    const tree = { depts: [{ id: "S", name: "Werk Süd", people: 1 }, { id: "N", name: "Werk Nord", people: 1 }, { id: "S1", name: "Assembly", people: 1, parentId: "S" }, { id: "X", name: "Lost", people: 1, parentId: "gone" }] };
    expect(siteFilters(tree).map((u) => u.id)).toEqual(["S", "N", "X"]);
    expect(unitFilters(tree, "S")).toEqual([{ id: "S1", name: "Assembly" }]);
    expect(unitFilters(tree, "N")).toEqual([]);
  });

  it("5 supporters from one unit name the unit, 4 give the count", () => {
    const me = { userId: "demo-u-1", seatIds: [], roleIds: [] };
    const from = (k: number, unit: string) => Array.from({ length: k }, (_, i) => ({ userId: unit + i, name: unit + i, unit }));
    expect(supportSummary([...from(5, "Werk Nord"), ...from(2, "Werk Süd")], me)).toEqual({ kind: "unit", count: 5, unit: "Werk Nord" });
    expect(supportSummary([...from(4, "Werk Nord"), ...from(2, "Werk Süd")], me)).toEqual({ kind: "count", count: 6 });
    expect(supportSummary([], me)).toEqual({ kind: "none" });
    expect(supportSummary([{ userId: "demo-u-1", name: "Me", unit: "Werk Nord" }], me)).toEqual({ kind: "you" });
  });

  it("feedPreview.ts is gone and nothing under src imports it", () => {
    expect(existsSync(join(process.cwd(), "src/components/dashboard/team/feedPreview.ts"))).toBe(false);
    const hits = files(join(process.cwd(), "src")).filter((f) => /\.(ts|tsx)$/.test(f) && /feedPreview/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
