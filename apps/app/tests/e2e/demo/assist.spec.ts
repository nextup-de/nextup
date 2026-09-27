// The raise-page assistant, demo mode (no database: the mock provider, nothing stored).
// Ask first -> an answer with sources -> "Raise it anyway" still raises; a question marked
// strictly confidential is not sent at all.
import { expect, test } from "../helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/acme/raise");
});

test("answers from company knowledge, then raises anyway", async ({ page }) => {
  await page.getByRole("textbox", { name: "Idea" }).fill("We should order a spare sensor for the test rig");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { name: "What NextUp found" })).toBeVisible();
  const sources = page.getByRole("list", { name: "Sources" });
  await expect(sources.getByText("Spend under €5k (parts, tools, consumables)")).toBeVisible();
  await expect(page.getByText("Nothing is stored.")).toBeVisible();

  await page.getByRole("button", { name: "Raise it anyway" }).click();
  await expect(page.getByRole("link", { name: "Open the case" })).toBeVisible({ timeout: 30_000 });
});

test("does not send a question marked strictly confidential", async ({ page }) => {
  await page.getByRole("textbox", { name: "Idea" }).fill("Streng vertraulich: prototype housing cracks at 80 degrees");
  await page.getByRole("button", { name: "Ask NextUp first" }).click();

  await expect(page.getByRole("heading", { name: "Not sent" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Nothing was sent" })).toBeVisible();
  await expect(page.getByRole("button", { name: "That solved it" })).toHaveCount(0);
});

test("that solved it clears the page", async ({ page }) => {
  await page.getByRole("textbox", { name: "Idea" }).fill("Who approves a new fixture for the changeover?");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "That solved it" }).click();
  await expect(page.getByRole("heading", { name: "How NextUp works" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Idea" })).toHaveValue("");
});
