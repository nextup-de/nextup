// The loop the product exists for, through the real UI (port of .github/ci/flow.test.cjs for the
// legacy demo): an employee raises a problem -> it lands on the right leader's desk -> the leader
// asks one question -> the employee answers -> the leader says no, with a reason -> the employee
// sees the no, the reason and the name. Demo mode: one browser plays every person via the dev panel.
import type { Page } from "@playwright/test";
import { confirmSheet, expect, raiseProblem, sheet, test } from "../helpers";

const TITLE = "The Friday shift plan leaves line 3 with no overtime hours for the changeover";

/** Dev panel -> "Viewing as". Switching person also sends you to that person's home page. */
async function viewAs(page: Page, persona: "Employee" | "Team leader" | "Manager") {
  await page.getByRole("button", { name: "Dev" }).click();
  await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: persona, exact: true }).click();
  await page.keyboard.press("Escape");
}

test.beforeEach(async ({ page }) => {
  await page.goto("/acme");
});

test("a raised problem goes round the whole loop", async ({ page }) => {
  await test.step("employee raises it; the router puts it on T. Vogel's desk", async () => {
    await expect(page).toHaveURL(/\/acme\/raise$/);
    await raiseProblem(page, TITLE);
    await expect(page.getByText("On T. Vogel’s desk.")).toBeVisible();
  });

  await test.step("it is in the team leader's inbox at 0 days", async () => {
    await viewAs(page, "Team leader");
    await expect(page).toHaveURL(/\/acme\/leader$/);
    const row = page.getByRole("main").getByText(TITLE).first();
    await expect(row).toBeVisible();
    await row.click();
  });

  await test.step("the leader asks one question and the clock pauses", async () => {
    await page.getByRole("button", { name: "Ask a question" }).click();
    // Confirm stays a hint until there is a question to send.
    await expect(sheet(page).getByRole("button", { name: "Type the question" })).toBeVisible();
    await confirmSheet(page, "Which shift - early or late?", "Send the question");
    await expect(page.getByText(/Waiting for .+ to answer · clock paused at 0 d\./)).toBeVisible();
    await expect(page.getByRole("button", { name: "Yes, do it" })).toHaveCount(0);
  });

  await test.step("the employee sees the question and answers it", async () => {
    await viewAs(page, "Employee");
    await page.goto("/acme/team");
    await expect(page.getByText("“Which shift - early or late?”")).toBeVisible();
    await page.getByRole("button", { name: "Answer T. Vogel" }).click();
    await confirmSheet(page, "The late shift, 14:00-22:00.", "Send the answer");
    await expect(page.getByRole("button", { name: "Answer T. Vogel" })).toHaveCount(0);
  });

  await test.step("the leader says no, with a reason", async () => {
    await viewAs(page, "Team leader");
    await page.getByRole("main").getByText(TITLE).first().click();
    await expect(page.getByRole("button", { name: "Yes, do it" })).toBeVisible();
    await page.getByRole("button", { name: "No, and why" }).click();
    await expect(sheet(page).getByRole("button", { name: "Pick a reason" })).toBeVisible();
    await sheet(page).getByRole("button", { name: /No time this quarter/ }).click();
    await confirmSheet(page, "Q4 at the earliest - the fixture team is on the 4-series until then", "Send the no");
    await expect(page.getByText(/Answered “no” in 0 days — no time\./)).toBeVisible();
  });

  await test.step("the employee sees the no, the reason and who said it - also after a reload", async () => {
    await viewAs(page, "Employee");
    await page.goto("/acme/team");
    const card = page.getByRole("article", { name: TITLE });
    await expect(card).toContainText("Answered: no");
    await expect(card).toContainText("Answered “no” in 0 days — no time.");
    await expect(card).toContainText("Q4 at the earliest - the fixture team is on the 4-series until then");
    await expect(card).toContainText("T. Vogel · today");
    await page.reload();
    await expect(page.getByRole("article", { name: TITLE })).toContainText("Answered: no");
  });
});

test("each person lands on their own home page", async ({ page }) => {
  await expect(page).toHaveURL(/\/acme\/raise$/);
  await viewAs(page, "Team leader");
  await expect(page).toHaveURL(/\/acme\/leader$/);
  await viewAs(page, "Manager");
  await expect(page).toHaveURL(/\/acme\/manager$/);
});

test("an answer that is late moves to the deputy on its own", async ({ page }) => {
  await raiseProblem(page, "Holiday roster for the late shift is still missing for October");
  await page.getByRole("button", { name: "Dev" }).click();
  const panel = page.getByRole("dialog", { name: "Demo controls" });
  // The promise is five days; on day six it belongs to the deputy as well.
  for (let day = 0; day < 6; day++) await panel.getByRole("button", { name: /\+1 day/ }).click();
  await page.keyboard.press("Escape");
  await page.goto("/acme/team");
  await expect(page.getByRole("main")).toContainText(/Moved to .+ automatically/);
});
