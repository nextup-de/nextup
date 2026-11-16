// UIP-E1: the case page (a real case with events in it), My cases, the Decision log and a Person page pass
// the page sweep with a section card, at 1440 and 375 px. The case page is the idea's one page, /idea?id= (16 Nov 2026).
import { expect, test, vis } from "../helpers";
import { workdayOf } from "../../../src/features/clock/calendar";
import { loadCalendar } from "../../../src/lib/db/calendar";
import { getDb } from "../../../src/lib/db/client";
import { addRole, addSeat, addUnit } from "../../../src/lib/db/org-edit";
import { rebuildProjections } from "../../../src/lib/db/projections/case-view";
import { createTestCompany, deleteTestCompany, type TestCompany } from "../../db/test-company";
import { signIn, sweepPages } from "./fixtures/page-sweep";

const SLUG = "uip-cases";
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL");

const MANAGER = { name: "Mara Sweep", email: `mara@${SLUG}.test`, role: "manager" as const };
const MEMBER = { name: "Milo Raiser", email: `milo@${SLUG}.test`, role: "member" as const };
const OPEN = { id: "uip-open", title: "Night-shift handover checklist" };
const DECIDED = { id: "uip-decided", title: "Shared forklift booking" };

let company: TestCompany;

test.beforeAll(async () => {
  company = await createTestCompany(SLUG, [MANAGER, MEMBER]);
  const db = getDb();
  const now = new Date();
  const day = workdayOf(now, await loadCalendar(company.companyId));
  const memberId = company.people[MEMBER.name].id;
  const managerId = company.people[MANAGER.name].id;
  // The member holds a seat, so a person page exists for them.
  const plant = await addUnit(company.companyId, "uip-e1", { key: "plant", name: "Werk Sued", kind: "site", headcount: 0, parentId: null });
  const assembly = await addUnit(company.companyId, "uip-e1", { key: "assembly", name: "Assembly", kind: "dept", headcount: 0, parentId: plant });
  const role = await addRole(company.companyId, "uip-e1", { orgUnitId: assembly, title: "Quality lead", reportsToId: null, decides: [], spendLimitEur: null });
  await addSeat(company.companyId, role, MEMBER.name, memberId);
  let n = 0;
  const row = (targetId: string, type: string, actor: string, actorUserId: string, payload: object, back = 0) => ({
    id: `${SLUG}-e${n++}`, companyId: company.companyId, ts: now, day: day - back, type, actor, actorUserId, targetId, source: "app", payload,
  });
  const raised = (c: { id: string; title: string }, back: number) => row(c.id, "case.raised", MEMBER.name, memberId, {
    title: c.title, body: "Each shift writes three lines on open, so the next one knows what is half done.",
    assignee: "Quality lead", fromDept: "Assembly", kind: "idea", routeId: null,
  }, back);
  await db.caseEvent.createMany({
    data: [
      raised(OPEN, 4),
      row(OPEN.id, "case.read", MANAGER.name, managerId, {}, 3),
      row(OPEN.id, "case.asked", MANAGER.name, managerId, { text: "Which lines would start?" }, 3),
      row(OPEN.id, "case.answered", MEMBER.name, memberId, { text: "Line 3 and line 4." }, 2),
      row(OPEN.id, "case.commented", MEMBER.name, memberId, { text: "We had the same on line 3 last spring." }, 1),
      raised(DECIDED, 6),
      row(DECIDED.id, "case.decided", MANAGER.name, managerId, { answer: "no", reason: "Covered by the new yard system in Q1" }, 2),
    ],
  });
  await rebuildProjections(company.companyId, now);
});
test.afterAll(async () => {
  await deleteTestCompany(SLUG);
});

test("UIP cases", async ({ page, browser }) => {
  await signIn(page, company, MANAGER.name);
  const memberId = company.people[MEMBER.name].id;
  const idea = (id: string) => `/${SLUG}/idea?id=${id}`;
  await sweepPages(page, [idea(OPEN.id), idea(DECIDED.id), `/${SLUG}/team`, `/${SLUG}/people/${memberId}`]);
  await sweepPages(page, [`/${SLUG}/decisions`], { title: false }); // a tab of Projects: the tab names it

  await test.step("the case page shows its title, its events and takes a note", async () => {
    // The sweep ends at phone width; the idea page and its Chats page are read on a laptop.
    await page.setViewportSize({ width: 1440, height: 900 });
    // One idea page, /idea?id= (16 Nov 2026): the title is the idea card's h1, and a note goes in the idea's Chats.
    await page.goto(`/${SLUG}/cases/${OPEN.id}`);
    await expect(page).toHaveURL(new RegExp(`/idea\\?id=${OPEN.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: OPEN.title, exact: true })).toBeVisible();
    await expect(vis(page, "section-card").filter({ hasText: "What happened" })).toContainText("Which lines would start?");
    await page.goto(`${idea(OPEN.id)}&page=chats`);
    await page.getByRole("button", { name: "Switch chat" }).click();
    await page.getByRole("dialog", { name: "Chats" }).getByRole("button", { name: /^From the feed/ }).click();
    await page.getByLabel("Add a comment", { exact: true }).fill("Checked on site.");
    await page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByText("Checked on site.")).toBeVisible();
  });

  await test.step("the decision log lists the no", async () => {
    await page.goto(`/${SLUG}/decisions`);
    const row = page.getByTestId("decisions-row").filter({ hasText: DECIDED.title, visible: true });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("No");
  });

  await test.step("the member's own cases, with a case in them", async () => {
    const context = await browser.newContext();
    const own = await context.newPage();
    // A member has no second factor: the login code alone signs them in.
    await own.goto(`/${SLUG}/login`);
    await own.locator("#code").fill(company.people[MEMBER.name].code);
    await own.getByRole("button", { name: "Log in", exact: true }).click();
    await own.waitForURL((url) => !/\/login/.test(url.pathname));
    await sweepPages(own, [`/${SLUG}/team`, idea(OPEN.id)]);
    await own.goto(`/${SLUG}/team`);
    await expect(own.getByRole("article", { name: OPEN.title })).toBeVisible();
    await context.close();
  });
});
