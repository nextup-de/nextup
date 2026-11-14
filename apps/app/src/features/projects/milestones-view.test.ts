import { describe, expect, it } from "vitest";
import { askDraft, blockedDays, estimate, milestoneCards, validMilestone } from "./milestones-view";
import type { CaseEvent } from "@/features/cases/events";
import type { Milestone, Step } from "./types";

const m = (patch: Partial<Milestone> = {}): Milestone => ({ id: "m1", title: "Pilot", startDay: 0, dueDay: 20, note: "", shipped: false, shippedDay: null, ...patch });
const step = (id: string, patch: Partial<Step> = {}): Step => ({ id, text: id, owner: null, ownerUserId: null, dueDay: null, column: "todo", why: "", note: "", addedDay: 0, movedDay: 0, by: "Lead", startedDay: null, doneDay: null, external: null, checklist: [], comments: [], waitingOn: null, milestoneId: "m1", ...patch });
const move = (stepId: string, to: string, day: number): CaseEvent => ({ id: stepId + day, ts: 0, day, type: "project.step.moved", actor: "x", target: "p", payload: { stepId, to } });
const none = { history: [] as CaseEvent[] };

describe("PLN milestones", () => {
  it("PLN milestones: the estimate is the latest open due day plus blocked days, overlapping ones once, and none without due days", () => {
    const steps = [step("a", { dueDay: 18, column: "blocked" }), step("b", { dueDay: 22, column: "blocked" }), step("done", { dueDay: 40, column: "done" })];
    const history = [move("a", "blocked", 5), move("a", "doing", 9), move("b", "blocked", 7), move("b", "doing", 12)];
    expect(blockedDays({ history }, steps, 15)).toBe(7); // days 5-11: a covers 5-8, b covers 7-11
    expect(estimate(m(), steps, 15, { history })).toEqual({ kind: "some", endDay: 29, lateDays: 9 });
    expect(estimate(m({ dueDay: 40 }), [step("a", { dueDay: 18 })], 15, none)).toEqual({ kind: "some", endDay: 18, lateDays: 0 });
    expect(estimate(m(), [step("a"), step("fin", { column: "done", dueDay: 3 })], 15, none)).toEqual({ kind: "none" });
  });

  it("PLN milestones: a step still blocked counts up to today", () => {
    expect(blockedDays({ history: [move("a", "blocked", 10)] }, [step("a", { column: "blocked" })], 12)).toBe(3);
  });

  it("PLN milestones: state is planned, running, at risk or shipped; progress counts the steps by column", () => {
    const base = { steps: [step("a")], milestones: [m()], history: [] as CaseEvent[] };
    expect(milestoneCards(base, 5)[0]).toMatchObject({ state: "planned", daysLeft: 15, progress: { total: 1, todo: 1 } });
    expect(milestoneCards({ ...base, steps: [step("a", { column: "doing" })] }, 5)[0].state).toBe("running");
    expect(milestoneCards({ ...base, steps: [step("a", { column: "blocked", dueDay: 3 })] }, 5)[0].state).toBe("atRisk");
    expect(milestoneCards({ ...base, steps: [step("a", { dueDay: 30 })] }, 5)[0].state).toBe("atRisk");
    expect(milestoneCards({ ...base, milestones: [m({ shipped: true })], steps: [step("a", { column: "blocked" })] }, 5)[0].state).toBe("shipped");
    expect(milestoneCards({ ...base, steps: [step("a", { milestoneId: "other" }), step("gone", { dropped: { why: "x", day: 1, byUserId: null } })] }, 5)[0].progress.total).toBe(0);
    expect(milestoneCards({ ...base, milestones: [m({ id: "late", title: "B", dueDay: 30 }), m({ id: "early", title: "A", dueDay: 10 })] }, 5).map((c) => c.milestone.id)).toEqual(["early", "late"]);
  });

  it("PLN milestones: a blocked step waiting on a person offers Ask, and the draft mentions that person on that step", () => {
    const waiting = step("a", { column: "blocked", waitingOn: { kind: "person", userId: "u9", name: "T. Vogel" } });
    const card = milestoneCards({ steps: [waiting], milestones: [m()], history: [] }, 5)[0];
    expect(card.ask).toMatchObject({ userId: "u9", name: "T. Vogel", step: { id: "a" } });
    expect(milestoneCards({ steps: [step("b", { column: "blocked", waitingOn: { kind: "outside", name: "Depot", userId: null } })], milestones: [m()], history: [] }, 5)[0].ask).toBeNull();
    expect(askDraft(waiting, { name: "T. Vogel" })).toEqual({ stepId: "a", text: "@T. Vogel " });
    expect(askDraft(waiting, { name: "T. Vogel" }, "can you answer?")).toEqual({ stepId: "a", text: "@T. Vogel can you answer?" });
  });

  it("PLN milestones: the create form checks title, note, due day and the order of the dates", () => {
    expect(validMilestone({ title: "Go live", dueDay: 10 })).toBeNull();
    expect(validMilestone({ title: "Go live", startDay: 10, dueDay: 10 })).toBeNull();
    expect(validMilestone({ title: "   ", dueDay: 10 })).toBe("title");
    expect(validMilestone({ title: "x".repeat(81), dueDay: 10 })).toBe("title");
    expect(validMilestone({ title: "ok", note: "n".repeat(1001), dueDay: 10 })).toBe("note");
    expect(validMilestone({ title: "ok" })).toBe("due");
    expect(validMilestone({ title: "ok", startDay: 11, dueDay: 10 })).toBe("dates");
  });
});
