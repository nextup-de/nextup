import { expect, it } from "vitest";
import type { EventPayload } from "@/features/cases/events";
import { APP_EVENT_TYPES } from "@/features/cases/persist";
import { FLAGS } from "@/config/flags";
import { de } from "@/i18n/de";
import { en } from "@/i18n/en";

it("PGE scaffold: exposes the events, typed payloads, rollout defaults and matching bilingual namespaces", () => {
  for (const suffix of ["page.added", "page.edited", "page.moved", "page.removed", "page.restored", "tool.added", "tool.moved", "tool.edited", "tool.removed", "tool.restored", "page.merged", "page.unmerged"]) {
    expect(APP_EVENT_TYPES).toContain(`project.${suffix}`);
  }
  const payloads: EventPayload[] = [
    { pageId: "notes", title: "Notes", icon: "doc", tools: [{ toolId: "notes.doc", kind: "doc", title: "Decisions", content: "text" }], before: null },
    { pageId: "notes", toolId: "notes.table", kind: "table" },
    { toolId: "notes.doc", title: "Decision log", collapsed: true, content: "new text", baseRev: 0 },
    { mergeId: "merge-1", fromPageId: "notes", intoPageId: "steps" },
  ];
  expect(payloads).toHaveLength(4);
  expect(FLAGS.projectPages).toMatchObject({ owner: "Kevin", defaults: { demo: true, sandbox: true, pilot: false, live: false }, added: "2026-11-13", removeBy: "2027-03-31" });
  for (const ns of ["projectPages", "projectSteps", "projectPlan", "projectHub", "projectRequests"] as const) {
    expect(Object.keys(de[ns]).sort()).toEqual(Object.keys(en[ns]).sort());
  }
});
