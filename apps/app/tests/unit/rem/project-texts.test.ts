// REM-P1: the draft's brief starts from the idea's text, and an update the agent drafted says so (plan REM, P5.4, Q7.16). Pure helpers of the two components. Flat tests (D2).
import { expect, it } from "vitest";
import { briefOfIdea, initialBrief } from "@/components/projects/draft/DraftGoal";
import { isAiDrafted } from "@/components/projects/move/WeeklyUpdate";
import type { CaseEvent } from "@/features/cases/events";
import { translate } from "@/i18n";

const idea = (over: { title?: string; body?: string; projectId?: string | null; answer?: "yes" | "no" } = {}) => ({
  title: over.title ?? "A shared setup cart",
  body: over.body ?? "Every changeover on line 3 loses 20 minutes looking for tools.\n\nA cart with the usual tools ends the search.",
  decided: { answer: over.answer ?? "yes", projectId: over.projectId === undefined ? "p1" : over.projectId } as never,
});
const project = (brief: string | null) => ({ id: "p1", goal: brief === null ? null : { goal: "Cart on line 3", doneWhen: "Every changeover starts with the cart", doneBy: null, brief } });

it("REM project brief starts from the idea", () => {
  // No goal stored: the idea's text, as one paragraph.
  expect(initialBrief(project(null), [idea()])).toBe("Every changeover on line 3 loses 20 minutes looking for tools. A cart with the usual tools ends the search.");
  // An idea without a body gives its title; the one whose yes opened this project, not another's.
  expect(initialBrief(project(null), [idea({ body: "  ", title: "Cart for line 3" })])).toBe("Cart for line 3");
  expect(initialBrief(project(null), [idea({ projectId: "p2", body: "Another project" }), idea({ body: "This one" })])).toBe("This one");
  expect(initialBrief(project(null), [idea({ answer: "no" }), idea({ projectId: null })]), "no idea of this project").toBe("");
  expect(initialBrief(project(null), [])).toBe("");
  // The field takes 1200 characters: a long text is cut at a word break and says so.
  const long = Array.from({ length: 400 }, (_, i) => `word${i}`).join(" ");
  const cut = briefOfIdea({ title: "t", body: long });
  expect(cut.length).toBeLessThanOrEqual(1200);
  expect(cut.endsWith("…")).toBe(true);
  expect(long.startsWith(cut.slice(0, -1))).toBe(true);
  expect(cut.slice(0, -1).endsWith(" ")).toBe(false);
  expect(briefOfIdea({ title: "t", body: "x".repeat(1200) })).toHaveLength(1200); // exactly the limit is not cut
});

it("REM project stored brief wins", () => {
  expect(initialBrief(project("What and why, in my words"), [idea()])).toBe("What and why, in my words");
  // A goal saved without a brief is a choice too: the idea does not come back.
  expect(initialBrief(project(""), [idea()])).toBe("");
});

const update = (over: Partial<CaseEvent["payload"]> & { text: string; week: number }): CaseEvent =>
  ({ id: `e${over.week}`, ts: 0, type: "project.update", actor: "A. Lead", actorUserId: "u1", target: "p1", day: over.week, payload: { ...over } }) as unknown as CaseEvent;

it("REM project marks an AI drafted update", () => {
  const drafted = update({ text: "Week 3: the cart is built.", week: 3, aiDrafted: true });
  const own = update({ text: "Week 4: the cart is in use.", week: 4 });
  const view = (events: CaseEvent[], text: string, week: number) => isAiDrafted({ latestUpdate: { text, week, day: week, byUserId: "u1" }, history: events });
  expect(view([drafted], "Week 3: the cart is built.", 3)).toBe(true);
  // The line follows the update in view: a later update of the lead's own has none, and so has a project without one.
  expect(view([drafted, own], "Week 4: the cart is in use.", 4)).toBe(false);
  expect(isAiDrafted({ latestUpdate: null, history: [drafted] })).toBe(false);
  // Edited before it was sent, it is the lead's text: a different text in the same week is not the drafted one.
  expect(view([drafted], "Week 3: the cart is built and tested.", 3)).toBe(false);
  expect(translate("en", "projectMove.updateAiDrafted")).toBe("Drafted with AI");
  expect(translate("de", "projectMove.updateAiDrafted")).toBe("Mit KI entworfen");
});
