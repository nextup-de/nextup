import { expect, it } from "vitest";
import { appendEvent, emptyLog } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { STATIC_DEMO_SEED } from "@/features/demo/static-demo";
import { isSampleId } from "./sample-data";
import { isAddedSample, sampleProjectEvents } from "./sample-project";

const ME = { userId: "u-me", name: "Jonas Schmidt" };

it("a sample project is a running project led by the viewer, from their idea, with a goal, a baseline and three steps", () => {
  const { caseId, projectId, events } = sampleProjectEvents(0, "x1", ME);
  const log = events.reduce((l, e) => appendEvent(l, { ...e, actor: ME.name, actorUserId: ME.userId }), emptyLog());
  const S = reduce(STATIC_DEMO_SEED, log);
  const p = S.projects.find((x) => x.id === projectId)!;
  expect(p).toBeDefined();
  expect(p.status).toBe("running");
  expect(p.leadUserId).toBe(ME.userId);
  expect(p.sources).toContain(caseId);
  expect(p.goal).not.toBeNull();
  expect(p.baseline).toMatchObject({ value: 42, better: "down" });
  expect(p.steps.map((s) => s.text)).toHaveLength(3);
  expect(S.cases.find((c) => c.id === caseId)?.decided?.answer).toBe("yes");
});

it("its ids stay in this browser, and each click gets its own project and title", () => {
  const a = sampleProjectEvents(0, "a", ME), e = sampleProjectEvents(4, "e", ME);
  for (const id of [a.caseId, a.projectId]) expect(isSampleId(id) && isAddedSample(id)).toBe(true);
  expect(a.events.every((ev) => isAddedSample(ev.target))).toBe(true);
  expect(e.projectId).not.toBe(a.projectId);
  expect(e.events[0].payload.title).toBe(a.events[0].payload.title + " (2)");
});
