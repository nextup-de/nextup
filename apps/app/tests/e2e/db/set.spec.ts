// SET acceptance (plan SET, SET-Z1): a yes becomes a project draft that the lead and the team accept and that starts on
// time, on a real company (sandbox stage, empty template) with the AI, Teams, Jira and Microsoft 365 off (D3).
//
// The story, in one test:
//  1. the desk says yes in the UI and names another lead; the lead takes the draft through /inbox, picks Quick win, invites
//     a member who accepts through /inbox, sets the goal and the baseline and starts it before its start day;
//  2. a raiser outside the draft reads its permitted summary and comments; an ordinary reader of the case sees only the
//     "being set up" line and cannot open the draft page; the server payload carries no more than that (SET-F1);
//  3. after the kickoff the lead names a sponsor on the Team tab, who accepts through /inbox;
//  4. three drafts left past their start day reach the seat above (not a manager): it keeps one with a new date, hands one
//     on and stops one with a reason the raiser receives;
//  5. a sandbox sends no mail: every outside row is written as skipped, to the right person with the right text, and the
//     in-app copy is sent.
//
// Set up in the database where the UI is not the point: the org, the raised ideas, the drafts that are already past their
// start day (their events carry a day 21 calendar days back, so the start day is behind us and the clock's fact is
// due now: a draft is "late" against the company's real day, which a sandbox clock cannot move) and the planner and
// clock passes. Own company, made straight in the database and deleted at the end, like loop.spec.ts and inb.spec.ts.
import type { Browser, Page } from "@playwright/test";
import { expect, passSecondFactor, test } from "../helpers";
import { getDb } from "../../../src/lib/db/client";
import { appendEventRow } from "../../../src/lib/db/events";
import { addRole, addSeat, addUnit, saveRoute } from "../../../src/lib/db/org-edit";
import { dispatchOnce } from "../../../src/server/notify/dispatch";
import { runClockOnce } from "../../../src/server/scheduler/clock";
import { createTestCompany, deleteTestCompany, emailOf } from "./company-fixture";

const STAMP = Date.now().toString(36);
const SLUG = `set-${STAMP}`;
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL (.env.local)");

const RAISER = "Rosa Raiserwood"; // member: raised every idea
const DESK = "Quentin Qualityfield"; // leader on the Quality lead seat: says yes
const LEAD = "Lena Linefield"; // leader on the Line lead seat: the lead the yes names
const ABOVE = "Paula Plantbridge"; // leader (no manager) on the Plant manager seat: above the desk
const MEMBER = "Max Memberfield"; // member on an Operator seat: invited as a member
const SPONSOR = "Sven Sponsorfield"; // leader on an Operator seat: named sponsor after the start
const OUTSIDER = "Olga Outsider"; // member with no seat and no part in the draft
const UNIT = "QA";
const OWNER_ROLE = "Quality lead";
const LINE_ROLE = "Line lead";
const ABOVE_ROLE = "Plant manager";
const TEAM_ROLE = "Operator";

const IDEA = "Changeover on line 3 takes too long and the setters wait for the crane";
const NOTE = "Thanks, Lena will lead it";
const GOAL = "Changeover on line 3 under 30 minutes";
const DONE_WHEN = "Three shifts in a row under 30 minutes";
const BASELINE = { metric: "Changeover time", unit: "min", value: "45" };
// What only the people on the draft may read (D13, D20): none of it may reach anyone else's browser.
const SECRET_STEP = "Zorgblat crane booking for Tuesday";
const SECRET_COMMENT = "Zorgblat the foreman objects to the new slot plan";
const RAISER_COMMENT = "Please also look at the crane queue";
const KEEP_WHY = "The rig is booked until next week";
const STOP_WHY = "The line closes in March, so this would never pay back";

