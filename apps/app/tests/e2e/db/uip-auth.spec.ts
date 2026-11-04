// UIP-A1: forgot code and the admin login sit in the auth shell, and so does the second-factor enrol step.
// A manager still signs in with code and authenticator (no auth logic changed), and a manager who has not
// enrolled yet sees the key and the code field in the shell at both widths.
import { expect, test } from "../helpers";
import { createTestCompany, deleteTestCompany, type TestCompany } from "../../db/test-company";
import { getDb } from "../../../src/lib/db/client";
import { signIn, sweepPages } from "./fixtures/page-sweep";

const SLUG = "uip-auth";
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL");

const MANAGER = { name: "Mara Auth", email: `mara@${SLUG}.test`, role: "manager" as const };
const NEWBIE = { name: "Nils Newkey", email: `nils@${SLUG}.test`, role: "manager" as const };

let company: TestCompany;

test.beforeAll(async () => {
  company = await createTestCompany(SLUG, [MANAGER, NEWBIE]);
  // Nils has not enrolled an authenticator yet: his code login shows the enrol step.
  await getDb().user.update({
    where: { id: company.people[NEWBIE.name].id, companyId: company.companyId },
    data: { totpSecretSealed: null, totpEnabledAt: null },
  });
});
test.afterAll(async () => {
  await deleteTestCompany(SLUG);
});

test("UIP auth pages", async ({ page, browser }) => {
  const base = test.info().project.use.baseURL;

  await test.step("a manager still signs in with code and authenticator", async () => {
    await signIn(page, company, MANAGER.name);
    await expect(page).not.toHaveURL(/\/login/);
  });

  await test.step("forgot code and the admin login pass the sweep with no session", async () => {
    const anonymous = await browser.newContext({ baseURL: base });
    const visitor = await anonymous.newPage();
    await sweepPages(visitor, ["/forgot-password", "/admin/login"], { marker: "auth-shell", title: false });
    await visitor.goto("/forgot-password");
    await expect(visitor.getByRole("heading", { level: 1 })).toBeVisible();
    await visitor.goto("/admin/login");
    await expect(visitor.locator("#code")).toBeVisible();
    await expect(visitor.locator("#totp")).toBeVisible();
    await expect(visitor.getByRole("button", { name: "Unlock" })).toBeVisible();
    await anonymous.close();
  });

  await test.step("the enrol step shows the key and the code field in the shell at both widths", async () => {
    const fresh = await browser.newContext({ baseURL: base });
    const enrol = await fresh.newPage();
    await enrol.goto(`/${SLUG}/login`);
    await enrol.locator("#code").fill(company.people[NEWBIE.name].code);
    await enrol.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(enrol.locator("#totp")).toBeVisible();
    await expect(enrol.getByTestId("auth-shell")).toBeVisible();
    const key = (await enrol.locator("code").first().innerText()).replace(/\s+/g, "");
    expect(key).toMatch(/^[A-Z2-7]{16,}$/);
    await expect(enrol.getByRole("button", { name: "Copy", exact: true })).toBeVisible();
    for (const width of [1440, 375]) {
      await enrol.setViewportSize({ width, height: 900 });
      const overflow = await enrol.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `enrol step at ${width} px runs ${overflow} px off the side`).toBeLessThanOrEqual(0);
    }
    await fresh.close();
  });
});
