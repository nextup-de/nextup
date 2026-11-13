// OVL acceptance (plan OVL, OVL-Z1): an away holder is covered and an overloaded desk is shared. On a real company (sandbox stage, empty template, working-day
// calendar) with the AI, Teams, Jira and Microsoft 365 off (D4).
//
// The story, in one test; the clock runs between the steps where a person waits for it:
//  1. away: the only holder H of desk A (whose route has a deputy desk D held by K) sets away from today to the next working day on the profile; one clock run;
//     both open cases sit on K's seat (the case page says "with" the deputy desk), K handed nothing; H ends the span, sees both under "Take back", takes one
//     back: it is on H's seat again and its passes count is 0, the other stays with K;
//  2. overflow at 30: desk O (one holder, 30 open cases, route deputy desk D2 held by K2) is at 30 per holder after one clock run; a member raises a new idea
//     to O on the raise page, whose sent line names K2; one more clock run hands the new case to K2's seat with why "overflow", and the older ones stay;
//  3. the seat above at 20: desk B (two holders, 40 open cases) is at 20 per holder; the clock writes desk.overloaded once and the holder U of the seat above
//     (app role member, no seat of B) gets the mail; U sees B on the desk load card in the Inbox with open, per holder and state and no name, appoints a cover seat
//     (desk.covered) and passes two of B's cases in bulk with one why;
//  4. triage at 10: desk T (one holder, 10 open cases) shows the triage banner to its holder, who selects two cases and passes them in bulk with one why;
//  5. pinned: a case the clock escalated to the seat above desk C and nobody touched since is first in the inbox of the holder of that seat, marked, and
//     counted as pinned on that desk's row of the card; an admin sees every loaded desk on the Dashboard card;
//  6. a vacant seat: the only holder of role V is switched off through the directory; the company admins have the vacant-seat mail at once (D30);
//  7. away for someone else (D31): the holder of the seat directly above member M finds M under "Set someone away" on their own profile and sets M away
//     from today to the next working day; M is told who set it; a company admin ends it from their own profile.
//
// The desk load card is on the Dashboard for a company admin and in the Inbox for a leader or member who holds the seat above a desk that can share its load
// (OVL D36). The seat above appoints the cover first: its two passes take desk B from 20 to 19 per holder, and the seat above may share only while it is up (D28),
// so the card, and with it the bulk bar's "Done" line, is gone once they went through; the spec reads the passes from the log.
//
// Set up in the database where the UI is not the point: the org, the open cases of each desk and the facts of an escalation. What matters for what it shows
// goes through the UI: the away spans, the take back, the raise to the overflowing desk, the bulk passes, the cover and the profile. Own company, made straight
// in the database and deleted at the end, like see.spec.ts and res.spec.ts. Run on any weekday.
import type { Browser, Page } from "@playwright/test";
import { expect, passSecondFactor, raiseLine, answerCoach, answerRail, showSidebar, vis, DEVELOP, test } from "../helpers";
import { reduce } from "../../../src/features/cases/reducer";
import { DEFAULT_CALENDAR } from "../../../src/features/clock";
import { dateOfWorkday, workdayOf } from "../../../src/features/clock/calendar";
import { getDb } from "../../../src/lib/db/client";
import { loadSeed } from "../../../src/lib/db/companies";
import { deactivateUser } from "../../../src/lib/db/directory";
import { appendEventRow, loadLog } from "../../../src/lib/db/events";
import { loadSeats } from "../../../src/lib/db/holders";
import { addRole, addSeat, addUnit, saveRoute } from "../../../src/lib/db/org-edit";
import { dispatchOnce } from "../../../src/server/notify/dispatch";
import { runClockOnce } from "../../../src/server/scheduler/clock";
import { createTestCompany, deleteTestCompany, emailOf } from "./company-fixture";

const STAMP = Date.now().toString(36);
const SLUG = `ovl-${STAMP}`;
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL (.env.local)");
// A click that waits for ever would hold the test until its timeout; none of these should wait longer than this.
test.use({ actionTimeout: 20_000 });

