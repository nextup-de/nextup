// INB acceptance (plan INB, INB-Z1): on a real company (sandbox stage, empty template) with the AI, Teams, Jira and
// Microsoft 365 off, everyone sees what waits for them on the one inbox, in the decided order, and every notice is in
// the app. A member with an open question, a leader with desk cases and a second person with a typed result to
// confirm each open /inbox; each finds the matching notice in the in-app list; with the loop group set to mail no
// Teams row is ever written; and the member's digest lists the same item the inbox shows.
// Own company, made straight in the database and deleted at the end, like loop.spec.ts. Set up in the database where
// the UI is not the point (the org, the cases, the project and its typed result, the planner and digest passes); the
// pages are driven for what the acceptance shows.
import type { Browser, Page } from "@playwright/test";
import { expect, passSecondFactor, test } from "../helpers";
import { getDb } from "../../../src/lib/db/client";
import { berlinDate, isWorkday, workdayOf } from "../../../src/features/clock/calendar";
import { CONFIRM_DAYS } from "../../../src/features/projects/confirm";
import { loadCalendar } from "../../../src/lib/db/calendar";
import { setPref } from "../../../src/lib/db/notify-prefs";
import { rebuildProjections } from "../../../src/lib/db/projections/case-view";
import { addRole, addSeat, addUnit, saveRoute } from "../../../src/lib/db/org-edit";
import { dispatchOnce } from "../../../src/server/notify/dispatch";
import { runDigests } from "../../../src/server/notify/digest";
import { createTestCompany, deleteTestCompany, emailOf } from "./company-fixture";

const STAMP = Date.now().toString(36);
const SLUG = `inb-acc-${STAMP}`;
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL (.env.local)");

const RAISER = "Rosa Raiserwood"; // a member: raised the case the desk asked a question about
const LEAD = "Quentin Qualityfield"; // a leader: holds the Quality lead seat, leads the project
const SECOND = "Paula Plantbridge"; // a leader on the Plant manager seat, the route's deputy: the second person
const UNIT = "QA";
const OWNER_ROLE = "Quality lead";
const DEPUTY_ROLE = "Plant manager";
const OLD = { id: `inb-old-${STAMP}`, title: "Gauge calibration is two weeks overdue on line 2" };
const NEW = { id: `inb-new-${STAMP}`, title: "Labels for the new pallet size are missing at goods out" };
const ASKED = { id: `inb-ask-${STAMP}`, title: "Scrap bins overflow on line 4, rework every shift" };
const PROJECT = { caseId: `inb-prj-${STAMP}`, id: `inb-p-${STAMP}`, title: "Shorter changeover on line 3" };
const QUESTION = "Which shift is it?";

const codes = new Map<string, string>();
let companyId = "";
let day = 0; // today as the company counts it: a working-day number
let digestAt = new Date();
const ids = { raiser: "", lead: "", second: "" };