const codes = new Map<string, string>();
let companyId = "";
let routeKey = "r-set";
let n = 0;
const id: Record<"raiser" | "desk" | "lead" | "above" | "member" | "sponsor" | "outsider", string> = {
  raiser: "", desk: "", lead: "", above: "", member: "", sponsor: "", outsider: "",
};

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
async function append(type: string, actor: string, actorUserId: string, targetId: string, payload: Record<string, unknown>, back = 0) {
  const r = await appendEventRow(
    companyId,
    { id: `${SLUG}-e${n++}`, day: 0, type, actor, targetId, payload } as never,
    { actorUserId, now: new Date(Date.now() - back * 86_400_000) },
  );
  if (!r.ok) throw new Error(r.error);
}

/** An idea of the raiser, open to everyone, sent to the desk's route. */
const raise = (caseId: string, title: string, back = 0) =>
  append("case.raised", RAISER, id.raiser, caseId, { kind: "idea", title, body: "The setters wait for the crane at every changeover.", assignee: DESK, fromDept: UNIT, routeId: routeKey, visibility: "everyone" }, back);

/** A draft the desk opened and leads itself, 21 calendar days ago: past its start day, so the clock gives it to the seat above. */
async function expiredDraft(key: string, title: string) {
  const caseId = `${SLUG}-case-${key}`;
  const projectId = `${SLUG}-p-${key}`;
  await raise(caseId, title, 21);
  await append("case.decided", DESK, id.desk, caseId, { answer: "yes", projectId, lead: DESK, leadUserId: id.desk, title, draft: true }, 21);
  return { caseId, projectId, title };
}

/** The planner and the clock until `rows` finds something: the app's own loops may hold a lease for a moment. */
async function settle<T>(rows: () => Promise<T[]>, message: string): Promise<T[]> {
  let found: T[] = [];
  await expect.poll(async () => {
    await runClockOnce();
    await dispatchOnce();
    found = await rows();
    return found.length;
  }, { message, timeout: 45_000, intervals: [500, 1_000, 2_000] }).toBeGreaterThan(0);
  return found;
}

/** Everything the server sent this browser for one page: the document and every fetch it made. */
async function payloadOf(page: Page, path: string): Promise<string> {
  const bodies: Promise<string>[] = [];
  const onResponse = (r: { request(): { resourceType(): string }; text(): Promise<string> }) => {
    if (["document", "fetch", "xhr"].includes(r.request().resourceType())) bodies.push(r.text().catch(() => ""));
  };
  page.on("response", onResponse);
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  page.off("response", onResponse);
  return (await Promise.all(bodies)).join("\n");
}

