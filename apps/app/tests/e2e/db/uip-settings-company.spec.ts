// UIP-S1: Notifications and Teams settings pass the page sweep with a section card at both widths.
import { expect, test } from "../helpers";
import { createTestCompany, deleteTestCompany, type TestCompany } from "../../db/test-company";
import { signIn, sweepPages } from "./fixtures/page-sweep";

const SLUG = "uip-settings-company";
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL");

const MANAGER = { name: "Mara Settings", email: `mara@${SLUG}.test`, role: "manager" as const };

let company: TestCompany;

test.beforeAll(async () => {
  await deleteTestCompany(SLUG);
  company = await createTestCompany(SLUG, [MANAGER]);
});
test.afterAll(async () => {
  await deleteTestCompany(SLUG);
});

test("UIP notifications and teams", async ({ page }) => {
  await signIn(page, company, MANAGER.name);
  await sweepPages(page, [`/${SLUG}/settings/notifications`, `/${SLUG}/settings/teams`], { marker: "section-card" });
  // Each page keeps its switch and its own test ids.
  await page.goto(`/${SLUG}/settings/notifications`);
  await expect(page.getByTestId("settings-notifications-switch")).toBeVisible();
  await page.goto(`/${SLUG}/settings/teams`);
  await expect(page.getByTestId("settings-teams-switch")).toBeVisible();
});
