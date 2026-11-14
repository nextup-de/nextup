import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { StepFilterRow } from "@/components/projects/steps/StepFilterRow";
import { headRowId } from "@/components/projects/tools/heads";
import { NO_FILTER } from "@/features/projects/step-filter";
import type { ProjectPage, ToolInstance } from "@/features/projects/types";
import { createT } from "@/i18n";
import { I18nProvider } from "@/i18n/client";

vi.mock("@/components/ui/elements", () => ({ PersonFace: ({ name }: { name: string }) => h("span", { "data-face": name }) }));

const t = createT("en");
const tool = (id: string): ToolInstance => ({ id, kind: "board", title: null, collapsed: false, content: null, rev: 0 });
const page: ProjectPage = { id: "steps", title: "Steps", icon: "board", tools: [tool("a"), tool("b")] };
const owners = [{ userId: "u1", name: "L. Brandt" }, { userId: "u2", name: "S. Tran" }];
const render = (props: Partial<Parameters<typeof StepFilterRow>[0]> = {}, locale: "en" | "de" = "en") => renderToStaticMarkup(h(I18nProvider, { locale, children: h(StepFilterRow, { search: "projectSteps.searchBoard", filter: NO_FILTER, onFilter: vi.fn(), owners, waitingCount: 3, page, tool: tool("a"), ...props }) }));

it("FIL filter row: search, the team's avatars, Only mine, Waiting on someone with its count, Due this week", () => {
  const html = render();
  expect(html).toContain(`placeholder="${t("projectSteps.searchBoard")}"`);
  expect(html).toContain('data-face="L. Brandt"');
  expect(html).toContain(t("projectSteps.filterOwner", { name: "S. Tran" }));
  for (const key of ["onlyMine", "waiting", "dueWeek"] as const) expect(html).toContain(t(`projectSteps.${key}`));
  expect(html).toContain('<span class="_count_');
  expect(html).toContain(">3<");
  expect(render({ waitingCount: 0 })).not.toContain(">3<");
});

it("FIL filter row: a pressed toggle and a chosen person show as pressed, and the list's row has no grouping switch", () => {
  const pressed = render({ filter: { ...NO_FILTER, mine: true, owners: ["u2"] } });
  expect(pressed.match(/aria-pressed="true"/g)).toHaveLength(2);
  expect(render({ search: "projectSteps.searchList" })).toContain(`placeholder="${t("projectSteps.searchList")}"`);
  expect(render()).not.toContain(t("projectSteps.byPerson"));
  const board = render({ group: { value: "person", onChange: vi.fn() } });
  expect(board).toContain(t("projectSteps.byStatus"));
  expect(board).toContain(t("projectSteps.byPerson"));
  expect(render({ group: { value: "status", onChange: vi.fn() } }, "de")).toContain("Nach Status");
});

it("FIL filter row: without the header's slot (the server render) the row stays above its tool, and the slot has a stable id per page", () => {
  expect(render({ tool: tool("b") })).toContain('data-testid="step-filter-row"');
  expect(headRowId("steps")).toBe("head-row-steps");
});
