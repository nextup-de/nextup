// Acceptance for pages built from tools (plan PGB): the manager, who may change P-2, builds a page from Calendar and
// Timeline, adds Milestones and a Doc, merges it into Steps by the keyboard way, undoes the merge, merges it again
// by dragging, and removes a page and brings it back. Demo mode: one browser plays the people through the dev panel.
import type { Page } from "@playwright/test";
import { addPages, expect, test } from "../helpers";

const LINE = "Freeze the dates after the depot visit";
const DEFAULT_PAGES = ["Idea", "Files"];

async function viewAs(page: Page, persona: "Employee" | "Team leader" | "Manager") {
  await page.getByRole("button", { name: "Dev" }).click();
  await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: persona, exact: true }).click();
  await page.keyboard.press("Escape");
}

test("PGB acceptance: build a page from tools, add a tool, merge it into Steps", async ({ page }) => {
  await page.goto("/acme");
  await viewAs(page, "Manager");
  await page.goto("/acme/projects/pj2");
  const reveal = page.getByRole("button", { name: "Show sidebar" });
  if (await reveal.isVisible()) await reveal.click();

  const pages = page.getByRole("navigation", { name: "Project pages" });
  const row = (title: string) => pages.locator("[data-page-id]").filter({ has: page.getByText(title, { exact: true }) });
  const sections = page.locator("main section[data-collapsed]");
  const section = (name: string) => page.locator(`main section[data-collapsed][aria-label="${name}"]`);
  const sectionNames = () => sections.evaluateAll((all) => all.map((el) => el.getAttribute("aria-label")));
  const rowTitles = () => pages.locator("[data-page-id] a").evaluateAll((all) => all.map((el) => (el.textContent ?? "").replace(/New$/, "").replace(/^⠿/, "").trim()));

  await test.step("the sidebar lists the default pages and no tab row is left", async () => {
    for (const title of DEFAULT_PAGES) await expect(pages.getByRole("link", { name: title, exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Project sections" })).toHaveCount(0);
  });

  await test.step("Add page offers the ready-made pages: Steps and Team are added with one click each", async () => {
    await addPages(page, "/acme/projects/pj2", ["Steps", "Team"]);
    expect(await rowTitles()).toEqual(["Idea", "Files", "Steps", "Team"]);
    await pages.getByRole("button", { name: /Add page/ }).click();
    const ready = page.getByRole("dialog", { name: "New page" }).getByRole("region", { name: "Ready-made pages" });
    await expect(ready.getByRole("button", { name: /^Plan/ })).toBeVisible();
    await expect(ready.getByRole("button", { name: /^Steps/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  await test.step("Add page: Calendar then Timeline, named Dates, opens with the two sections in that order", async () => {
    await pages.getByRole("button", { name: /Add page/ }).click();
    const wizard = page.getByRole("dialog", { name: "New page" });
    const tile = (name: string) => wizard.locator("button[aria-pressed]").filter({ has: page.locator("strong", { hasText: new RegExp(`^${name}$`) }) });
    await tile("Calendar").click();
    await tile("Timeline").click();
    await expect(tile("Calendar").locator("span").filter({ hasText: /^1$/ })).toBeVisible();
    await expect(tile("Timeline").locator("span").filter({ hasText: /^2$/ })).toBeVisible();
    await wizard.getByRole("button", { name: /Next: name it/ }).click();
    await wizard.getByRole("textbox", { name: "Page name" }).fill("Dates");
    await wizard.getByRole("button", { name: "Create page" }).click();
    await expect(wizard).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Dates", level: 1 }).first()).toBeVisible();
    await expect(row("Dates")).toBeVisible();
    await expect.poll(sectionNames).toEqual(["Calendar", "Timeline"]);
  });

  await test.step("+ Add tool: Milestones and a Doc with a line that saves", async () => {
    for (const kind of ["Milestones", "Doc"]) {
      await page.getByRole("button", { name: "+ Add tool", exact: true }).click();
      await page.getByRole("dialog", { name: "Add tool" }).getByRole("button", { name: new RegExp("^" + kind) }).click();
      await expect(page.getByRole("dialog", { name: "Add tool" })).toHaveCount(0);
    }
    await expect.poll(sectionNames).toEqual(["Calendar", "Timeline", "Milestones", "Doc"]);
    const body = section("Doc").getByRole("textbox", { name: "Document content" });
    await body.fill(LINE);
    await body.blur();
    await expect(section("Doc").getByRole("status")).toContainText("Saved");
  });

  await test.step("the Dates row menu, by keyboard, merges it into Steps: the dialog lists what moves", async () => {
    // The row's ⋯ shows while the row has focus: focus its link, then Tab onto the button.
    await row("Dates").getByRole("link").focus();
    await page.keyboard.press("Tab");
    await expect(pages.getByRole("button", { name: "Actions for Dates" })).toBeFocused();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: "Actions for Dates" });
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: "Merge into…" }).focus();
    await page.keyboard.press("Enter");
    await menu.getByRole("menuitem", { name: "Steps", exact: true }).focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Add Dates's tools to Steps?" });
    await expect(dialog).toBeVisible();
    const items = dialog.getByRole("listitem");
    await expect(items).toHaveCount(6);
    for (const [index, name, mark] of [[0, "Board", "on Steps"], [1, "List", "on Steps"], [2, "Calendar", "from Dates"], [3, "Timeline", "from Dates"], [4, "Milestones", "from Dates"], [5, "Doc", "from Dates"]] as const) {
      await expect(items.nth(index)).toContainText(name);
      await expect(items.nth(index)).toContainText(mark);
    }
  });

  await test.step("confirming gives Steps six sections, keeps the doc line, removes Dates and shows the toast", async () => {
    await page.getByRole("dialog", { name: "Add Dates's tools to Steps?" }).getByRole("button", { name: "Add 4 tools to Steps" }).click();
    await expect(page).toHaveURL(/page=steps/);
    await expect.poll(sectionNames).toEqual(["Board", "List", "Calendar", "Timeline", "Milestones", "Doc"]);
    await expect(section("Doc").getByRole("textbox", { name: "Document content" })).toHaveValue(LINE);
    await expect(row("Dates")).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Dates merged into Steps" })).toBeVisible();
  });

  await test.step("Undo brings Dates back with its four tools and leaves Steps two", async () => {
    await page.getByRole("status").filter({ hasText: "Dates merged into Steps" }).getByRole("button", { name: "Undo" }).click();
    await expect(row("Dates")).toBeVisible();
    await expect.poll(sectionNames).toEqual(["Board", "List"]);
    await row("Dates").getByRole("link").click();
    await expect.poll(sectionNames).toEqual(["Calendar", "Timeline", "Milestones", "Doc"]);
  });

  await test.step("dragging Dates onto Steps and confirming gives six sections again", async () => {
    const from = await row("Dates").boundingBox();
    const to = await row("Steps").boundingBox();
    if (!from || !to) throw new Error("page rows are not on screen");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, (from.y + to.y) / 2, { steps: 6 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 });
    await expect(page.getByRole("status").filter({ hasText: "Drop to add 4 tools to Steps" })).toBeVisible();
    await page.mouse.up();
    await page.getByRole("dialog", { name: "Add Dates's tools to Steps?" }).getByRole("button", { name: "Add 4 tools to Steps" }).click();
    await expect(page).toHaveURL(/page=steps/);
    await expect.poll(sectionNames).toEqual(["Board", "List", "Calendar", "Timeline", "Milestones", "Doc"]);
    await expect(row("Dates")).toHaveCount(0);
  });

  await test.step("removing Team from its row menu and pressing Undo puts it back in its place", async () => {
    const before = await rowTitles();
    expect(before).toContain("Team");
    await row("Team").hover();
    await pages.getByRole("button", { name: "Actions for Team" }).click();
    await page.getByRole("menu", { name: "Actions for Team" }).getByRole("menuitem", { name: "Remove page" }).click();
    await expect(row("Team")).toHaveCount(0);
    await page.getByRole("status").filter({ hasText: "Team removed" }).getByRole("button", { name: "Undo" }).click();
    await expect(row("Team")).toBeVisible();
    expect(await rowTitles()).toEqual(before);
  });
});
