import { describe, expect, it } from "vitest";
import { contentOnly, templateWrites } from "@/features/demo/content";
import { parseSeed, toSeedJson } from "@/features/demo/parse";
import { ROUTES, SEED } from "@/features/demo/seed";
import { DEMO_RULES } from "@/features/demo/structure";
import { NO_KNOWLEDGE } from "@/features/knowledge";

let n = 0;
const newId = () => `id${n++}`;

describe("STR demo content only", () => {
  it("drops structure, goals and spend and keeps the content", () => {
    const c = contentOnly(SEED);
    expect(c.depts).toEqual([]);
    expect(c.people).toEqual([]);
    expect(c.routes).toEqual([]);
    expect(c.goals).toEqual([]);
    expect(c.spend).toBeNull();
    expect(c.cases).toBe(SEED.cases);
    expect(c.problems).toBe(SEED.problems);
    expect(c.personas).toBe(SEED.personas);
    expect(c.projects).toBe(SEED.projects);
  });
  it("the empty template writes no rows and stores no owner names", () => {
    const w = templateWrites("empty", newId);
    expect(w.knowledge).toEqual(NO_KNOWLEDGE);
    expect(w.rules).toBeNull();
    const json = JSON.stringify(w.seedJson);
    for (const name of new Set(ROUTES.map((r) => r.owner))) expect(json).not.toContain(name);
  });
  it("the demo template writes acme's tables, goals and rules", () => {
    const w = templateWrites("demo", newId);
    expect(w.knowledge.rules).toHaveLength(SEED.routes.length);
    expect(w.knowledge.goals).toHaveLength(4);
    expect(w.rules).toEqual(DEMO_RULES);
  });
  it("the stored form still passes the shape check", () => {
    const w = templateWrites("demo", newId);
    expect(() => parseSeed(JSON.parse(JSON.stringify(toSeedJson(w.seedJson))))).not.toThrow();
  });
});
