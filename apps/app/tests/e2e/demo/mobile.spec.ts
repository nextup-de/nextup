// Phone width (runs in the "phone" project only, Pixel 7): every page a person reaches fits the
// screen - nothing scrolls sideways - and raising works with a thumb.
import { expect, raiseProblem, test } from "../helpers";

const PAGES = ["/acme/raise", "/acme/team", "/acme/dashboard", "/acme/leader", "/acme/manager", "/acme/ideas", "/acme/problems"];

for (const path of PAGES) {
  test(`${path} fits a phone screen`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "pixels the page is wider than the screen").toBeLessThanOrEqual(1);
  });
}

test("raising a problem works on a phone", async ({ page }) => {
  await page.goto("/acme/raise");
  await raiseProblem(page, "Locker room on line 2 has no working light since Monday");
  await expect(page.getByText(/desk\./).first()).toBeVisible();
});
