// Collaboration: the project list is not cut down by a department nobody can see or change, and a phone
// opens the org chart at a size that can be read. "Fit all" still shows the whole chart.
import { expect, test } from "../helpers";

const PAGE = "/demo/projects/collaboration";

test("Collaboration lists the projects this viewer may see", async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.getByText(/^\d+ of \d+$/).first()).toHaveText("2 of 2");
  await expect(page.getByText("No project matches")).toHaveCount(0);
});

test("a phone opens the org chart readable, and Fit all shows all of it", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(PAGE);
  const zoom = page.getByText(/^\d+%$/).first();
  await expect(zoom).toHaveText("70%");
  // The demo's own panel can cover the button on a phone; this checks the chart, not that panel.
  await page.getByRole("button", { name: "Fit all" }).dispatchEvent("click");
  await expect.poll(async () => Number((await zoom.innerText()).replace("%", ""))).toBeLessThan(70);
});
