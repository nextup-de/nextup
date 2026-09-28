// Small steps both suites repeat. Locators go by role and visible text - what a person sees -
// so a class rename never breaks a test, and a changed label does (which is worth knowing).
import { test as base, expect, type Page } from "@playwright/test";

/** `test` with one extra rule: any uncaught error in the page fails the test, not only a wrong assertion. */
export const test = base.extend<{ failOnPageError: void }>({
  failOnPageError: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await use();
      expect(errors, "uncaught errors in the page").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

// What the second message adds so any one-line idea clears the publish line (docs/IDEAS.md): a
// goal, a number, who it reaches, why, and a first step with no spend.
export const DEVELOP = "It serves the changeover goal: setup waits cost about 20 minutes per changeover on every shift, because the team waits for a slot. First step: a one-week pilot on line 3, no spend needed.";

/**
 * Publish an idea from the member home (the idea studio): the one line, then DEVELOP as the answer
 * to the coach, then Publish once the score allows it. On a phone the actions live in a bottom
 * sheet opened from the score. Waits until the route is shown.
 */
export async function publishIdea(page: Page, title: string) {
  const box = page.getByRole("textbox", { name: "Your idea" });
  await box.fill(title);
  await box.press("Enter");
  await expect(page.getByRole("region", { name: "Benchmarks" })).toBeVisible({ timeout: 30_000 });
  await box.fill(DEVELOP);
  await box.press("Enter");
  await expect(page.getByText(/^Up \d+ to \d+/)).toBeVisible({ timeout: 30_000 });
  const publish = page.getByRole("button", { name: "Publish idea" });
  // Phones: the panel is a bottom sheet, parked off-screen (still "visible" to Playwright) until the score opens it.
  const sheet = page.getByRole("button", { name: /— actions$/ });
  if (await sheet.isVisible()) await sheet.click();
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(page.getByRole("dialog", { name: "Publishing your idea" }).getByRole("link", { name: "Open the case" })).toBeVisible({ timeout: 30_000 });
}

/** The sheet that opens for "No, and why", "Ask a question", "Answer …". */
export const sheet = (page: Page) => page.getByRole("dialog").filter({ has: page.locator("textarea") });

/** Type into the open sheet and press its confirm button. */
export async function confirmSheet(page: Page, text: string, confirm: string) {
  await sheet(page).locator("textarea").fill(text);
  await page.getByRole("button", { name: confirm }).click();
  await expect(sheet(page)).toBeHidden();
}
