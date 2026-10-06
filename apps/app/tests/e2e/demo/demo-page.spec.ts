// The static demo (/demo, docs/IDEAS.md "The demo page"): no company, no login. The prepared idea and two
// prepared answers, one click each, the coach's prepared replies after a short pause, then publish it and
// find it on the dashboard - and a reload starts over. A company's /raise offers none of it.
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

  await test.step("published to T. Vogel, and on the dashboard", async () => {
    await publishTo(page, "T. Vogel");
    await page.getByRole("link", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/demo\/dashboard$/);
    await expect(page.getByRole("main")).toContainText(TITLE);
  });

  await test.step("a reload starts the demo over", async () => {
    await page.reload();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText(TITLE);
  });
});

test("a company's raise page has no demo script", async ({ page }) => {
  await page.goto("/acme/raise");
  await expect(page.getByRole("textbox", { name: START })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Insert the / })).toHaveCount(0);
});
