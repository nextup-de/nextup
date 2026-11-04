// UIP-G1: the page sweep passes on a page Sam built, and it fails when the marker is missing.
import { expect, test } from "../helpers";
import { createTestCompany, deleteTestCompany, type TestCompany } from "../../db/test-company";
import { signIn, sweepPages } from "./fixtures/page-sweep";

const SLUG = "uip-elements";
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL");

const MANAGER = { name: "Mara Sweep", email: `mara@${SLUG}.test`, role: "manager" as const };

let company: TestCompany;

test.beforeAll(async () => {
  company = await createTestCompany(SLUG, [MANAGER]);
});
test.afterAll(async () => {
  await deleteTestCompany(SLUG);
});

test("UIP sweep", async ({ page }) => {
  await signIn(page, company, MANAGER.name);
  await sweepPages(page, [`/${SLUG}/settings/company`], { marker: "page-header" });
  await expect(sweepPages(page, [`/${SLUG}/settings/company`], { marker: "no-such-marker", viewports: [1440] })).rejects.toThrow(/no no-such-marker/);
});
