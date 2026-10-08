// What NextUp looked up across the company per analysis dial (features/ideas/company-read.ts): every
// line built from the company's own data - its desks, people, goals, cases and outcomes - and left out
// where a company has no such data.
import { describe, expect, it } from "vitest";
import { companyRead, type CompanyCase, type CompanyInput } from "@/features/ideas/company-read";
import { GOALS } from "@/features/evaluate";
import { DEPTS, IDEAS, INITIATIVES, OUTCOMES, PEOPLE, PROBLEMS, ROUTES } from "@/features/demo/seed";

const base: CompanyInput = {
  text: "", lead: "T. Vogel", myDept: "Production", affected: [], people: PEOPLE, depts: DEPTS, routes: ROUTES, goals: GOALS,
  problems: PROBLEMS, ideas: IDEAS, initiatives: INITIATIVES, outcomes: OUTCOMES, cases: [], promiseDays: 5, spendLimitEur: 5000,
};
const kase = (over: Partial<CompanyCase>): CompanyCase => ({ title: "A case", from: "J. Klein", assignee: "T. Vogel", routeId: "r7", upside: "", open: true, raisedDay: -10, decided: null, ...over });
const text = (facts: { text: string }[]) => facts.map((f) => f.text).join(" ");

describe("companyRead", () => {
  const cart = { ...base, text: "A shared setup cart for line 3, so a changeover never waits for the tooling", affected: ["Engineering"] };

  it("names the desk, its deputy and how it decided", () => {
    const cases = [
      kase({ title: "Jig rack", open: false, decided: { answer: "yes", day: -8 } }), // 2 days: on time
      kase({ title: "New layout", raisedDay: -20, open: false, decided: { answer: "no", day: -5 } }), // 15 days: late
      kase({ title: "Still open" }),
    ];
    const r = companyRead({ ...cart, cases });
    expect(text(r.feas)).toContain("“Fixture, tooling or line layout” is T. Vogel’s desk (Team lead, 4-series), with M. Roth as deputy");
    expect(text(r.feas)).toContain("T. Vogel decided 1 of the last 2 cases on that desk within 5 days; 1 case is open there today.");
    expect(text(r.risk)).toContain("On that desk, 1 of the last 2 decisions were yes; the latest no was “New layout”.");
    expect(text(r.feas)).toContain("Production already carries 3 initiatives: “Retrofit kit line” (in trial), “Team spend authority” (awaiting decision) and 1 more.");
  });

  it("finds the goal it serves and what already pulls on it", () => {
    const r = companyRead({ ...cart, cases: [kase({ title: "Quick-change jigs", upside: "Every changeover under 20 minutes" })] });
    expect(r.fit[0].text).toBe("Checked against the 4 company goals: it serves “Every changeover under 20 minutes”.");
    expect(text(r.fit)).toContain("1 open case already serves that goal, the newest “Quick-change jigs” from J. Klein.");
    expect(text(r.fit)).toContain("Worked on for that goal so far: “4-series fixture redesign” (shipped).");
    expect(text(r.risk)).toContain("1 of the 4 changes shipped so far delivered less than promised: “4-series fixture redesign” promised −40 h / wk rework and delivered −26 h / wk rework.");
  });

  it("counts the people where it lands and names who feels it first", () => {
    const r = companyRead(cart);
    expect(text(r.value)).toContain("Production (190) and Engineering (65): 255 people work where this lands.");
    expect(text(r.risk)).toContain("B. Hartmann (Head of Production) and M. Roth (Engineering lead)");
    expect(text(companyRead({ ...base, text: "A better break room" }).value)).toContain("Production, where this lands, has 190 people.");
  });

  it("knows the spend rule and who signs above it", () => {
    const r = companyRead(cart);
    expect(r.cost[0].text).toBe("Team leads approve up to €5,000 without a controlling sign-off.");
    expect(text(r.cost)).toContain("Above that it goes to K. Adler (CFO), the signature “Team spend authority” is waiting on right now.");
  });

  it("matches a named problem and a shipped outcome by their words", () => {
    const r = companyRead({ ...base, text: "Bundle the access requests so new hires get system access in week one" });
    expect(text(r.value)).toContain("have named “New hires wait five weeks for system access”, though it is easing (64 h lost so far).");
    expect(text(r.value)).toContain("“Bundle new-hire access into one request”, promised 5 wks → 11 d and delivered 5 wks → 11 d.");
  });

  it("leaves a line out where the company has no data for it, instead of making one up", () => {
    const empty: CompanyInput = { ...cart, people: [], depts: [], routes: [], problems: [], ideas: [], initiatives: [], outcomes: [] };
    const r = companyRead(empty);
    expect(r.value).toEqual([]);
    expect(r.feas).toEqual([]);
    expect(r.cost.map((f) => f.source)).toEqual(["Spend rule"]);
    expect(r.risk).toEqual([]);
  });
});