test.describe("SET acceptance: the yes opens a project draft", () => {
  test.beforeAll(async () => {
    const made = await createTestCompany({
      slug: SLUG, name: `SET ${STAMP}`, template: "empty", stage: "sandbox",
      people: [
        { name: RAISER, role: "member", dept: UNIT, email: emailOf(RAISER, SLUG) },
        { name: DESK, role: "leader", dept: UNIT, email: emailOf(DESK, SLUG) },
        { name: LEAD, role: "leader", dept: UNIT, email: emailOf(LEAD, SLUG) },
        { name: ABOVE, role: "leader", dept: UNIT, email: emailOf(ABOVE, SLUG) },
        { name: MEMBER, role: "member", dept: UNIT, email: emailOf(MEMBER, SLUG) },
        { name: SPONSOR, role: "leader", dept: UNIT, email: emailOf(SPONSOR, SLUG) },
        { name: OUTSIDER, role: "member", dept: UNIT, email: emailOf(OUTSIDER, SLUG) },
      ],
    });
    for (const [name, code] of made) codes.set(name, code);
    companyId = (await db().company.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } })).id;
    id.raiser = await userId(RAISER);
    id.desk = await userId(DESK);
    id.lead = await userId(LEAD);
    id.above = await userId(ABOVE);
    id.member = await userId(MEMBER);
    id.sponsor = await userId(SPONSOR);
    id.outsider = await userId(OUTSIDER);

    // The structure: the Quality lead desk and the Line lead report to the Plant manager (the seat above), who is a leader,
    // not a manager. The people who may be invited need a seat. The route's deputy is the Line lead, so the Plant manager
    // has no right on a draft except the one the clock gives it.
    const unit = await addUnit(companyId, "set-z1", { key: UNIT, name: UNIT, kind: "dept", headcount: 0, parentId: null });
    const role = (title: string, reportsToId: string | null) => addRole(companyId, "set-z1", { orgUnitId: unit, title, reportsToId, decides: [], spendLimitEur: null });
    const aboveRole = await role(ABOVE_ROLE, null);
    const ownerRole = await role(OWNER_ROLE, aboveRole);
    const lineRole = await role(LINE_ROLE, aboveRole);
    const teamRole = await role(TEAM_ROLE, lineRole);
    await addSeat(companyId, aboveRole, ABOVE, id.above);
    await addSeat(companyId, ownerRole, DESK, id.desk);
    await addSeat(companyId, lineRole, LEAD, id.lead);
    await addSeat(companyId, teamRole, MEMBER, id.member);
    await addSeat(companyId, teamRole, SPONSOR, id.sponsor);
    routeKey = "r-set";
    await saveRoute(companyId, "set-z1", { key: routeKey, type: "Changeover", keywords: ["changeover", "crane"], ownerRoleId: ownerRole, deputyRoleId: lineRole, buddyRoleId: null, wait: "3 d" });

    // D3: nothing that calls out is on, and every notice of the loop and the reminders goes by mail (skipped on a sandbox).
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
    if (process.env.SET_KEEP) return;
    await deleteTestCompany(SLUG);
  });

  test("SET acceptance: a yes becomes a draft that the lead and team accept and that starts on time", async ({ browser }) => {
    test.setTimeout(420_000);
    const caseA = `${SLUG}-case-a`;
    let projectA = "";

    // ── the yes ──────────────────────────────────────────────────────────────────────────────────────────────────────
    await raise(caseA, IDEA);

    await test.step("the desk says yes, names Lena as the lead and leaves a line to the raiser; a draft opens", async () => {
      const page = await signIn(browser, DESK);
      await expect(page).toHaveURL(new RegExp(`/${SLUG}/inbox$`));
      await page.getByRole("main").getByText(IDEA).first().click();
      await page.getByRole("button", { name: "Yes, do it" }).click();
      const sheet = page.getByRole("dialog", { name: "Yes, do it" });
      await sheet.locator("#accept-lead").selectOption(id.lead);
      await sheet.locator("#accept-note").fill(NOTE);
      await sheet.getByRole("button", { name: "Say yes and open the draft" }).click();

      await expect.poll(async () => {
        const row = (await eventsOf("case.decided", caseA))[0];
        projectA = (row?.payload as { projectId?: string } | undefined)?.projectId ?? "";
        return projectA;
      }, { message: "the yes carries the id of the draft it opened" }).not.toBe("");
      const yes = (await eventsOf("case.decided", caseA))[0].payload as Record<string, unknown>;
      expect(yes).toMatchObject({ answer: "yes", draft: true, leadUserId: id.lead, raiserNote: NOTE });
      await page.context().close();
    });

    await test.step("the raiser has an outside row (skipped on a sandbox) and a sent in-app notice of the yes, with the line; the lead is asked", async () => {
      const mail = (await settle(() => noticesOf(id.raiser, "loop.case.decided", "mail"), "the yes reaches the raiser by mail")).at(-1)!;
      expect(mail).toMatchObject({ status: "skipped", lastError: "sandbox", address: emailOf(RAISER, SLUG) });
      expect(mail.text).toContain(NOTE);
      expect(mail.text).toContain(LEAD);
      const app = await noticesOf(id.raiser, "loop.case.decided", "inapp");
      expect(app).toHaveLength(1);
      expect(app[0]).toMatchObject({ status: "sent", address: null });
      expect(app[0].sentAt).not.toBeNull();
      // Lena is not the decider: the same yes asks her to take it.
      const ask = await settle(() => noticesOf(id.lead, "loop.case.decided", "inapp"), "the lead is asked");
      expect(ask[0].subject).toContain("Lead a project");
    });

    // ── the lead takes it ────────────────────────────────────────────────────────────────────────────────────────────
    await test.step("the lead finds 'Lead a project' in /inbox and takes it; the start day appears", async () => {
      const page = await signIn(browser, LEAD);
      await page.goto(`/${SLUG}/inbox`);
      const row = page.locator('[data-testid="inbox-row"][data-kind="lead"]').filter({ hasText: IDEA });
      await expect(row).toHaveCount(1);
      await row.click();
      await expect(page).toHaveURL(new RegExp(`/projects/${projectA}$`));
      await expect(page.getByTestId("draft-top-line")).toContainText("once"); // no start day before the lead takes it
      await page.getByRole("button", { name: "Take it" }).click();
      await expect(page.getByTestId("draft-top-line")).toContainText(/start expected \S/);
      await expect(page.getByTestId("draft-top-line")).not.toContainText("once");
      await expect.poll(async () => (await eventsOf("project.lead.answered", projectA)).length).toBe(1);
      expect((await eventsOf("project.lead.answered", projectA))[0]).toMatchObject({ actorUserId: id.lead, payload: { take: true } });

      await test.step("picks the Quick win template", async () => {
        const quick = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Quick win" }) });
        await quick.getByRole("button", { name: "Use this template" }).click();
        await expect(quick.getByText("In use")).toBeVisible();
        await expect.poll(async () => (await eventsOf("project.template", projectA)).length).toBe(1);
        expect((await eventsOf("project.template", projectA))[0].payload).toMatchObject({ key: "quick-win" });
      });

      await test.step("invites Max as a member", async () => {
        const invite = page.getByRole("form", { name: "Invite" });
        await invite.getByLabel("Person").selectOption(id.member);
        await invite.getByLabel("Role").selectOption("member");
        await invite.getByRole("button", { name: "Invite" }).click();
        await expect.poll(async () => (await eventsOf("project.invited", projectA)).length).toBe(1);
        expect((await eventsOf("project.invited", projectA))[0].payload).toMatchObject({ userId: id.member, role: "member" });
        await expect(page.getByText("Waiting for an answer")).toBeVisible();
      });
      await page.context().close();
    });

    await test.step("Max accepts through /inbox, and the draft shows him as accepted", async () => {
      const page = await signIn(browser, MEMBER);
      await page.goto(`/${SLUG}/inbox`);
      const row = page.locator('[data-testid="inbox-row"][data-kind="invitation"]').filter({ hasText: IDEA });
      await expect(row).toHaveCount(1);
      await row.click();
      await expect(page).toHaveURL(new RegExp(`/projects/${projectA}#invite-`));
      await expect(page.getByTestId("project-draft")).toBeVisible(); // an invited person reads the draft
      await page.getByRole("group", { name: /You are invited as Member/ }).getByRole("button", { name: "Accept", exact: true }).click();
      await expect.poll(async () => (await eventsOf("project.invite.answered", projectA)).length).toBe(1);
      expect((await eventsOf("project.invite.answered", projectA))[0]).toMatchObject({ actorUserId: id.member, payload: { userId: id.member, take: true } });
      await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
      await page.context().close();
    });

    // ── goal; then what each kind of reader gets, before the start ──────────────────────────────────────────────────
    await test.step("the lead sets the goal", async () => {
      const page = await signIn(browser, LEAD);
      await page.goto(`/${SLUG}/projects/${projectA}`);
      await page.getByRole("textbox", { name: "Goal", exact: true }).fill(GOAL);
      await page.getByRole("textbox", { name: "Done when", exact: true }).fill(DONE_WHEN);
      await page.getByRole("button", { name: "Save the goal" }).click();
      await expect.poll(async () => (await eventsOf("project.goal", projectA)).length).toBe(1);
      await page.context().close();
      // What only the people on the draft may read: a step and a comment of the lead.
      await append("project.step.added", LEAD, id.lead, projectA, { stepId: "s_secret", text: SECRET_STEP });
      await append("project.commented", LEAD, id.lead, projectA, { text: SECRET_COMMENT });
    });

    await test.step("a member who may read the case but is not on the draft sees only 'being set up', and no draft page or payload", async () => {
      const page = await signIn(browser, OUTSIDER);
      const body = await payloadOf(page, `/${SLUG}/cases/${caseA}`);
      await expect(page.getByTestId("draft-being-set-up")).toContainText("Accepted · being set up by");
      await expect(page.getByTestId("draft-being-set-up")).toContainText("start expected");
      await expect(page.getByTestId("draft-raiser-panel")).toHaveCount(0);
      await expect(page.locator(`a[href*="/projects/${projectA}"]`)).toHaveCount(0); // no link to the draft
      expect(body, "the server sent the case").toContain(IDEA);
      for (const secret of [SECRET_STEP, SECRET_COMMENT, GOAL, DONE_WHEN, NOTE, "project.invited", "project.invite.answered", "project.template"]) { // NOTE: the desk's line to the raiser (D23)
        expect(body, `the payload for a reader outside the draft must not hold: ${secret}`).not.toContain(secret);
      }

      await page.goto(`/${SLUG}/projects/${projectA}`);
      await expect(page.getByRole("heading", { name: "No such project" })).toBeVisible();
      await expect(page.getByTestId("project-draft")).toHaveCount(0);
      const projects = await payloadOf(page, `/${SLUG}/projects/${projectA}`);
      for (const secret of [SECRET_STEP, SECRET_COMMENT, GOAL, DONE_WHEN]) expect(projects, `the draft page's payload must not hold: ${secret}`).not.toContain(secret);
      await page.context().close();
    });

    await test.step("the raiser, not on the draft, reads the goal and comments; she gets no steps, comments or invitations", async () => {
      const page = await signIn(browser, RAISER);
      const body = await payloadOf(page, `/${SLUG}/cases/${caseA}`);
      const panel = page.getByTestId("draft-raiser-panel");
      await expect(panel).toContainText(GOAL);
      await expect(panel).toContainText(DONE_WHEN);
      expect(body, "the permitted summary is in the payload").toContain(GOAL);
      for (const secret of [SECRET_STEP, SECRET_COMMENT, "project.invited", "project.invite.answered", "project.template"]) {
        expect(body, `the raiser's payload must not hold: ${secret}`).not.toContain(secret);
      }

      await panel.getByLabel("Add a comment to the draft").fill(RAISER_COMMENT);
      await panel.getByRole("button", { name: "Send" }).click();
      await expect.poll(async () => (await eventsOf("project.commented", projectA)).filter((e) => e.actorUserId === id.raiser).length).toBe(1);
      expect((await eventsOf("project.commented", projectA)).find((e) => e.actorUserId === id.raiser)!.payload).toMatchObject({ text: RAISER_COMMENT });
      await page.context().close();
    });

    // ── baseline and start, before the start day ─────────────────────────────────────────────────────────────────────
    await test.step("the lead sets the baseline and starts the project before its start day", async () => {
      const page = await signIn(browser, LEAD);
      await page.goto(`/${SLUG}/projects/${projectA}`);
      await page.getByLabel("What is measured").filter({ visible: true }).fill(BASELINE.metric);
      await page.getByLabel(/Today.s number/).filter({ visible: true }).fill(BASELINE.value);
      await page.getByLabel("Unit").filter({ visible: true }).fill(BASELINE.unit);
      await page.getByLabel("Lower is better").filter({ visible: true }).check();
      await page.getByLabel("Where the number comes from").filter({ visible: true }).fill("Stopwatch on three changeovers");
      await page.getByRole("button", { name: "Save the baseline" }).click();
      await expect.poll(async () => (await eventsOf("project.baseline", projectA)).length).toBe(1);

      const start = page.getByRole("button", { name: "Start the project" });
      await expect(start).toBeEnabled();
      await start.click();
      await expect.poll(async () => (await eventsOf("project.started", projectA)).length).toBe(1);
      await expect(page.getByTestId("project-draft")).toHaveCount(0); // the draft page is gone; the project has its board

      // Started on the day of the take, long before its start day (10 working days after it).
      const taken = (await eventsOf("project.lead.answered", projectA))[0];
      const started = (await eventsOf("project.started", projectA))[0];
      expect(started.actorUserId).toBe(id.lead);
      expect(started.day).toBeLessThan(taken.day + 10);
      await page.context().close();
    });

    await test.step("the raiser has an outside row (skipped) and a sent in-app notice of the kickoff; the team hears the goal", async () => {
      const mail = (await settle(() => noticesOf(id.raiser, "loop.project.started", "mail"), "the kickoff reaches the raiser by mail"))[0];
      expect(mail).toMatchObject({ status: "skipped", lastError: "sandbox", address: emailOf(RAISER, SLUG) });
      const app = await noticesOf(id.raiser, "loop.project.started", "inapp");
      expect(app).toHaveLength(1);
      expect(app[0]).toMatchObject({ status: "sent", address: null });
      const team = (await settle(() => noticesOf(id.member, "loop.project.started", "mail"), "the kickoff reaches the team by mail"))[0];
      expect(team).toMatchObject({ status: "skipped", address: emailOf(MEMBER, SLUG) });
      expect(team.text).toContain(GOAL);
      expect(team.text).toContain(DONE_WHEN);
    });

    // ── a sponsor, after the start ──────────────────────────────────────────────────────────────────────────────────
    await test.step("after the kickoff the lead invites Sven as sponsor on the Team tab; he accepts through /inbox", async () => {
      const lead = await signIn(browser, LEAD);
      await lead.goto(`/${SLUG}/projects/${projectA}?tab=team`);
      const invite = lead.getByRole("form", { name: "Invite" });
      await invite.getByLabel("Person").selectOption(id.sponsor);
      await invite.getByLabel("Role").selectOption("sponsor");
      await invite.getByRole("button", { name: "Invite" }).click();
      await expect.poll(async () => (await eventsOf("project.invited", projectA)).filter((e) => (e.payload as { userId?: string }).userId === id.sponsor).length).toBe(1);
      await lead.context().close();

      const page = await signIn(browser, SPONSOR);
      await page.goto(`/${SLUG}/inbox`);
      const row = page.locator('[data-testid="inbox-row"][data-kind="invitation"]').filter({ hasText: IDEA });
      await expect(row).toHaveCount(1);
      await row.click();
      await expect(page).toHaveURL(new RegExp(`/projects/${projectA}\\?tab=team#invite-`));
      await page.getByRole("group", { name: /You are invited as Sponsor/ }).getByRole("button", { name: "Accept", exact: true }).click();
      await expect.poll(async () => (await eventsOf("project.invite.answered", projectA)).filter((e) => e.actorUserId === id.sponsor).length).toBe(1);
      expect((await eventsOf("project.invite.answered", projectA)).find((e) => e.actorUserId === id.sponsor)!.payload).toMatchObject({ userId: id.sponsor, take: true });
      await expect(page.getByText("Accepted", { exact: true }).first()).toBeVisible();
      await page.context().close();
    });

    // ── drafts left past their start day ────────────────────────────────────────────────────────────────────────────
    const keep = await expiredDraft("keep", "Crane queue at the changeover");
    const hand = await expiredDraft("hand", "Pallet labels at goods out");
    const stop = await expiredDraft("stop", "Spare gauge for line 5");

    await test.step("the clock gives each late draft to the seat above, which is told in the app and by mail (skipped)", async () => {
      for (const d of [keep, hand, stop]) {
        const facts = await settle(() => eventsOf("clock.due", d.projectId), `the clock writes the late fact of ${d.title}`);
        expect(facts[0].payload).toMatchObject({ kind: "draft" });
        expect(facts[0]).toMatchObject({ actor: "system:clock", source: "clock" });
        const about = async (channel: string) => (await noticesOf(id.above, "reminder.draft", channel)).filter((r) => r.subject.includes(d.title));
        const app = await settle(() => about("inapp"), `the seat above is told about ${d.title}`);
        expect(app[0]).toMatchObject({ status: "sent", address: null });
        const mail = await about("mail");
        expect(mail.length, `a skipped mail for ${d.title}`).toBeGreaterThan(0);
        expect(mail[0]).toMatchObject({ status: "skipped", address: emailOf(ABOVE, SLUG) });
      }
    });

    await test.step("the seat above, no manager, keeps one draft with a new date", async () => {
      const page = await signIn(browser, ABOVE);
      await page.goto(`/${SLUG}/projects/${keep.projectId}`);
      await expect(page.getByRole("heading", { name: "Past its start day" })).toBeVisible();
      const form = page.getByRole("form", { name: "Keep with a new date" });
      await form.getByRole("spinbutton").fill("5");
      await form.getByRole("textbox").fill(KEEP_WHY);
      await form.getByRole("button", { name: "Keep with a new date" }).click();
      await expect.poll(async () => (await eventsOf("project.start.moved", keep.projectId)).length).toBe(1);
      expect((await eventsOf("project.start.moved", keep.projectId))[0]).toMatchObject({ actorUserId: id.above, payload: { why: KEEP_WHY } });
      await expect(page.getByRole("heading", { name: "Past its start day" })).toHaveCount(0); // the new date is ahead
      await page.context().close();
    });

    await test.step("the seat above hands the lead of another late draft on", async () => {
      const page = await signIn(browser, ABOVE);
      await page.goto(`/${SLUG}/projects/${hand.projectId}`);
      const form = page.getByRole("form", { name: "Hand the lead on" });
      await form.getByLabel("Hand to").selectOption(id.sponsor);
      await form.getByRole("button", { name: "Hand the lead on" }).click();
      await expect.poll(async () => (await eventsOf("project.handed", hand.projectId)).length).toBe(1);
      expect((await eventsOf("project.handed", hand.projectId))[0]).toMatchObject({ actorUserId: id.above, payload: { toUserId: id.sponsor } });
      await page.context().close();
    });

    await test.step("the seat above stops a third late draft with a reason, and the raiser receives it", async () => {
      const page = await signIn(browser, ABOVE);
      await page.goto(`/${SLUG}/projects/${stop.projectId}`);
      await page.getByRole("button", { name: "Stop the project" }).click();
      await page.getByRole("textbox", { name: "Why stop it?" }).fill(STOP_WHY);
      await page.getByRole("button", { name: "Stop it" }).click();
      await expect.poll(async () => (await eventsOf("project.stopped", stop.projectId)).length).toBe(1);
      expect((await eventsOf("project.stopped", stop.projectId))[0]).toMatchObject({ actorUserId: id.above, payload: { why: STOP_WHY } });
      await page.context().close();

      const mail = (await settle(() => noticesOf(id.raiser, "loop.project.stopped", "mail"), "the stop reaches the raiser by mail"))[0];
      expect(mail).toMatchObject({ status: "skipped", lastError: "sandbox", address: emailOf(RAISER, SLUG) });
      expect(mail.text).toContain(STOP_WHY);
      const app = await noticesOf(id.raiser, "loop.project.stopped", "inapp");
      expect(app).toHaveLength(1);
      expect(app[0]).toMatchObject({ status: "sent", address: null });
    });

    // ── the sandbox sent nothing ────────────────────────────────────────────────────────────────────────────────────
    await test.step("a sandbox sent no mail and no Teams message: every outside row is skipped, every in-app row is sent", async () => {
      const rows = await db().outboxMessage.findMany({ where: { companyId } });
      expect(rows.filter((r) => r.channel === "teams" || r.channel === "webhook"), "Teams and webhook rows").toHaveLength(0);
      const outside = rows.filter((r) => r.channel !== "inapp");
      expect(outside.length).toBeGreaterThan(0);
      expect(outside.every((r) => r.status === "skipped" && r.lastError === "sandbox"), "every outside row is skipped").toBe(true);
      expect(rows.filter((r) => r.channel === "inapp").every((r) => r.status === "sent" && r.sentAt !== null && r.address === null)).toBe(true);
    });
  });
});
