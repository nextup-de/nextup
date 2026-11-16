// Collaboration (Kevin, 16 Nov 2026): projects only, in three lists - the projects you work on, requests to you and your
// unit, and the projects run across units with the units as a column. The org chart it showed before is gone from here.
import { expect, test } from "../helpers";

const PAGE = "/demo/projects/collaboration";

test("Collaboration lists the projects run across units, with their units", async ({ page }) => {
  await page.goto(PAGE);
  const across = page.getByTestId("section-card").filter({ has: page.getByRole("heading", { name: "Across units" }) });
  await expect(across.getByRole("columnheader", { name: "Units" })).toBeVisible();
  await expect(across.getByRole("link", { name: /^P-\d+ · / }).first()).toBeVisible();
  await expect(page.getByRole("table", { name: "Problems and ideas" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /zoom out/i })).toHaveCount(0);
});

test("on a phone Collaboration fits the width", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(PAGE);
  await expect(page.getByRole("heading", { name: "Across units" })).toBeVisible();
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});
