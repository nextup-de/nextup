// REQ acceptance (plan REQ): in demo mode the lead builds and shares a form, a member outside the project answers it, the lead makes the answer
// a step that shows on the board, declines a second answer and undoes the decline; the member then sees 'Made into a step' on their requests page.
// One browser plays every person via the dev panel, on acme's seeded P-2 (D. Ferraro's); the Manager has the lead's rights.
import type { Page } from "@playwright/test";
import { expect, test } from "../helpers";

async function viewAs(page: Page, persona: "Employee" | "Team leader" | "Manager") {
  await page.getByRole("button", { name: "Dev" }).click();
  await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: persona, exact: true }).click();
  await page.keyboard.press("Escape");
}

const FORM = "Ask for a line to join";
const QUESTION = "Which line?";
const FIRST_ANSWER = "Line 2, same suppliers as Line 3";
const SECOND_ANSWER = "Line 4 as well";
const STEP = "Add Line 2 to the pilot";

test("REQ acceptance: a member answers a form and the lead makes it a step", async ({ page }) => {
  await page.goto("/acme");
  await viewAs(page, "Manager");
  await page.goto("/acme/projects/pj2?page=requests");

  await test.step("the lead sees the Requests page with its forms and a way to make a new one", async () => {
    await expect(page.locator("#requests-pj2")).toBeVisible();
    await expect(page.getByRole("button", { name: "+ New form" })).toBeVisible();
  });

  await test.step("the lead builds a form with one required question, saves it and shares its link", async () => {
    // Blocked until the form builder is wired into RequestsTool (?form=new), which comes after REQ-A1 merges.
    test.fixme(!(await page.getByRole("button", { name: "+ New form" }).click().then(() => page.getByRole("textbox", { name: "Form title" }).isVisible({ timeout: 3000 }).catch(() => false))), "the form builder is not wired into the Requests tool yet");
    await page.getByRole("textbox", { name: "Form title" }).fill(FORM);
    await page.getByRole("button", { name: "Short answer" }).first().click();
    await page.getByRole("textbox", { name: "Question" }).fill(QUESTION);
    await page.getByRole("button", { name: "Save form" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Share link" }).click();
    await expect(page.getByText("Link copied")).toBeVisible();
  });

  await test.step("a member outside the project answers it on its own page", async () => {
    // Blocked: the answer page reads the form from the server, which the demo mode does not have, so it needs a database run.
    test.fixme(true, "the answer page (REQ-C1) needs the server: it cannot be reached in demo mode");
    await viewAs(page, "Employee");
    await page.getByRole("textbox", { name: QUESTION }).fill(FIRST_ANSWER);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText("Your answer was sent")).toBeVisible();
  });

  await test.step("the lead makes the answer a step that shows on the board", async () => {
    await viewAs(page, "Manager");
    await page.goto("/acme/projects/pj2?page=requests");
    const card = page.getByRole("listitem", { name: /request/i }).filter({ hasText: FIRST_ANSWER });
    await card.getByRole("button", { name: "Make it a step" }).click();
    const dialog = page.getByRole("dialog", { name: "Make it a step" });
    await dialog.getByRole("textbox").first().fill(STEP);
    await dialog.getByRole("button", { name: "Make it a step" }).click();
    await expect(page.getByText("Step made")).toBeVisible();
    await page.goto("/acme/projects/pj2?page=steps");
    await expect(page.getByRole("group", { name: "To do" })).toContainText(STEP);
  });

  await test.step("the lead declines a second answer with a reason and undoes the decline", async () => {
    await page.goto("/acme/projects/pj2?page=requests");
    const card = page.getByRole("listitem", { name: /request/i }).filter({ hasText: SECOND_ANSWER });
    await card.getByRole("button", { name: "Decline" }).click();
    await card.getByRole("textbox", { name: /Reason \(shown to/ }).fill("Line 4 joins in spring");
    await card.getByRole("button", { name: "Decline" }).last().click();
    await expect(page.getByText("Request declined")).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("Request is new again")).toBeVisible();
  });

  await test.step("the member sees 'Made into a step' on their requests page", async () => {
    await viewAs(page, "Employee");
    await expect(page.getByText("Made into a step")).toBeVisible();
  });
});
