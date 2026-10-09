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

// The raise page (docs/IDEAS.md): the start composer, the chat composer, and the window that asks
// who should get a published idea.
export const START = "Share an idea that would make work better…";
export const ANSWER = "Answer, or add more detail…";
export const aiMessages = (page: Page) => page.locator('[data-role="ai"]');

/**
 * Raise one line from the start page and wait for the coach's first answer. NextUp evaluates it,
 * and may open its analysis of that first answer: closed again here, so the chat is in front.
 */
export async function raiseLine(page: Page, title: string) {
  await page.getByRole("textbox", { name: START }).fill(title);
  await page.getByRole("button", { name: "Ask NextUp" }).click();
  const close = page.getByRole("button", { name: "Close analysis" });
  const answer = page.getByRole("textbox", { name: ANSWER });
  await expect(close.or(answer).first()).toBeVisible({ timeout: 30_000 });
  if (await close.isVisible()) await close.click();
  await expect(aiMessages(page).first()).toBeVisible({ timeout: 30_000 });
}

/**
 * Send an answer to the coach and wait for its reply. On a live stack the reply shows while it
 * streams, but Enter is ignored until it is stored - Send turns on then, so wait for that first.
 */
export async function answerCoach(page: Page, text: string) {
  const before = await aiMessages(page).count();
  const box = page.getByRole("textbox", { name: ANSWER });
  await box.fill(text);
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled({ timeout: 30_000 });
  await box.press("Enter");
  await expect(aiMessages(page)).toHaveCount(before + 1, { timeout: 30_000 });
}

/**
 * "Publish idea", then "Who should get this?": pick `to` among the suggestions, or find them under
 * "Choose someone else". Waits until the case is raised (the chat offers "Open the case").
 * On a phone the sidebar is a drawer, opened first.
 */
export async function publishTo(page: Page, to: string) {
  const show = page.getByRole("button", { name: "Show sidebar" });
  if (await show.isVisible()) await show.click();
  await page.getByRole("button", { name: "Publish idea" }).click();
  const who = page.getByRole("dialog", { name: "Who should get this?" });
  await expect(who).toBeVisible({ timeout: 30_000 });
  const offered = who.getByRole("radio").filter({ hasText: to }); // by its text: no pattern built from the name
  if (await offered.count()) await offered.first().click();
  else {
    await who.getByRole("button", { name: /Choose someone else/ }).click();
    await who.getByRole("textbox", { name: "Search people" }).fill(to);
    await who.getByRole("button").filter({ hasText: to }).first().click();
  }
  await who.getByRole("button", { name: "Send to " + to }).click();
  await expect(page.getByRole("link", { name: "Open the case" })).toBeVisible({ timeout: 30_000 });
}

/**
 * Publish an idea from the member home: the one line, DEVELOP as the answer to the coach, then
 * publish it to `to` (the team lead in the demo). Waits until the case is raised.
 */
export async function publishIdea(page: Page, title: string, to = "T. Vogel") {
  await raiseLine(page, title);
  await answerCoach(page, DEVELOP);
  await publishTo(page, to);
}

/** The sheet that opens for "No, and why", "Ask a question", "Answer …". */
export const sheet = (page: Page) => page.getByRole("dialog").filter({ has: page.locator("textarea") });

/** Type into the open sheet and press its confirm button. */
export async function confirmSheet(page: Page, text: string, confirm: string) {
  await sheet(page).locator("textarea").fill(text);
  await page.getByRole("button", { name: confirm }).click();
  await expect(sheet(page)).toBeHidden();
}