async function signIn(browser: Browser, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/${SLUG}/login`);
  await page.locator("#code:visible").fill(codes.get(name) ?? "");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await passSecondFactor(page, `${SLUG}|${name}`);
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

/** The section card of an ask on /inbox, by its heading. */
const section = (page: Page, name: string) => page.getByTestId("section-card").filter({ has: page.getByRole("heading", { name, exact: true }) });
const today = (page: Page) => ({
  decide: page.getByTestId("inbox-today-decide"),
  late: page.getByTestId("inbox-today-late"),
  part: page.getByTestId("inbox-today-part"),
});
const noticesOf = async (userId: string) => getDb().outboxMessage.findMany({ where: { companyId, channel: "inapp", recipientUserId: userId }, orderBy: { createdAt: "asc" } });

test.describe.serial("INB acceptance", () => {
  test.beforeAll(async () => {
    const made = await createTestCompany({
      slug: SLUG, name: `INB acceptance ${STAMP}`, template: "empty", stage: "sandbox",
      people: [
        { name: RAISER, role: "member", dept: UNIT, email: emailOf(RAISER, SLUG) },
        { name: LEAD, role: "leader", dept: UNIT, email: emailOf(LEAD, SLUG) },
        { name: SECOND, role: "leader", dept: UNIT, email: emailOf(SECOND, SLUG) },
      ],
    });
    for (const [name, code] of made) codes.set(name, code);
    const db = getDb();
    companyId = (await db.company.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } })).id;
    const user = async (name: string) => (await db.user.findFirstOrThrow({ where: { companyId, name }, select: { id: true } })).id;
    ids.raiser = await user(RAISER);
    ids.lead = await user(LEAD);
    ids.second = await user(SECOND);

    // The structure: a unit, two roles with a seat each, and the route between them (the second person is the deputy).
    const unit = await addUnit(companyId, "inb-z1", { key: UNIT, name: UNIT, kind: "dept", headcount: 0, parentId: null });
    const role = (title: string) => addRole(companyId, "inb-z1", { orgUnitId: unit, title, reportsToId: null, decides: [], spendLimitEur: null });
    const ownerRoleId = await role(OWNER_ROLE);
    const deputyRoleId = await role(DEPUTY_ROLE);
    await addSeat(companyId, ownerRoleId, LEAD, ids.lead);
    await addSeat(companyId, deputyRoleId, SECOND, ids.second);
    await saveRoute(companyId, "inb-z1", { key: "r-inb", type: "Quality", keywords: ["gauge", "label", "scrap"], ownerRoleId, deputyRoleId, buddyRoleId: null, wait: "3 d" });
    const routeId = "r-inb"; // a route's id in the company's seed is its key

    // D2: nothing that calls out is on. The loop notices go by mail (the group's rule is `mail`), so Teams is never
    // asked even if it were on; one check at 30 days so a typed result is all a project needs; the company's switch
    // for notices is on so the digest can be asked for.
    await db.companyConfig.update({ where: { companyId }, data: { measureDays: [30], notifications: true, noticeChannels: { loop: "mail" } } });
    const config = await db.companyConfig.findUniqueOrThrow({ where: { companyId } });
    expect(config.aiRouting, "AI routing").toBe(false);
    expect(config.assistant, "the raise assistant").toBe(false);
    expect(config.n8n, "n8n").toBe(false);
    expect(await db.integration.count({ where: { companyId, on: true } }), "integrations switched on (Teams, Jira)").toBe(0);
    expect(await db.connection.count({ where: { companyId } }), "Microsoft 365 connections").toBe(0);

    // The planner starts at the newest event the first time it sees a company: one pass now, events after it.
    await dispatchOnce();

    // Today in the company's working-day count, and a moment on this working day from which a digest may be written
    // (07:00 Berlin or later, on a working day: a weekend counts as the last working day before it).
    const cal = await loadCalendar(companyId);
    const real = new Date();
    day = workdayOf(real, cal);
    let date = berlinDate(real);
    while (!isWorkday(date, cal)) date = berlinDate(new Date(new Date(`${date}T12:00:00Z`).getTime() - 864e5));
    digestAt = new Date(`${date}T10:30:00Z`);

    let n = 0;
    const row = (targetId: string, type: string, actor: string, actorUserId: string, payload: object, back = 0) => ({
      id: `${SLUG}-e${n++}`, companyId, ts: real, day: day - back, type, actor, actorUserId, targetId, source: "app", payload,
    });
    const raised = (c: { id: string; title: string }, back: number) => row(c.id, "case.raised", RAISER, ids.raiser, {
      title: c.title, body: "It has been like this for a while and the shift works around it.", assignee: LEAD, fromDept: UNIT, kind: "problem", routeId,
    }, back);
    await db.caseEvent.createMany({
      data: [
        // Three cases on the Quality lead's desk: one long past its answer date (late), a new one, and one the desk asked a question about.
        raised(OLD, 12),
        raised(NEW, 0),
        raised(ASKED, 1),
        row(ASKED.id, "case.asked", LEAD, ids.lead, { text: QUESTION }, 0),
        // A project the desk said yes to, 31 working days ago started and done; its 30-day result typed today by the lead.
        row(PROJECT.caseId, "case.raised", RAISER, ids.raiser, { title: PROJECT.title, body: "Setters walk to the crib before every changeover.", assignee: LEAD, fromDept: UNIT, kind: "idea", routeId }, 35),
        row(PROJECT.caseId, "case.decided", LEAD, ids.lead, { answer: "yes", projectId: PROJECT.id, lead: LEAD, leadUserId: ids.lead, title: PROJECT.title }, 34),
        row(PROJECT.id, "project.baseline", LEAD, ids.lead, { metric: "Changeover", unit: "min", value: 42, better: "down", source: "stopwatch" }, 33),
        row(PROJECT.id, "project.started", LEAD, ids.lead, {}, 32),
        row(PROJECT.id, "project.done", LEAD, ids.lead, {}, 31),
        row(PROJECT.id, "project.measured", LEAD, ids.lead, { check: 30, value: 30 }, 0),
      ],
    });
    await rebuildProjections(companyId, real);

    // The planner writes the notices of those events, mail rows (skipped on a sandbox) and one in-app copy each.
    await dispatchOnce();

    // The member asks for the digest; the digest pass writes it (an in-app copy, the outside rows skipped on a sandbox).
    await setPref(companyId, ids.raiser, "digest", true);
    await runDigests(digestAt);
  });

  test.afterAll(async () => {
    if (process.env.INB_KEEP) return;
    await deleteTestCompany(SLUG);
  });

  test("INB acceptance: every role sees what waits for it on one inbox, and every notice is in the app", async ({ browser }) => {
    await test.step("the member sees the question the desk asked, as their part, and nothing to decide", async () => {
      const page = await signIn(browser, RAISER);
      await page.goto(`/${SLUG}/inbox`);
      await expect(page.getByTestId("inbox-today")).toBeVisible();
      await expect(today(page).decide).toHaveText("0 to decide");
      await expect(today(page).late).toHaveText("0 late");
      await expect(today(page).part).toHaveText("1 to do my part");
      const rows = section(page, "Do my part").getByTestId("inbox-row");
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toContainText(ASKED.title);
      await expect(rows.first()).toHaveAttribute("data-kind", "question");
      await expect(section(page, "Decide")).toHaveCount(0);
      await expect(section(page, "Approve or confirm")).toHaveCount(0);

      // The notice for it is in the app, unread, and Mark as read marks it.
      const asked = (await noticesOf(ids.raiser)).find((n) => n.template === "loop.case.asked");
      expect(asked, "an in-app copy of the question").toBeTruthy();
      const notice = page.getByTestId("inbox-notice").filter({ hasText: asked!.subject });
      await expect(notice).toHaveAttribute("data-read", "false");
      await notice.getByRole("button", { name: "Mark as read" }).click();
      await expect(notice).toHaveAttribute("data-read", "true");
      await expect.poll(async () => (await getDb().outboxMessage.findUniqueOrThrow({ where: { id: asked!.id } })).readAt !== null).toBe(true);
      await page.context().close();
    });

    await test.step("the member's digest lists the same item the inbox shows", async () => {
      const digest = (await noticesOf(ids.raiser)).find((n) => n.template === "digest");
      expect(digest, "an in-app copy of the member's digest").toBeTruthy();
      expect(digest!.text).toContain(ASKED.title);
      expect((digest!.data as { itemIds: string[] }).itemIds).toEqual([`question:${ASKED.id}`]);
      expect(digest!.link).toMatch(/\/inbox$/);
    });

    await test.step("the leader sees the desk cases under Decide, the late one first, and the raise notices", async () => {
      const page = await signIn(browser, LEAD);
      await expect(page).toHaveURL(new RegExp(`/${SLUG}/inbox$`)); // the leader's home
      await expect(today(page).decide).toHaveText("3 to decide");
      await expect(today(page).late).toHaveText("1 late");
      await expect(today(page).part).toHaveText("0 to do my part");
      const rows = section(page, "Decide").getByTestId("inbox-row");
      await expect(rows).toHaveCount(3);
      await expect(rows.first()).toContainText(OLD.title);
      await expect(rows.first()).toHaveAttribute("data-late", "true");
      for (const c of [NEW, ASKED]) await expect(rows.filter({ hasText: c.title })).toHaveCount(1);
      await expect(rows.filter({ hasText: NEW.title })).not.toHaveAttribute("data-late", "true");

      // Opens in place: the existing decision card is there.
      await rows.first().click();
      await expect(page.getByRole("button", { name: "Yes, do it" })).toBeVisible();

      // One raise notice per case that came to the desk (the project's case too).
      const raisedNotices = (await noticesOf(ids.lead)).filter((n) => n.template === "raised");
      expect(raisedNotices).toHaveLength(4);
      for (const c of [OLD, NEW, ASKED, { title: PROJECT.title }]) {
        const n = raisedNotices.find((x) => x.subject.includes(c.title));
        expect(n, `a notice for ${c.title}`).toBeTruthy();
        await expect(page.getByTestId("inbox-notice").filter({ hasText: n!.subject })).toHaveAttribute("data-read", "false");
      }
      await page.context().close();
    });

    await test.step("the second person sees the typed result to confirm, and the notice that asks for it", async () => {
      const page = await signIn(browser, SECOND);
      await page.goto(`/${SLUG}/inbox`);
      const rows = section(page, "Approve or confirm").getByTestId("inbox-row");
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toContainText(PROJECT.title);
      await expect(rows.first()).toHaveAttribute("data-kind", "confirm");
      await expect(rows.first()).toHaveAttribute("href", new RegExp(`/projects/${PROJECT.id}$`));
      await expect(today(page).decide).toHaveText("0 to decide");
      await expect(today(page).late).toHaveText("0 late"); // confirmable for CONFIRM_DAYS working days from today
      expect(CONFIRM_DAYS).toBeGreaterThan(1);

      const ask = (await noticesOf(ids.second)).find((n) => n.template === "loop.project.measured");
      expect(ask, "an in-app copy of the request to confirm").toBeTruthy();
      await expect(page.getByTestId("inbox-notice").filter({ hasText: ask!.subject })).toHaveAttribute("data-read", "false");
      await page.context().close();
    });

    await test.step("the lead who typed the result is not asked to confirm it", async () => {
      const page = await signIn(browser, LEAD);
      await page.goto(`/${SLUG}/inbox`);
      await expect(section(page, "Approve or confirm")).toHaveCount(0);
      await page.context().close();
    });

    await test.step("with the loop group set to mail, no Teams row was written, and every notice has its in-app copy", async () => {
      const db = getDb();
      expect(await db.outboxMessage.count({ where: { companyId, channel: "teams" } }), "Teams rows").toBe(0);
      const loopMail = await db.outboxMessage.findMany({ where: { companyId, template: { startsWith: "loop." }, channel: "mail" } });
      expect(loopMail.length, "the loop notices went by mail").toBeGreaterThan(0);
      for (const m of loopMail) {
        // One in-app copy of each outside notice, to the same person.
        expect(await db.outboxMessage.count({ where: { companyId, channel: "inapp", template: m.template, recipientUserId: m.recipientUserId } }), `${m.template} to ${m.recipientUserId}`).toBeGreaterThan(0);
      }
      const app = await db.outboxMessage.findMany({ where: { companyId, channel: "inapp" } });
      expect(app.every((r) => r.status === "sent" && r.sentAt !== null && r.address === null)).toBe(true);
    });
  });
});
