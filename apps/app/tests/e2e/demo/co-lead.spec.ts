// Administrators on the team list: who runs the project adds a person, makes them an administrator and takes the role
// back, and it fits a phone. Demo mode.
import type { Page } from "@playwright/test";
import { addPages, expect, test } from "../helpers";

async function viewAs(page: Page, persona: "Employee" | "Team leader" | "Manager") {
  await page.getByRole("button", { name: "Dev", exact: true }).click();
  await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: persona, exact: true }).click();
  await page.keyboard.press("Escape");
}

test("the team list makes someone an administrator and takes the role back", async ({ page }) => {
  await page.goto("/acme");
  await viewAs(page, "Manager");
  await addPages(page, "/acme/projects/pj2", ["Team"]);
  await page.getByRole("navigation").getByRole("link", { name: /^Team/ }).first().click();
  const add = page.getByLabel("Add to the team");
  const name = (await add.locator("option").nth(1).textContent()) ?? "";
  await add.selectOption({ index: 1 });
  await page.getByRole("button", { name: "Add", exact: true }).click();

  const row = page.getByRole("main").getByRole("listitem").filter({ hasText: name }).first();
  await row.getByRole("button", { name: `Make ${name} an administrator` }).click();
  await expect(row).toContainText("Administrator");
  await page.reload();
  await expect(row).toContainText("Administrator");

  await row.getByRole("button", { name: `Make ${name} a team member again` }).click();
  await expect(row.getByRole("button", { name: `Make ${name} an administrator` })).toBeVisible();

  // On a phone nothing scrolls sideways.
  await page.setViewportSize({ width: 390, height: 844 });
  // The name stays on one line beside its buttons.
  expect((await row.boundingBox())?.height ?? 999).toBeLessThan(130);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
