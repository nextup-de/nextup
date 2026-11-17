// GAT acceptance (plan GAT, GAT-Z1): a review and an approval each hold a desk with a deadline, on a real company (sandbox stage, empty template) with
// the AI, Teams, Jira and Microsoft 365 off (D4). One test, the steps of the plan:
//  1. before any approval setting a raise without a route lands on the first manager role's seat, not on the head of the org chart (D16, D30);
//  2. an admin sets the review role, a council and a role rule for the route on Settings -> Approvals; the spend limits of the desk (5k) and of the
//     plant manager (25k) come from the org;
//  3. a raise lands on the review seat and is forwarded to its desk; the desk records a 12k cost and can only say "Yes, if approved", which names the
//     people who will approve; the budget approver, the council secretary and the role holder find their approval in /inbox at once and answer in any
//     order; the draft opens only with the last yes (decisions A, D and P5 as changed on 16 Nov 2026);
//  4. a pending approver is reminded once, three working days after they were asked, and nothing follows (decision C);
//  5. one no returns the idea to its raiser with the reason, who sends it again, which asks every approver afresh (decision B).
// Notices are outbox rows: a sandbox skips every outside row and sends every in-app row; nothing here reads delivered mail.
//
// Set up in the database where the UI is not the point: the org, and the raises that only need to exist. The clock is moved by running it with a later
// `now`, as tests/db/gat-clock.test.ts does. Own company, made straight in the database and deleted at the end, like nor.spec.ts and res.spec.ts.
import type { Browser, Page } from "@playwright/test";
import { expect, passSecondFactor, publishIdea, test, vis, yourMove } from "../helpers";
import { DEFAULT_CALENDAR } from "../../../src/features/clock";
import { dateOfWorkday, workdayOf } from "../../../src/features/clock/calendar";
import { getDb } from "../../../src/lib/db/client";
import { reduce } from "../../../src/features/cases/reducer";
import { loadSeed } from "../../../src/lib/db/companies";
import { appendEventRow, loadLog } from "../../../src/lib/db/events";
import { loadSeats } from "../../../src/lib/db/holders";
import { addRole, addSeat, addUnit, saveRoute } from "../../../src/lib/db/org-edit";
import { createToken } from "../../../src/lib/db/tokens";
import { dispatchOnce } from "../../../src/server/notify/dispatch";
import { runClockOnce } from "../../../src/server/scheduler/clock";
import { createTestCompany, deleteTestCompany, emailOf } from "./company-fixture";

const STAMP = Date.now().toString(36);
const SLUG = `gat-${STAMP}`;
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL (.env.local)");
// A click that waits for ever would hold the test until its timeout; none of these should wait longer than this.
test.use({ actionTimeout: 20_000 });

const RAISER = "Rosa Raiserwood"; // member
const DESK = "Quentin Qualityfield"; // leader, Quality lead (spend limit 5k): the route's owner, says the yes, leads the draft
const IDEA_MANAGER = "Ivy Ideafield"; // leader, Idea manager: the review role
const DIRECTOR = "Dora Directorfield"; // leader, Director: the head of the org chart, not a manager
const PLANT = "Paula Plantbridge"; // manager, Plant manager (spend limit 25k): the first manager role, the budget approver
const SAFETY = "Sven Safetyfield"; // leader, Safety officer: a role rule for the route
const SECRETARY = "Sam Secretaryfield"; // leader, Council secretary: records the council's outcome
const UNIT = "QA";
const ROLE = { director: "Director", plant: "Plant manager", desk: "Quality lead", review: "Idea manager", safety: "Safety officer", secretary: "Council secretary" } as const;
const ROUTE = { key: "r-gat", type: "Changeover" } as const;

// A raise keeps about 50 characters of its first line as the title.
const ROUTELESS = "Window latches in the packing hall stick";
const FIRST_IDEA = "Changeover on line 3 needs a second crane";
const SECOND_IDEA = "Changeover on line 4 needs a crane for long dies";
const THIRD_IDEA = "Changeover on line 5 needs a crane for wide dies";
const COST_BASIS = "Supplier quote of 3 November";
const CONDITIONS = "The crane is bought after the audit and the quote stays under 12k";
const COUNCIL = "Investment council";
const REFUSAL = "It does not serve a goal of this year and it would break the plant budget";

