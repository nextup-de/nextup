// Acceptance for the plan tools (plan PLN): the manager of the demo company plans the running P-2 on its Plan page.
// Drag an unscheduled step onto a calendar day, schedule a second one from the keyboard, stretch a timeline bar by
// two days and undo it once, then create a milestone, add a step to it and mark it shipped. One browser plays
// the person through the dev panel; the steps the test adds carry no due day, so the seeded steps do not matter.
import type { Page } from "@playwright/test";
import { expect, test } from "../helpers";

const DRAGGED = "Acceptance: paint the floor marks";
const KEYED = "Acceptance: order the labels";
const MILESTONE = "Acceptance: pilot line ready";

async function viewAs(page: Page, persona: "Employee" | "Team leader" | "Manager") {
  await page.getByRole("button", { name: "Dev" }).click();
  await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: persona, exact: true }).click();
  await page.keyboard.press("Escape");
}

/** The date `days` from now as the date inputs want it, moved off a weekend. */
function isoIn(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

test("PLN acceptance: schedule from the drawer, stretch on the timeline, ship in a milestone", async ({ page }) => {
  await page.goto("/acme");
  await viewAs(page, "Manager");
  await page.goto("/acme/projects/pj2?page=plan");
  const calendar = page.getByRole("region", { name: "Calendar of steps" });
  // The tool section and the milestones list are both regions of that name; the list is the inner one.
  const milestones = page.getByRole("region", { name: "Milestones", exact: true }).filter({ has: page.getByRole("button", { name: "+ Create milestone" }) }).last();

  await test.step("two steps without a due day are added with the dialog", async () => {
    for (const title of [DRAGGED, KEYED]) {
      await page.getByRole("button", { name: "+ Add step", exact: true }).first().click();
      const dialog = page.getByRole("dialog", { name: "New step" });
      await dialog.getByRole("textbox", { name: "What needs doing?" }).fill(title);
      await dialog.getByRole("button", { name: "Add step" }).click();
      await expect(dialog).toHaveCount(0);
    }
  });

  await test.step("the Not scheduled drawer lists both; dragging one onto a day gives it a chip there", async () => {
    await calendar.getByRole("button", { name: /^Not scheduled/ }).click();
    const drawer = calendar.getByRole("complementary", { name: "Not scheduled" });
    await expect(drawer.getByRole("button", { name: "Open step: " + DRAGGED })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Open step: " + KEYED })).toBeVisible();
    const day = calendar.getByRole("group", { name: /, 0 steps$/ }).nth(12);
    // The draggable is the card's wrapper. The drag events carry one DataTransfer, as a real drag would.
    const source = drawer.locator('[draggable="true"]').filter({ hasText: DRAGGED });
    const transfer = await page.evaluateHandle(() => new DataTransfer());
    await source.dispatchEvent("dragstart", { dataTransfer: transfer });
    await day.dispatchEvent("dragover", { dataTransfer: transfer });
    await expect(calendar.getByRole("status").filter({ hasText: /^Due / }).first()).toBeVisible();
    await day.dispatchEvent("drop", { dataTransfer: transfer });
    // The day's name counts its steps, so it is now the day with one step, and the chip sits in it.
    await expect(calendar.getByRole("group", { name: /, 1 steps$/ }).getByRole("button", { name: "Open step: " + DRAGGED })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Open step: " + DRAGGED })).toHaveCount(0);
  });

  await test.step("Schedule… works from the keyboard for the second step", async () => {
    const drawer = calendar.getByRole("complementary", { name: "Not scheduled" });
    const row = drawer.getByRole("listitem").filter({ hasText: KEYED });
    await row.getByRole("button", { name: "Schedule…" }).focus();
    await page.keyboard.press("Enter");
    const picker = row.getByRole("form", { name: "Schedule…" });
    await expect(picker).toBeVisible();
    await picker.getByLabel("Date").fill(isoIn(5));
    await page.keyboard.press("Enter");
    await expect(picker).toHaveCount(0);
    await expect(calendar.getByRole("button", { name: "Open step: " + KEYED }).first()).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Open step: " + KEYED })).toHaveCount(0);
  });

  await test.step("stretching a timeline bar by two days sends one change; Undo takes it back", async () => {
    const handle = page.locator(`span[aria-label="Change the due day of ${DRAGGED}"]`);
    await handle.scrollIntoViewIfNeeded();
    const bar = handle.locator("xpath=..");
    const before = (await bar.boundingBox())!.width;
    const box = (await handle.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const dayPx = 96 / 7;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dayPx, y, { steps: 4 });
    await page.mouse.move(x + 2 * dayPx, y, { steps: 4 });
    await expect(page.getByRole("status").filter({ hasText: /\(was \d+ d\)/ })).toBeVisible();
    await page.mouse.up();
    const toast = page.getByRole("status").filter({ hasText: "Due date moved to" });
    await expect(toast).toBeVisible();
    await expect.poll(async () => Math.round(((await bar.boundingBox())!.width - before) / dayPx)).toBe(2);
    await toast.getByRole("button", { name: "Undo" }).click();
    await expect(toast).toHaveCount(0);
    await expect.poll(async () => Math.round(((await bar.boundingBox())!.width - before) / dayPx)).toBe(0);
  });

  await test.step("a milestone is created, takes a step and is marked shipped", async () => {
    await milestones.scrollIntoViewIfNeeded();
    await milestones.getByRole("button", { name: "+ Create milestone" }).click();
    const dialog = page.getByRole("dialog", { name: "Create milestone" });
    await dialog.getByRole("textbox", { name: "Name" }).fill(MILESTONE);
    await dialog.getByLabel("Ships").fill(isoIn(20));
    await dialog.getByRole("button", { name: "Create milestone" }).click();
    await expect(dialog).toHaveCount(0);
    const card = milestones.getByRole("article", { name: MILESTONE });
    await expect(card).toBeVisible();
    await expect(card).toContainText("Planned");
    await card.getByRole("button", { name: "Add steps →" }).click();
    const picker = card.getByRole("group", { name: "Steps without a milestone" });
    await picker.locator("div").filter({ hasText: DRAGGED }).getByRole("button", { name: "Add", exact: true }).first().click();
    await picker.getByRole("button", { name: "Done" }).click();
    await expect(card.getByRole("button", { name: DRAGGED, exact: true })).toBeVisible();
    await expect(card.getByRole("img", { name: "0 of 1 steps done" })).toBeVisible();
    await card.getByRole("button", { name: "Actions for " + MILESTONE }).click();
    await page.getByRole("menuitem", { name: "Mark shipped" }).click();
    await expect(card).toContainText("Shipped");
    await expect(card).toHaveAttribute("data-state", "shipped");
  });
});
