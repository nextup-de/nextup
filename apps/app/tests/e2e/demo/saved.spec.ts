// "Saved per year" on the manager's Dashboard (features/metrics/impact.ts): one tile with the sum, and on a click the
// calculation. The demo seed: "Bundle new-hire access" saves 1,700 h per year on its confirmed 90-day check, priced with
// the demo's hour cost of €45; "Retrofit kit line" carries €180,000 per year on a check nobody has confirmed yet.
import { expect, test } from "../helpers";

test("the Dashboard shows what confirmed results save per year, and how the sum is made", async ({ page }) => {
  await page.goto("/acme");
  await page.getByRole("button", { name: "Dev" }).click();
  await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: "Manager", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.goto("/acme/dashboard");

  // Nothing was confirmed in the last 30 days: no tile, no 0.
  await expect(page.getByTestId("dashboard-tile-firstReasonedAnswer")).toBeVisible();
  await expect(page.getByTestId("dashboard-tile-saved")).toHaveCount(0);

  await page.getByTestId("dashboard-period-menu").click();
  await page.getByRole("menuitemradio", { name: "This quarter" }).click();
  const tile = page.getByTestId("dashboard-tile-saved");
  await expect(tile).toContainText("Saved per year");
  await expect(tile).toContainText("€76,500");

  await tile.click();
  const calc = page.getByTestId("dashboard-saved");
  const row = calc.getByTestId("dashboard-saved-row");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Bundle new-hire access into one request");
  await expect(row).toContainText("90-day check · 1,700 h × €45 =");
  await expect(row).toContainText("€76,500");
  await expect(calc.getByTestId("dashboard-saved-sum")).toContainText("€76,500");
  // Typed but not confirmed: never in the sum, one quiet line apart.
  await expect(calc.getByTestId("dashboard-saved-unconfirmed")).toHaveText("+ €180,000 not confirmed yet");
  await expect(row.getByRole("link", { name: "Bundle new-hire access into one request" })).toHaveAttribute("href", "/acme/projects/pj1");
});
