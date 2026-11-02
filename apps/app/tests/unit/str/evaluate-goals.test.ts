import { describe, expect, it } from "vitest";
import * as evaluateModule from "@/features/evaluate";
import { evaluate } from "@/features/evaluate";
import { DEPTS, IDEAS, INITIATIVES, OUTCOMES, PEOPLE, PROBLEMS, ROUTES, SEED } from "@/features/demo/seed";
import { ideaContext } from "@/features/ideas/drafts";
import { benchmark } from "@/features/ideas/benchmarks";
import { companyRead, type CompanyInput } from "@/features/ideas/company-read";

const who = { name: "J. Schmidt", line: "Production, Line 3", handle: "Anonymous #4471" };
const input = (text: string) => ({ kind: "problem" as const, text, affected: [], attachments: 0, who });
const step = (ev: ReturnType<typeof evaluate>, id: string) => ev.steps.find((s) => s.id === id)?.detail ?? "";

describe("STR goals and spend from the company", () => {
  it("serves the company's goals, none for a company without", () => {
    const text = "Scrap and rework on the 4-series casting is a defect we see every week";
    expect(step(evaluate(input(text), { ...SEED, cases: [] }), "goals")).toContain("Scrap and rework on the 4-series down 20 %");
    expect(step(evaluate(input(text), { ...SEED, goals: [], cases: [] }), "goals")).toContain("No stated goal matches directly");
  });
  it("serves a goal the company added", () => {
    const goals = [{ goal: "Fewer forklift waits", keys: ["forklift", "wait"] }];
    expect(step(evaluate(input("forklift wait at the dock again"), { ...SEED, goals, cases: [] }), "goals")).toContain("Fewer forklift waits");
  });
  it("names no €5k without a spend rule", () => {
    const ev = evaluate(input("We need to buy a €300 sensor"), { ...SEED, spend: null, cases: [] });
    expect(step(ev, "budget")).not.toContain("€5k");
    expect(step(ev, "budget")).toContain("no spend rule");
  });
  it("benchmarks without a spend rule never say within authority", () => {
    const ctx = ideaContext(SEED.routes, [], [], null);
    expect(ctx.spendLimitEur).toBeNull();
    const b = benchmark({ text: "buy a €300 sensor", affected: [], attachments: 0 }, ctx);
    const found = JSON.stringify(b.parts);
    expect(found).not.toContain("Within team authority");
    expect(found).toContain("no spend rule");
  });
  it("the company read leaves out the Spend rule source", () => {
    expect(JSON.stringify(companyRead(companyReadInput()))).toContain("Spend rule");
    expect(JSON.stringify(companyRead({ ...companyReadInput(), spendLimitEur: null }))).not.toContain("Spend rule");
  });
  it("no longer exports SPEND_RULE", () => {
    expect("SPEND_RULE" in evaluateModule).toBe(false);
  });
});

function companyReadInput(): CompanyInput {
  return {
    text: "A shared setup cart for line 3", lead: "T. Vogel", myDept: "Production", affected: [], people: PEOPLE, depts: DEPTS, routes: ROUTES, goals: SEED.goals,
    problems: PROBLEMS, ideas: IDEAS, initiatives: INITIATIVES, outcomes: OUTCOMES, cases: [], promiseDays: 5, spendLimitEur: 5000,
  };
}
