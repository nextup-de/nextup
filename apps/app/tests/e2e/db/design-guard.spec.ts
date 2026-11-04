// The design rules on the pages that need a database: settings, KPIs, reports, sign-in and the floor. The strip of
// tabs shows on Dashboard and Profile here, where both of their pages exist.
import { checkDesign } from "../design-check";
import { expect, test } from "../helpers";
import { createTestCompany, deleteTestCompany, type TestCompany } from "../../db/test-company";
import { SETTINGS_SECTIONS } from "../../../src/features/settings/sections";
import { signIn, SWEEP_WIDTHS } from "./fixtures/page-sweep";

const SLUG = "design-guard";
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL");

const MANAGER = { name: "Dana Guard", email: `dana@${SLUG}.test`, role: "manager" as const };
let company: TestCompany;

test.beforeAll(async () => {
  await deleteTestCompany(SLUG);
  company = await createTestCompany(SLUG, [MANAGER]);
});
test.afterAll(async () => {
  await deleteTestCompany(SLUG);
});

test("no black fill on the public pages", async ({ page }) => {
  test.setTimeout(180_000);
  for (const width of SWEEP_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/login", "/signup", "/forgot-password", `/${SLUG}/login`]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await checkDesign(page, `${path} ${width}`);
    }
  }
});

test("no black fill on the signed-in pages", async ({ page }) => {
  test.setTimeout(600_000);
  await signIn(page, company, MANAGER.name);
  const app = ["raise", "feed", "leader", "team", "decisions", "projects", "projects/collaboration", "projects/progress", "dashboard", "dashboard/kpis", "profile", "reports"];
  const settings = SETTINGS_SECTIONS.map((section) => `settings/${section.path}`);
  for (const width of SWEEP_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [...app, ...settings, "settings/areas/devices"]) {
      await page.goto(`/${SLUG}/${path}`);
      await page.waitForLoadState("networkidle");
      await checkDesign(page, `${path} ${width}`);
    }
  }
});

test("Dashboard and Profile each have a strip of tabs that leads to the other page", async ({ page }) => {
  await signIn(page, company, MANAGER.name);
  await page.goto(`/${SLUG}/dashboard`);
  await page.getByTestId("dashboard-tabs").getByRole("link", { name: "KPIs" }).click();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}/dashboard/kpis`));
  await expect(page.getByTestId("dashboard-tabs").locator('[aria-current="page"]')).toHaveText("KPIs");
  await page.goto(`/${SLUG}/profile`);
  await page.getByTestId("profile-tabs").getByRole("link", { name: "My reports" }).click();
  await expect(page).toHaveURL(new RegExp(`/${SLUG}/reports`));
  await expect(page.getByTestId("profile-tabs").locator('[aria-current="page"]')).toHaveText("My reports");
});
