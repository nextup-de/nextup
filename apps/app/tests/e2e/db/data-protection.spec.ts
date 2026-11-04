// GDP acceptance (plan GDP, GDP-Z1): a manager deactivates a member, sees it in the audit view, makes an
// admin-only export of her data, then pseudonymises her. Structured identity (members list, audit view,
// export actors) shows the pseudonym; the case event table stays byte-for-byte; immutable comment text
// may still hold her name. Own company in stage pilot, deleted at the end, like admin-setup.spec.ts.
import type { Page } from "@playwright/test";
import { expect, passSecondFactor, test } from "../helpers";
import { getDb } from "../../../src/lib/db/client";
import { createTestCompany, deleteTestCompany } from "./company-fixture";

const STAMP = Date.now().toString(36);
const SLUG = `gdp-${STAMP}`;
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL (.env.local)");

const MANAGER = { name: "Wilhelmina Quarterfoil", email: `wilhelmina@${SLUG}.test` };
const LENA = { name: "Lena Brandt", email: `lena@${SLUG}.test` };
const OTHER = { name: "Mattis Oberholzer", email: `mattis@${SLUG}.test` };
const CASE_ID = `case-${STAMP}`;

const codes = new Map<string, string>();
const eventRows = async (companyId: string) =>
  JSON.stringify(await getDb().caseEvent.findMany({ where: { companyId }, orderBy: { seq: "asc" } }));

type Download = { text: string; tables: Record<string, Record<string, unknown>[]> };
async function download(page: Page, href: string): Promise<Download> {
  const res = await page.context().request.get(href);
  expect(res.status()).toBe(200);
  const text = await res.text();
  return { text, tables: (JSON.parse(text) as { tables: Download["tables"] }).tables };
}

