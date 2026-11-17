// DESIGN_RULES §4: the Ideas area's pages sit in its side view on a laptop: the raise page's own sidebar carries "New idea" and
// "Mine" at its top, Mine sits in the area's side view, and no strip of tabs repeats them. The raise page still opens calm
// (ideas.spec.ts covers that).
import type { Page } from "@playwright/test";
import { expect, test } from "../helpers";

async function viewAs(page: Page, persona: "Employee" | "Team leader" | "Manager") {
  await page.getByRole("button", { name: "Dev" }).click();
  await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: persona, exact: true }).click();
  await page.keyboard.press("Escape");
}

test("the Ideas side view leads from New idea to Mine and back, with no strip of tabs on a laptop", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/acme");
  await viewAs(page, "Team leader");
  await page.goto("/acme/raise");
  await expect(page.locator('[data-side="true"]')).toBeHidden(); // the strip is a phone's alone
  await expect(page.getByTestId("area-frame")).toHaveCount(0); // the raise page brings its own side view, no second one

  await page.getByRole("button", { name: "Show sidebar" }).first().click();
  const pages = page.getByTestId("ideas-pages");
  await expect(pages.getByRole("button", { name: "New idea" })).toHaveAttribute("aria-current", "page");
  await pages.getByRole("link", { name: "Mine" }).click();
  await expect(page).toHaveURL(/\/acme\/ideas$/);

  const frame = page.getByTestId("area-frame");
  await expect(frame).toBeVisible();
  await expect(page.locator('[data-side="true"]')).toBeHidden();
  if (await frame.getByRole("button", { name: "Show sidebar" }).isVisible()) await frame.getByRole("button", { name: "Show sidebar" }).click();
  await expect(frame.getByRole("link", { name: "Mine" })).toHaveAttribute("aria-current", "page");
  await frame.getByRole("link", { name: "New idea" }).click();
  await expect(page).toHaveURL(/\/acme\/raise$/);
});
