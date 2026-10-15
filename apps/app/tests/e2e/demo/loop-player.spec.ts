// The static demo's second half (features/ideas/demo-loop.ts, components/demo/LoopPlayer.tsx): once the
// script's idea is published, "What happens next" plays the rest of the loop one step at a time - the
// discussion, version 2, the check-in, the yes, the project, two measures and the thanks - and ends on
// the project, recognised. docs/plans/2026-10-15_idea-to-project.md, step 7.
import { aiMessages, ANSWER, expect, publishTo, START, test } from "../helpers";

test("the demo plays the loop to the end after the idea is published", async ({ page }) => {
  await page.goto("/demo");
  const player = page.getByRole("complementary", { name: "What happens next" });
  const controls = page.getByRole("group", { name: "Demo controls" });
  const step = (name: string) => controls.getByRole("button", { name, exact: true });

  await test.step("the script's idea, the whole conversation, published to Thomas Vogel", async () => {
    await expect(player).toHaveCount(0);
    await step("Start demo").click();
    await step("Fill sample idea").click();
    await expect(page.getByRole("textbox", { name: START })).not.toHaveValue("");
    await page.getByRole("button", { name: "Ask NextUp" }).click();
    const box = page.getByRole("textbox", { name: ANSWER });
    for (const label of ["First answer", "Second answer"]) {
      await expect(step(label)).toBeEnabled({ timeout: 30_000 });
      await step(label).click();
      await box.press("Enter");
    }
    await expect(step("Full conversation")).toBeEnabled({ timeout: 30_000 });
    await step("Full conversation").click();
    await expect(aiMessages(page).last()).toContainText("Everything on the right is answered");
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
    await expect(main).toContainText("A reporting screen at station 4");
    await expect(main).toContainText("15");
    await expect(main).toContainText("4");
    await expect(main.getByText("better").first()).toBeVisible();
    await expect(main).toContainText("Thank you, Jonas");
  });
});
