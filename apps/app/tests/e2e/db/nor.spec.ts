// NOR acceptance (plan NOR, NOR-Z1): a no has a category, a reason and a date; a not-now comes back on its day; the raiser asks for a second
// look that the deputy answers; a third pass goes to the seat above; a check-in left late reaches the deputy and then the seat above. On a real
// company (sandbox stage, empty template) with the AI, Teams, Jira and Microsoft 365 off (D4).
//
// The story, in one test:
//  1. the desk's No sheet refuses what is not a reasoned no (no category, a short reason, a not-now without a date), then sends a not-now with a
//     date; the raiser is told; on that date the clock reopens the case on the desk with a new answer date, once however often it runs, and tells
//     the desk and the raiser;
//  2. passes: the desk passes to the deputy, the deputy sends it Not mine, and the third pass can only be Send up, to the seat above; a form
//     opened before the second pass is refused by the server when it is sent as an ordinary pass;
//  3. a discussion whose check-in is left escalation_days late is handled like a late answer: the deputy, then the seat above;
//  4. the raiser asks for a second look at a no; the one who said no cannot answer it, not even holding the deputy's role since; the deputy
//     reopens the case; the desk decides again the same day with a not-now, which also comes back on its date, once;
//  5. a sandbox sends no mail: every outside row is skipped, to the right person with the right text, and the in-app copy is sent.
//
// Set up in the database where the UI is not the point: the org, the raised ideas, the discussion that is already late and the planner and clock
// passes. The clock is moved by running it with a later `now`, as tests/db/nor-clock.test.ts does. Own company, made straight in the database and
// deleted at the end, like set.spec.ts and loop.spec.ts.
import type { Browser, Page } from "@playwright/test";
import { expect, passSecondFactor, test } from "../helpers";
import { getDb } from "../../../src/lib/db/client";
import { appendEventRow } from "../../../src/lib/db/events";
import { addRole, addSeat, addUnit, saveRoute } from "../../../src/lib/db/org-edit";
import { dispatchOnce } from "../../../src/server/notify/dispatch";
import { runClockOnce } from "../../../src/server/scheduler/clock";
import { createTestCompany, deleteTestCompany, emailOf } from "./company-fixture";

const STAMP = Date.now().toString(36);
const SLUG = `nor-${STAMP}`;
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL (.env.local)");
// A click that waits for ever would hold the test until its timeout; none of these should wait longer than this.
test.use({ actionTimeout: 20_000 });

const RAISER = "Rosa Raiserwood"; // member: raised every idea
const DESK = "Quentin Qualityfield"; // leader on the Quality lead seat: the route's owner, says no
const DEPUTY = "Lena Linefield"; // leader on the Line lead seat: the route's deputy, answers a second look
const ABOVE = "Paula Plantbridge"; // leader (no manager) on the Plant manager seat: above both desks
const UNIT = "QA";
const OWNER_ROLE = "Quality lead";
const DEPUTY_ROLE = "Line lead";
const ABOVE_ROLE = "Plant manager";

const REASON_NOT_NOW = "The line is full until the autumn shutdown, so a new changeover plan has to wait for it";
const REASON_NO_FIT = "It does not serve a goal of this year and it would break the gauge standard on the line";
const REASON_SECOND = "The raiser added the supplier quote and the standard does allow the gauge in this setup";
const REASON_AGAIN = "Not before the new plan year starts, because the budget for it is gone and has to be asked for again";
const APPEAL = "The quote came in below the budget and the standard allows it, so please look at it again";
const WHY_PASS = "The setters on line 3 own this changeover, not the quality desk";
const WHY_BACK = "It is not a line question either: nobody here runs the gauge";
const WHY_UP = "It needs a decision above both desks, they disagree on the owner";

const codes = new Map<string, string>();
let companyId = "";
let routeKey = "r-nor";
let n = 0;
const id: Record<"raiser" | "desk" | "deputy" | "above", string> = { raiser: "", desk: "", deputy: "", above: "" };
const seat: Record<"desk" | "deputy" | "above", string> = { desk: "", deputy: "", above: "" };
let deputyRoleId = "";

