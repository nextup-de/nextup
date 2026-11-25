// The way back and forth: the desk asks, the raiser edits the idea on its card, and the desk reads what came back.
import type { Page } from "@playwright/test";
import { confirmSheet, expect, publishIdea, test, yourMove } from "../helpers";

const TITLE = "The Friday shift plan leaves line 3 with no overtime hours for the changeover";
const SHOWN = "The Friday shift plan leaves line 3 with no overtime";

async function viewAs(page: Page, persona: "Employee" | "Team leader") {
  await page.getByRole("button", { name: "Dev", exact: true }).click();
  await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: persona, exact: true }).click();
  await page.keyboard.press("Escape");
}

test("an edit of the idea goes back to the desk that asked", async ({ page }) => {
  await page.goto("/acme");
  await publishIdea(page, TITLE);

  await viewAs(page, "Team leader");
  await expect(page).toHaveURL(/\/acme\/inbox/);
  await page.getByRole("main").getByText(SHOWN).first().click();
  await (await yourMove(page, "Ask a question")).click();
  await confirmSheet(page, "Which shift - early or late?", "Send the question");

  const id = await page.evaluate(() => new URL(location.href).search);
  const caseId = new URLSearchParams(id).get("item") ?? new URLSearchParams(id).get("id");
  expect(caseId).toBeTruthy();
  await viewAs(page, "Employee");
  await page.goto("/acme/idea?id=" + caseId);
  const move = page.getByTestId("your-move");
  await expect(move).toContainText(/Back with you: T\. Vogel asked · /);
  await expect(move).toContainText("“Which shift - early or late?”");

  // A title alone answers nothing: the question stays with the raiser.
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("main").locator("textarea").first().fill(TITLE.replace("changeover", "change-over"));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved as version 2. Everyone who can see the idea sees it.")).toBeVisible();
  await expect(move).toContainText(/Back with you: T\. Vogel asked · /);
  await expect(move.getByRole("button", { name: "Answer the question" })).toBeVisible();

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const text = page.getByRole("main").locator("textarea").nth(1);
  await text.fill("The late shift, 14:00-22:00, has no overtime hours for the changeover.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved as version 3. It is back with T. Vogel.")).toBeVisible();
  await expect(move).not.toContainText("Back with you");

  await viewAs(page, "Team leader");
  await expect(page).toHaveURL(/\/acme\/inbox/);
  await page.getByRole("main").getByText(SHOWN).first().click();
  await expect(move).toContainText("answered");
  await expect(move).toContainText("Changed: version 3");
  await expect(move).not.toContainText("See v3");
});
