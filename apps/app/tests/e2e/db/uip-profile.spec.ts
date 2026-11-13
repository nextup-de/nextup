// UIP-E4: the KPI report and the Profile pass the page sweep with a section card, at 1440 and 375 px.
import { expect, test } from "../helpers";
import { createTestCompany, deleteTestCompany, type TestCompany } from "../../db/test-company";
import { signIn, sweepPages } from "./fixtures/page-sweep";

const SLUG = "uip-profile";
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL");

const MANAGER = { name: "Mara Sweep", email: `mara@${SLUG}.test`, role: "manager" as const };

let company: TestCompany;

test.beforeAll(async () => {
  company = await createTestCompany(SLUG, [MANAGER]);
});
test.afterAll(async () => {
  await deleteTestCompany(SLUG);
});

test("UIP kpis and profile", async ({ page }) => {
  await signIn(page, company, MANAGER.name);
  await sweepPages(page, [`/${SLUG}/dashboard/kpis`, `/${SLUG}/profile`]);

  await test.step("the KPI report switches period and keeps its parts", async () => {
    await page.goto(`/${SLUG}/dashboard/kpis`);
    await expect(page.locator("h1")).toHaveText("Idea management figures");
    await page.getByTestId("kpis-period-lastYear").click();
    await expect(page.getByTestId("kpis-period-lastYear")).toHaveAttribute("data-on", "true");
    await expect(page.getByTestId("kpis-footnote")).toBeVisible();
  });

  await test.step("the profile shows the person and a mail switch saves and goes back", async () => {
    await page.goto(`/${SLUG}/profile`);
    await expect(page.getByRole("heading", { name: MANAGER.name })).toBeVisible();
    const mails = page.getByRole("switch", { name: /Discussions and projects/ });
    const before = await mails.isChecked();
    await mails.click();
    await expect(mails).toBeChecked({ checked: !before });
    await mails.click();
    await expect(mails).toBeChecked({ checked: before });
  });
});
