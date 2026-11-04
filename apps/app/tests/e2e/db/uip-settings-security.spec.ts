// UIP-S3: Sign-in, Support access, Privacy and Audit pass the page sweep with a section card at both widths.
import { expect, test, vis } from "../helpers";
import { createTestCompany, deleteTestCompany, type TestCompany } from "../../db/test-company";
import { signIn, sweepPages } from "./fixtures/page-sweep";

const SLUG = "uip-settings-security";
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

test("UIP security settings", async ({ page }) => {
  await signIn(page, company, MANAGER.name);
  await sweepPages(page, [`/${SLUG}/settings/sign-in`, `/${SLUG}/settings/support-access`, `/${SLUG}/settings/privacy`, `/${SLUG}/settings/audit`], { marker: "section-card" });
  // Each page keeps its own test ids.
  await page.goto(`/${SLUG}/settings/sign-in`);
  await expect(vis(page, "signin-codes")).toBeVisible();
  await page.goto(`/${SLUG}/settings/support-access`);
  await expect(vis(page, "settings-support-open")).toBeVisible();
  await page.goto(`/${SLUG}/settings/privacy`);
  await expect(vis(page, "settings-privacy-save-rules")).toBeVisible();
  await page.goto(`/${SLUG}/settings/audit`);
  await expect(vis(page, "settings-audit-export")).toBeVisible();
});
