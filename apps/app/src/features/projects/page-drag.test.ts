import { expect, it } from "vitest";
import { dropIntent, pageRowMenu } from "./page-drag";
import { READY_PAGES } from "./pages";

it("PGB drop intent: uses the middle half for merging and the outer quarters for ordering", () => {
  expect(dropIntent(100, 40, 100, false, false)).toBe("before");
  expect(dropIntent(100, 40, 109, false, false)).toBe("before");
  for (const y of [110, 120, 130]) expect(dropIntent(100, 40, y, false, false)).toBe("into");
  expect(dropIntent(100, 40, 131, false, false)).toBe("after");
  expect(dropIntent(100, 40, 140, false, false)).toBe("after");
});

it("PGB drop intent: ignores itself, invalid geometry and Overview merge drops", () => {
  for (const y of [101, 120, 139]) expect(dropIntent(100, 40, y, true, false)).toBeNull();
  expect(dropIntent(100, 40, 120, false, true)).toBeNull();
  expect(dropIntent(100, 40, 101, false, true)).toBe("before");
  expect(dropIntent(100, 40, 139, false, true)).toBe("after");
  expect(dropIntent(100, 0, 100, false, false)).toBeNull();
  expect(dropIntent(100, 40, 99, false, false)).toBeNull();
  expect(dropIntent(100, 40, 141, false, false)).toBeNull();
  expect(dropIntent(100, 40, NaN, false, false)).toBeNull();
});

it("PGB drop intent: offers bounded keyboard moves and merge destinations with the same protection", () => {
  const [overview, steps] = READY_PAGES;
  expect(pageRowMenu(READY_PAGES, overview, { editor: true })).toMatchObject({ moveUp: false, moveDown: true, remove: false, mergeInto: [] });
  expect(pageRowMenu(READY_PAGES, steps, { editor: true })).toMatchObject({ rename: true, icon: true, moveUp: true, moveDown: true, remove: true });
  expect(pageRowMenu(READY_PAGES, steps, { editor: true }).mergeInto.map((page) => page.id)).toEqual(READY_PAGES.filter((page) => page.id !== steps.id).map((page) => page.id));
  expect(pageRowMenu(READY_PAGES, READY_PAGES.at(-1)!, { editor: true }).moveDown).toBe(false);
  expect(pageRowMenu([steps], steps, { editor: true })).toMatchObject({ moveUp: false, moveDown: false, remove: false, mergeInto: [] });
  expect(pageRowMenu(READY_PAGES, steps, { editor: false })).toEqual({ rename: false, icon: false, moveUp: false, moveDown: false, remove: false, mergeInto: [] });
});
