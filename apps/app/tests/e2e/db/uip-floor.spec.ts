// UIP-F1: Areas and Devices have the house look, and the shop-floor phone pages sit in the floor shell.
// The areas and the device are made through the pages themselves, so adding and removing is proven too.
import { expect, test, vis } from "../helpers";
import { createTestCompany, deleteTestCompany, type TestCompany } from "../../db/test-company";
import { getDb } from "../../../src/lib/db/client";
import { signIn, sweepPages } from "./fixtures/page-sweep";

const SLUG = "uip-floor";
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL");

const MANAGER = { name: "Mara Floor", email: `mara@${SLUG}.test`, role: "manager" as const };
const UNIT = "Zephyrwerk";
const ROLE = "Hall supervisor";

let company: TestCompany;

test.beforeAll(async () => {
  company = await createTestCompany(SLUG, [MANAGER]);
  const db = getDb();
  const unit = await db.orgUnit.create({ data: { companyId: company.companyId, key: "ZW", name: UNIT, kind: "dept", sort: 0 } });
  await db.orgRole.create({ data: { companyId: company.companyId, orgUnitId: unit.id, title: ROLE, decides: [], sort: 0 } });
});
test.afterAll(async () => {
  await deleteTestCompany(SLUG);
});

test("UIP areas and floor", async ({ page, browser }) => {
  const areas = `/${SLUG}/settings/areas`;
  const devices = `/${SLUG}/settings/areas/devices`;
  await signIn(page, company, MANAGER.name);
  // A streamed page can hold a hidden second copy for a moment: look inside the visible main.
  const main = page.getByRole("main");

  await test.step("both pages show their empty state", async () => {
    await page.goto(areas);
    await expect(page.getByTestId("settings-areas")).toHaveCount(1);
    await expect(vis(page, "settings-areas-empty")).toBeVisible();
    await page.goto(devices);
    await expect(main.getByText("No device yet.")).toBeVisible();
  });

  await test.step("an area is added in the drawer and shows in its row", async () => {
    await page.goto(areas);
    await expect(page.getByTestId("settings-areas")).toHaveCount(1);
    await vis(page, "settings-areas-add").click();
    const drawer = vis(page, "settings-areas-drawer");
    await expect(drawer).toBeVisible();
    await vis(page, "settings-areas-field-name").fill("Line 3");
    await vis(page, "settings-areas-field-key").fill("line-3");
    await vis(page, "settings-areas-field-unit").selectOption({ label: UNIT });
    await vis(page, "settings-areas-field-role").selectOption({ label: ROLE });
    await vis(page, "settings-areas-field-anonymous").check();
    await vis(page, "settings-areas-save").click();
    await expect(drawer).toBeHidden();
    const row = vis(page, "settings-areas-row-line-3");
    await expect(row).toBeVisible();
    await expect(row.getByTestId("settings-areas-name")).toHaveText("Line 3");
    // The unit is a department chip in its tint (D10).
    await expect(page.locator("[data-dept-tone]", { hasText: UNIT }).first()).toBeVisible();
  });

  let pairCode = "";
  await test.step("a device is added and its pairing code is shown once", async () => {
    await page.goto(devices);
    await expect(page.getByTestId("floor-devices-list")).toHaveCount(1);
    await vis(page, "floor-device-add").click();
    await vis(page, "floor-device-label").fill("Line 3 tablet");
    await page.getByRole("checkbox", { name: "Line 3" }).check();
    await vis(page, "floor-device-create").click();
    const secret = main.getByTestId("floor-devices-secret");
    await expect(secret).toBeVisible();
    pairCode = (await secret.locator("code").innerText()).trim();
    expect(pairCode.length).toBeGreaterThan(3);
    await main.getByTestId("floor-devices-secret-done").click();
    await expect(secret).toBeHidden();
    await expect(main.getByText("Line 3 tablet")).toBeVisible();
    // The manager is listed with a face in their own tint.
    await expect(page.locator("[data-person-face]").first()).toBeVisible();
  });

  await test.step("the settings pages pass the sweep with data in them", async () => {
    await sweepPages(page, [areas, devices], { marker: "section-card" });
  });

  await test.step("the device pairs and the floor pages sit in the floor shell at 375 px", async () => {
    const phone = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const mobile = await phone.newPage();
    await mobile.goto(`/${SLUG}/floor/pair`);
    await mobile.getByTestId("floor-pair-code").fill(pairCode);
    await mobile.getByTestId("floor-pair-submit").click();
    await expect(mobile.getByTestId("floor-pair-done")).toBeVisible();
    await sweepPages(mobile, [`/${SLUG}/floor/pair`, `/${SLUG}/floor/line-3`, `/${SLUG}/floor/status`], { marker: "floor-shell", title: false, viewports: [375] });
    // The raise page names the unit as a department chip.
    await mobile.goto(`/${SLUG}/floor/line-3`);
    await expect(mobile.getByTestId("floor-raise-place").locator("[data-dept-tone]")).toHaveText(UNIT);
    await phone.close();
  });

  await test.step("the device and the area are removed again", async () => {
    await page.goto(devices);
    await expect(page.getByTestId("floor-devices-list")).toHaveCount(1);
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await vis(page, "floor-device-remove-dialog").getByRole("button", { name: "Remove", exact: true }).click();
    await expect(main.getByText("No device yet.")).toBeVisible();

    await page.goto(areas);
    await expect(page.getByTestId("settings-areas")).toHaveCount(1);
    await vis(page, "settings-areas-delete").click();
    await vis(page, "settings-areas-delete-yes").click();
    await expect(vis(page, "settings-areas-empty")).toBeVisible();
  });
});