const UNIT = "OPS";
const ADMIN = "Adele Adminfield"; // company admin (app role manager), holds no seat
const HEAD = "Hanna Headfield"; // leader, Plant head: the top of the chart
const HOLDER_A = "Hugo Awayfield"; // leader, the only holder of desk A: goes away
const COVER_K = "Kim Coverfield"; // leader, the deputy desk D of A's route
const TRIAGE = "Tara Triagefield"; // leader, the only holder of desk T: ten open cases
const SPARE = "Sven Sparefield"; // leader, the spare desk X the bulk passes go to
const BUSY1 = "Bea Busyfield"; // leader, first holder of desk B
const BUSY2 = "Bruno Busytwofield"; // leader, second holder of desk B
const ABOVE = "Uma Abovefield"; // member, holds the seat above desk B: no seat of B, no manager
const OVER = "Otto Overfield"; // leader, the only holder of desk O: thirty open cases
const COVER_K2 = "Kara Secondfield"; // leader, the deputy desk D2 of O's route
const PIN_DESK = "Cora Pinfield"; // leader, the only holder of desk C
const PIN_ABOVE = "Paul Pinnedfield"; // leader, holds S2, the seat above desk C
const VACANT = "Vera Vacantfield"; // leader, the only holder of role V: leaves
const TEAM_LEAD = "Lena Leadfield"; // leader, the seat directly above member M
const MEMBER_M = "Max Memberfield"; // member, set away by the seat above, and back by an admin
const RAISER = "Rita Raiserfield"; // member on no seat: raises the cases and the new idea to O

const ROLE = {
  head: "Plant head", a: "Line desk A", d: "Deputy desk D", t: "Triage desk T", x: "Spare desk X", s: "Operations head", b: "Busy desk B", o: "Overflow desk O",
  d2: "Second deputy desk D2", s2: "Section head", c: "Escalation desk C", v: "Vacant desk V", tl: "Team lead desk", m: "Team member desk",
} as const;

const AWAY_TITLE = (i: number) => `Away case ${i}: the label printer jams every shift`;
const PASS_WHY_T = "The spare desk owns the tool crib now, so it belongs there";
const PASS_WHY_B = "The spare desk can take the tool crib cases while this desk is full";
const NEW_IDEA = "A forklift charging bay at the overflow desk"; // a raise keeps about 50 characters of the line

const PEOPLE: { name: string; role: "manager" | "leader" | "member" }[] = [
  { name: ADMIN, role: "manager" }, { name: HEAD, role: "leader" }, { name: HOLDER_A, role: "leader" }, { name: COVER_K, role: "leader" },
  { name: TRIAGE, role: "leader" }, { name: SPARE, role: "leader" }, { name: BUSY1, role: "leader" }, { name: BUSY2, role: "leader" }, { name: ABOVE, role: "member" },
  { name: OVER, role: "leader" }, { name: COVER_K2, role: "leader" }, { name: PIN_DESK, role: "leader" }, { name: PIN_ABOVE, role: "leader" },
  { name: VACANT, role: "leader" }, { name: TEAM_LEAD, role: "leader" }, { name: MEMBER_M, role: "member" }, { name: RAISER, role: "member" },
];

const codes = new Map<string, string>();
let companyId = "";
let n = 0;
const id: Record<string, string> = {};
const seat: Record<string, string> = {};
const role: Record<string, string> = {};
const route: Record<string, string> = {}; // route id by key

/** Today's working-day number, the way the app counts it on a sandbox company (the default calendar). */
const D = workdayOf(new Date(), DEFAULT_CALENDAR);
/** A moment on working day `day`. */
const on = (day: number) => new Date(`${dateOfWorkday(day, DEFAULT_CALENDAR)}T10:00:00Z`);
/** A working day as the date input writes it. */
const iso = (day: number) => dateOfWorkday(day, DEFAULT_CALENDAR);

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
const eventsOf = (type: string, targetId?: string) =>
  db().caseEvent.findMany({ where: { companyId, type, ...(targetId ? { targetId } : {}) }, orderBy: { seq: "asc" } });
const handedWhy = (why: string) => db().caseEvent.findMany({ where: { companyId, type: "case.handed", payload: { path: ["why"], equals: why } }, orderBy: { seq: "asc" } });
const seatOfCase = async (caseId: string) => (await db().caseView.findFirstOrThrow({ where: { companyId, caseId }, select: { assigneeSeatId: true } })).assigneeSeatId;
const noticesOf = (userIdOf: string, subject: string) =>
  db().outboxMessage.findMany({ where: { companyId, recipientUserId: userIdOf, channel: "mail", subject: { contains: subject } }, orderBy: { createdAt: "asc" } });