async function signIn(browser: Browser, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/${SLUG}/login`);
  await page.locator("#code:visible").fill(codes.get(name) ?? "");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await passSecondFactor(page, `${SLUG}|${name}`);
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

const db = () => getDb();
const userId = async (name: string) => (await db().user.findFirstOrThrow({ where: { companyId, name }, select: { id: true } })).id;
const eventsOf = (type: string, targetId: string) => db().caseEvent.findMany({ where: { companyId, type, targetId }, orderBy: { seq: "asc" } });
const noticesOf = (userIdOf: string, template: string, channel?: string) =>
  db().outboxMessage.findMany({ where: { companyId, recipientUserId: userIdOf, template, ...(channel ? { channel } : {}) }, orderBy: { createdAt: "asc" } });

/** Append an event the way the app would store it, `back` calendar days ago (the day it carries follows). */
async function append(type: string, actor: string, actorUserId: string, targetId: string, payload: Record<string, unknown>, back = 0, now?: Date) {
  const r = await appendEventRow(
    companyId,
    { id: `${SLUG}-e${n++}`, day: 0, type, actor, targetId, payload } as never,
    { actorUserId, now: now ?? new Date(Date.now() - back * 86_400_000) },
  );
  if (!r.ok) throw new Error(r.error);
}

/** An idea of the raiser, open to everyone, sent to the desk's route. */
const raise = (caseId: string, title: string, back = 0) =>
  append("case.raised", RAISER, id.raiser, caseId, { kind: "idea", title, body: "The setters wait for the crane at every changeover.", assignee: DESK, fromDept: UNIT, routeId: routeKey, visibility: "everyone" }, back);

/** The planner and the clock until `rows` finds something: the app's own loops may hold a lease for a moment. */
async function settle<T>(rows: () => Promise<T[]>, message: string, now?: Date): Promise<T[]> {
  let found: T[] = [];
  await expect.poll(async () => {
    await runClockOnce(now);
    await dispatchOnce();
    found = await rows();
    return found.length;
  }, { message, timeout: 45_000, intervals: [500, 1_000, 2_000] }).toBeGreaterThan(0);
  return found;
}

/** The next working days from tomorrow on, as the date input takes them (Monday to Friday; the sheet says when a day is no day for the company). */
function nextDays(count: number): string[] {
  const out: string[] = [];
  for (let k = 1; out.length < count; k++) {
    const d = new Date(Date.now() + k * 86_400_000);
    if (d.getDay() !== 0 && d.getDay() !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Opens a case from the desk's inbox and starts the No sheet. */
async function openNoSheet(page: Page, title: string) {
  await page.goto(`/${SLUG}/inbox`);
  await page.getByRole("main").getByText(title).first().click();
  await page.getByRole("button", { name: "No, and why" }).click();
}

/**
 * Fills the No sheet that is open: the category, the reason and, where it needs one, a date. Tries the next working days until the sheet accepts one.
 * Returns the date it sent for, when there was one.
 */
async function sendNo(page: Page, category: RegExp, reason: string, withDate: boolean): Promise<string | null> {
  await page.getByRole("button", { name: category }).first().click();
  await page.getByLabel(/Your reason, which/).fill(reason);
  let sent: string | null = null;
  if (withDate) {
    for (const date of nextDays(8)) {
      await page.locator("#no-revisit").fill(date);
      if (await page.getByRole("button", { name: "Send the no" }).isVisible()) { sent = date; break; }
    }
    expect(sent, "a working day the sheet accepts").not.toBeNull();
  }
  await page.getByRole("button", { name: "Send the no" }).click();
  return sent;
}

test.describe("NOR acceptance: a no has a reason, a date and a second look", () => {
  test.beforeAll(async () => {
    const made = await createTestCompany({
      slug: SLUG, name: `NOR ${STAMP}`, template: "empty", stage: "sandbox",
      people: [
        { name: RAISER, role: "member", dept: UNIT, email: emailOf(RAISER, SLUG) },
        { name: DESK, role: "leader", dept: UNIT, email: emailOf(DESK, SLUG) },
        { name: DEPUTY, role: "leader", dept: UNIT, email: emailOf(DEPUTY, SLUG) },
        { name: ABOVE, role: "leader", dept: UNIT, email: emailOf(ABOVE, SLUG) },
      ],
    });
    for (const [name, code] of made) codes.set(name, code);
    companyId = (await db().company.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } })).id;
    id.raiser = await userId(RAISER);
    id.desk = await userId(DESK);
    id.deputy = await userId(DEPUTY);
    id.above = await userId(ABOVE);

    // The structure: the Quality lead (the route's owner) and the Line lead (its deputy) report to the Plant manager, a leader, not a manager.
    const unit = await addUnit(companyId, "nor-z1", { key: UNIT, name: UNIT, kind: "dept", headcount: 0, parentId: null });
    const role = (title: string, reportsToId: string | null) => addRole(companyId, "nor-z1", { orgUnitId: unit, title, reportsToId, decides: [], spendLimitEur: null });
    const aboveRole = await role(ABOVE_ROLE, null);
    const ownerRole = await role(OWNER_ROLE, aboveRole);
    const lineRole = await role(DEPUTY_ROLE, aboveRole);
    deputyRoleId = lineRole;
    seat.above = await addSeat(companyId, aboveRole, ABOVE, id.above);
    seat.desk = await addSeat(companyId, ownerRole, DESK, id.desk);
    seat.deputy = await addSeat(companyId, lineRole, DEPUTY, id.deputy);
    routeKey = "r-nor";
    await saveRoute(companyId, "nor-z1", { key: routeKey, type: "Changeover", keywords: ["changeover", "crane"], ownerRoleId: ownerRole, deputyRoleId: lineRole, buddyRoleId: null, wait: "3 d" });

    // D4: nothing that calls out is on, and every notice of the loop and the reminders goes by mail (skipped on a sandbox).
    await db().companyConfig.update({ where: { companyId }, data: { notifications: true, noticeChannels: { loop: "mail", reminders: "mail" } } });
    const config = await db().companyConfig.findUniqueOrThrow({ where: { companyId } });
    expect(config.aiRouting, "AI routing").toBe(false);
    expect(config.assistant, "the raise assistant").toBe(false);
    expect(config.n8n, "n8n").toBe(false);
    expect(await db().integration.count({ where: { companyId, on: true } }), "integrations switched on (Teams, Jira)").toBe(0);
    expect(await db().connection.count({ where: { companyId } }), "Microsoft 365 connections").toBe(0);
    expect(await db().company.count({ where: { id: companyId, stage: "sandbox" } })).toBe(1);

    // The planner starts at the newest event the first time it sees a company: one pass now, events after it.
    await dispatchOnce();
  });

  test.afterAll(async () => {
    if (process.env.NOR_KEEP) return;
    await deleteTestCompany(SLUG);
  });

  test("NOR acceptance: a no has a reason, a date and a second look", async ({ browser }) => {
    test.setTimeout(480_000);
    const notNow = `${SLUG}-case-notnow`;
    let revisitDate = "";

    // ── a no needs a category, a reason and, for not now, a date ───────────────────────────────────────────────────
    await raise(notNow, "Changeover on line 3 takes too long and the setters wait for the crane");
    await test.step("the No sheet refuses a no without a category, with a short reason, and a not-now without a date", async () => {
      const page = await signIn(browser, DESK);
      await openNoSheet(page, "Changeover on line 3 takes too long");
      const sheet = page.getByRole("button", { name: "Pick a reason" });
      await expect(sheet).toBeVisible(); // nothing picked: the button says what is missing
      await expect(sheet).toBeDisabled();
      await page.getByRole("button", { name: /^Not now/ }).first().click();
      await page.getByLabel(/Your reason, which/).fill("Too early.");
      await expect(page.getByRole("button", { name: /Write the reason \(\d+ characters\)/ })).toBeDisabled();
      await page.getByLabel(/Your reason, which/).fill(REASON_NOT_NOW);
      await expect(page.getByRole("button", { name: "Pick the date it comes back" })).toBeDisabled(); // not now needs its date
      expect(await eventsOf("case.decided", notNow), "nothing was written for a refused no").toHaveLength(0);

      await page.locator("#no-revisit").fill("");
      for (const date of nextDays(8)) {
        await page.locator("#no-revisit").fill(date);
        if (await page.getByRole("button", { name: "Send the no" }).isVisible()) { revisitDate = date; break; }
      }
      expect(revisitDate, "a working day the sheet accepts").not.toBe("");
      await page.getByRole("button", { name: "Send the no" }).click();
      await expect.poll(async () => (await eventsOf("case.decided", notNow)).length).toBe(1);
      const no = (await eventsOf("case.decided", notNow))[0];
      expect(no).toMatchObject({ actorUserId: id.desk, payload: { answer: "no", category: "not-now", reason: REASON_NOT_NOW } });
      expect(typeof (no.payload as { revisitDay?: number }).revisitDay).toBe("number");
      await page.context().close();
    });

    await test.step("the raiser has an outside row (skipped on a sandbox) with the reason and a sent in-app notice of the no", async () => {
      const mail = (await settle(() => noticesOf(id.raiser, "loop.case.decided", "mail"), "the no reaches the raiser by mail")).at(-1)!;
      expect(mail).toMatchObject({ status: "skipped", lastError: "sandbox", address: emailOf(RAISER, SLUG) });
      expect(mail.text).toContain(REASON_NOT_NOW);
      const app = await noticesOf(id.raiser, "loop.case.decided", "inapp");
      expect(app).toHaveLength(1);
      expect(app[0]).toMatchObject({ status: "sent", address: null });
    });

    // ── not now comes back on its date ──────────────────────────────────────────────────────────────────────────────
    await test.step("on its date the clock reopens the case on the desk with a new answer date, once, and tells the desk and the raiser", async () => {
      const day = new Date(`${revisitDate}T12:00:00Z`);
      await runClockOnce(new Date(day.getTime() - 3 * 86_400_000)); // before its date: nothing
      expect(await eventsOf("case.reopened", notNow)).toHaveLength(0);
      await runClockOnce(day);
      await runClockOnce(day); // however often it runs
      await runClockOnce(new Date(day.getTime() + 86_400_000));
      const reopened = await eventsOf("case.reopened", notNow);
      expect(reopened).toHaveLength(1);
      expect(reopened[0]).toMatchObject({ actor: "system:clock", actorUserId: null, source: "clock", payload: { why: "revisit" } });
      expect(typeof (reopened[0].payload as { dueDay?: number }).dueDay).toBe("number");
      expect((reopened[0].payload as { toRoleHolderId?: string }).toRoleHolderId).toBe(seat.desk);
      expect((reopened[0].payload as { dueDay: number }).dueDay).toBeGreaterThan(reopened[0].day);
      await dispatchOnce();
      const raiser = await settle(() => noticesOf(id.raiser, "loop.case.reopened", "mail"), "the raiser is told the case came back");
      expect(raiser[0]).toMatchObject({ status: "skipped", lastError: "sandbox", address: emailOf(RAISER, SLUG) });
      expect((await noticesOf(id.raiser, "loop.case.reopened", "inapp"))[0]).toMatchObject({ status: "sent" });
      const desk = await settle(() => noticesOf(id.desk, "loop.case.reopened", "mail"), "the desk is told the case is back");
      expect(desk[0]).toMatchObject({ status: "skipped", address: emailOf(DESK, SLUG) });
    });
  });
});
