// The demo company's ideas (features/demo/seed.ts IDEA_CASES): the pages open the way they look once
// people use them - the employee's own ideas at every stage, the leads' desks with new, answered and
// handed-over ones. Checked through the same rows the dashboard and the inbox show.
import { describe, expect, it } from "vitest";
import { emptyLog } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { dashboardRow, OVERVIEW_STEPS } from "@/features/cases/rows";
import { inboxFor } from "@/features/cases/selectors";
import { CASES, IDEA_CASES, PROMISE_DAYS, SEED } from "@/features/demo/seed";

const S = reduce(SEED, emptyLog());
const rowsOf = (viewer: { name: string; handle: string | null }) =>
  S.cases.map((c) => dashboardRow(c, PROMISE_DAYS, viewer)).filter((r) => r.mine);

describe("the demo ideas", () => {
  it("sit beside the eight cases the reducer tests use, as ideas, with ids of their own", () => {
    expect(SEED.cases).toEqual([...CASES, ...IDEA_CASES]);
    expect(IDEA_CASES.every((c) => c.kind === "idea")).toBe(true);
    expect(new Set(SEED.cases.map((c) => c.id)).size).toBe(SEED.cases.length);
  });

  it("give the employee one idea at every status - by name alone too, as in a company without handles", () => {
    const all = ["waiting", "move", "replied", "approved", "declined", "building", "shipped"];
    expect(new Set(rowsOf({ name: "J. Schmidt", handle: null }).map((r) => r.status))).toEqual(new Set(all));
    expect(new Set(rowsOf({ name: "J. Schmidt", handle: "Anonymous #4471" }).map((r) => r.status))).toEqual(new Set(all));
    // every step of the overview is someone's current step
    expect(new Set(rowsOf({ name: "J. Schmidt", handle: null }).map((r) => r.step))).toEqual(new Set([2, 3, 4, 5]));
    expect(OVERVIEW_STEPS.length).toBe(5);
  });

  it("put new, paused and answered ideas on the team lead's desk, and a handed-over one with Quality", () => {
    const desk = inboxFor(S, "T. Vogel").map((c) => c.id);
    expect(desk).toEqual(expect.arrayContaining(["c9", "c11"]));
    // paused while the question is with its author - the inbox counts it as "paused"
    expect(S.cases.find((c) => c.id === "c10")).toMatchObject({ status: "asked", assignee: "T. Vogel" });
    expect(S.cases.find((c) => c.id === "c11")?.question?.answer?.by).toBe("J. Schmidt");
    expect(S.cases.find((c) => c.id === "c15")).toMatchObject({ assignee: "H. Sander", handed: [{ from: "T. Vogel", to: "H. Sander" }] });
    expect(inboxFor(S, "H. Sander").some((c) => c.id === "c15")).toBe(true);
  });

  it("keep every open one inside the promise, so the demo starts with nothing new escalated", () => {
    expect(S.cases.filter((c) => IDEA_CASES.some((x) => x.id === c.id) && c.overdue)).toEqual([]);
  });
});
