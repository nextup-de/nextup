// Acceptance for the step tools (plan STP): the manager of the demo company works the Steps page of the running P-2.
// Filter to Only mine, group by person, drag a card to Blocked and name what it waits for, change a due day
// in the List with the keyboard, tick a checklist item and reply to a comment. One browser plays the people
// through the dev panel; the steps the test adds carry their owner, so the seeded steps do not matter.
import type { Page } from "@playwright/test";
import { addPages, expect, test } from "../helpers";

const MINE = "Acceptance: time the deburring queue";
const OTHER = "Acceptance: order the stopwatch";
const ITEM = "Charge the stopwatch";
const COMMENT = "The queue timing starts on Monday";
const REPLY = "Agreed, I will bring the stopwatch";

async function viewAs(page: Page, persona: "Employee" | "Team leader" | "Manager") {
  await page.getByRole("button", { name: "Dev" }).click();
  await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: persona, exact: true }).click();
  await page.keyboard.press("Escape");
}

test("STP acceptance: filter, group, drag to Blocked, edit a cell, comment on a step", async ({ page }) => {
  await page.goto("/acme");
  await viewAs(page, "Manager");
  await addPages(page, "/acme/projects/pj2", ["Steps"]);
  await page.goto("/acme/projects/pj2?page=steps");
  const board = page.getByRole("region", { name: "Board", exact: true });
  const list = page.getByRole("region", { name: "List", exact: true });
  // The first tool's filter row sits in the page header, outside its region.
  const bar = page.getByTestId("step-filter-row").first();

  await test.step("the manager adds one step owned by themself (the dialog) and one owned by L. Brandt (the board)", async () => {
    await page.getByRole("button", { name: /^\+\s*Add step$/ }).first().click();
    const dialog = page.getByRole("dialog", { name: "New step" });
    await dialog.getByRole("textbox", { name: "What needs doing?" }).fill(MINE);
    await dialog.getByRole("button", { name: "Add step" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(board.getByRole("article").filter({ hasText: MINE })).toBeVisible();
    await board.getByRole("button", { name: "Add a step to To do" }).click();
    const composer = board.getByRole("group", { name: "To do" });
    await composer.getByRole("combobox", { name: "Owner" }).selectOption({ label: "L. Brandt" });
    await composer.getByRole("textbox", { name: "New step" }).fill(OTHER);
    await composer.getByRole("textbox", { name: "New step" }).press("Enter");
    await expect(composer.getByRole("article").filter({ hasText: OTHER })).toBeVisible();
  });

  await test.step("Only mine keeps the lead's step, hides the others and says how many it shows", async () => {
    await bar.getByRole("button", { name: "Only mine" }).click();
    await expect(bar.getByRole("button", { name: "Only mine" })).toHaveAttribute("aria-pressed", "true");
    await expect(board.getByRole("article").filter({ hasText: MINE })).toBeVisible();
    await expect(board.getByRole("article").filter({ hasText: OTHER })).toHaveCount(0);
    await expect(board.getByRole("article").filter({ hasText: "Offline form on the service tablets" })).toHaveCount(0);
    await expect(board.getByRole("button", { name: /^Showing \d+ of 10 · Clear filter$/ })).toBeVisible();
  });

  await test.step("grouping by person shows the lead's own lane", async () => {
    await bar.getByRole("button", { name: "By person" }).click();
    await expect(board.getByRole("button", { name: /^▾?\s*You/ })).toBeVisible();
    await expect(board.getByRole("article").filter({ hasText: MINE })).toBeVisible();
    await bar.getByRole("button", { name: "By status" }).click();
    await expect(bar.getByRole("button", { name: "By status" })).toHaveAttribute("aria-pressed", "true");
  });

  await test.step("dragging the step to Blocked asks what it waits for, then the card says it", async () => {
    const blocked = board.getByRole("group", { name: "Blocked" });
    await board.getByRole("article").filter({ hasText: MINE }).dragTo(blocked);
    const form = board.getByRole("form", { name: "What is it waiting for?" });
    await expect(form).toBeVisible();
    await form.getByRole("textbox", { name: "Question or reason" }).fill("Needs the stopwatch from the depot");
    await form.getByRole("button", { name: "Someone outside" }).click();
    await form.getByRole("textbox", { name: "Name" }).fill("Ulm depot");
    await form.getByRole("button", { name: "Mark blocked" }).click();
    await expect(form).toHaveCount(0);
    await expect(blocked.getByRole("article").filter({ hasText: MINE })).toContainText("Waiting on Ulm depot");
    await board.getByRole("button", { name: /^Showing \d+ of 10 · Clear filter$/ }).click();
    await expect(board.getByRole("button", { name: /Clear filter/ })).toHaveCount(0);
  });

  await test.step("the List changes a due day from the keyboard", async () => {
    await list.getByRole("searchbox", { name: "Search this list" }).fill(OTHER);
    const row = list.getByRole("row").filter({ hasText: OTHER });
    await expect(row).toHaveCount(1);
    const due = row.getByRole("button", { name: "Change due date" });
    const before = await due.innerText();
    await due.focus();
    await page.keyboard.press("Enter");
    const menu = row.getByRole("dialog", { name: "Change due date" });
    await expect(menu).toBeVisible();
    await menu.getByRole("button", { name: "+1 week" }).focus();
    await page.keyboard.press("Enter");
    await expect(menu).toHaveCount(0);
    await expect(due).not.toHaveText(before);
  });

  await test.step("a checklist item ticked in the panel counts as done", async () => {
    await board.getByRole("button", { name: "Open step: " + MINE, exact: true }).click();
    const sheet = page.getByRole("dialog", { name: MINE, exact: true }).last();
    await sheet.getByRole("button", { name: "Add a step inside" }).click();
    await sheet.getByRole("textbox", { name: "What needs doing?" }).fill(ITEM);
    await sheet.getByRole("textbox", { name: "What needs doing?" }).press("Enter");
    await expect(sheet.getByRole("heading", { name: "Steps inside · 0 of 1 done" })).toBeVisible();
    await sheet.getByRole("checkbox", { name: ITEM }).check();
    await expect(sheet.getByRole("heading", { name: "Steps inside · 1 of 1 done" })).toBeVisible();
  });

  await test.step("a reply shows under the comment it answers", async () => {
    const sheet = page.getByRole("dialog", { name: MINE, exact: true }).last();
    await sheet.getByRole("textbox", { name: "Write a comment…" }).fill(COMMENT);
    await sheet.getByRole("button", { name: "Post comment" }).click();
    const comments = sheet.getByRole("region", { name: "Comments" });
    await expect(comments).toContainText(COMMENT);
    await comments.getByRole("button", { name: "Reply", exact: true }).click();
    const reply = comments.getByRole("form", { name: /^Replying to / });
    await reply.getByRole("textbox", { name: "Write a comment…" }).fill(REPLY);
    await reply.getByRole("button", { name: "Reply", exact: true }).click();
    const thread = comments.locator("div").filter({ has: page.getByText(COMMENT) }).filter({ hasText: REPLY }).first();
    await expect(thread).toBeVisible();
    await expect(comments).toContainText(REPLY);
  });
});
