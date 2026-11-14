// Acceptance for the Overview, Doc and Links tools (plan HUB): the lead of the running P-2 changes the Overview's
// range with the keyboard, writes a Doc on the Files page and adds a link; a member then reads both after a reload.
// Demo mode: one browser plays the people through the dev panel.
import type { Page } from "@playwright/test";
import { expect, test } from "../helpers";

const LINE = "The depot opens at six, bring the stopwatch";
const LINK_URL = "https://example.com/depot-guide";
const LINK_TITLE = "Depot guide";

async function viewAs(page: Page, persona: "Employee" | "Team leader" | "Manager") {
  await page.getByRole("button", { name: "Dev" }).click();
  await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: persona, exact: true }).click();
  await page.keyboard.press("Escape");
}

/** Dev panel -> "Inbox of" a desk: the leader persona acts as that seat's holder. */
async function actAs(page: Page, seat: string) {
  await page.getByRole("button", { name: "Dev" }).click();
  await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: new RegExp("^" + seat.replace(".", "\\.")) }).click();
  await page.keyboard.press("Escape");
}

test("HUB acceptance: change the range, save a doc for the team, add a link", async ({ page }) => {
  await page.goto("/acme");
  await viewAs(page, "Team leader");
  await actAs(page, "D. Ferraro");
  const section = (name: string) => page.locator(`main section[data-collapsed][aria-label="${name}"]`);

  await test.step("the lead picks Last 30 days in the Overview's range menu with the keyboard", async () => {
    await page.goto("/acme/projects/pj2?page=overview");
    const range = page.getByRole("button", { name: /^Date range:/ });
    await expect(range).toBeVisible();
    await range.focus();
    await page.keyboard.press("ArrowDown");
    const menu = page.getByRole("menu", { name: "Date range" });
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitemradio", { name: "Last 30 days" }).focus();
    await page.keyboard.press("Enter");
    await expect(menu).toHaveCount(0);
    await expect(page).toHaveURL(/range=30d/);
    await expect(page.getByRole("button", { name: "Date range: Last 30 days" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Date range: Last 30 days" })).toBeFocused();
  });

  await test.step("the lead adds a Doc to the Files page and writes a line that saves", async () => {
    await page.goto("/acme/projects/pj2?page=files");
    await page.getByRole("button", { name: "+ Add tool", exact: true }).click();
    await page.getByRole("dialog", { name: "Add tool" }).getByRole("button", { name: /^Doc/ }).click();
    await expect(page.getByRole("dialog", { name: "Add tool" })).toHaveCount(0);
    const body = section("Doc").getByRole("textbox", { name: "Document content" });
    await body.fill(LINE);
    await body.blur();
    await expect(section("Doc").getByRole("status")).toContainText("Saved");
  });

  await test.step("the lead adds a link that shows with its title", async () => {
    const links = section("Links");
    await links.getByRole("button", { name: "+ Add link" }).click();
    const form = links.getByRole("form", { name: "Add a link" });
    await form.getByLabel("Address").fill(LINK_URL);
    await form.getByLabel("Name (optional)").fill(LINK_TITLE);
    await form.getByRole("button", { name: "Add link", exact: true }).click();
    await expect(links.getByRole("link", { name: LINK_TITLE })).toHaveAttribute("href", LINK_URL);
    await expect(links.getByRole("status")).toContainText("Saved");
  });

  await test.step("a member reads the doc and the link after a reload", async () => {
    await actAs(page, "L. Brandt");
    await page.goto("/acme/projects/pj2?page=files");
    await page.reload();
    const doc = section("Doc");
    await expect(doc).toBeVisible();
    const editable = doc.getByRole("textbox", { name: "Document content" });
    if (await editable.count()) await expect(editable).toHaveValue(LINE); else await expect(doc).toContainText(LINE);
    await expect(section("Links").getByRole("link", { name: LINK_TITLE })).toHaveAttribute("href", LINK_URL);
  });
});
