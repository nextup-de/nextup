// Decision Q1.14: the raiser withdraws an idea nobody has decided yet, from the case page. In demo mode.
import { expect, publishIdea, raisedCaseId, test } from "../helpers";

test("the raiser withdraws an undecided idea with a reason, and it reads as withdrawn", async ({ page }) => {
  const title = "Small tools have no tray on the changeover cart";
  await page.goto("/acme/raise");
  await publishIdea(page, title);
  await expect.poll(() => raisedCaseId(page, "Small tools have no tray")).not.toBeNull();
  const id = await raisedCaseId(page, "Small tools have no tray");

  // The idea's one page (/idea?id=, 16 Nov 2026), on a phone: the phone draws its own layout, so the whole withdrawal
  // happens at phone width, and the open row fits it: nothing wider than the screen.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/acme/cases/${id}`);
  await expect(page.getByTestId("case-answer-by").filter({ visible: true })).toBeVisible();
  await page.getByTestId("case-withdraw").filter({ visible: true }).click();
  await page.getByRole("textbox", { name: "Why, in one line (optional)" }).filter({ visible: true }).fill("We fixed it on the line ourselves.");
  await page.getByTestId("case-withdraw-confirm").filter({ visible: true }).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/withdraw-phone.png` });
  await page.getByTestId("case-withdraw-confirm").filter({ visible: true }).click();
  await page.setViewportSize({ width: 1280, height: 800 });

  const main = page.getByRole("main");
  await expect(main).toContainText("Withdrawn by the person who raised it."); // the idea card's line (one idea page, 16 Nov 2026)
  await expect(main).toContainText("withdrew the idea: We fixed it on the line ourselves.");
  await expect(page.getByTestId("case-withdraw")).toHaveCount(0);
  await expect(page.getByTestId("case-answer-by"), "a withdrawn idea promises no answer").toHaveCount(0);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/withdraw-done.png` });

  await page.goto("/acme/team");
  const row = page.getByRole("main").locator("li, article, [data-row]").filter({ hasText: title }).first();
  await expect(row).toContainText("Withdrawn");
});