/** Append an event the way the app would store it, on working day `at` (today by default). */
async function append(type: string, actor: string, actorUserId: string | null, targetId: string | null, payload: Record<string, unknown>, opts: { at?: number; source?: string; idemKey?: string } = {}) {
  const r = await appendEventRow(companyId, { id: `${SLUG}-e${n++}`, day: 0, type, actor, targetId, payload } as never, {
    actorUserId, ...(opts.at === undefined ? {} : { now: on(opts.at) }), ...(opts.source ? { source: opts.source } : {}), ...(opts.idemKey ? { idemKey: opts.idemKey } : {}),
  });
  if (!r.ok) throw new Error(r.error);
}

/** An open idea of the raiser on a route's desk; open to everyone, so every viewer's state counts it. */
const raise = (caseId: string, title: string, routeKey: string, at?: number) =>
  append("case.raised", RAISER, id[RAISER], caseId, { kind: "idea", title, body: "It costs the desk time every day.", fromDept: UNIT, routeId: route[routeKey], visibility: "everyone" }, { at });
const raiseMany = async (prefix: string, count: number, routeKey: string, at: number) => {
  for (let i = 0; i < count; i++) await raise(`${SLUG}-${prefix}${i}`, `${prefix.toUpperCase()} case ${i}: the tool crib ${prefix}${i} is short`, routeKey, at);
};

/** The clock and the planner until `rows` finds something: for notices that follow an action, or a clock day (the app's own loops may hold a lease for a moment). */
async function settle<T>(rows: () => Promise<T[]>, message: string, atLeast = 1): Promise<T[]> {
  let found: T[] = [];
  await expect.poll(async () => {
    await runClockOnce();
    await dispatchOnce();
    found = await rows();
    return found.length;
  }, { message, timeout: 45_000, intervals: [500, 1_000, 2_000] }).toBeGreaterThanOrEqual(atLeast);
  return found;
}

/** The reduced state of the company as it is now, for what the UI does not show (a case's passes count). */
async function stateNow() {
  const seed = (await loadSeed(SLUG))!;
  return reduce({ ...seed, seats: await loadSeats(companyId) }, await loadLog(companyId));
}

/** The case page of a case. */
const openCase = async (page: Page, caseId: string) => {
  await page.goto(`/${SLUG}/cases/${caseId}`);
  await page.waitForLoadState("networkidle");
};

/** The raise page's last steps like the helper's publishTo, but keeping the sent line before the window closes. */
async function publishAndRead(page: Page, to: string): Promise<string> {
  const look = page.getByRole("dialog", { name: "Last look before it goes out" });
  if (!(await look.isVisible())) {
    await showSidebar(page);
    await page.getByRole("button", { name: "Publish idea" }).click();
  }
  await look.getByRole("button", { name: /Choose a desk/ }).click({ timeout: 30_000 });
  const who = page.getByRole("dialog", { name: "Where should it go?" });
  await expect(who).toBeVisible({ timeout: 30_000 });
  const offered = who.getByRole("radio").filter({ hasText: to });
  if (await offered.count()) await offered.first().click();
  else {
    const other = who.getByTestId("raise-desk-other").getByRole("button").first();
    if ((await other.getAttribute("aria-expanded")) !== "true") await other.click();
    await who.getByRole("textbox").fill(to);
    await who.getByRole("button").filter({ hasText: to }).first().click();
  }
  await who.getByTestId("raise-send").click();
  const sent = who.getByTestId("raise-sent");
  await expect(sent).toBeVisible({ timeout: 30_000 });
  const line = (await sent.innerText()).trim();
  await who.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(page.getByRole("link", { name: "Open the case" })).toBeVisible({ timeout: 30_000 });
  return line;
}

