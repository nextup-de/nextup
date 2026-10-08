// The main pages, one screenshot each per screen size (playwright.visual.config.ts has the sizes).
// Demo mode: one browser plays every person through the dev panel. The clock is pinned so "raised
// 3 d ago" and due dates read the same every day; the dev-only overlays are hidden.
import type { Page } from "@playwright/test";
import { expect, test } from "../helpers";

const NOW = new Date("2026-10-08T09:30:00");

/** Dev panel -> "Viewing as". Switching person also sends you to that person's home page. */
async function viewAs(page: Page, persona: "Employee" | "Team leader" | "Manager") {
  await page.getByRole("button", { name: "Dev", exact: true }).click();
  await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: persona, exact: true }).click();
  await page.keyboard.press("Escape");
}

/** Hide what only exists in `next dev` (the Next.js badge) and the demo's dev panel button. */
async function settle(page: Page) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; } [title*='demo on'] { visibility: hidden !important; }" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600); // the open/close transitions are short under reduced motion, not zero
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test("sign-in", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Find your company" })).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot("sign-in.png");
});

test("raise: the start", async ({ page }) => {
  await page.goto("/acme");
  await expect(page).toHaveURL(/\/acme\/raise$/);
  await expect(page.getByRole("textbox", { name: "Share an idea that would make work better…" })).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot("raise.png");
});

test("employee: what happened to what I sent", async ({ page }) => {
  await page.goto("/acme");
  await expect(page).toHaveURL(/\/acme\/raise$/);
  await page.goto("/acme/team");
  await expect(page.getByRole("heading", { name: "What happened to what I sent" })).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot("sent.png");
});

test("team leader: the inbox with an item open", async ({ page }, info) => {
  await page.goto("/acme");
  await viewAs(page, "Team leader");
  await expect(page).toHaveURL(/\/acme\/leader$/);
  await page.getByRole("region", { name: "Fresh ideas" }).getByRole("button", { name: /^Rework on the 4-series housing/ }).click();
  await expect(page.getByRole("heading", { name: /Rework on the 4-series housing/, level: 1 })).toBeVisible();
  if (info.project.name !== "phone") {
    // The list starts folded to avatars on some sizes; screenshot it open, as people use it.
    const expand = page.getByRole("button", { name: "Show inbox" });
    if (await expand.isVisible()) await expand.click();
    await expect(page.getByRole("button", { name: "Tuck inbox away" })).toBeVisible();
  }
  await settle(page);
  await expect(page).toHaveScreenshot("inbox.png");
});

test("manager: the home overview", async ({ page }) => {
  await page.goto("/acme");
  await viewAs(page, "Manager");
  await expect(page).toHaveURL(/\/acme\/manager$/);
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot("manager.png");
});

test("manager: the case table", async ({ page }) => {
  await page.goto("/acme");
  await viewAs(page, "Manager");
  await page.goto("/acme/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot("case-table.png");
});

test("manager: a case opened from the case table", async ({ page }) => {
  await page.goto("/acme");
  await viewAs(page, "Manager");
  await page.goto("/acme/dashboard");
  await page.getByRole("main").getByText("Night shift has no one who can sign").first().click();
  await expect(page.getByRole("heading", { name: /Night shift has no one who can sign/, level: 1 })).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot("case.png");
});