const codes = new Map<string, string>();
let companyId = "";
let n = 0;
type Person = "raiser" | "desk" | "ideaManager" | "director" | "plant" | "safety" | "secretary";
const id: Record<Person, string> = { raiser: "", desk: "", ideaManager: "", director: "", plant: "", safety: "", secretary: "" };
const seat: Record<"director" | "plant" | "desk" | "review" | "safety" | "secretary", string> = { director: "", plant: "", desk: "", review: "", safety: "", secretary: "" };
const role: Record<keyof typeof ROLE, string> = { director: "", plant: "", desk: "", review: "", safety: "", secretary: "" };

/** Today's working-day number, the way the app counts it on a sandbox company (the default calendar). */
const D = workdayOf(new Date(), DEFAULT_CALENDAR);
/** A moment on working day `day`: what the clock is run with to be "later". */
const on = (day: number) => new Date(`${dateOfWorkday(day, DEFAULT_CALENDAR)}T10:00:00Z`);

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

/** The case raised with this title, once the raise is in the log (the page says "Open the case" a moment before the append is there). */
async function caseIdOf(title: string): Promise<string> {
  let found: string | null = null;
  await expect.poll(async () => {
    const rows = await db().caseEvent.findMany({ where: { companyId, type: "case.raised" }, select: { targetId: true, payload: true } });
    found = rows.find((r) => (r.payload as { title?: string }).title === title)?.targetId ?? null;
    return found !== null;
  }, { message: `the case raised as "${title}"`, timeout: 20_000 }).toBe(true);
  return found as unknown as string;
}

/** The clock and the planner until `rows` finds something: for notices that follow a UI action, or a clock day. */
async function settle<T>(rows: () => Promise<T[]>, message: string, day?: number): Promise<T[]> {
  let found: T[] = [];
  await expect.poll(async () => {
    await runClockOnce(day === undefined ? undefined : on(day));
    await dispatchOnce();
    found = await rows();
    return found.length;
  }, { message, timeout: 45_000, intervals: [500, 1_000, 2_000] }).toBeGreaterThan(0);
  return found;
}

const stampedSeat = async (caseId: string) => ((await eventsOf("case.raised", caseId))[0].payload as { assigneeRoleHolderId?: string | null }).assigneeRoleHolderId ?? null;

/** Append an event the way the app would store it, as `actor`. */
async function append(type: string, actor: string, actorUserId: string, targetId: string, payload: Record<string, unknown>) {
  const r = await appendEventRow(companyId, { id: `${SLUG}-e${n++}`, day: 0, type, actor, targetId, payload } as never, { actorUserId });
  if (!r.ok) throw new Error(r.error);
}

/** An idea of the raiser on the route's desk, open to everyone: the raise the server would have stamped with review off. */
const raiseOnDesk = (caseId: string, title: string) =>
  append("case.raised", RAISER, id.raiser, caseId, { kind: "idea", title, body: "The setters wait for the crane at every changeover.", assignee: DESK, assigneeRoleHolderId: seat.desk, fromDept: UNIT, routeId: ROUTE.key, visibility: "everyone" });

/** The desk says 'Yes, if approved' on the case from /inbox, in the UI. */
async function yesIfApproved(page: Page, title: string) {
  await page.goto(`/${SLUG}/inbox`);
  await page.getByRole("main").getByText(title).first().click();
  await page.getByRole("button", { name: "Yes, do it" }).click();
  const sheet = page.getByRole("dialog", { name: "Yes, do it" });
  await expect(sheet.getByTestId("yes-only-if-approved")).toBeVisible();
  await sheet.getByRole("button", { name: "Yes, if approved" }).click();
}

