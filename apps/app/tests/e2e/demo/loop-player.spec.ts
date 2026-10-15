// The static demo's second half (features/ideas/demo-loop.ts, components/demo/LoopPlayer.tsx): once the
// script's idea is published, "What happens next" plays the rest of the loop one step at a time - the
// discussion, version 2, the check-in, the yes, the project, two measures and the thanks - and ends on
// the project, recognised. docs/plans/2026-10-15_idea-to-project.md, step 7.
import { aiMessages, ANSWER, expect, publishTo, START, test } from "../helpers";

test("the demo plays the loop to the end after the idea is published", async ({ page }) => {
  await page.goto("/demo");
  const player = page.getByRole("complementary", { name: "What happens next" });

  await test.step("the script's idea, its two answers, published to Thomas Vogel", async () => {
    await expect(player).toHaveCount(0);
    await page.getByRole("button", { name: "Insert the prepared idea" }).click();
    await expect(page.getByRole("textbox", { name: START })).not.toHaveValue("");
    await page.getByRole("button", { name: "Ask NextUp" }).click();
    await expect(aiMessages(page).first()).toBeVisible({ timeout: 30_000 });
    const box = page.getByRole("textbox", { name: ANSWER });
    for (const label of ["next answer", "last answer"]) {
      await page.getByRole("button", { name: "Insert the " + label }).click();
      await box.press("Enter");
      await expect(page.getByRole("button", { name: /^Insert the / }).or(page.getByRole("button", { name: "Publish now" })).first()).toBeVisible({ timeout: 30_000 });
    }
    await publishTo(page, "Thomas Vogel");
  });

  await test.step("the player walks the rest of the loop, one step per click", async () => {
    await expect(player).toBeVisible({ timeout: 20_000 });
    const said: string[] = [];
    for (let k = 0; k < 15 && (await player.count()) > 0; k++) {
      const text = (await player.locator("p").innerText()).trim();
      said.push(text);
      await player.getByRole("button", { name: "Play ▸" }).click();
      // The next step (or the end): the line under the button changes, or the player goes away.
      await expect(async () => {
        if ((await player.count()) === 0) return;
        expect((await player.locator("p").innerText()).trim()).not.toBe(text);
      }).toPass({ timeout: 15_000 });
    }
    await expect(player).toHaveCount(0);
    expect(said.length).toBeGreaterThanOrEqual(10);
    expect(said.some((s) => s.startsWith("Yes, do it"))).toBe(true);
  });

  await test.step("it ends on the project: measured better, the thanks on record", async () => {
    await expect(page).toHaveURL(/\/demo\/projects\/p_demo$/);
    const main = page.getByRole("main");
    await expect(main).toContainText("A setup cart for line 3");
    await expect(main).toContainText("38");
    await expect(main).toContainText("19");
    await expect(main.getByText("better").first()).toBeVisible();
    await expect(main).toContainText("Thank you, Jonas");
  });
});
