// UIP-K1: on the pages Sam built, every person has a tinted face and every department a tone (plan UIP, D10).
// A company made from the demo template, so there are people, units, routes and cases to look at.
import type { Browser, Page } from "@playwright/test";
import { expect, passSecondFactor, test } from "../helpers";
import { deptTone } from "../../../src/lib/dept-tone";
import { createTestCompany, deleteTestCompany, emailOf } from "./company-fixture";

const SLUG = `uip-colour-${Date.now().toString(36)}`;
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL");

const PEOPLE = [
  { name: "B. Hartmann", role: "manager", dept: "Betriebsleitung" },
  { name: "T. Vogel", role: "leader", dept: "Production" },
  { name: "J. Schmidt", role: "member", dept: "Production, Line 3" },
] as const;
const codes = new Map<string, string>();

async function signIn(browser: Browser, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/${SLUG}/login`);
  await page.locator("#code").fill(codes.get(name) ?? "");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await passSecondFactor(page, `${SLUG}|${name}`);
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

async function open(page: Page, path: string) {
  await page.goto(`/${SLUG}${path}`);
  await page.waitForLoadState("networkidle");
}

/** Every face is tinted (an anonymous person stays grey and shows "?"), and there is at least `min` of them. */
async function expectTintedFaces(page: Page, min: number) {
  const faces = page.locator("[data-person-face]");
  expect(await faces.count(), "faces on the page").toBeGreaterThanOrEqual(min);
  const bare = await faces.evaluateAll((els) => els.filter((e) => !e.hasAttribute("data-avatar") && e.textContent?.trim() !== "?").length);
  expect(bare, "faces without a tint").toBe(0);
}

test.describe.serial("UIP colour", () => {
  test.beforeAll(async () => {
    const made = await createTestCompany({
      slug: SLUG, name: `UIP colour ${SLUG}`, template: "demo", stage: "sandbox",
      people: PEOPLE.map((p) => ({ ...p, email: emailOf(p.name, SLUG) })),
    });
    for (const [name, code] of made) codes.set(name, code);
  });

  test.afterAll(async () => {
    await deleteTestCompany(SLUG);
  });

  test("UIP colour: Members, Org, Routing, Feed, Dashboard and Inbox", async ({ browser }) => {
    const manager = await signIn(browser, "B. Hartmann");

    // Members: every person has a tinted face, and a department keeps the tone its name gives it.
    await open(manager, "/settings/members");
    await expectTintedFaces(manager, PEOPLE.length);
    const dept = manager.locator("[data-dept-tone]:visible", { hasText: "Betriebsleitung" }).first();
    await expect(dept).toHaveAttribute("data-dept-tone", deptTone("Betriebsleitung") ?? "");

    // Org and Routing name departments, and Org shows who holds each seat.
    await open(manager, "/settings/org");
    await expect(manager.locator("[data-dept-tone]:visible").first()).toBeVisible();
    await expectTintedFaces(manager, 0);
    await open(manager, "/settings/routing");
    await expect(manager.locator("[data-dept-tone]:visible").first()).toBeVisible();
    await expectTintedFaces(manager, 0);

    // Feed: the department filters carry a tone, and the people on the posts have tinted faces.
    await open(manager, "/feed");
    await expect(manager.locator("[data-dept-tone]:visible").first()).toBeVisible();
    await expectTintedFaces(manager, 1);

    // The manager's Dashboard breaks the wait ledger down by unit, and every unit it shows carries its tone.
    // This company has three people, so every unit is under 5 and the breakdown may show none at all.
    await open(manager, "/dashboard");
    await expect(manager.getByTestId("dashboard-board")).toBeVisible();
    const units = manager.getByTestId("dashboard-row");
    await expect(units.locator("[data-dept-tone]")).toHaveCount(await units.count());
    await manager.context().close();

    // The leader's Inbox: its people are tinted too.
    const leader = await signIn(browser, "T. Vogel");
    await open(leader, "/leader");
    await expectTintedFaces(leader, 0);
    await leader.context().close();
  });
});
