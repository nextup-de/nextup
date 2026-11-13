// Decision Q1.7: on the last look a member chooses to post an idea by name instead of their handle. Everything they
// do on that case afterwards carries the same name, so the case never links the two. In demo mode.
import { answerCoach, answerRail, DEVELOP, DEVELOP_MORE, expect, publishTo, raisedCaseId, raiseLine, showSidebar, test } from "../helpers";

test("a member posts one idea by name; the case and its later events carry the name, not the handle", async ({ page }) => {
  const title = "Forklift charging point blocks the fire exit";
  await page.goto("/acme/raise");
  await raiseLine(page, title);
  await answerCoach(page, DEVELOP);
  await answerCoach(page, DEVELOP_MORE);
  await answerRail(page);

  await showSidebar(page);
  await page.getByRole("button", { name: "Publish idea" }).click();
  const look = page.getByRole("dialog", { name: "Last look before it goes out" });
  const posting = look.getByTestId("raise-posting");
  await expect(posting).toBeVisible({ timeout: 30_000 });
  // The company preselects the handle.
  await expect(posting.getByTestId("raise-posting-handle")).toBeChecked();
  await expect(posting).toContainText("Nobody learns who you are");
  // The choice fits a phone.
  await page.setViewportSize({ width: 390, height: 844 });
  await posting.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await posting.getByTestId("raise-posting-name").check();
  await expect(posting).toContainText("read your name");
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/posting-phone.png` });
  await page.setViewportSize({ width: 1280, height: 800 });
  await publishTo(page, "T. Vogel");

  // The case page: raised by name; a withdraw by the same person carries the same name.
  await expect.poll(() => raisedCaseId(page, "Forklift charging point")).not.toBeNull();
  await page.goto(`/acme/cases/${await raisedCaseId(page, "Forklift charging point")}`);
  const main = page.getByRole("main");
  await expect(main).toContainText(/J(onas)?\.? Schmidt raised this/);
  await page.getByTestId("case-withdraw").click();
  await page.getByTestId("case-withdraw-confirm").click();
  await expect(main).toContainText(/J(onas)?\.? Schmidt withdrew the idea/);
  await expect(main).not.toContainText("Anonymous #");
});
