import { expect, it } from "vitest";
import { pageIdFor, SETUP_PAGE, showsSetup } from "./page-route";
import { pagesOf, READY_PAGES } from "./pages";

// A project whose team added the ready-made pages (a new one starts with Idea and Files only).
const pages = pagesOf({ pages: READY_PAGES }, { agent: true });

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
  const visible = pagesOf({ pages: READY_PAGES }, { agent: false });
  expect(pageIdFor(visible, { page: "agent" })).toBe("overview");
  expect(pageIdFor(visible, { tab: "agent" })).toBe("overview");
  expect(pageIdFor(pages, { page: "agent" })).toBe("agent");
  const moved = pages.map((page) => page.id === "plan" ? { ...page, tools: [...page.tools, pages[8].tools[0]] } : page);
  expect(pagesOf({ pages: moved }, { agent: false }).flatMap((page) => page.tools).some((tool) => tool.kind === "agent")).toBe(false);
});

it("PGB page route: a new project opens on its Idea, Files second", () => {
  const start = pagesOf({ pages: null }, { agent: true });
  expect(pageIdFor(start, {})).toBe("overview");
  expect(pageIdFor(start, { tab: "files" })).toBe("files");
  expect(pageIdFor(start, { tab: "board" })).toBe("overview"); // the old Steps tab, until the team adds a Steps page
});

it("PGB page route: an open draft opens on its setup until another page is asked for", () => {
  expect(showsSetup(true, null)).toBe(true);
  expect(showsSetup(true, SETUP_PAGE)).toBe(true);
  expect(showsSetup(true, "overview")).toBe(false);
  expect(showsSetup(false, null)).toBe(false);
  expect(showsSetup(false, SETUP_PAGE)).toBe(false);
});
