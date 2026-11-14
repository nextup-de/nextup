// Acceptance for the Files page and the page headers (plan FIL), in demo mode: a manager works through the folder of P-2,
// then Board, List and Files are looked at again at phone width. The demo tree lives in memory (D11); nothing leaves the browser.
import type { Page } from "@playwright/test";
import { expect, test } from "../helpers";

const UPLOAD = "Spec upload.txt";

async function viewAs(page: Page, persona: "Employee" | "Team leader" | "Manager") {
  await page.getByRole("button", { name: "Dev" }).click();
  await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: persona, exact: true }).click();
  await page.keyboard.press("Escape");
}

async function noSidewaysScroll(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(wide).toBeLessThanOrEqual(1);
}

test("FIL acceptance: open Files, grid, folder, search, link, upload, request and delete, then the headers at 375 px", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

  await page.goto("/acme");
  await viewAs(page, "Manager");
  await page.goto("/acme/projects/pj2?page=files");
  const head = page.getByTestId("page-head");
  const files = page.getByTestId("files-view");
  const tile = (name: string) => files.getByTestId("files-grid").getByRole("button", { name, exact: true });

  await test.step("the Files page has the new header and lists the folder first", async () => {
    await expect(head.getByRole("heading", { level: 1, name: "Files" })).toBeVisible();
    await expect(head.getByText("SharePoint", { exact: true })).toBeVisible();
    await expect(head.getByRole("link", { name: /Open in SharePoint/ })).toBeVisible();
    await expect(head.getByRole("button", { name: /Upload$/ })).toBeVisible();
    await expect(files.getByRole("row").filter({ hasText: "Delivery reports Q3" })).toBeVisible();
    await expect(files.getByRole("row").filter({ hasText: "Supplier scorecard.xlsx" })).toBeVisible();
  });

  await test.step("the grid shows the same files as tiles, and the list comes back", async () => {
    await files.getByRole("button", { name: "Grid" }).click();
    await expect(files.getByTestId("files-grid")).toBeVisible();
    await expect(tile("Supplier scorecard.xlsx")).toBeVisible();
  });

  await test.step("a double-click opens Delivery reports Q3, and the breadcrumb goes back", async () => {
    await tile("Delivery reports Q3").dblclick();
    const crumbs = files.getByRole("navigation", { name: "Folder path" });
    await expect(crumbs.locator("strong")).toHaveText("Delivery reports Q3");
    await expect(tile("July.xlsx")).toBeVisible();
    await crumbs.getByRole("button").first().click();
    await expect(tile("Supplier scorecard.xlsx")).toBeVisible();
    await expect(tile("July.xlsx")).toHaveCount(0);
  });

  await test.step("search narrows the folder to one file, and Esc brings the rest back", async () => {
    const search = files.getByRole("searchbox", { name: "Search files" });
    await search.fill("scorecard");
    await expect(tile("Supplier scorecard.xlsx")).toBeVisible();
    await expect(tile("Framework agreement.pdf")).toHaveCount(0);
    await search.press("Escape");
    await expect(tile("Framework agreement.pdf")).toBeVisible();
  });

  await test.step("selecting a file shows its panel, and Link to a step links it to one", async () => {
    await tile("Supplier scorecard.xlsx").click();
    const panel = page.getByTestId("files-file-panel");
    await expect(panel.getByRole("heading", { name: "Supplier scorecard.xlsx" })).toBeVisible();
    await panel.getByRole("button", { name: "Link to a step" }).click();
    const dialog = page.getByRole("dialog", { name: "Link to a step" });
    await dialog.getByText("Offline form on the service tablets").first().click();
    await dialog.getByRole("button", { name: /^Link to / }).click();
    await expect(dialog).toHaveCount(0);
    await expect(panel).toContainText("FS-12");
    await tile("Supplier scorecard.xlsx").click();
  });

  await test.step("Upload puts a file into the open folder", async () => {
    await head.getByRole("button", { name: /Upload$/ }).click();
    const menu = page.getByRole("menu", { name: "Upload" });
    await expect(menu).toContainText("To");
    const chooser = page.waitForEvent("filechooser");
    await menu.getByRole("menuitem", { name: "Upload files" }).click();
    await (await chooser).setFiles({ name: UPLOAD, mimeType: "text/plain", buffer: Buffer.from("spec upload") });
    await expect(tile(UPLOAD)).toBeVisible();
  });

  await test.step("Request files asks two people on the project and makes a step for each", async () => {
    await files.getByRole("button", { name: "Request files" }).click();
    const dialog = page.getByRole("dialog", { name: "Ask for files" });
    const pick = dialog.getByRole("combobox", { name: "People on the project" });
    await pick.selectOption({ label: "L. Brandt" });
    await pick.selectOption({ label: "D. Ferraro" });
    await dialog.getByRole("textbox", { name: "What do you need?" }).fill("Q3 delivery reports");
    await dialog.getByRole("button", { name: "Send request" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Requested files in 2 steps")).toBeVisible();
  });

  await test.step("Delete moves the upload to the recycle bin and says so", async () => {
    await files.getByRole("button", { name: "List" }).click();
    await files.getByRole("button", { name: "Actions for " + UPLOAD }).click();
    await page.getByRole("menuitem", { name: /^Delete/ }).click();
    const dialog = page.getByRole("alertdialog", { name: "Delete " + UPLOAD + "?" });
    await expect(dialog).toContainText("SharePoint recycle bin");
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Deleted " + UPLOAD })).toBeVisible();
    await expect(files.getByRole("row").filter({ hasText: UPLOAD })).toHaveCount(0);
  });

  await test.step("Board and List carry the new header too", async () => {
    await page.goto("/acme/projects/pj2?page=steps");
    await expect(head.getByRole("heading", { level: 1, name: "Steps" })).toBeVisible();
    await expect(head.getByRole("button", { name: /Add step/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Board", exact: true }).first()).toBeVisible();
    await expect(page.getByRole("region", { name: "List", exact: true }).first()).toBeVisible();
  });

  await test.step("at 375 px the pages fit the screen", async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    for (const id of ["steps", "files"]) {
      await page.goto("/acme/projects/pj2?page=" + id);
      await expect(head.getByRole("heading", { level: 1 })).toBeVisible();
      await noSidewaysScroll(page);
    }
    await expect(files.getByRole("row").filter({ hasText: "Supplier scorecard.xlsx" })).toBeVisible();
    await expect(page.getByTestId("files-side")).toBeVisible();
    await noSidewaysScroll(page);
  });

  expect(errors).toEqual([]);
});
