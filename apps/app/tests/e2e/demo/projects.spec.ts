// The second half of the loop through the real UI (docs/plans/2026-10-15_idea-to-project.md §3-5): the
// lead of a planned project adds steps (one suggested by the idea's brief), takes the baseline and
// starts it; the board is worked and the project done; the clock moves 30 days at a time to each
// measure check; then the manager records the reward by the company's rule. Demo mode: one browser
// plays every person via the dev panel, on acme's seeded P-4 (T. Vogel's, from c9's yes).
import type { Page } from "@playwright/test";
import { expect, test } from "../helpers";

const FIRST = "Move the spare bench from line 1 next to the press for two weeks";
const TYPED = "Time the queue at five shift starts";

async function viewAs(page: Page, persona: "Employee" | "Team leader" | "Manager") {
  await page.getByRole("button", { name: "Dev" }).click();
  await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: persona, exact: true }).click();
  await page.keyboard.press("Escape");
}

/** Dev panel -> "+30 days", `times` times. */
async function plus30(page: Page, times = 1) {
  await page.getByRole("button", { name: "Dev" }).click();
  const panel = page.getByRole("dialog", { name: "Demo controls" });
  for (let k = 0; k < times; k++) await panel.getByRole("button", { name: /\+30 days/i }).click();
  await page.keyboard.press("Escape");
}

// The project page; its state ("P-4 · Running") and baseline line are in the header at the top.
const head = (page: Page) => page.getByRole("main");

test("a lead plans, runs and measures a project; the manager records the reward", async ({ page }) => {
  await page.goto("/acme");
  await viewAs(page, "Team leader");
  await expect(page).toHaveURL(/\/acme\/leader$/);

  await test.step("the lead finds P-4 under Planning", async () => {
    await page.getByRole("link", { name: "Projects", exact: true }).click();
    const planning = page.getByRole("region", { name: "Planning" });
    await expect(planning).toContainText("Take the baseline");
    await planning.getByRole("link", { name: /P-4 Second deburring bench/ }).click();
    await expect(page).toHaveURL(/\/acme\/projects\/pj4$/);
    await expect(page.getByRole("status").filter({ hasText: "Your move" })).toContainText("Take the baseline");
  });

  await test.step("adds a step the brief suggests and one of their own", async () => {
    await page.getByRole("button", { name: "Add step: " + FIRST }).click();
    await page.getByRole("textbox", { name: "New step" }).fill(TYPED);
    await page.getByRole("button", { name: "Add step", exact: true }).click();
    const todo = page.getByRole("group", { name: "To do" });
    await expect(todo.getByRole("article")).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Add step: " + FIRST })).toHaveCount(0);
  });

  await test.step("Start stays locked until the baseline is taken", async () => {
    await expect(page.getByRole("button", { name: "Start the project" })).toBeDisabled();
    await page.getByLabel("What is measured").fill("Deburring queue");
    await page.getByLabel(/Today.s number/).fill("25");
    await page.getByLabel("Unit").fill("minutes");
    await page.getByLabel("Lower is better").check();
    await page.getByLabel("Where the number comes from").fill("Stopwatch, five shift starts");
    await page.getByRole("button", { name: "Save the baseline" }).click();
    await expect(head(page)).toContainText("25 minutes · Deburring queue · lower is better");
    await page.getByRole("button", { name: "Start the project" }).click();
    await expect(head(page)).toContainText("P-4 · Running");
  });

  await test.step("works the board: blocked asks why, then both steps are done", async () => {
    await page.getByRole("button", { name: "Move “" + TYPED + "” to Blocked" }).click();
    await page.getByRole("textbox", { name: "What blocks it?" }).fill("Stopwatch is at the other site");
    await page.getByRole("button", { name: "Mark blocked" }).click();
    await expect(page.getByRole("group", { name: "Blocked" })).toContainText("Stopwatch is at the other site");
    await page.getByRole("button", { name: "Move “" + TYPED + "” to Done" }).click();
    await page.getByRole("button", { name: "Move “" + FIRST + "” to Done" }).click();
    await expect(page.getByRole("group", { name: "Done" }).getByRole("article")).toHaveCount(2);
  });

  await test.step("marks it done; the 30-day check opens 30 days later", async () => {
    await page.getByRole("textbox", { name: "What is done" }).fill("Second bench in use on every shift");
    await page.getByRole("button", { name: "Mark it done" }).click();
    await expect(head(page)).toContainText("P-4 · Measuring");
    const check30 = page.getByRole("group", { name: "30-day check" });
    await expect(check30).toContainText("Opens");
    await plus30(page);
    await check30.getByLabel(/The number now/).fill("12");
    await expect(check30.getByRole("status")).toContainText("better");
    await check30.getByRole("button", { name: "Record the measure" }).click();
    await expect(check30).toContainText("25 → 12 minutes");
    await expect(check30).toContainText("−52 %");
  });

  await test.step("records the 90-day check, worse than the 30-day one but still better than before", async () => {
    await plus30(page, 2);
    const check90 = page.getByRole("group", { name: "90-day check" });
    await check90.getByLabel(/The number now/).fill("14");
    await check90.getByRole("button", { name: "Record the measure" }).click();
    await expect(check90).toContainText("25 → 14 minutes");
    await expect(head(page)).toContainText("P-4 · Measured");
    // The lead does not record a reward: that is the manager's.
    await expect(page.getByRole("button", { name: "Record the reward" })).toHaveCount(0);
  });

  await test.step("the manager records the reward by the company's rule", async () => {
    await viewAs(page, "Manager");
    await page.goto("/acme/projects/pj4");
    const reward = page.getByRole("region", { name: "Reward" });
    await expect(reward).toContainText("Reward due by your rule: A thank-you, on record");
    await reward.getByLabel("Note (optional)").fill("Thanked at the shift meeting");
    await reward.getByRole("button", { name: "Record the reward" }).click();
    await expect(head(page)).toContainText("P-4 · Recognised");
    await expect(reward).toContainText("Recorded today by B. Hartmann: Thanked at the shift meeting");
  });
});

