import { describe, expect, it } from "vitest";
import { EMPTY_SEED } from "@/features/demo";
import { BUDDIES, DEPTS, LEADERS, PEOPLE, ROLES, ROUTES, SEED } from "@/features/demo/seed";
import { DEMO_GOALS, DEMO_RULES } from "@/features/demo/structure";
import { emptyLog } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { NO_KNOWLEDGE, rowsFromSeed, structureSeed } from "@/features/knowledge";
import { DEFAULT_RULES } from "@/features/knowledge/rules";

const counter = () => { let n = 0; return () => "id" + ++n; };
const rows = () => rowsFromSeed(SEED, DEMO_GOALS, counter());

describe("STR structure from the tables", () => {
  it("gives a seed with no rows no structure, goals or spend", () => {
    const s = structureSeed(SEED, NO_KNOWLEDGE, DEFAULT_RULES);
    expect([s.depts, s.people, s.routes, s.goals]).toEqual([[], [], [], []]);
    expect(s.spend).toBeNull();
  });

  it("takes everything from the rows and rules", () => {
    const s = structureSeed(EMPTY_SEED, rows(), DEMO_RULES);
    expect(s.depts).toEqual(SEED.depts);
    expect(s.people).toEqual(SEED.people);
    expect(s.routes).toEqual(SEED.routes);
    expect(s.goals).toEqual(DEMO_GOALS);
    expect(s.spend).toEqual({ limitEur: 5000, text: "team-level authority up to €5k, no controlling sign-off" });
  });

  it("reduces to the same cases as the built-in seed", () => {
    const moved = structureSeed({ ...SEED, depts: [], people: [], routes: [], goals: [] }, rows(), DEMO_RULES);
    expect(reduce(moved, emptyLog()).cases).toEqual(reduce(SEED, emptyLog()).cases);
  });

  it("carries no acme marker in EMPTY_SEED", () => {
    const markers = [
      ...PEOPLE.map((p) => p.name), ...LEADERS, ...ROLES.map((r) => r.who.name),
      ...ROUTES.flatMap((r) => [r.owner.name, r.deputy, r.buddy]),
      ...BUDDIES.map((b) => b.name), ...DEPTS.map((d) => d.name), ...DEMO_GOALS.map((g) => g.goal), "€5k",
    ].filter(Boolean);
    const json = JSON.stringify(EMPTY_SEED);
    for (const m of markers) expect(json).not.toContain(m);
  });

  it("has neutral personas", () => {
    expect(EMPTY_SEED.personas.map((p) => p.id)).toEqual(["member", "leader", "manager"]);
    for (const p of EMPTY_SEED.personas) expect(p.who.name).toBe("");
  });
});
