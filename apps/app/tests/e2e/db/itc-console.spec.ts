// ITC acceptance (plan ITC, ITC-Z1): in a one-company stack /admin is the company's IT and privacy
// console - seven sections, no platform page - and NextUp support gets a read-only session the company
// can revoke. The company is made straight in the database (tests/db/test-company.ts), never through /admin.
// The server runs in single mode for this spec (playwright.db.config.ts).
import type { Browser, Page } from "@playwright/test";
import { expect, test, vis } from "../helpers";
import { createTestCompany, deleteTestCompany, type TestCompany } from "../../db/test-company";
import { CONSOLE_SECTIONS } from "../../../src/features/admin/nav";
import { totpAt } from "../../../src/features/auth/totp";

const SLUG = "itc-console";
test.skip(!process.env.DATABASE_URL || !process.env.ADMIN_ACCESS_CODE, "needs DATABASE_URL and ADMIN_ACCESS_CODE");

const ADMIN = { name: "Ingrid Console", email: `ingrid@${SLUG}.test`, role: "manager" as const, stackAdmin: true };
const MANAGER = { name: "Mats Plain", email: `mats@${SLUG}.test`, role: "manager" as const };
const LABELS = ["Overview", "Access", "Connectors", "Assistant and data protection", "Company data", "Routing review", "Support access"];

let company: TestCompany;

async function consoleAsAdmin(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/admin/login");
  await page.locator("#code:visible").fill(company.people[ADMIN.name].code);
  await page.locator("#totp:visible").fill(totpAt(company.people[ADMIN.name].totpSecret, Date.now()));
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  return page;
}

test.describe.serial("ITC acceptance", () => {
  test.beforeAll(async () => {
    await deleteTestCompany(SLUG);
    company = await createTestCompany(SLUG, [ADMIN, MANAGER]);
  });

  test.afterAll(async () => {
    await deleteTestCompany(SLUG);
  });

  test("ITC acceptance: the console shows only the own company and no platform page", async ({ browser }) => {
    // A stack admin: personal code and authenticator code. The nav is the seven sections, in order.
    const admin = await consoleAsAdmin(browser);
    const nav = admin.getByRole("navigation", { name: "Admin" });
    expect(CONSOLE_SECTIONS.map((s) => s.key)).toHaveLength(7);
    await expect(nav.getByRole("link")).toHaveText(LABELS);

    // No platform page: companies, requests, tickets and connections live on admin.sellux.ch.
    for (const path of ["companies", "requests", "tickets", "connections"]) {
      const res = await admin.goto(`/admin/${path}`);
      expect(res?.status(), `/admin/${path}`).toBe(404);
    }

    // A manager who is no console admin is sent to the login.
    const plain = await (await browser.newContext()).newPage();
    await plain.goto("/login");
    await plain.locator("#code:visible").fill(company.people[MANAGER.name].code);
    await plain.getByRole("button", { name: "Log in", exact: true }).click();
    await plain.locator("#totp:visible").fill(totpAt(company.people[MANAGER.name].totpSecret, Date.now()));
    await plain.locator("form button[type=submit]").last().click();
    await expect(plain).not.toHaveURL(/\/login/);
    await plain.goto("/admin");
    await expect(plain).toHaveURL(/\/admin\/login$/);
    await plain.context().close();

    // Open support access: the code is shown once.
    await admin.goto("/admin/support");
    await vis(admin, "console-support-open").click();
    const code = (await vis(admin, "console-support-code").innerText()).trim();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{12}$/);
    await admin.getByRole("button", { name: "Log out" }).click();
    await expect(admin).toHaveURL(/\/admin\/login$/);

    // Sign in with the support code: the banner shows, Connectors only reads.
    const support = await (await browser.newContext()).newPage();
    await support.goto("/admin/login");
    await support.locator("#supportCode:visible").fill(code);
    await vis(support, "console-support-signin").getByRole("button").click();
    await expect(support).toHaveURL(/\/admin$/);
    await expect(vis(support, "console-support-banner")).toContainText("NextUp support until");
    await support.goto("/admin/connectors");
    await expect(support.getByText("This is a support session: you can look, not change.")).toBeVisible();
    await expect(vis(support, "console-connectors-jira-save")).toBeDisabled();

    // The stack admin revokes; the support session ends on the next page.
    const again = await consoleAsAdmin(browser);
    await again.goto("/admin/support");
    await vis(again, "console-support-revoke").click();
    await expect(vis(again, "console-support-state")).toContainText("Support access is closed.");
    await support.goto("/admin/connectors");
    await expect(support.getByTestId("console-support-banner")).toHaveCount(0);
    await expect(support.getByTestId("console-connectors-jira")).toHaveCount(0);
    await again.context().close();
    await support.context().close();
    await admin.context().close();
  });

  // The story above only opens three sections; a section that throws on its own query needs opening
  // to be seen. The error screen comes after the loading boxes, so wait for a heading before judging.
  test("every console section opens, and Access lists the company's people", async ({ browser }) => {
    const admin = await consoleAsAdmin(browser);
    for (const { path } of CONSOLE_SECTIONS) {
      await admin.goto(path);
      const heading = admin.getByRole("heading", { level: 1 }).first();
      await expect(heading, path).toBeVisible();
      await expect(heading, path).not.toHaveText("This page could not be shown");
    }

    await admin.goto("/admin/people");
    for (const person of [ADMIN, MANAGER]) {
      await expect(admin.getByRole("checkbox", { name: `Stack admin: ${person.name}` })).toBeVisible();
    }
    await admin.context().close();
  });

  test("the account menu leads to Settings, and to the console for a console admin", async ({ browser }) => {
    const signIn = async (person: { name: string }) => {
      const page = await (await browser.newContext()).newPage();
      await page.goto("/login");
      await page.locator("#code:visible").fill(company.people[person.name].code);
      await page.getByRole("button", { name: "Log in", exact: true }).click();
      await page.locator("#totp:visible").fill(totpAt(company.people[person.name].totpSecret, Date.now()));
      await page.locator("form button[type=submit]").last().click();
      await expect(page).not.toHaveURL(/\/login/);
      await page.getByRole("button", { name: "Profile" }).click();
      return page;
    };
    const admin = await signIn(ADMIN);
    const menu = admin.getByRole("dialog", { name: "Profile" });
    await expect(menu.getByRole("link", { name: /Settings/ })).toHaveAttribute("href", "/settings");
    await menu.getByRole("link", { name: /IT console/ }).click();
    await expect(admin).toHaveURL(/\/admin\/login$/);
    await admin.context().close();

    const plain = await signIn(MANAGER);
    const plainMenu = plain.getByRole("dialog", { name: "Profile" });
    await plainMenu.getByRole("link", { name: /Settings/ }).click();
    await expect(plain).toHaveURL(/\/settings/);
    await plain.getByRole("button", { name: "Profile" }).click();
    await expect(plain.getByRole("dialog", { name: "Profile" }).getByRole("link", { name: /IT console/ })).toHaveCount(0);
    await plain.context().close();
  });

  test("a company stack has no static demo: /demo answers 404", async ({ request }) => {
    for (const path of ["/demo", "/demo/raise"]) expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(404);
  });
});
