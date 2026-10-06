// The raise page, demo mode (no database: drafts in this browser, the offline coach). One line is
// evaluated and analysed; the chat shows the AI analysis and the rail of the five points a decision
// needs; the draft
// survives a reload; publishing asks who should get it and raises the case on their desk.
// docs/IDEAS.md.
import { aiMessages, answerCoach, DEVELOP, expect, publishTo, START, test } from "../helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/acme/raise");
});

test("one line is evaluated, analysed, and the rail shows what a decision still needs", async ({ page }) => {
  await page.getByRole("textbox", { name: START }).fill("A shared calendar for the endurance rig");
  await page.getByRole("button", { name: "Ask NextUp" }).click();
  await expect(page.getByRole("region", { name: "Evaluating" })).toBeVisible();

  // The analysis of the first answer: five dials.
  const close = page.getByRole("button", { name: "Close analysis" });
  const answer = page.getByRole("textbox", { name: "Answer, or add more detail…" });
  await expect(close.or(answer).first()).toBeVisible({ timeout: 30_000 });
  if (!(await close.isVisible())) await page.getByRole("button", { name: "Analysis", exact: true }).click();
  for (const label of ["Value", "Feasibility", "Cost", "Fit", "Risk"]) await expect(page.getByText(label, { exact: true })).toBeVisible();
  await close.click();

  // The chat: the coach's first answer with the AI analysis under it, and the rail of the five points a
  // decision needs, one of them next.
  await expect(aiMessages(page).first()).toContainText(/\S.{40,}/);
  await expect(page.getByRole("group", { name: "AI analysis" })).toBeVisible();
  await expect(page.locator("[data-rail-seg]")).toHaveCount(5);
  await expect(page.locator('[data-rail-seg][aria-label$="next"]')).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Publish idea" })).toBeEnabled();
});

test("develop it, keep it as a draft, publish it", async ({ page }) => {
  const title = "Reserve the endurance rig one day a week for our own experiments";
  await page.getByRole("textbox", { name: START }).fill(title);
  await page.getByRole("button", { name: "Ask NextUp" }).click();
  const close = page.getByRole("button", { name: "Close analysis" });
  const answer = page.getByRole("textbox", { name: "Answer, or add more detail…" });
  await expect(close.or(answer).first()).toBeVisible({ timeout: 30_000 });
  if (await close.isVisible()) await close.click();
  await expect(aiMessages(page).first()).toBeVisible({ timeout: 30_000 });
  await answerCoach(page, DEVELOP);

  // The draft is kept: after a reload it is under Ideas, with the answer.
  await page.reload();
  await page.getByRole("button", { name: new RegExp("^" + title.slice(0, 30)) }).first().click();
  await expect(page.getByText(DEVELOP)).toBeVisible();

  await publishTo(page, "T. Vogel");
  await expect(page.getByText(/on T\. Vogel’s desk/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Published", exact: true })).toBeDisabled(); // a status now, not a button
  await expect(page.getByRole("textbox", { name: "Add a follow-up — it goes to Overview" })).toBeVisible();
});
