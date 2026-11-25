// Co-leads on the team list: the lead asks, and only an asked person who took it has the role (tests/unit/mov/co-leads).
// Someone who may not change the team sees no button. Demo mode.
import type { Page } from "@playwright/test";
import { addPages, expect, test } from "../helpers";

async function viewAs(page: Page, persona: "Employee" | "Team leader" | "Manager") {
  await page.getByRole("button", { name: "Dev", exact: true }).click();
  await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: persona, exact: true }).click();
  await page.keyboard.press("Escape");
}

test("the team list keeps its names on a phone and shows no refused button", async ({ page }) => {
  await page.goto("/acme");
  await viewAs(page, "Manager");
  await addPages(page, "/acme/projects/pj2", ["Team"]);
  await page.getByRole("navigation").getByRole("link", { name: /^Team/ }).first().click();
  const add = page.getByLabel("Add to the team");
  const name = (await add.locator("option").nth(1).textContent()) ?? "";
  await add.selectOption({ index: 1 });
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const row = page.getByRole("main").getByRole("listitem").filter({ hasText: name }).first();
  await expect(row.getByRole("button", { name: `Take ${name} off the team` })).toBeVisible();
  // An older project has no invitations, so nobody can be asked to co-lead it.
  await expect(row.getByRole("button", { name: `Ask ${name} to co-lead` })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await row.boundingBox())?.height ?? 999).toBeLessThan(130);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
