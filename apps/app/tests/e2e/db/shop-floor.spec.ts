// FLR acceptance (plan FLR, FLR-Z1): an admin sets up an area, the poster's URL raises a case anonymously
// on a phone, the desk of the area's role decides it, and the reference on the status page shows the answer.
// The reference never travels in a URL (D8). Own company, deleted at the end, like structure.spec.ts.
import { devices, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { expect, passSecondFactor, sheet, test, vis } from "../helpers";
import { getDb } from "../../../src/lib/db/client";
import { createTestCompany, deleteTestCompany, emailOf } from "./company-fixture";

const STAMP = Date.now().toString(36);
const SLUG = `flr-${STAMP}`;
const MANAGER = "Greta Hallwood";
const LEADER = "Lennart Brightwater";
const UNIT = "Zephyrwerk";
const ROLE = "Hall supervisor";
const TITLE = `Oil on the floor by press ${STAMP}`;
const REASON = "Not this quarter, the press is replaced in January";
// The path-mode server of playwright.db.config.ts, whichever port this checkout has (playwright.ports.ts).
const BASE = () => test.info().project.use.baseURL;

test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL (.env.local)");
test.use({ ...devices["Pixel 7"] });

const codes = new Map<string, string>();

async function signIn(browser: Browser, name: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ ...devices["Desktop Chrome"], baseURL: BASE() });
  const page = await context.newPage();
  await page.goto(`/${SLUG}/login`);
  await page.locator("#code:visible").fill(codes.get(name) ?? "");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await passSecondFactor(page, `${SLUG}|${name}`);
  await expect(page).not.toHaveURL(/\/login/);
  return { context, page };
}

test.describe.serial("FLR acceptance", () => {
  test.beforeAll(async () => {
    const made = await createTestCompany({
      slug: SLUG, name: `FLR ${STAMP}`, template: "empty", stage: "sandbox",
      people: [
        { name: MANAGER, role: "manager", dept: UNIT, email: emailOf(MANAGER, SLUG) },
        { name: LEADER, role: "leader", dept: UNIT, email: emailOf(LEADER, SLUG) },
      ],
    });
    for (const [name, code] of made) codes.set(name, code);
    // The structure: a unit, a role with one seat linked to the leader.
    const db = getDb();
    const company = await db.company.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
    const leader = await db.user.findFirstOrThrow({ where: { companyId: company.id, name: LEADER }, select: { id: true } });
    const unit = await db.orgUnit.create({ data: { companyId: company.id, key: "ZW", name: UNIT, kind: "dept", sort: 0 } });
    const role = await db.orgRole.create({ data: { companyId: company.id, orgUnitId: unit.id, title: ROLE, decides: [], sort: 0 } });
    await db.orgRoleHolder.create({ data: { companyId: company.id, roleId: role.id, name: LEADER, userId: leader.id, sort: 0 } });
  });

  test.afterAll(async () => {
    await deleteTestCompany(SLUG);
  });

  test("FLR acceptance: QR raise reaches the role and the reference shows the answer", async ({ browser }) => {
    let areaUrl = "";
    let reference = "";

    await test.step("an admin creates area line-3 and reads the URL under its poster code", async () => {
      const { context, page } = await signIn(browser, MANAGER);
      await page.goto(`/${SLUG}/settings/areas`);
      await vis(page, "settings-areas-add").click();
      await vis(page, "settings-areas-field-name").fill("Line 3");
      await vis(page, "settings-areas-field-key").fill("line-3");
      await vis(page, "settings-areas-field-unit").selectOption({ label: UNIT });
      await vis(page, "settings-areas-field-role").selectOption({ label: ROLE });
      await vis(page, "settings-areas-field-anonymous").check();
      await vis(page, "settings-areas-save").click();
      const row = vis(page, "settings-areas-row-line-3");
      await expect(row).toBeVisible();
      await vis(row, "settings-areas-poster").click();
      await expect(vis(page, "settings-areas-poster-qr")).toBeVisible();
      areaUrl = (await vis(page, "settings-areas-poster-url").innerText()).trim();
      expect(areaUrl).toContain(`/${SLUG}/floor/line-3`);
      await context.close();
    });

    // The phone: a fresh context, every request URL recorded.
    const phone = await browser.newContext({ ...devices["Pixel 7"], baseURL: BASE() });
    const requested: string[] = [];
    phone.on("request", (r) => requested.push(r.url()));
    const mobile = await phone.newPage();

    await test.step("on a phone the area URL raises a problem anonymously", async () => {
      // The poster shows the public address; the test server answers on its own host.
      await mobile.goto(new URL(areaUrl).pathname);
      await vis(mobile, "floor-raise-problem").click();
      await vis(mobile, "floor-raise-title").fill(TITLE);
      await vis(mobile, "floor-raise-send").click();
      await expect(vis(mobile, "floor-sent-page")).toBeVisible();
    });

    await test.step("the sent page shows a reference that is in no request URL", async () => {
      reference = (await vis(mobile, "floor-sent-reference").innerText()).replace(/\D/g, "");
      expect(reference).toMatch(/^\d{8}$/);
      await mobile.waitForTimeout(1500); // let late prefetches land in the request log
      for (const url of requested) expect(url, "a request URL carries the reference").not.toContain(reference);
    });

    await test.step("the leader finds the case in the inbox and decides no with a reason", async () => {
      const { context, page } = await signIn(browser, LEADER);
      await page.goto(`/${SLUG}/leader`);
      await page.getByRole("main").getByText(TITLE).first().click();
      await page.getByRole("button", { name: "No, and why" }).click();
      await sheet(page).getByRole("button", { name: "Pick a reason" }).waitFor();
      await sheet(page).getByRole("button", { name: /No budget this year/ }).click();
      await sheet(page).getByRole("textbox", { name: /Your reason/ }).fill(REASON);
      await sheet(page).getByRole("button", { name: "Send the no" }).click();
      await expect(sheet(page)).toBeHidden();
      await expect(page.getByText(/Answered “no”/)).toBeVisible();
      await context.close();
    });

    await test.step("on the phone the reference shows the answer and the reason, not the leader", async () => {
      await mobile.goto(`/${SLUG}/floor/status`);
      for (const d of reference) await vis(mobile, `floor-keypad-${d}`).click();
      await vis(mobile, "floor-keypad-action").click();
      const decision = vis(mobile, "floor-status-decision");
      await expect(decision).toBeVisible();
      // The answer and the category's label show; the desk's reason text never does (D12, NOR D25).
      await expect(decision).toContainText(/^No/);
      await expect(decision).toContainText(/no budget this year/i);
      const text = await mobile.locator("body").innerText();
      expect(text).not.toContain(REASON);
      expect(text).not.toContain(LEADER);
      expect(text).not.toContain(LEADER.split(" ")[0]);
      for (const url of requested) expect(url, "a request URL carries the reference").not.toContain(reference);
      await phone.close();
    });
  });
});
