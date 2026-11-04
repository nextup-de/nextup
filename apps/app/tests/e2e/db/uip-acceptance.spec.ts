// UIP-Z1: one sweep over the pages of plan UIP that need no data of their own, at 1440 and 375 px, and the
// old list pages still lead somewhere. Pages that need a case or a project keep their sweep in their own spec
// (uip-cases, uip-projects); the console has its own server (uip-console), the phone pages uip-floor.
import { expect, test } from "../helpers";
import { createTestCompany, deleteTestCompany, type TestCompany } from "../../db/test-company";
import { signIn, sweepPages } from "./fixtures/page-sweep";

const SLUG = "uip-acceptance";
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL");

const MANAGER = { name: "Mara Sweep", email: `mara@${SLUG}.test`, role: "manager" as const };

const page_ = (path: string) => `/${SLUG}/${path}`;
// Built by plan UIP: every page is a header and section cards.
const CARDS = [
  "settings/notifications", "settings/teams", "settings/import-export", "settings/webhooks", "settings/api-tokens",
  "settings/sign-in", "settings/support-access", "settings/privacy", "settings/audit", "settings/areas", "settings/areas/devices",
  "dashboard/kpis", "profile", "projects/collaboration", "projects/progress", "reports",
].map(page_);
// Built by Sam, or empty without data: the page header is what they share.
const HEADERS = [
  "settings/company", "settings/rules", "settings/calendar", "settings/org", "settings/routing", "settings/members",
  "projects", "team", "decisions",
].map(page_);

let company: TestCompany;

test.beforeAll(async () => {
  company = await createTestCompany(SLUG, [MANAGER]);
});
test.afterAll(async () => {
  await deleteTestCompany(SLUG);
});

test("UIP acceptance", async ({ page }) => {
  test.setTimeout(600_000);
  await signIn(page, company, MANAGER.name);
  await sweepPages(page, CARDS);
  await sweepPages(page, HEADERS, { marker: "page-header" });

  // A page module must win over settings.module.css whichever loads first: the search is the wide field.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(page_("settings/members"));
  const wide = async (selector: string) => (await page.locator(selector).first().boundingBox())?.width ?? 0;
  expect(await wide("main input[type=search], main input")).toBeGreaterThan(await wide("main select"));

  for (const old of ["ideas", "problems"]) {
    await page.goto(page_(old));
    await expect(page, `/${old} goes to the Feed`).toHaveURL(new RegExp(`/${SLUG}/feed`));
  }
});
