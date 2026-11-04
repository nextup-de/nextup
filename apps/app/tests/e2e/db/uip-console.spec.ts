// UIP-C1: the console's People, Company data, Decisions, Support and Assistant pages share one look
// (page header, section cards, tables) and pass the page sweep at 1440 and 375 px.
// The console exists only in a one-company stack, so the spec talks to the second server of
// playwright.db.config.ts (the one itc-console.spec.ts uses) and sets up the company that server serves.
import { expect, test } from "../helpers";
import { createTestCompany, deleteTestCompany, type TestCompany } from "../../db/test-company";
import { totpAt } from "../../../src/features/auth/totp";
import { checkoutPort } from "../../../playwright.ports";
import { sweepPages } from "./fixtures/page-sweep";

// COMPANY_SLUG of the console server in playwright.db.config.ts.
const SLUG = "itc-console";
const CONSOLE_PORT = (Number(process.env.E2E_DB_PORT) || checkoutPort(3200)) + 1;
test.use({ baseURL: `http://localhost:${CONSOLE_PORT}` });
test.skip(!process.env.DATABASE_URL || !process.env.ADMIN_ACCESS_CODE, "needs DATABASE_URL and ADMIN_ACCESS_CODE");

const ADMIN = { name: "Ingrid Console", email: `ingrid@${SLUG}.test`, role: "manager" as const, stackAdmin: true };
const OTHER = { name: "Mats Plain", email: `mats@${SLUG}.test`, role: "manager" as const };

let company: TestCompany;

test.describe.serial("UIP console", () => {
  test.beforeAll(async () => {
    await deleteTestCompany(SLUG);
    company = await createTestCompany(SLUG, [ADMIN, OTHER]);
  });

  test.afterAll(async () => {
    await deleteTestCompany(SLUG);
  });

  test("UIP console: the console's pages pass the sweep", async ({ page }) => {
    // The console opens with the admin session of a stack admin: personal code and authenticator.
    const person = company.people[ADMIN.name];
    await page.goto("/admin/login");
    await page.locator("#code").fill(person.code);
    await page.locator("#totp").fill(totpAt(person.totpSecret, Date.now()));
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page).toHaveURL(/\/admin$/);

    await sweepPages(page, ["/admin/people", "/admin/company-data", "/admin/decisions", "/admin/support", "/admin/assistant"]);
  });
});
