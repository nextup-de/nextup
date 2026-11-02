import { describe, expect, it } from "vitest";
import { appendEvent, emptyLog } from "@/features/cases/events";
import { logFromRows } from "@/features/cases/persist";
import { contentOnly } from "@/features/demo/content";
import { EMPTY_SEED } from "@/features/demo";
import { parseSeed } from "@/features/demo/parse";
import { SEED } from "@/features/demo/seed";
import { DEMO_GOALS, DEMO_RULES } from "@/features/demo/structure";
import { rowsFromSeed, structureSeed } from "@/features/knowledge";

const counter = () => { let n = 0; return () => "id" + ++n; };
const stored = [{ id: "x", roleId: "y", label: "z", userId: null, sort: 0 }];

describe("IDN seats in the seed", () => {
  const rows = rowsFromSeed(SEED, DEMO_GOALS, counter());
  const s = structureSeed(EMPTY_SEED, rows, DEMO_RULES);

  it("has one seat per holder and route ids that point at the right seats", () => {
    expect(s.seats).toHaveLength(rows.holders.length);
    const r1 = s.routes.find((r) => r.id === "r1")!;
    const rule = rows.rules.find((r) => r.key === "r1")!;
    expect(r1.ownerRoleId).toBe(rule.ownerRoleId);
    expect(r1.deputyRoleId).toBe(rule.deputyRoleId);
    // The labels are read here only to check the fixture.
    const label = (id: string | null | undefined) => s.seats.find((x) => x.id === id)?.label;
    expect(label(r1.ownerSeatId)).toBe("T. Vogel");
    expect(label(r1.deputySeatId)).toBe("M. Roth");
  });

  it("gives no seats for a company without rows", () => {
    expect(structureSeed(SEED, { units: [], roles: [], holders: [], rules: [], goals: [] }, DEMO_RULES).seats).toEqual([]);
  });

  it("never keeps a stored seats", () => {
    expect(parseSeed({ ...JSON.parse(JSON.stringify(SEED)), seats: stored }).seats).toEqual([]);
    expect(contentOnly({ ...SEED, seats: stored }).seats).toEqual([]);
  });

  it("keeps actorUserId through logFromRows and appendEvent", () => {
    const base = { id: "e1", seq: 1, day: 0, ts: 1, type: "case.read", actor: "A", targetId: "c1", payload: {} };
    const log = logFromRows([{ ...base, actorUserId: "u1" }, base], 0);
    expect(log.events.map((e) => e.actorUserId)).toEqual(["u1", null]);
    const ev = { type: "case.read" as const, actor: "A", target: "c1" };
    expect(appendEvent(emptyLog(), { ...ev, actorUserId: "u1" }).events[0].actorUserId).toBe("u1");
    expect(appendEvent(emptyLog(), ev).events[0].actorUserId).toBeNull();
  });
});
