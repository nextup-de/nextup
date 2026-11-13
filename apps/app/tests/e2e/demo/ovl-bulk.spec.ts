// OVL bulk in the demo (plan OVL-U1, D21, D8): a holder selects two cases on the inbox and passes them to another desk with one why; both leave the inbox. The demo
// has no clock and no server, so this is the holders' side only: the same acts a single pass uses (act.pass), one event per case.
import type { Page } from "@playwright/test";
import { expect, test } from "../helpers";

/** Dev panel -> "Viewing as". Switching person also sends you to that person's home page. */
async function viewAs(page: Page, persona: "Employee" | "Team leader" | "Manager") {
  await page.getByRole("button", { name: "Dev" }).click();
  await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: persona, exact: true }).click();
  await page.keyboard.press("Escape");
}

test("OVL bulk in demo", async ({ page }) => {
  await page.goto("/acme");
  await viewAs(page, "Team leader");
  await expect(page).toHaveURL(/\/acme\/inbox$/);

  const decide = page.locator('[data-testid="inbox-row"][data-ask="decide"][data-kind="case"]');
  await expect(decide.first()).toBeVisible();
  const before = await decide.count();
  expect(before, "two cases to decide on the team leader's desk").toBeGreaterThanOrEqual(2);
  // Two cases of the team leader's own desk (route r1); the Rework case belongs to M. Roth's desk as well and stays visible when passed to them.
  const one = "Night shift has no one who can sign a €300 parts order";
  const two = "Changeover sheet and MES ask for the same six numbers";
  await expect(page.getByRole("main").getByText(one, { exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByText(two, { exact: true })).toBeVisible();

  await test.step("selecting two cases opens the bulk bar with the count", async () => {
    await page.getByTestId("inbox-select").click();
    await page.getByRole("checkbox", { name: one, exact: true }).check();
    await page.getByRole("checkbox", { name: two, exact: true }).check();
    await expect(page.getByTestId("bulk-bar")).toBeVisible();
    await expect(page.getByTestId("bulk-count")).toHaveText("2");
    // never a bulk no: the bar passes or asks, nothing else
    await expect(page.getByTestId("bulk-bar").getByRole("button", { name: /^No/ })).toHaveCount(0);
  });

  await test.step("with no reason the bar refuses and writes nothing", async () => {
    // M. Roth sits on the desk of route r2: another desk, so what is passed to them leaves this inbox.
    const seat = page.getByTestId("bulk-seat");
    await seat.selectOption(await seat.locator("option", { hasText: "M. Roth" }).first().getAttribute("value") ?? "");
    await page.getByTestId("bulk-send").click();
    await expect(page.getByRole("alert").filter({ hasText: /./ })).toBeVisible();
    await expect(decide).toHaveCount(before);
  });

  await test.step("one why passes both cases on; both leave the inbox", async () => {
    await page.getByTestId("bulk-text").fill("Both belong to the next desk: they are about its line");
    await page.getByTestId("bulk-send").click();
    await expect(page.getByTestId("bulk-done")).toContainText("2");
    await expect(decide).toHaveCount(before - 2);
    await expect(page.getByRole("main").getByText(one, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("main").getByText(two, { exact: true })).toHaveCount(0);
  });
});
