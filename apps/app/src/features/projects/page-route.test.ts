import { expect, it } from "vitest";
import { pageIdFor } from "./page-route";
import { pagesOf } from "./pages";

const pages = pagesOf({ pages: null }, { agent: true });

it("PGB page route: opens an explicit page before a legacy tab", () => {
  expect(pageIdFor(pages, { page: "plan", tab: "board" })).toBe("plan");
  expect(pageIdFor(pages, { page: "team" })).toBe("team");
});

it("PGB page route: missing or unknown pages open the first page in its current order", () => {
  const reordered = [pages[2], pages[0], pages[1]];
  for (const page of [undefined, null, "", "missing"]) expect(pageIdFor(reordered, { page })).toBe("plan");
  expect(pageIdFor(reordered, { page: "missing", tab: "board" })).toBe("plan");
  expect(pageIdFor([], {})).toBe("");
});

it("PGB page route: maps every old tab and falls back when its page was removed", () => {
  for (const [tab, id] of Object.entries({ overview: "overview", board: "steps", team: "team", results: "results", files: "files", activity: "activity", agent: "agent" })) {
    expect(pageIdFor(pages, { tab })).toBe(id);
  }
  expect(pageIdFor(pages, { tab: "missing" })).toBe("overview");
  expect(pageIdFor(pages.filter((p) => p.id !== "steps"), { tab: "board" })).toBe("overview");
});

it("PGB page route: an Agent page is reachable only in the viewer's filtered pages", () => {
  const visible = pagesOf({ pages: null }, { agent: false });
  expect(pageIdFor(visible, { page: "agent" })).toBe("overview");
  expect(pageIdFor(visible, { tab: "agent" })).toBe("overview");
  expect(pageIdFor(pages, { page: "agent" })).toBe("agent");
  const moved = pages.map((page) => page.id === "plan" ? { ...page, tools: [...page.tools, pages[8].tools[0]] } : page);
  expect(pagesOf({ pages: moved }, { agent: false }).flatMap((page) => page.tools).some((tool) => tool.kind === "agent")).toBe(false);
});
