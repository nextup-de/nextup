// The static demo (/demo, docs/IDEAS.md "The demo page"): no company, no login. The prepared idea and two
// prepared answers, one click each, the coach's prepared replies after a short pause, then publish it: the
// case opens with its main points, the desk asks a question by itself, the dashboard shows every status
// and opens each case at its own address - and a reload starts over. A company's /raise offers none of it.
import { aiMessages, ANSWER, expect, publishTo, START, test } from "../helpers";

const TITLE = "A shared setup cart for line 3, so a changeover never waits for tools";

test("the demo page: prepared idea, two prepared answers, published, on the dashboard", async ({ page }) => {
  await page.goto("/demo");
  await expect(page).toHaveURL(/\/demo\/raise$/);
  const start = page.getByRole("textbox", { name: START });

  await test.step("the prepared idea goes into the field with one click, and the coach answers it", async () => {
    await page.getByRole("button", { name: "Insert the prepared idea" }).click();
    await expect(start).toHaveValue(TITLE);
    await page.getByRole("button", { name: "Ask NextUp" }).click();
    // No analysis first on this page: the reply is in the chat, and it carries no scores.
    await expect(aiMessages(page).first()).toContainText("It serves “Every changeover under 20 minutes”", { timeout: 30_000 });
    await expect(aiMessages(page).first()).not.toContainText("of 100");
  });

  await test.step("two prepared answers, each one click away, each answered", async () => {
    const box = page.getByRole("textbox", { name: ANSWER });
    for (const [label, reply] of [["next answer", "That number did the work."], ["last answer", "It is ready: publish it"]]) {
      await page.getByRole("button", { name: "Insert the " + label }).click();
      await expect(box).not.toHaveValue("");
      await box.press("Enter");
      await expect(aiMessages(page).last()).toContainText(reply, { timeout: 30_000 });
    }
    await expect(page.getByRole("button", { name: /^Insert the / })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Publish now" })).toBeVisible();
  });

  await test.step("published to Thomas Vogel: the case shows its main points, and he asks a question", async () => {
    await publishTo(page, "Thomas Vogel");
    await page.getByRole("link", { name: "Open the case" }).click();
    await expect(page).toHaveURL(/\/demo\/cases\/c_\w+$/);
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: TITLE, level: 1 })).toBeVisible();
    for (const label of ["Worth", "First step", "Cost", "Still open"]) await expect(main.getByText(label, { exact: true })).toBeVisible();
    await expect(main).toContainText("Which tools go on the cart first?", { timeout: 15_000 });
  });

  await test.step("the dashboard: every status, and each row opens at its own address", async () => {
    await page.getByRole("button", { name: "Back to the dashboard" }).click();
    await expect(page).toHaveURL(/\/demo\/dashboard$/);
    const main = page.getByRole("main");
    await expect(main).toContainText(TITLE);
    for (const t of ["Your move", "Replied", "past promise", "Building", "Shipped"]) await expect(main.getByText(t, { exact: true }).first()).toBeVisible();
    await main.getByText("Ear defenders in two sizes at the press").click();
    await expect(page).toHaveURL(/\/demo\/cases\/d2$/);
    await expect(main).toContainText("€250 covers everyone");
  });

  await test.step("the dev panel is there, and a reload starts the demo over", async () => {
    await expect(page.getByRole("button", { name: "Dev", exact: true })).toBeVisible();
    await page.goto("/demo/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText(TITLE);
  });
});

test("a company's raise page has no demo script", async ({ page }) => {
  await page.goto("/acme/raise");
  await expect(page.getByRole("textbox", { name: START })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Insert the / })).toHaveCount(0);
});
