// Projects › Progress (the Steps card) and Projects › Collaboration (the three lists), the pure parts.
import { describe, expect, it } from "vitest";
import { reduce } from "@/features/cases/reducer";
import { LOCAL_SEED } from "@/features/demo";
import { crossUnitProjects, incomingRequests, worksOn, type TeamPerson } from "@/features/projects/collab-view";
import { STUCK_DAYS } from "@/features/projects/overview-view";
import { stepProgress } from "@/features/projects/progress-view";
import type { Form, ReducedProject, Request, Step } from "@/features/projects/types";

const base = reduce(LOCAL_SEED, { events: [], day: 0 }).projects[0];
const mk = (o: Partial<ReducedProject>): ReducedProject =>
  ({ ...base, status: "running", closed: false, steps: [], requests: [], forms: [], members: [], memberUserIds: [], lead: "Lead", leadUserId: "u_lead", ...o });
const step = (o: Partial<Step>): Step =>
  ({ checklist: [], comments: [], waitingOn: null, id: "s", text: "Step", owner: null, ownerUserId: null, dueDay: null, column: "todo", why: "", movedDay: 0, doneDay: null, ...o } as Step);
const DAY = 100;

describe("stepProgress", () => {
  it("counts done, stuck and late steps, leaves out dropped steps and stopped projects", () => {
    const rows = stepProgress([
      mk({ id: "a", number: 1, steps: [
        step({ id: "1", column: "done", doneDay: 90 }),
        step({ id: "2", column: "doing", movedDay: DAY - STUCK_DAYS - 3 }),
        step({ id: "3", column: "todo", dueDay: DAY - 1 }),
        step({ id: "4", column: "todo", dropped: { why: "x", day: 1, byUserId: null } }),
      ] }),
      mk({ id: "b", number: 2, status: "stopped", steps: [step({ column: "done" })] }),
    ], DAY);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ total: 3, done: 1, doing: 1, todo: 1, stuck: 1, longestStuckDays: STUCK_DAYS + 3, late: 1, allDone: false });
  });

  it("says all steps are done only with at least one step, and puts stuck projects first", () => {
    const rows = stepProgress([
      mk({ id: "done", number: 1, status: "measuring", steps: [step({ column: "done" })] }),
      mk({ id: "empty", number: 2, status: "planning" }),
      mk({ id: "stuck", number: 3, steps: [step({ column: "blocked", movedDay: 0 })] }),
    ], DAY);
    expect(rows.map((r) => r.id)).toEqual(["stuck", "empty", "done"]);
    expect(rows.find((r) => r.id === "done")?.allDone).toBe(true);
    expect(rows.find((r) => r.id === "empty")?.allDone).toBe(false);
  });
});

describe("Collaboration lists", () => {
  const units: Record<string, string> = { u_me: "PRD", u_lead: "ENG", u_other: "QUA", u_mate: "PRD" };
  const unitOf = (who: TeamPerson) => (who.userId ? units[who.userId] ?? null : null);

  it("lists the open projects this person is on but does not lead", () => {
    const list = [
      mk({ id: "on", number: 1, memberUserIds: ["u_me"], members: ["Me"] }),
      mk({ id: "leads", number: 2, leadUserId: "u_me" }),
      mk({ id: "closed", number: 3, memberUserIds: ["u_me"], members: ["Me"], status: "recognised", closed: true }),
      mk({ id: "not", number: 4 }),
    ];
    expect(worksOn(list, "u_me").map((p) => p.id)).toEqual(["on"]);
    expect(worksOn(list, null)).toEqual([]);
  });

  it("shows requests from outside the team to my projects and my unit's, open ones first by the date they are needed", () => {
    const form: Form = { id: "f", title: "Ask for help", intro: "", shared: true, rev: 1, revisions: [], fields: [
      { id: "what", kind: "short", label: "What", required: true }, { id: "by", kind: "date", label: "By when", required: false },
    ] };
    const req = (id: string, by: string | null, state: Request["state"], need: number | null, day = 10): Request =>
      ({ id, formId: "f", formRev: 1, answers: need === null ? { what: "Help " + id } : { what: "Help " + id, by: String(need) }, byUserId: by, day, state, stepId: null, why: null });
    const mineP = mk({ id: "mine", number: 1, memberUserIds: ["u_me"], members: ["Me"], forms: [form], requests: [
      req("late", "u_other", "new", 140), req("soon", "u_other", "new", 120), req("done", "u_other", "stepped", null, 30), req("inside", "u_lead", "new", 110),
    ] });
    const unitP = mk({ id: "unit", number: 2, leadUserId: "u_mate", lead: "Mate", forms: [form], requests: [req("unit", null, "new", null)] });
    const elseP = mk({ id: "else", number: 3, forms: [form], requests: [req("never", "u_other", "new", 105)] });
    const askerP = mk({ id: "asker", number: 4, leadUserId: "u_other", lead: "Other" });
    const rows = incomingRequests([mineP, unitP, elseP, askerP], { userId: "u_me", unit: "PRD" }, unitOf);
    expect(rows.map((r) => r.request.id)).toEqual(["soon", "late", "unit", "done"]);
    expect(rows[0]).toMatchObject({ what: "Help soon", byDay: 120, project: { id: "mine" }, fromProjects: [{ id: "asker" }] });
    expect(rows.find((r) => r.request.id === "unit")?.byDay).toBeNull();
  });

  it("lists the projects whose team spans units, with the units", () => {
    const list = [
      mk({ id: "two", number: 1, memberUserIds: ["u_me"], members: ["Me"] }),
      mk({ id: "three", number: 2, memberUserIds: ["u_me", "u_other"], members: ["Me", "Other"] }),
      mk({ id: "one", number: 3, memberUserIds: ["u_lead"], members: ["Lead again"] }),
      mk({ id: "stopped", number: 4, status: "stopped", memberUserIds: ["u_me"], members: ["Me"] }),
    ];
    const rows = crossUnitProjects(list, unitOf);
    expect(rows.map((r) => [r.project.id, r.units])).toEqual([["three", ["ENG", "PRD", "QUA"]], ["two", ["ENG", "PRD"]]]);
  });
});