/** The company's cases and projects as the app reduces them now. */
async function stateNow() {
  const company = await db().company.findUniqueOrThrow({ where: { id: companyId }, select: { slug: true } });
  const seed = (await loadSeed(company.slug))!;
  return reduce({ ...seed, seats: await loadSeats(companyId) }, await loadLog(companyId));
}

/** The row of an approval waiting for the person in /inbox, if there is one. */
const approvalRow = (page: Page, title: string) => page.locator('[data-testid="inbox-row"][data-kind="approval"]').filter({ hasText: title });

/** Opens the case from its row in /inbox; a click right after the page loads may land before it is hydrated, so it is made again until the case is open. */
async function openFromInbox(page: Page, title: string, caseId: string) {
  await expect(async () => {
    await approvalRow(page, title).click();
    // One idea page, /idea?id= (16 Nov 2026): the row links there, not to /cases/<id>.
    await expect(page).toHaveURL(new RegExp(`/idea\\?id=${caseId}$`), { timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
}

test.describe("GAT acceptance: a review and an approval each hold a desk with a deadline", () => {
  test.beforeAll(async () => {
    const made = await createTestCompany({
      slug: SLUG, name: `GAT ${STAMP}`, template: "empty", stage: "sandbox",
      people: [
        { name: RAISER, role: "member", dept: UNIT, email: emailOf(RAISER, SLUG) },
        { name: DESK, role: "leader", dept: UNIT, email: emailOf(DESK, SLUG) },
        { name: IDEA_MANAGER, role: "leader", dept: UNIT, email: emailOf(IDEA_MANAGER, SLUG) },
        { name: DIRECTOR, role: "leader", dept: UNIT, email: emailOf(DIRECTOR, SLUG) },
        { name: PLANT, role: "manager", dept: UNIT, email: emailOf(PLANT, SLUG) },
        { name: SAFETY, role: "leader", dept: UNIT, email: emailOf(SAFETY, SLUG) },
        { name: SECRETARY, role: "leader", dept: UNIT, email: emailOf(SECRETARY, SLUG) },
      ],
    });
    for (const [name, code] of made) codes.set(name, code);
    companyId = (await db().company.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } })).id;
    id.raiser = await userId(RAISER); id.desk = await userId(DESK); id.ideaManager = await userId(IDEA_MANAGER); id.director = await userId(DIRECTOR);
    id.plant = await userId(PLANT); id.safety = await userId(SAFETY); id.secretary = await userId(SECRETARY);

    // The org: the director heads the chart and is no manager; the plant manager (a manager, limit 25k) reports to the director; the desk (limit 5k), the
    // idea manager, the safety officer and the council secretary report to the plant manager. The seats are written in this order: the director's is
    // first by sort, the plant manager's is the first one held by a manager.
    const unit = await addUnit(companyId, "gat-z1", { key: UNIT, name: UNIT, kind: "dept", headcount: 0, parentId: null });
    const add = (title: string, reportsToId: string | null, spendLimitEur: number | null) => addRole(companyId, "gat-z1", { orgUnitId: unit, title, reportsToId, decides: [], spendLimitEur });
    role.director = await add(ROLE.director, null, null);
    role.plant = await add(ROLE.plant, role.director, 25_000);
    role.desk = await add(ROLE.desk, role.plant, 5_000);
    role.review = await add(ROLE.review, role.plant, null);
    role.safety = await add(ROLE.safety, role.plant, null);
    role.secretary = await add(ROLE.secretary, role.plant, null);
    seat.director = await addSeat(companyId, role.director, DIRECTOR, id.director);
    seat.plant = await addSeat(companyId, role.plant, PLANT, id.plant);
    seat.desk = await addSeat(companyId, role.desk, DESK, id.desk);
    seat.review = await addSeat(companyId, role.review, IDEA_MANAGER, id.ideaManager);
    seat.safety = await addSeat(companyId, role.safety, SAFETY, id.safety);
    seat.secretary = await addSeat(companyId, role.secretary, SECRETARY, id.secretary);

    // D4: nothing that calls out is on, and every notice of the loop and the reminders goes by mail (skipped on a sandbox).
    await db().companyConfig.update({ where: { companyId }, data: { notifications: true, noticeChannels: { loop: "mail", reminders: "mail" } } });
    const config = await db().companyConfig.findUniqueOrThrow({ where: { companyId } });
    expect(config.aiRouting, "AI routing").toBe(false);
    expect(config.assistant, "the raise assistant").toBe(false);
    expect(config.n8n, "n8n").toBe(false);
    expect(await db().integration.count({ where: { companyId, on: true } }), "integrations switched on (Teams, Jira)").toBe(0);
    expect(await db().connection.count({ where: { companyId } }), "Microsoft 365 connections").toBe(0);
    expect(await db().company.count({ where: { id: companyId, stage: "sandbox" } })).toBe(1);
    expect(await db().companyRule.count({ where: { companyId, key: { in: ["review", "approval_rules", "councils", "triage_role", "fallback_role"] } } }), "no approval settings yet").toBe(0);

    // The planner starts at the newest event the first time it sees a company: one pass now, events after it.
    await dispatchOnce();
  });

  test.afterAll(async () => {
    if (process.env.GAT_KEEP) return;
    await deleteTestCompany(SLUG);
  });

  test("GAT acceptance: a review and an approval each hold a desk with a deadline", async ({ browser, request }) => {
    test.setTimeout(900_000);

    // ── before any setting: the first manager role's seat ─────────────────────────────────────────────────────────
    await test.step("a raise without a route lands on the first manager role's seat, not on the head of the org chart", async () => {
      // The raise page always names a desk, and a desk is a route's owner; a raise with no route comes from API v1 (or the floor, or Teams). Same server
      // steps (D34): the seat is stamped by the server, whatever the client sends.
      const token = await createToken(companyId, "gat-acceptance", ["cases:write", "cases:read"]);
      const res = await request.post(`/api/v1/${SLUG}/cases`, {
        headers: { authorization: `Bearer ${token}` },
        data: { title: ROUTELESS, body: "The latches freeze shut and nobody can open the windows.", kind: "problem", raisedByUserId: id.raiser, routeHint: null, externalId: null },
      });
      expect(res.status(), await res.text()).toBe(201);
      const caseId = await caseIdOf(ROUTELESS);
      const payload = (await eventsOf("case.raised", caseId))[0].payload as Record<string, unknown>;
      expect(payload.routeId ?? null, "no route fits").toBeNull();
      expect(await stampedSeat(caseId), "the first manager role's seat").toBe(seat.plant);
      expect(await stampedSeat(caseId), "not the head of the org chart").not.toBe(seat.director);
      expect(payload.review, "no review is switched on").toBeUndefined();
      await saveRoute(companyId, "gat-z1", { key: ROUTE.key, type: ROUTE.type, keywords: ["changeover", "crane"], ownerRoleId: role.desk, deputyRoleId: role.review, buddyRoleId: null, wait: "3 d" });
    });

    // ── the settings, in the UI ───────────────────────────────────────────────────────────────────────────────────
    const MEETING = D + 2; // the council's first meeting, a working day ahead
    await test.step("an admin sets the review role, a council and a role rule for the route on Settings -> Approvals", async () => {
      const page = await signIn(browser, PLANT);
      await page.goto(`/${SLUG}/settings/approvals`);
      // The switch is mounted once: the hidden copy a streamed page holds for a moment after a load goes, and one is left.
      await expect(page.getByTestId("settings-approvals-review-on")).toHaveCount(1);
      await vis(page, "settings-approvals-review-on").check();
      await vis(page, "settings-approvals-review-role").selectOption(role.review);
      // The council first: the rules below can name it before it is saved.
      await vis(page, "settings-approvals-add-council").click();
      const council = vis(page, "settings-approvals-council-0");
      await council.locator('[name="council.0.name"]').fill(COUNCIL);
      await council.locator('[name="council.0.secretary"]').selectOption(role.secretary);
      await council.locator('[name="council.0.every"]').fill("10");
      await council.locator('[name="council.0.first"]').fill(dateOfWorkday(MEETING, DEFAULT_CALENDAR));
      await council.locator('[name="council.0.members"]').selectOption([role.plant, role.secretary]);
      await vis(page, "settings-approvals-add-rule").click();
      const first = vis(page, "settings-approvals-rule-0");
      const councilOption = first.locator('[name="rule.0.approver"] option').filter({ hasText: COUNCIL });
      await first.locator('[name="rule.0.approver"]').selectOption((await councilOption.getAttribute("value")) ?? "");
      await first.locator('[name="rule.0.route"]').selectOption(ROUTE.key);
      await vis(page, "settings-approvals-add-rule").click();
      const second = vis(page, "settings-approvals-rule-1");
      await second.locator('[name="rule.1.approver"]').selectOption(`role:${role.safety}`);
      await second.locator('[name="rule.1.route"]').selectOption(ROUTE.key);
      await vis(page, "settings-approvals-save").click();
      await expect(vis(page, "settings-approvals-saved")).toBeVisible();

      const rows = await db().companyRule.findMany({ where: { companyId, key: { in: ["review", "approval_rules", "councils"] } } });
      const value = (key: string) => rows.find((r) => r.key === key)?.value as Record<string, unknown> & unknown[];
      expect(value("review")).toMatchObject({ on: true, roleId: role.review });
      expect(value("councils")).toMatchObject([{ name: COUNCIL, secretaryRoleId: role.secretary, everyDays: 10, firstDay: MEETING, memberRoleIds: expect.arrayContaining([role.plant, role.secretary]) }]);
      expect(value("approval_rules")).toMatchObject([{ kind: "council", routeKey: ROUTE.key, minEur: null }, { kind: "role", roleId: role.safety, routeKey: ROUTE.key, minEur: null }]);
      await page.context().close();
    });

    // ── a raise lands on the review seat and is forwarded ─────────────────────────────────────────────────────────
    let first = "";
    let runId = "";
    await test.step("a raise lands on the review seat; the idea manager forwards it to its desk, and cannot say yes", async () => {
      const raiser = await signIn(browser, RAISER);
      await raiser.goto(`/${SLUG}/raise`);
      await publishIdea(raiser, FIRST_IDEA, ROLE.desk);
      first = await caseIdOf(FIRST_IDEA);
      const raised = (await eventsOf("case.raised", first))[0].payload as Record<string, unknown>;
      expect(raised).toMatchObject({ routeId: ROUTE.key, review: true, reviewDueDay: D + 2 });
      expect(await stampedSeat(first), "the review seat, not the route's owner").toBe(seat.review);
      await raiser.context().close();

      const page = await signIn(browser, IDEA_MANAGER);
      await page.goto(`/${SLUG}/cases/${first}`);
      await expect(vis(page, "review-block")).toBeVisible();
      await expect(page.getByRole("button", { name: "Yes, do it" }), "the review forwards, the desk says yes").toHaveCount(0);
      await vis(page, "review-route").selectOption(ROUTE.key);
      await vis(page, "review-forward").click();
      await expect.poll(async () => (await eventsOf("case.reviewed", first)).length).toBe(1);
      expect((await eventsOf("case.reviewed", first))[0].payload).toMatchObject({ outcome: "forward", routeId: ROUTE.key, toRoleHolderId: seat.desk });
      await page.context().close();
      const told = await settle(() => noticesOf(id.desk, "loop.case.reviewed", "inapp"), "the new desk is told");
      expect(told[0]).toMatchObject({ status: "sent" });
    });

    await test.step("the desk records a 12k cost, sees the flag and can only say 'Yes, if approved', with the approving people named", async () => {
      const page = await signIn(browser, DESK);
      await page.goto(`/${SLUG}/cases/${first}`);
      await vis(page, "case-cost-eur").fill("12000");
      await vis(page, "case-cost-basis").fill(COST_BASIS);
      await vis(page, "case-cost-save").click();
      await expect(vis(page, "case-cost-flag")).toBeVisible();
      await expect.poll(async () => (await eventsOf("case.costed", first)).length).toBe(1);
      expect((await eventsOf("case.costed", first))[0].payload).toMatchObject({ eur: 12_000, basis: COST_BASIS });

      await page.goto(`/${SLUG}/inbox`);
      await page.getByRole("main").getByText(FIRST_IDEA).first().click();
      await page.getByRole("button", { name: "Yes, do it" }).click();
      const sheet = page.getByRole("dialog", { name: "Yes, do it" });
      await expect(sheet.getByTestId("yes-only-if-approved")).toBeVisible();
      const approvers = await sheet.getByTestId("yes-approvers").innerText();
      // The people, each step through its head (decision A): the budget approver (the plant manager covers 12k above the desk's 5k), the council through
      // its secretary, the role rule through the safety officer.
      expect(approvers.indexOf(PLANT)).toBeGreaterThanOrEqual(0);
      expect(approvers.indexOf(SECRETARY)).toBeGreaterThan(approvers.indexOf(PLANT));
      expect(approvers.indexOf(SAFETY)).toBeGreaterThan(approvers.indexOf(SECRETARY));
      await expect(sheet.getByRole("button", { name: "Say yes", exact: true }), "no plain yes").toHaveCount(0);
      await sheet.getByRole("button", { name: "Yes, if approved" }).click();
      await expect.poll(async () => (await eventsOf("case.provisional", first)).length).toBe(1);
      const run = (await eventsOf("case.provisional", first))[0];
      runId = run.id;
      expect(run.payload).toMatchObject({
        approvals: [
          { kind: "budget", roleId: role.plant, coversUpToEur: 25_000, userId: id.plant },
          { kind: "council", councilId: expect.any(String), userId: id.secretary },
          { kind: "role", roleId: role.safety, userId: id.safety },
        ],
        costEur: 12_000, decidingRoleId: role.desk, draft: true, parallel: true, stepDueDay: D + 3,
      });
      expect(await eventsOf("case.decided", first), "no plain yes was written").toHaveLength(0);
      await page.context().close();
    });

    // ── the approvals, at once ────────────────────────────────────────────────────────────────────────────────────
    await test.step("the budget approver, the council secretary and the role holder find their approval in /inbox at once; the draft opens with the last yes", async () => {
      let s = await stateNow();
      expect(s.projects.filter((p) => p.sources.includes(first)), "no draft while the approvers vote").toHaveLength(0);
      expect(s.cases.find((c) => c.id === first)).toMatchObject({ status: "approval", decided: null });
      // The raiser hears of the provisional yes: an outside row (skipped on a sandbox) and the in-app copy.
      const mail = (await settle(() => noticesOf(id.raiser, "loop.case.provisional", "mail"), "the raiser is told of the provisional yes"))[0];
      expect(mail).toMatchObject({ status: "skipped", lastError: "sandbox" });

      const plant = await signIn(browser, PLANT);
      const secretary = await signIn(browser, SECRETARY);
      const safety = await signIn(browser, SAFETY);
      const inboxOf = async (page: Page) => { await page.goto(`/${SLUG}/inbox`); await page.waitForLoadState("networkidle"); };
      for (const page of [plant, secretary, safety]) { await inboxOf(page); await expect(approvalRow(page, FIRST_IDEA), "everyone is asked at once").toHaveCount(1); }

      // The council's secretary first, with conditions and how many were present; then the safety officer. Any order.
      await openFromInbox(secretary, FIRST_IDEA, first);
      await vis(secretary, "approval-present").fill("7");
      await (await yourMove(secretary, "Approve with conditions")).click(); // under More in "Your move" (DESIGN_RULES §9)
      await vis(secretary, "approval-text").fill(CONDITIONS);
      await vis(secretary, "approval-send").click();
      await expect.poll(async () => (await eventsOf("case.approval", first)).length).toBe(1);
      expect((await eventsOf("case.approval", first))[0].payload).toMatchObject({ approvalAnswer: "conditions", step: 1, present: 7, conditions: CONDITIONS });
      await openFromInbox(safety, FIRST_IDEA, first);
      await vis(safety, "approval-approve").click();
      await expect.poll(async () => (await eventsOf("case.approval", first)).length).toBe(2);
      await inboxOf(safety);
      await expect(approvalRow(safety, FIRST_IDEA), "answered").toHaveCount(0);
      s = await stateNow();
      expect(s.projects.filter((p) => p.sources.includes(first)), "two of three: still no draft").toHaveLength(0);
      expect(s.cases.find((c) => c.id === first)?.status).toBe("approval");
      // The idea page's approver line: who approved, who it waits on.
      await openFromInbox(plant, FIRST_IDEA, first);
      await expect(vis(plant, "approver-count")).toHaveText(`2 of 3 approved · waiting on ${PLANT}`);

      // The budget: the plant manager's yes is the last. It decides the case and opens the draft; nobody else writes it.
      await vis(plant, "approval-approve").click();
      await expect.poll(async () => (await eventsOf("case.decided", first)).length).toBe(1);
      const yes = (await eventsOf("case.decided", first))[0];
      expect(yes).toMatchObject({ actor: "system:approvals" });
      for (const page of [plant, secretary, safety]) await page.context().close();

      // One draft, opened on the day of the last yes as the desk's yes asked for it, its start day counted from then.
      s = await stateNow();
      const done = s.cases.find((c) => c.id === first);
      expect(done).toMatchObject({ status: "decided", approvals: null, openingRunId: runId });
      const drafts = s.projects.filter((p) => p.sources.includes(first));
      expect(drafts, "one draft").toHaveLength(1);
      expect(yes.payload).toMatchObject({ answer: "yes", projectId: drafts[0].id });
      expect(drafts[0]).toMatchObject({ draft: true, openedDay: yes.day, leadUserId: id.desk, deciderUserId: id.desk, startDay: yes.day + s.rules.projectStartDays });
    });

    // ── one reminder, three working days after ────────────────────────────────────────────────────────────────────
    const second = `${SLUG}-case-second`;
    await test.step("a pending approver is reminded once, three working days after they were asked, and nothing follows", async () => {
      await raiseOnDesk(second, SECOND_IDEA);
      const page = await signIn(browser, DESK);
      await yesIfApproved(page, SECOND_IDEA);
      await expect.poll(async () => (await eventsOf("case.provisional", second)).length).toBe(1);
      const run = (await eventsOf("case.provisional", second))[0];
      // No cost, so no budget step: the council through its secretary and the safety officer, each due for a reminder three working days on.
      expect(run.payload).toMatchObject({ approvals: [{ kind: "council", userId: id.secretary }, { kind: "role", roleId: role.safety, userId: id.safety }], stepDueDay: D + 3, parallel: true });
      await page.context().close();

      const told = await settle(() => noticesOf(id.secretary, "reminder.approval", "inapp"), "the secretary is reminded", D + 3);
      expect(told[0]).toMatchObject({ status: "sent" });
      const facts = async () => (await eventsOf("clock.due", second)).filter((e) => ["approval", "council"].includes((e.payload as { kind?: string }).kind ?? ""));
      expect((await facts()).map((e) => (e.payload as { kind?: string; check?: number }).kind + ":" + (e.payload as { check?: number }).check).sort(), "one reminder each").toEqual(["approval:1", "approval:1"]);
      expect((await facts()).map((e) => (e.payload as { stepId?: string }).stepId).sort()).toEqual([`${run.id}:0@0`, `${run.id}:1@0`]);
      // Weeks later: no second reminder, no hand-over, no escalation to a manager, no council move.
      await runClockOnce(on(D + 20));
      expect(await facts(), "nothing after the one reminder").toHaveLength(2);
      expect(await noticesOf(id.plant, "reminder.approval"), "the manager above is not told").toHaveLength(0);
    });

    // ── one no returns the idea ───────────────────────────────────────────────────────────────────────────────────
    const third = `${SLUG}-case-third`;
    await test.step("one no returns the idea to its raiser with the reason; the raiser sends it again and every approver is asked afresh", async () => {
      await raiseOnDesk(third, THIRD_IDEA);
      await append("case.costed", DESK, id.desk, third, { eur: 12_000, basis: COST_BASIS });
      const desk = await signIn(browser, DESK);
      await yesIfApproved(desk, THIRD_IDEA);
      await expect.poll(async () => (await eventsOf("case.provisional", third)).length).toBe(1);
      await desk.context().close();

      const plant = await signIn(browser, PLANT);
      await plant.goto(`/${SLUG}/inbox`);
      await plant.waitForLoadState("networkidle");
      await openFromInbox(plant, THIRD_IDEA, third);
      await plant.getByTestId("your-move").getByRole("button", { name: "More", exact: true }).click(); // the other answers sit under More
      await expect(plant.getByTestId("approval-conditions")).toBeVisible();
      await expect(plant.getByTestId("approval-back"), "no send-back: a no goes to the raiser").toHaveCount(0);
      await plant.keyboard.press("Escape");
      await vis(plant, "approval-refuse").click();
      await vis(plant, "approval-text").fill(REFUSAL);
      await vis(plant, "approval-send").click();
      await expect.poll(async () => (await eventsOf("case.approval", third)).length).toBe(1);
      expect((await eventsOf("case.approval", third))[0].payload).toMatchObject({ approvalAnswer: "no", reason: REFUSAL });
      await plant.context().close();
      expect(await eventsOf("case.decided", third), "a no decides nothing").toHaveLength(0);
      let s = await stateNow();
      expect(s.projects.filter((p) => p.sources.includes(third)), "nothing was opened").toHaveLength(0);
      expect(s.cases.find((c) => c.id === third)).toMatchObject({ status: "approval", decided: null, approvals: null });
      expect(s.cases.find((c) => c.id === third)?.approvalRuns.map((r) => r.outcome)).toEqual(["no"]);
      const back = await settle(() => noticesOf(id.raiser, "loop.case.approval", "inapp"), "the raiser is told it came back");
      expect(back.some((r) => (r.subject ?? "").startsWith("Sent back to you"))).toBe(true);

      const raiser = await signIn(browser, RAISER);
      await raiser.goto(`/${SLUG}/cases/${third}`);
      await expect(vis(raiser, "approver-returned")).toContainText(REFUSAL);
      await vis(raiser, "approver-resend").click();
      await expect.poll(async () => (await eventsOf("case.provisional", third)).length).toBe(2);
      const again = (await eventsOf("case.provisional", third))[1];
      expect(again).toMatchObject({ actorUserId: id.raiser });
      expect(again.payload).toMatchObject({ resend: true, parallel: true, stepDueDay: D + 3 });
      await raiser.context().close();
      s = await stateNow();
      const fresh = s.cases.find((c) => c.id === third);
      expect(fresh?.approvals).toMatchObject({ runId: again.id, parallel: true, deciderUserId: id.desk });
      expect(fresh?.approvals?.steps.map((x) => x.state)).toEqual(["pending", "pending", "pending"]);
      const asked = await settle(() => noticesOf(id.plant, "loop.case.provisional", "inapp"), "the approvers are asked again");
      expect(asked.length).toBeGreaterThan(0);
    });

    // ── a sandbox sends no mail ───────────────────────────────────────────────────────────────────────────────────
    await test.step("a sandbox sent nothing outside: every outside row is skipped, every in-app row is sent", async () => {
      await dispatchOnce();
      const rows = await db().outboxMessage.findMany({ where: { companyId } });
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.filter((r) => r.channel === "teams" || r.channel === "webhook"), "Teams and webhook rows").toHaveLength(0);
      for (const row of rows.filter((r) => r.channel !== "inapp")) expect({ status: row.status, lastError: row.lastError }, `${row.template} (${row.channel})`).toEqual({ status: "skipped", lastError: "sandbox" });
      for (const row of rows.filter((r) => r.channel === "inapp")) expect(row.status, `${row.template} (in-app)`).toBe("sent");
      const templates = new Set(rows.map((r) => r.template));
      for (const wanted of ["loop.case.reviewed", "loop.case.provisional", "loop.case.approval", "reminder.approval"]) expect(templates.has(wanted), wanted).toBe(true);
    });
  });
});
