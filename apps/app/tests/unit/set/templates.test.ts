// Plan SET, SET-C1: the content of the three templates, version 1.
import { describe, expect, it } from "vitest";
import { latestTemplate, TEMPLATES, templateSteps, type TemplateKey } from "@/features/templates/library";

const KEYS: TemplateKey[] = ["quick-win", "8d", "investment"];

describe("SET templates", () => {
  it("has the three keys, each with a version 1 first", () => {
    expect(Object.keys(TEMPLATES).sort()).toEqual(["8d", "investment", "quick-win"]);
    for (const key of KEYS) {
      expect(TEMPLATES[key][0].version).toBe(1);
      expect(TEMPLATES[key][0].key).toBe(key);
    }
  });

  it("gives every step a text, a role of lead, sponsor or team and ascending day offsets", () => {
    for (const key of KEYS) {
      const steps = templateSteps(key, 1);
      expect(steps.length, key).toBeGreaterThanOrEqual(3);
      for (const s of steps) {
        expect(s.text.trim(), key).not.toBe("");
        expect(["lead", "sponsor", "team"], key).toContain(s.role);
        expect(Number.isInteger(s.day) && s.day >= 0, key).toBe(true);
      }
      steps.slice(1).forEach((s, i) => expect(s.day, `${key} step ${i + 2}`).toBeGreaterThan(steps[i].day));
    }
  });

  it("has four quick-win steps, the eight disciplines of 8D and seven investment steps", () => {
    expect(templateSteps("quick-win", 1)).toHaveLength(4);
    const d8 = templateSteps("8d", 1);
    expect(d8).toHaveLength(8);
    d8.forEach((s, i) => expect(s.text.startsWith(`D${i + 1} `)).toBe(true));
    expect(templateSteps("investment", 1)).toHaveLength(7);
  });

  it("suggests roles (none required) and a metric, and is no agent template", () => {
    for (const key of KEYS) {
      const t = latestTemplate(key)!;
      expect(Array.isArray(t.roles), key).toBe(true);
      expect(t.metric === null || t.metric.trim() !== "", key).toBe(true);
      expect(t.agent, key).toBe(false);
    }
    expect(latestTemplate("8d")!.metric).toBe("Customer complaints");
  });

  it("returns exactly the steps of the version asked for, and nothing for an unknown key or version", () => {
    for (const key of KEYS) expect(templateSteps(key, 1)).toEqual(TEMPLATES[key][0].steps);
    expect(templateSteps("8d", 2)).toEqual([]);
    expect(templateSteps("nope", 1)).toEqual([]);
    expect(latestTemplate("8d")!.version).toBe(1);
    expect(latestTemplate("nope")).toBeNull();
  });
});