test.describe.serial("GDP acceptance: audit, export and pseudonymise", () => {
  test.beforeAll(async () => {
    const made = await createTestCompany({
      slug: SLUG, name: `GDP ${STAMP}`, template: "empty", stage: "pilot",
      people: [
        { ...MANAGER, role: "manager", dept: "Management" },
        { ...LENA, role: "member", dept: "Production" },
        { ...OTHER, role: "member", dept: "Production" },
      ],
    });
    for (const [name, code] of made) codes.set(name, code);
    const db = getDb();
    const company = await db.company.findFirstOrThrow({ where: { slug: SLUG }, select: { id: true } });
    const users = await db.user.findMany({ where: { companyId: company.id } });
    const lena = users.find((u) => u.email === LENA.email);
    const other = users.find((u) => u.email === OTHER.email);
    if (!lena || !other) throw new Error("members were not created");
    const ev = (n: number, type: string, who: typeof lena, actor: string, payload: object) => ({
      id: `e-${STAMP}-${n}`, companyId: company.id, day: 0, type, actor, actorUserId: who.id, targetId: CASE_ID, payload,
    });
    await db.caseEvent.createMany({
      data: [
        ev(1, "case.raised", lena, lena.handle ?? lena.name, { title: `Rig booking ${STAMP}`, body: "We wait for the test rig." }),
        // An older event: the display name as the actor label.
        ev(2, "case.commented", lena, lena.name, { text: "More detail from my side." }),
        ev(3, "case.commented", other, other.handle ?? other.name, { text: "Thanks Lena Brandt" }),
      ],
    });
  });

  test.afterAll(async () => {
    await deleteTestCompany(SLUG);
  });

  test("deactivate, audit, admin-only export, pseudonymise", async ({ browser }) => {
    const db = getDb();
    const company = await db.company.findFirstOrThrow({ where: { slug: SLUG }, select: { id: true } });
    const lena = await db.user.findFirstOrThrow({ where: { companyId: company.id, email: LENA.email } });

    // Sign in: code, then second factor (as ADM-Z1).
    const page = await (await browser.newContext()).newPage();
    await page.goto(`/${SLUG}/login`);
    await page.locator("#code").fill(codes.get(MANAGER.name) ?? "");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await passSecondFactor(page, `${SLUG}|${MANAGER.name}`);
    await expect(page).not.toHaveURL(/\/login/);

    // Deactivate Lena Brandt in Members.
    await page.goto(`/${SLUG}/settings/members`);
    const row = () => page.locator(`[data-testid="settings-member-${lena.id}"]`);
    const menu = () => row().locator(`[data-testid="settings-member-menu-${lena.id}"]`);
    await expect(row()).toBeVisible({ timeout: 15_000 });
    await menu().click();
    await row().getByRole("button", { name: /^Deactivate/ }).click();
    await page.getByRole("button", { name: /^Yes, deactivate/i }).click();
    await expect(row()).toHaveAttribute("data-inactive", "", { timeout: 15_000 });

    // The audit view shows "Deactivated" about Lena Brandt.
    await page.goto(`/${SLUG}/settings/audit`);
    const auditRows = page.locator('[data-testid="settings-audit-row"]');
    await expect(auditRows.filter({ hasText: "Deactivated" }).filter({ hasText: LENA.name }).first()).toBeVisible({ timeout: 15_000 });

    // Admin-only export from her menu; the dialog says so and the reason is recorded.
    await page.goto(`/${SLUG}/settings/members`);
    await menu().click();
    await row().locator('[data-testid="member-export-open"]').click();
    const dialog = page.locator('[data-testid="member-export-dialog"]');
    await expect(dialog.locator('[data-testid="member-export-inactive"]')).toContainText(/admin-only copy/i);
    await dialog.locator('[data-testid="member-export-submit"]').click();
    await expect(page.locator('[data-testid="member-privacy-status"]')).toBeVisible({ timeout: 15_000 });
    const exported = await db.auditEvent.findFirstOrThrow({ where: { companyId: company.id, action: "audit.privacy.exported" } });
    expect(JSON.stringify(exported)).toMatch(/admin-only/i);

    // Download from Data and privacy: her events are in it, the second member is not.
    await page.goto(`/${SLUG}/settings/privacy`);
    const href = await page.locator('[data-testid="settings-privacy-download"]').first().getAttribute("href");
    const person = await download(page, href ?? "");
    expect(person.tables.events).toHaveLength(2);
    expect(person.tables.events.every((e) => e.actorUserId === lena.id)).toBe(true);
    expect(person.text).not.toContain(OTHER.name);
    expect(person.text).not.toContain(OTHER.email);

    // Pseudonymise: type the name (case ignored), confirm.
    const before = await eventRows(company.id);
    await page.goto(`/${SLUG}/settings/members`);
    await menu().click();
    await row().locator('[data-testid="member-pseudonymise-open"]').click();
    await page.locator('[data-testid="member-pseudonymise-name"]').fill("lena brandt");
    await page.locator('[data-testid="member-pseudonymise-submit"]').click();
    await expect(page.locator('[data-testid="member-privacy-status"]')).toContainText("Former member #", { timeout: 15_000 });

    // Members list and audit view show the pseudonym; the event table is unchanged.
    await page.goto(`/${SLUG}/settings/members`);
    await expect(row()).toContainText("Former member #");
    await expect(row()).not.toContainText(LENA.name);
    await page.goto(`/${SLUG}/settings/audit`);
    await expect(auditRows.filter({ hasText: "Former member #" }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("main").locator("table")).not.toContainText(LENA.name);
    expect(await eventRows(company.id)).toBe(before);

    // A new company export holds the pseudonym as identity; immutable comment text may keep the name.
    await page.goto(`/${SLUG}/settings/privacy`);
    await page.locator('[data-testid="settings-privacy-export-company"]').click();
    const links = page.locator('[data-testid="settings-privacy-download"]');
    await expect(links).toHaveCount(1, { timeout: 15_000 }); // her own export expired with the pseudonym;
    const all = await download(page, (await links.first().getAttribute("href")) ?? "");
    const mine = all.tables.events.filter((e) => e.actorUserId === lena.id);
    expect(mine).toHaveLength(2);
    for (const e of mine) expect(String(e.actor)).toMatch(/^Former member #\d+$/);
    expect(JSON.stringify(all.tables.users)).not.toContain(LENA.name);
    expect(JSON.stringify(all.tables.events)).toContain("Thanks Lena Brandt");
    await page.context().close();
  });
});
