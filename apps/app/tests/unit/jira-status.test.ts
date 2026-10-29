// Board column <-> Jira status (features/integrations/jira/status.ts): picking the transition.
import { describe, expect, it } from "vitest";
import { columnFor, pickTransition, sameState } from "@/features/integrations/jira/status";
import type { JiraStatus, JiraTransition } from "@/features/integrations/jira/types";

const st = (id: string, name: string, key: JiraStatus["statusCategory"]["key"]): JiraStatus => ({ id, name, statusCategory: { key } });
const TODO = st("1", "To Do", "new");
const DOING = st("3", "In Progress", "indeterminate");
const REVIEW = st("4", "In Review", "indeterminate");
const DONE = st("10", "Done", "done");
const tr = (to: JiraStatus): JiraTransition => ({ id: "t" + to.id, name: "to " + to.name, to });

describe("jira status: same state", () => {
  it("compares by category, and blocked stands for in progress", () => {
    expect(sameState("todo", TODO, {})).toBe(true);
    expect(sameState("doing", REVIEW, {})).toBe(true);
    expect(sameState("blocked", DOING, {})).toBe(true);
    expect(sameState("done", DOING, {})).toBe(false);
  });

  it("a pinned status is exact", () => {
    expect(sameState("doing", DOING, { statusFor: { doing: "4" } })).toBe(false);
    expect(sameState("doing", REVIEW, { statusFor: { doing: "4" } })).toBe(true);
  });
});

describe("jira status: the column an issue belongs on", () => {
  it("keeps the current column when it already fits (Blocked stays Blocked)", () => {
    expect(columnFor(DOING, {}, "blocked")).toBe("blocked");
    expect(columnFor(DOING, {}, "todo")).toBe("doing");
    expect(columnFor(DONE, {}, "doing")).toBe("done");
    expect(columnFor(TODO, {}, "done")).toBe("todo");
  });

  it("a pinned status names its column first", () => {
    expect(columnFor(REVIEW, { statusFor: { blocked: "4" } }, "doing")).toBe("blocked");
  });
});

describe("jira status: picking the transition", () => {
  it("takes a direct transition into the category", () => {
    const hop = pickTransition([tr(DOING), tr(DONE)], "done", {}, TODO);
    expect(hop).toMatchObject({ final: true, transition: { id: "t10" } });
  });

  it("blocked goes to the indeterminate category (In Progress), todo to the new one", () => {
    expect(pickTransition([tr(DOING), tr(DONE)], "blocked", {}, TODO)?.transition.to.id).toBe("3");
    expect(pickTransition([tr(TODO), tr(DONE)], "todo", {}, DOING)?.transition.to.id).toBe("1");
  });

  it("with no direct way (To Do cannot go straight to Done) it steps through In Progress first", () => {
    const hop = pickTransition([tr(DOING)], "done", {}, TODO);
    expect(hop).toMatchObject({ final: false, transition: { to: { id: "3" } } });
  });

  it("and says so when there is no way at all", () => {
    expect(pickTransition([], "done", {}, TODO)).toBeNull();
    expect(pickTransition([tr(TODO)], "done", {}, DONE)).toBeNull();
    expect(pickTransition([tr(TODO), tr(DONE)], "blocked", {}, REVIEW)).toBeNull();
  });

  it("a pinned status wins over the category, and is final or nothing", () => {
    const pinned = { statusFor: { doing: "4" } };
    expect(pickTransition([tr(DOING), tr(REVIEW)], "doing", pinned, TODO)).toMatchObject({ final: true, transition: { id: "t4" } });
    expect(pickTransition([tr(DOING)], "doing", pinned, TODO)).toBeNull();
  });
});
