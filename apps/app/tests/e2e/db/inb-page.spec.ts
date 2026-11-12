// INB page (plan INB, INB-D1): on a real company (sandbox stage, empty template) a leader opens /inbox, sees the Today
// line and the case on their desk under Decide, opens it and the existing decide sheets work, and sees the raise
// notice in the notices list and marks it read. Own company, made straight in the database and deleted at the end,
// like loop.spec.ts. The case and its notice are written as the app writes them (the raise event, the in-app row).
import type { Browser, Page } from "@playwright/test";
import { expect, passSecondFactor, test } from "../helpers";
import { getDb } from "../../../src/lib/db/client";
import { workdayOf } from "../../../src/features/clock/calendar";
import { loadCalendar } from "../../../src/lib/db/calendar";
import { rebuildProjections } from "../../../src/lib/db/projections/case-view";
import { addRole, addSeat, addUnit } from "../../../src/lib/db/org-edit";
import { createTestCompany, deleteTestCompany, emailOf } from "./company-fixture";

const STAMP = Date.now().toString(36);
const SLUG = `inb-${STAMP}`;
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL (.env.local)");

const RAISER = "Rosa Raiserwood";
const LEAD = "Quentin Qualityfield";
const UNIT = "QA";
const ROLE = "Quality lead";
const CASE_ID = `inb-d1-${STAMP}`;
const TITLE = "Scrap bins overflow on line 4, rework every shift";
const NOTICE = `New case for Quality lead: ${TITLE}`;

const codes = new Map<string, string>();
let companyId = "";

async function signIn(browser: Browser, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/${SLUG}/login`);
  await page.locator("#code:visible").fill(codes.get(name) ?? "");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await passSecondFactor(page, `${SLUG}|${name}`);
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

test.describe.serial("INB page", () => {
  test.beforeAll(async () => {
    const made = await createTestCompany({
      slug: SLUG, name: `INB ${STAMP}`, template: "empty", stage: "sandbox",
      people: [
        { name: RAISER, role: "member", dept: UNIT, email: emailOf(RAISER, SLUG) },
        { name: LEAD, role: "leader", dept: UNIT, email: emailOf(LEAD, SLUG) },
      ],
    });
    for (const [name, code] of made) codes.set(name, code);
    const db = getDb();
    companyId = (await db.company.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } })).id;
    const user = async (name: string) => (await db.user.findFirstOrThrow({ where: { companyId, name }, select: { id: true } })).id;
    const lead = await user(LEAD);
    const raiser = await user(RAISER);

    // The leader holds the Quality lead seat; the member raised a case to it.
    const unit = await addUnit(companyId, "inb-d1", { key: UNIT, name: UNIT, kind: "dept", headcount: 0, parentId: null });
    const role = await addRole(companyId, "inb-d1", { orgUnitId: unit, title: ROLE, reportsToId: null, decides: [], spendLimitEur: null });
    const seatId = await addSeat(companyId, role, LEAD, lead);
    const now = new Date();
    const day = workdayOf(now, await loadCalendar(companyId));
    await db.caseEvent.create({
      data: {
        id: `${SLUG}-raised`, companyId, ts: now, day, type: "case.raised", actor: RAISER, actorUserId: raiser, targetId: CASE_ID, source: "app",
        payload: { title: TITLE, body: "The bins are full by ten and the shift reworks parts until noon.", assignee: LEAD, assigneeRoleHolderId: seatId, fromDept: UNIT, kind: "problem", routeId: null },
      },
    });
    await rebuildProjections(companyId, now);
    // The notice the planner writes next to the mail: one in-app row, sent, unread.
    await db.outboxMessage.create({
      data: { companyId, channel: "inapp", key: `notify:${SLUG}-raised:${lead}:app`, recipientUserId: lead, template: "raised", locale: "en", subject: NOTICE, text: "A new case is on your desk.", status: "sent", sentAt: now },
    });
  });

  test.afterAll(async () => {
    await deleteTestCompany(SLUG);
  });

  test("INB page: a leader sees the Today line, decides the desk case in place and marks the raise notice read", async ({ browser }) => {
    const page = await signIn(browser, LEAD);
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(`/${SLUG}/inbox`);

    await test.step("the Today line counts the case to decide", async () => {
      const today = page.getByTestId("inbox-today");
      await expect(today).toBeVisible();
      await expect(page.getByTestId("inbox-today-decide")).toHaveText("1 to decide");
      await expect(page.getByTestId("inbox-today-late")).toHaveText("0 late");
      await expect(page.getByTestId("inbox-today-part")).toHaveText("0 to do my part");
    });

    await test.step("the case is under Decide and opens in place with the decide actions", async () => {
      const decide = page.getByTestId("section-card").filter({ has: page.getByRole("heading", { name: "Decide", exact: true }) });
      const row = decide.getByTestId("inbox-row").filter({ hasText: TITLE });
      await expect(row).toHaveCount(1);
      await expect(row).toHaveAttribute("data-ask", "decide");
      await row.click();
      await expect(page).toHaveURL(new RegExp(`id=${CASE_ID}`));
      await expect(page.getByRole("button", { name: "Yes, do it" })).toBeVisible();
      await expect(page.getByRole("button", { name: "No, and why" })).toBeVisible();
    });

    await test.step("the raise notice is unread in the notices list and Mark all as read marks it", async () => {
      const notice = page.getByTestId("inbox-notice").filter({ hasText: NOTICE });
      await expect(notice).toHaveAttribute("data-read", "false");
      await page.getByRole("button", { name: "Mark all as read" }).click();
      await expect(notice).toHaveAttribute("data-read", "true");
      await expect(page.getByRole("button", { name: "Mark all as read" })).toHaveCount(0);
      await expect.poll(() => getDb().outboxMessage.count({ where: { companyId, channel: "inapp", readAt: { not: null } } })).toBe(1);
      await page.reload();
      await expect(page.getByTestId("inbox-notice").filter({ hasText: NOTICE })).toHaveAttribute("data-read", "true");
    });

    await test.step("the existing decide sheets work: a yes opens the project and the case leaves the list", async () => {
      await page.goto(`/${SLUG}/inbox?id=${CASE_ID}`);
      await page.getByRole("button", { name: "Yes, do it" }).click();
      await page.getByRole("dialog", { name: "Yes, do it" }).getByRole("button", { name: "Say yes and open the project" }).click();
      await expect.poll(() => getDb().caseEvent.count({ where: { companyId, type: "case.decided", targetId: CASE_ID } })).toBe(1);
      await page.goto(`/${SLUG}/inbox`);
      await expect(page.getByTestId("inbox-today-decide")).toHaveText("0 to decide");
    });

    expect(errors, "console errors").toEqual([]);
    await page.context().close();
  });
});
