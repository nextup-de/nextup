import { expect, it } from "vitest";
import { isFilesPage, toolsBehindGear } from "@/features/files/settings";
import { DEFAULT_PAGES } from "@/features/projects/pages";

const files = DEFAULT_PAGES.find((page) => page.id === "files")!;
const idea = DEFAULT_PAGES.find((page) => page.id === "overview")!;

it("FIL settings: a page that starts with Files keeps its other tools behind the gear, in order", () => {
  expect(isFilesPage(files)).toBe(true);
  expect(toolsBehindGear(files).map((tool) => tool.kind)).toEqual(["links"]);
  const withDoc = { ...files, tools: [...files.tools, { ...files.tools[1], id: "doc-1", kind: "doc" as const }] };
  expect(toolsBehindGear(withDoc).map((tool) => tool.kind)).toEqual(["links", "doc"]);
});

it("FIL settings: any other page shows its tools as before", () => {
  expect(isFilesPage(idea)).toBe(false);
  expect(toolsBehindGear(idea)).toEqual([]);
  expect(isFilesPage({ tools: [] })).toBe(false);
  // Files further down a page is a tool like any other, not a Files page.
  expect(isFilesPage({ tools: [...idea.tools, ...files.tools] })).toBe(false);
});
