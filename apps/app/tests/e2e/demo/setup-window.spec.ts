// Set up project, in demo mode: an employee raises an idea, the desk says yes, and the window on the draft adds pages and
// asks people to join. Nothing is sent before Save.
import type { Page } from "@playwright/test";
import { expect, publishIdea, test, yourMove } from "../helpers";

const SHOWN = "A tool cart beside press 3";

async function viewAs(page: Page, persona: "Employee" | "Team leader" | "Manager") {
  await page.getByRole("button", { name: "Dev", exact: true }).click();
  await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: persona, exact: true }).click();
  await page.keyboard.press("Escape");
}

test("the Set up window adds pages and asks people, and sends nothing before Save", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/acme");
  await expect(page).toHaveURL(/\/acme\/raise$/);
  await publishIdea(page, SHOWN + " so changeovers stop waiting for tools");
  await viewAs(page, "Team leader");
  await expect(page).toHaveURL(/\/acme\/inbox$/);
  await page.getByTestId("inbox-row").filter({ hasText: SHOWN }).click();
  await (await yourMove(page, /^Yes, do it/)).click();
  await page.getByRole("dialog", { name: "Yes, do it" }).getByRole("button", { name: /^Say yes/ }).click();
  await page.getByRole("link", { name: /^Open P-\d+$/ }).click();
  await expect(page).toHaveURL(/\/acme\/projects\/p_/);

  const open = page.getByRole("button", { name: "Set up project", exact: true });
  const win = page.getByRole("dialog", { name: "Set up project" });
  await open.click();
  await expect(win.getByTestId("setup-page")).toHaveCount(3);

  // A page of its own, a person, another role; closing asks first and then sends nothing.
  await win.getByRole("button", { name: "+ Own page" }).click();
  await win.getByLabel("Name of the page").fill("Notes");
  await win.getByRole("button", { name: "Doc", exact: true }).click();
  await win.getByRole("button", { name: "Add", exact: true }).click();
  await win.getByLabel("Find a person").first().fill("a");
  const first = win.getByRole("list", { name: "Find a person" }).getByRole("button").first();
  const name = ((await first.textContent()) ?? "").replace(/^[A-Z]{1,2}(?=[A-Z]\.)/, "");
  await first.click();
  await win.getByTestId("setup-guest").getByRole("combobox").selectOption("colead");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await win.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.keyboard.press("Escape");
  await expect(win.getByText("Close without saving?")).toBeVisible();
  await win.getByRole("button", { name: "Keep editing" }).click();
  await win.getByRole("button", { name: "Save", exact: true }).click();
  await expect(win).toHaveCount(0);

  // Saved: the window opens again with the pages there, and the Team step shows who was asked.
  await open.click();
  await expect(win.getByRole("list", { name: "Pages it already has" })).toContainText("Notes");
  await expect(win.getByTestId("setup-page")).toHaveCount(0);
  await win.getByRole("button", { name: "Cancel" }).click();
  await page.getByTestId("draft-progress").getByRole("button", { name: /^Team/ }).click();
  await expect(page.getByTestId("draft-step")).toContainText(name + " · Co-lead");

  // Closing without saving sends nothing.
  await open.click();
  await win.getByRole("button", { name: "+ Requests" }).click();
  await page.keyboard.press("Escape");
  await win.getByRole("button", { name: "Close", exact: true }).last().click();
  await open.click();
  await expect(win.getByTestId("setup-page")).toHaveCount(0);
});
