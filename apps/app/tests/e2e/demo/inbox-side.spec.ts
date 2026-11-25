// DESIGN_RULES §4 and §8 (Kevin, 17 Nov 2026): on a laptop the Inbox's pages sit in its side view, open at the start;
// with an idea open, the walk through the inbox is listed there, the open one marked and its pages under it, and an
// idea's own page (/idea?id=) has the same side view. A phone keeps the strip of tabs.
import type { Page } from "@playwright/test";
import { expect, test } from "../helpers";

/** Dev panel -> "Viewing as". Switching person also sends you to that person's home page. */
async function viewAs(page: Page, persona: "Team leader") {
  await page.getByRole("button", { name: "Dev" }).click();
  await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: persona, exact: true }).click();
  await page.keyboard.press("Escape");
}

test("the inbox's side view walks through the items, leads to Decisions and back, and stays beside an idea's own page", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "a phone has no side view");
  await page.goto("/acme");
  await viewAs(page, "Team leader");
  await expect(page).toHaveURL(/\/acme\/inbox$/);
  const pages = page.getByTestId("inbox-pages");
  await expect(pages.getByRole("link", { name: "Inbox" })).toHaveAttribute("aria-current", "page"); // open at the start
  await expect(page.getByTestId("inbox-walk")).toHaveCount(0); // the list is the page: not drawn twice

  // Open an item: it is the marked step of the walk, its pages under it.
  const decide = page.getByTestId("section-card").filter({ has: page.getByRole("heading", { name: "Decide", exact: true }) }).getByTestId("inbox-row");
  const first = (await decide.nth(0).getByTestId("inbox-row-title").innerText()).trim();
  const second = (await decide.nth(1).getByTestId("inbox-row-title").innerText()).trim();
  await decide.nth(0).click();
  await expect(page.getByRole("heading", { level: 1, name: first })).toBeVisible();
  const current = page.locator('[data-testid="inbox-side-row"][aria-current="true"]');
  await expect(current).toContainText(first); // a late one carries a hidden "Late"
  const ideaPages = page.getByTestId("idea-pages");
  await expect(ideaPages.getByRole("link", { name: "Idea" })).toHaveAttribute("aria-current", "true");
  await expect(ideaPages.getByRole("link", { name: /^Files/ })).toBeVisible();
  await expect(ideaPages.getByRole("link", { name: /^Chats/ })).toBeVisible();

  // The next one, from the side view.
  await page.getByTestId("inbox-side-row").filter({ hasText: second }).click();
  await expect(page.getByRole("heading", { level: 1, name: second })).toBeVisible();
  await expect(current).toContainText(second);

  // To Decisions and back: the pages stay in the side view.
  await pages.getByRole("link", { name: "Decisions" }).click();
  await expect(page).toHaveURL(/\/acme\/decisions/);
  await expect(pages.getByRole("link", { name: "Decisions" })).toHaveAttribute("aria-current", "page");
  await pages.getByRole("link", { name: "Inbox" }).click();
  await expect(page).toHaveURL(/\/acme\/inbox$/);

  // The idea's own page (/idea?id=, its Files): the same side view, the same item marked, Files marked under it.
  await decide.nth(0).click();
  await ideaPages.getByRole("link", { name: /^Files/ }).click();
  await expect(page).toHaveURL(/\/acme\/idea\?id=[^&]+&page=files/);
  await expect(pages.getByRole("link", { name: "Decisions" })).toBeVisible();
  await expect(current).toContainText(first);
  await expect(ideaPages.getByRole("link", { name: /^Files/ })).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("projects-area")).toHaveCount(0); // no second, Projects-style sidebar for an idea

  // One toggle: hidden, the idea stands alone and one button brings the side view back.
  await page.getByRole("button", { name: "Hide sidebar" }).click();
  await expect(pages).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show sidebar" })).toHaveCount(1);
});
