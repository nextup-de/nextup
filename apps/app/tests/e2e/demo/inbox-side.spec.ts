// DESIGN_RULES §4 (Kevin, 16 Nov 2026: every area): on a laptop the inbox's pages sit in its side view, hidden at the start,
// and an opened item's list of items to decide is drawn there too, the open one marked. A phone keeps the strip of tabs.
import type { Page } from "@playwright/test";
import { expect, test } from "../helpers";

/** Dev panel -> "Viewing as". Switching person also sends you to that person's home page. */
async function viewAs(page: Page, persona: "Team leader") {
  await page.getByRole("button", { name: "Dev" }).click();
  await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: persona, exact: true }).click();
  await page.keyboard.press("Escape");
}

test("the inbox's side view leads from Inbox to Decisions and lists the items to decide", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "a phone has no side view");
  await page.goto("/acme");
  await viewAs(page, "Team leader");
  await expect(page).toHaveURL(/\/acme\/inbox$/);
  await expect(page.getByTestId("inbox-pages")).toHaveCount(0); // hidden at the start
  await page.getByRole("button", { name: "Show sidebar" }).click();
  const pages = page.getByTestId("inbox-pages");
  await expect(pages.getByRole("link", { name: "Inbox" })).toHaveAttribute("aria-current", "page");

  // An item opened from the list: its row in the side view is the marked one.
  const row = page.getByTestId("section-card").filter({ has: page.getByRole("heading", { name: "Decide", exact: true }) }).getByTestId("inbox-row").first();
  const title = (await row.locator("span").nth(1).innerText()).trim();
  await row.click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.locator('[data-testid="inbox-side-row"][aria-current="true"]')).toContainText(title); // the late dot carries a hidden "Late"

  await pages.getByRole("link", { name: "Decisions" }).click();
  await expect(page).toHaveURL(/\/acme\/decisions/);
  await expect(page.getByTestId("inbox-pages").getByRole("link", { name: "Decisions" })).toHaveAttribute("aria-current", "page");
});
