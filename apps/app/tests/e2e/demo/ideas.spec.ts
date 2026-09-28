// The idea studio, demo mode (no database: drafts in this browser, the offline coach). A one-liner
// is scored and held back; developing it with the coach lifts it over the line; the draft survives a
// reload; publishing puts it on the team lead's desk. docs/IDEAS.md.
import { DEVELOP, expect, test } from "../helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/acme/raise");
});

test("a one-liner is scored on four bars and cannot be published yet", async ({ page }) => {
  const box = page.getByRole("textbox", { name: "Your idea" });
  await box.fill("A shared calendar for the endurance rig");
  await box.press("Enter");

  const bench = page.getByRole("region", { name: "Benchmarks" });
  await expect(bench).toBeVisible({ timeout: 30_000 });
  for (const label of ["Strategic fit", "Impact & reach", "Feasibility", "Novelty & clarity"]) await expect(bench.getByText(label)).toBeVisible();
  await expect(page.getByText(/^First read: \d+ of 100/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish idea" })).toBeDisabled();
  await expect(page.getByText(/points to publish/)).toBeVisible();
});

test("develop it, keep it as a draft, publish it", async ({ page }) => {
  const title = "Reserve the endurance rig one day a week for our own experiments";
  const box = page.getByRole("textbox", { name: "Your idea" });
  await box.fill(title);
  await box.press("Enter");
  await expect(page.getByRole("region", { name: "Benchmarks" })).toBeVisible({ timeout: 30_000 });
  await box.fill(DEVELOP);
  await box.press("Enter");
  await expect(page.getByText(/^Up \d+ to \d+/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Publish idea" })).toBeEnabled();

  // The draft is kept: after a reload it is on the left, with both messages.
  await page.reload();
  const rail = page.getByRole("navigation", { name: "Your ideas" });
  await rail.getByRole("button", { name: new RegExp(title.slice(0, 30)) }).click();
  await expect(page.getByText(DEVELOP)).toBeVisible();

  await page.getByRole("button", { name: "Publish idea" }).click();
  const done = page.getByRole("dialog", { name: "Publishing your idea" });
  await expect(done.getByText(/On T\. Vogel’s desk/)).toBeVisible({ timeout: 30_000 });
  await expect(rail.getByRole("button", { name: /^✓ Reserve the endurance rig/ })).toBeVisible(); // moved under Published
  await expect(page.getByRole("textbox", { name: "Your idea" })).toHaveCount(0); // a published idea is read-only
});
