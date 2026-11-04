// UIP-S2: Import and export, Webhooks and API tokens pass the page sweep with a section card at both widths.
import { expect, test, vis } from "../helpers";
import { createTestCompany, deleteTestCompany, type TestCompany } from "../../db/test-company";
import { signIn, sweepPages } from "./fixtures/page-sweep";

const SLUG = "uip-settings-data";
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

test("UIP data settings", async ({ page }) => {
  await signIn(page, company, MANAGER.name);
  await sweepPages(page, [`/${SLUG}/settings/import-export`, `/${SLUG}/settings/webhooks`, `/${SLUG}/settings/api-tokens`], { marker: "section-card" });
  // Each page keeps its own test ids.
  await page.goto(`/${SLUG}/settings/import-export`);
  await expect(vis(page, "section-card").first()).toBeVisible();
  await page.goto(`/${SLUG}/settings/webhooks`);
  await expect(vis(page, "settings-webhooks-switch")).toBeVisible();
  await page.goto(`/${SLUG}/settings/api-tokens`);
  await expect(vis(page, "settings-api-tokens-add")).toBeVisible();
});