test.describe("OVL acceptance: an away holder is covered and an overloaded desk is shared", () => {
  test.beforeAll(async () => {
    const made = await createTestCompany({
      slug: SLUG, name: `OVL ${STAMP}`, template: "empty", stage: "sandbox",
      people: PEOPLE.map((p) => ({ name: p.name, role: p.role, dept: UNIT, email: emailOf(p.name, SLUG) })),
    });
    for (const [name, code] of made) codes.set(name, code);
    companyId = (await db().company.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } })).id;
    for (const p of PEOPLE) id[p.name] = await userId(p.name);

    // The structure: everybody reports to the Plant head except desk B, whose seat above is the Operations head (U, a member), desk C, whose seat above is
    // the Section head (S2), and the team member below the team lead. A, B, T, O and C each own a route; A's and B's deputy is desk D, O's is D2.
    const unit = await addUnit(companyId, "ovl-z1", { key: UNIT, name: UNIT, kind: "dept", headcount: 0, parentId: null });
    const mk = async (key: keyof typeof ROLE, reportsToId: string | null) => (role[key] = await addRole(companyId, "ovl-z1", { orgUnitId: unit, title: ROLE[key], reportsToId, decides: [], spendLimitEur: null }));
    await mk("head", null);
    for (const k of ["a", "d", "t", "x", "s", "o", "d2", "s2", "v", "tl"] as const) await mk(k, role.head);
    await mk("b", role.s);
    await mk("c", role.s2);
    await mk("m", role.tl);
    const sit = async (key: string, roleKey: string, name: string) => (seat[key] = await addSeat(companyId, role[roleKey], name, id[name]));
    await sit("head", "head", HEAD); await sit("a", "a", HOLDER_A); await sit("d", "d", COVER_K); await sit("t", "t", TRIAGE); await sit("x", "x", SPARE);
    await sit("b1", "b", BUSY1); await sit("b2", "b", BUSY2); await sit("s", "s", ABOVE); await sit("o", "o", OVER); await sit("d2", "d2", COVER_K2);
    await sit("c", "c", PIN_DESK); await sit("s2", "s2", PIN_ABOVE); await sit("v", "v", VACANT); await sit("tl", "tl", TEAM_LEAD); await sit("m", "m", MEMBER_M);
    const rt = (key: string, owner: string, deputy: string | null, keywords: string[]) =>
      saveRoute(companyId, "ovl-z1", { key, type: key, keywords, ownerRoleId: role[owner], deputyRoleId: deputy === null ? null : role[deputy], buddyRoleId: null, wait: "3 d" });
    await rt("r-a", "a", "d", ["printer"]);
    await rt("r-t", "t", null, ["crib"]);
    await rt("r-x", "x", null, ["spare"]);
    await rt("r-b", "b", "d", ["conveyor"]);
    await rt("r-o", "o", "d2", ["forklift"]);
    await rt("r-c", "c", null, ["scaffold"]);
    const seed = (await loadSeed(SLUG))!;
    for (const r of seed.routes) route[r.type] = r.id;
    for (const key of ["r-a", "r-t", "r-x", "r-b", "r-o", "r-c"]) expect(route[key], `route ${key}`).toBeTruthy();

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
    if (process.env.OVL_KEEP) return;
    await deleteTestCompany(SLUG);
  });

  test("OVL acceptance: an away holder is covered and an overloaded desk is shared", async ({ browser }) => {
    test.setTimeout(900_000);
    const a1 = `${SLUG}-a1`;
    const a2 = `${SLUG}-a2`;
    const pinned = `${SLUG}-pinned`;

    // ── what the clock left behind: a case escalated to the seat above desk C and left alone ───────────────────────
    // Written the way the clock writes it (clk-escalation.test.ts): raised long ago, past its answer date the deadline fact, then the escalation fact naming the
    // seat above, then the hand-over to it by system:clock with why "escalation" and the clock's own keys; nobody touched the case since. With the facts there,
    // no later clock run has anything left to do on it. Done before the rest.
    await raise(pinned, "Scaffold case: the scaffold ties at desk C are loose", "r-c", D - 14);
    const due = (await stateNow()).cases.find((c) => c.id === pinned)!.dueDay;
    const clock = { source: "clock" } as const;
    await append("clock.due", "system:clock", null, pinned, { kind: "deadline", dueDay: due, toRoleHolderId: null }, { at: D - 8, idemKey: `clk:deadline:${pinned}:${due}`, ...clock });
    await append("clock.due", "system:clock", null, pinned, { kind: "escalation", dueDay: due, toRoleHolderId: seat.s2 }, { at: D - 6, idemKey: `clk:escalate:${pinned}`, ...clock });
    await append("case.handed", "system:clock", null, pinned, { to: PIN_ABOVE, toRoleHolderId: seat.s2, why: "escalation" }, { at: D - 5, idemKey: `clk:escalate:${pinned}:handover`, ...clock });
    await expect.poll(() => seatOfCase(pinned), { message: "the case is on that seat" }).toBe(seat.s2);

    // ── the open work of each desk ─────────────────────────────────────────────────────────────────────────────────
    // Raised yesterday, so none of it counts as new when desk O reaches its limit (overflow takes only cases raised from then on, D24). Desk A has two cases.
    await raise(a1, AWAY_TITLE(1), "r-a", D - 1);
    await raise(a2, AWAY_TITLE(2), "r-a", D - 1);
    await raiseMany("t", 10, "r-t", D - 1); // one holder, ten open items: triage
    await raiseMany("b", 40, "r-b", D - 1); // two holders, forty open items: twenty each, up
    await raiseMany("o", 30, "r-o", D - 1); // one holder, thirty open items: overflow
    await dispatchOnce();

    // ── away: the only holder sets it on the profile; the clock gives her cases to the deputy desk ────────────────
    let hugo: Page | null = null;
    await test.step("the only holder of desk A sets away from today to the next working day; one clock run puts both open cases on the deputy desk's seat", async () => {
      hugo = await signIn(browser, HOLDER_A);
      await hugo.goto(`/${SLUG}/profile`);
      await expect(vis(hugo, "away-card")).toBeVisible();
      await expect(vis(hugo, "away-takeback-none")).toBeVisible();
      await vis(hugo, "away-open").click();
      await hugo.getByTestId("away-from").fill(iso(D));
      await hugo.getByTestId("away-to").fill(iso(D + 1));
      await expect(hugo.getByText("No reason is asked or kept.")).toBeVisible();
      await hugo.getByTestId("away-save").click();
      await expect(vis(hugo, "away-now")).toBeVisible();
      const spans = await eventsOf("person.away");
      expect(spans).toHaveLength(1);
      expect(spans[0]).toMatchObject({ actorUserId: id[HOLDER_A], payload: { userId: id[HOLDER_A], from: D, to: D + 1, setBy: id[HOLDER_A] } });
      expect(Object.keys(spans[0].payload as object).sort(), "an absence has no reason and no text").toEqual(["awayId", "from", "setBy", "to", "userId"]);

      const away = await settle(() => handedWhy("away"), "the clock hands the away holder's cases on", 2);
      expect(away).toHaveLength(2);
      for (const e of away) {
        expect(e).toMatchObject({ actor: "system:clock", actorUserId: null, source: "clock", payload: { why: "away", toRoleHolderId: seat.d } });
      }
      await expect.poll(() => seatOfCase(a1), { message: "the case is on that seat" }).toBe(seat.d);
      await expect.poll(() => seatOfCase(a2), { message: "the case is on that seat" }).toBe(seat.d);
      // The case page says who has it now (the deputy desk's holder) and that the clock handed it there because of the absence, with no more than that.
      await openCase(hugo, a1);
      await expect(hugo.getByText(`system:clock handed it to ${COVER_K}`)).toBeVisible();
      await expect(hugo.getByText(COVER_K).first()).toBeVisible();
      // The cover hands nothing on, and the clock's own hand-over did not count as a pass.
      expect(await db().caseEvent.count({ where: { companyId, type: "case.handed", actorUserId: id[COVER_K] } })).toBe(0);
    });

    await test.step("the holder ends the span, sees both cases under Take back and takes one back: it is on her seat again, its passes are 0", async () => {
      const page = hugo!;
      await page.goto(`/${SLUG}/profile`);
      await vis(page, "away-end").click();
      await expect(vis(page, "away-now")).toBeHidden();
      expect((await eventsOf("person.back")).map((e) => e.payload)).toMatchObject([{ userId: id[HOLDER_A] }]);
      const list = vis(page, "away-takeback");
      await expect(list).toBeVisible();
      await expect(list.getByRole("listitem")).toHaveCount(2);
      await page.getByTestId(`away-takeback-${a1}`).click();
      await expect.poll(() => seatOfCase(a1), { message: "the taken back case is on her seat" }).toBe(seat.a);
      await expect.poll(() => seatOfCase(a2), { message: "the case she left stays with the cover" }).toBe(seat.d);
      const back = (await eventsOf("case.handed", a1)).at(-1)!;
      expect(back).toMatchObject({ actor: "system:cover", payload: { why: "takeback", takenBy: id[HOLDER_A], toRoleHolderId: seat.a } });
      const state = await stateNow();
      expect(state.cases.find((c) => c.id === a1)?.passes, "a clock hand-over and a take back are no passes").toBe(0);
      await expect(list.getByRole("listitem")).toHaveCount(1);
      await page.context().close();
    });

    // ── overflow at 30: the raise page names the deputy desk and the new case goes there ────────────────────────────
    await test.step("desk O is at 30 per holder after one clock run; a new idea to it is named to go to the deputy desk's holder and the clock hands it there", async () => {
      const facts = await settle(() => eventsOf("desk.overloaded"), "the clock writes the desks' overloaded facts", 2);
      const levels = new Map(facts.map((e) => [(e.payload as { roleId: string }).roleId, (e.payload as { level: number }).level]));
      expect(levels.get(role.o), "desk O reached 30").toBe(30);
      expect(levels.get(role.b), "desk B reached 20").toBe(20);
      expect(levels.has(role.t), "desk T tells nobody").toBe(false);
      expect(await db().caseEvent.count({ where: { companyId, type: "case.handed", payload: { path: ["why"], equals: "overflow" } } }), "older cases stay on the desk").toBe(0);

      const page = await signIn(browser, RAISER);
      await page.goto(`/${SLUG}/raise`);
      await raiseLine(page, NEW_IDEA);
      await answerCoach(page, DEVELOP);
      await answerRail(page);
      const line = await publishAndRead(page, ROLE.o);
      expect(line, "the sent line names the deputy desk's holder").toContain(COVER_K2);
      expect(line).toContain(ROLE.o);
      expect(line, "it does not say the desk waits").not.toMatch(/waits until someone sits/);
      await page.context().close();

      // The page says "Open the case" a moment before the append is in the log.
      let newId = "";
      await expect.poll(async () => {
        const rows = await eventsOf("case.raised");
        newId = rows.find((e) => (e.payload as { title?: string }).title === NEW_IDEA)?.targetId ?? "";
        return newId !== "";
      }, { message: `the case raised as "${NEW_IDEA}"`, timeout: 20_000 }).toBe(true);
      const over = await settle(() => handedWhy("overflow"), "the clock hands the new case to the deputy desk", 1);
      expect(over.map((e) => [e.targetId, e.actor])).toEqual([[newId, "system:clock"]]);
      expect(over[0].payload).toMatchObject({ why: "overflow", toRoleHolderId: seat.d2 });
      await expect.poll(() => seatOfCase(newId), { message: "the case is on that seat" }).toBe(seat.d2);
      await expect.poll(() => seatOfCase(`${SLUG}-o0`), { message: "an older case stays on desk O" }).toBe(seat.o);
    });

    // ── the seat above at 20: the mail, and the card without names ─────────────────────────────────────────────────
    await test.step("desk B at 20 per holder told the seat above once, by mail, with no name in it", async () => {
      const up = await settle(() => noticesOf(id[ABOVE], "A desk below you is loaded"), "the seat above gets the desk.overloaded mail");
      expect(up).toHaveLength(1);
      expect(up[0].subject).toContain(ROLE.b);
      expect(up[0].text).toContain(ROLE.b);
      for (const p of PEOPLE.filter((x) => x.name !== ABOVE)) expect(up[0].text, `the mail names no person (${p.name})`).not.toContain(p.name);
      // Nobody who sits on the desk itself is told that it is loaded above them.
      expect(await noticesOf(id[BUSY1], "A desk below you is loaded")).toHaveLength(0);
      expect(await eventsOf("desk.overloaded", role.b)).toHaveLength(1);
    });

    // ── a vacant seat: the admins' mail at once ───────────────────────────────────────────────────────────────────
    await test.step("the only holder of role V is switched off through the directory: the company admins have the vacant-seat mail at once", async () => {
      expect(await deactivateUser(companyId, id[VACANT])).toMatchObject({ deactivated: 1 });
      const vac = await eventsOf("org.seat.vacant");
      expect(vac).toHaveLength(1);
      expect(vac[0]).toMatchObject({ targetId: seat.v, payload: { seatId: seat.v, roleId: role.v, userId: id[VACANT] } });
      await dispatchOnce();
      const mail = await settle(() => noticesOf(id[ADMIN], "A seat has no holder"), "the admin has the vacant-seat mail");
      expect(mail).toHaveLength(1);
      expect(mail[0].subject).toContain(ROLE.v);
      expect(await noticesOf(id[HEAD], "A seat has no holder"), "only the company admins are told").toHaveLength(0);
    });

    // ── away set for someone else (D31) ───────────────────────────────────────────────────────────────────────────
    await test.step("the holder of the seat directly above member M sets M away on their own profile; M is told who did; a company admin ends it", async () => {
      const lead = await signIn(browser, TEAM_LEAD);
      await lead.goto(`/${SLUG}/profile`);
      const section = vis(lead, "away-others");
      await expect(section).toBeVisible();
      await expect(section.getByTestId(`away-other-${id[MEMBER_M]}`)).toContainText(MEMBER_M);
      await expect(section.getByRole("listitem"), "only the person directly below is listed").toHaveCount(1);
      await section.getByTestId(`away-other-set-${id[MEMBER_M]}`).click();
      const dialog = section.getByTestId("away-dialog");
      await expect(dialog).toContainText(MEMBER_M);
      await dialog.getByTestId("away-from").fill(iso(D));
      await dialog.getByTestId("away-to").fill(iso(D + 1));
      await dialog.getByTestId("away-save").click();
      await expect(section.getByTestId(`away-other-${id[MEMBER_M]}`)).toContainText("Away until");
      const spans = (await eventsOf("person.away")).filter((e) => (e.payload as { userId: string }).userId === id[MEMBER_M]);
      expect(spans).toHaveLength(1);
      expect(spans[0]).toMatchObject({ actorUserId: id[TEAM_LEAD], payload: { from: D, to: D + 1, setBy: id[TEAM_LEAD] } });
      const told = await settle(() => noticesOf(id[MEMBER_M], "You have been set away"), "M's outbox has the mail");
      expect(told[0].text, "the mail names who set it").toContain(TEAM_LEAD);
      await lead.context().close();

      const admin = await signIn(browser, ADMIN);
      await admin.goto(`/${SLUG}/profile`);
      const all = vis(admin, "away-others");
      await expect(all.getByTestId(`away-other-${id[MEMBER_M]}`)).toContainText("Away until");
      await all.getByTestId(`away-other-end-${id[MEMBER_M]}`).click();
      await expect(all.getByTestId(`away-other-${id[MEMBER_M]}`)).not.toContainText("Away until");
      const back = (await eventsOf("person.back")).filter((e) => (e.payload as { userId: string }).userId === id[MEMBER_M]);
      expect(back).toHaveLength(1);
      expect(back[0]).toMatchObject({ actorUserId: id[ADMIN], payload: { awayId: (spans[0].payload as { awayId: string }).awayId } });
      await admin.context().close();

      const m = await signIn(browser, MEMBER_M);
      await m.goto(`/${SLUG}/profile`);
      await expect(vis(m, "away-card")).toBeVisible();
      await expect(vis(m, "away-now"), "M's span shows as ended").toBeHidden();
      await m.context().close();
    });

    // ── OVL-U1's screens: the desk load card, the triage banner, the bulk bar and the pinned mark ──────────────────
    // vis: the streamed page holds a hidden second copy for a moment after a load (helpers.ts)
    const cardOf = (page: Page) => vis(page, "desk-load");
    const rowOf = (page: Page, roleId: string) => cardOf(page).locator(`[data-testid="desk-load-row"][data-role="${roleId}"]`);
    /** The cells of a desk's row: open, per holder, late, pinned. */
    const cellsOf = (row: ReturnType<typeof rowOf>) => row.locator("td");
    const noNames = async (page: Page) => {
      for (const p of PEOPLE) await expect(cardOf(page), `the card names no person (${p.name})`).not.toContainText(p.name);
    };

    await test.step("the seat above sees desk B on the Inbox card without names, passes two of its cases in bulk and appoints a cover", async () => {
      const page = await signIn(browser, ABOVE);
      // A member cannot open the Dashboard (OVL D36): whoever holds the seat above a desk finds the card for the desks below them in the Inbox.
      await page.goto(`/${SLUG}/dashboard`);
      await expect(page, "the Dashboard stays for managers").not.toHaveURL(/\/dashboard/);
      await page.goto(`/${SLUG}/inbox`);
      await expect(cardOf(page)).toBeVisible();
      const row = rowOf(page, role.b);
      await expect(row).toHaveAttribute("data-level", "up");
      await expect(cellsOf(row).nth(1)).toHaveText("40"); // open
      await expect(cellsOf(row).nth(2)).toHaveText("20"); // per holder
      await expect(row).toContainText("Up");
      await noNames(page);
      await expect(cardOf(page).locator("[data-testid=desk-load-row]"), "only the desk the viewer may share the load of").toHaveCount(1);

      // The cover first: two passes take the desk from 20 to 19 per holder, below "up", and the seat above may share the load only while it is up (D28).
      await row.getByTestId("desk-appoint-cover").click();
      await row.getByTestId("desk-cover-seat").selectOption(seat.d);
      await row.getByTestId("desk-cover-save").click();
      await expect(page.getByText("The cover is set.")).toBeVisible();
      const cover = await eventsOf("desk.covered");
      expect(cover).toHaveLength(1);
      expect(cover[0]).toMatchObject({ actorUserId: id[ABOVE], payload: { roleId: role.b, seatId: seat.d } });

      await row.getByTestId("desk-pass-bulk").click();
      const bar = row.getByTestId("bulk-bar");
      await bar.getByRole("checkbox").nth(0).check();
      await bar.getByRole("checkbox").nth(1).check();
      await expect(bar.getByTestId("bulk-count")).toHaveText("2");
      await bar.getByTestId("bulk-seat").selectOption(seat.x);
      await bar.getByTestId("bulk-text").fill(PASS_WHY_B);
      await bar.getByTestId("bulk-send").click();
      // The card goes with the desk's load: once the two passes took it under 20 per holder nothing is left to share, so its "Done" line is gone too.
      await expect.poll(async () => (await eventsOf("case.handed")).filter((e) => e.actorUserId === id[ABOVE]).length, { message: "two passes under the seat above's name" }).toBe(2);
      const passed = (await eventsOf("case.handed")).filter((e) => e.actorUserId === id[ABOVE]);
      for (const e of passed) expect(e.payload).toMatchObject({ why: PASS_WHY_B, toRoleHolderId: seat.x });
      for (const e of passed) await expect.poll(() => seatOfCase(e.targetId as string), { message: "the case is on that seat" }).toBe(seat.x);
      await page.context().close();
    });

    await test.step("the only holder of desk T sees the triage banner, selects two cases and passes them in bulk with one why", async () => {
      const page = await signIn(browser, TRIAGE);
      await page.goto(`/${SLUG}/inbox`);
      await expect(page.getByTestId("inbox-triage")).toContainText("Triage the desk's open items");
      await expect(page.getByTestId("inbox-triage")).toHaveAttribute("data-level", "triage");
      await expect(cardOf(page), "a holder of the desk has no share of the load to offer").toHaveCount(0);
      await page.getByTestId("inbox-select").click();
      const boxes = page.locator('[data-testid="inbox-row"][data-select="true"] input[type="checkbox"]');
      await boxes.nth(0).check();
      await boxes.nth(1).check();
      const bar = page.getByTestId("bulk-bar");
      await expect(bar.getByTestId("bulk-count")).toHaveText("2");
      await bar.getByTestId("bulk-seat").selectOption(seat.x);
      await bar.getByTestId("bulk-text").fill(PASS_WHY_T);
      await bar.getByTestId("bulk-send").click();
      await expect.poll(async () => (await eventsOf("case.handed")).filter((e) => e.actorUserId === id[TRIAGE]).length, { message: "two passes under the holder's name" }).toBe(2);
      const passed = (await eventsOf("case.handed")).filter((e) => e.actorUserId === id[TRIAGE]);
      for (const e of passed) expect(e.payload).toMatchObject({ why: PASS_WHY_T, toRoleHolderId: seat.x });
      for (const e of passed) await expect.poll(() => seatOfCase(e.targetId as string), { message: "the case is on that seat" }).toBe(seat.x);
      await page.context().close();
    });

    await test.step("the case the seat above left alone is first in its holder's inbox with the pinned mark", async () => {
      expect((await stateNow()).cases.find((c) => c.id === pinned)?.assigneeSeatId).toBe(seat.s2);
      const page = await signIn(browser, PIN_ABOVE);
      await page.goto(`/${SLUG}/inbox`);
      const first = page.getByTestId("inbox-row").first().locator("xpath=ancestor::li[1]");
      await expect(first).toContainText("Scaffold case");
      await expect(first.getByTestId("inbox-pinned")).toContainText("Left alone by the seat above");
      await expect(page.getByTestId("inbox-pinned"), "only that case is pinned").toHaveCount(1);
      await page.context().close();
    });

    await test.step("a company admin sees every loaded desk on the Dashboard card, the pinned case counted on its desk, without a name", async () => {
      const page = await signIn(browser, ADMIN);
      await page.goto(`/${SLUG}/dashboard`);
      await expect(cardOf(page)).toBeVisible();
      for (const r of [role.b, role.o, role.t, role.s2]) await expect(rowOf(page, r), `the row of ${r}`).toBeVisible();
      await expect(rowOf(page, role.o)).toHaveAttribute("data-level", "overflow");
      await expect(cellsOf(rowOf(page, role.s2)).nth(4), "the pinned case is counted on the desk it sits on").toHaveText("1");
      await expect(cellsOf(rowOf(page, role.b)).nth(4)).toHaveText("0");
      await noNames(page);
      await page.context().close();
    });
  });
});