test("projects and the overview are tabs of one page", async ({ page }) => {
  await page.goto("/acme");
  await viewAs(page, "Team leader");
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Overview" })).toHaveCount(0);
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Ideas & problems" }).click();
  await expect(page).toHaveURL(/\/acme\/overview$/);
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Projects/ }).first()).toBeVisible();
});

test("a step is dragged to another column; a drop on Blocked asks why", async ({ page }) => {
  await page.goto("/acme");
  await viewAs(page, "Team leader");
  await page.goto("/acme/projects/pj4");
  await page.getByRole("textbox", { name: "New step" }).fill(TYPED);
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  const todo = page.getByRole("group", { name: "To do" });
  const card = todo.getByRole("article", { name: TYPED });
  await card.dragTo(page.getByRole("group", { name: "Doing" }));
  await expect(page.getByRole("group", { name: "Doing" }).getByRole("article", { name: TYPED })).toBeVisible();
  await page.getByRole("group", { name: "Doing" }).getByRole("article", { name: TYPED }).dragTo(page.getByRole("group", { name: "Blocked" }));
  const why = page.getByRole("textbox", { name: "What blocks it?" });
  await expect(why).toBeVisible();
  await expect(page.getByRole("group", { name: "Doing" }).getByRole("article", { name: TYPED })).toBeVisible(); // not moved until the reason is given
  await why.fill("Waiting for the stopwatch");
  await page.getByRole("button", { name: "Mark blocked" }).click();
  await expect(page.getByRole("group", { name: "Blocked" }).getByRole("article", { name: TYPED })).toContainText("Waiting for the stopwatch");
});

test("the project page shows the idea it came from", async ({ page }) => {
  await page.goto("/acme");
  await viewAs(page, "Team leader");
  await page.goto("/acme/projects/pj4");
  await expect(page.getByRole("heading", { name: "The idea" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Files and sources" })).toBeVisible();
});
