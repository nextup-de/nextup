// SEE acceptance (plan SEE, SEE-Z1): the raiser follows the idea and sees why. On a real company (sandbox stage, empty template) with the AI, Teams,
// Jira and Microsoft 365 off (D4).
//
// The story, in one test:
//  1. a no with a reason, "what would make it a yes" and a date: the raiser's card on My cases draws the track (Raised, With the desk, Decision with
//     "No · Not now") with the reason, what would make it a yes and the day it comes back; the case page shows the no block and the second look;
//  2. "Start a better idea from it": the raise page follows the old idea, the new idea is linked both ways;
//  3. two near-identical ideas: the desk of the second sees "Maybe the same as" the first and merges it with a note; the merged case is off the desk's
//     inbox and its raiser sees "Merged into" on My cases and the case page; a merge chain and a merge back (a cycle) are refused by the server, as is
//     a merge into a case the desk may not open, with the same answer as for a case that is not there;
//  4. what a viewer may not open stays unnamed: a link from a visible case to a case private to someone else, and a merge into a visible case from
//     one that is hidden, show neither title nor text in any page or response of the viewer;
//  5. a case in a discussion: its raiser sees "Decision expected by" on My cases, on the case page and in the one mail of the discussion;
//  6. the raiser leaves: the desk sees "(inactive)" after the name on the case;
//  7. no merge, link or follow-up sends a notice (D21).
//
// Set up in the database where the UI is not the point: the org, the ideas that only need to exist and the discussion. The raises that matter for what
// they carry (the second of two near-identical ideas keeps what it looked like; the better idea keeps what it follows) go through the raise page.
// Own company, made straight in the database and deleted at the end, like nor.spec.ts and set.spec.ts.
import type { Browser, Page } from "@playwright/test";
import { expect, passSecondFactor, publishIdea, raiseLine, answerCoach, answerRail, publishTo, DEVELOP, test } from "../helpers";
import { getDb } from "../../../src/lib/db/client";
import { deactivateUser } from "../../../src/lib/db/directory";
import { appendEventRow } from "../../../src/lib/db/events";
import { addRole, addSeat, addUnit, saveRoute } from "../../../src/lib/db/org-edit";
import { dispatchOnce } from "../../../src/server/notify/dispatch";
import { createTestCompany, deleteTestCompany, emailOf } from "./company-fixture";

const STAMP = Date.now().toString(36);
const SLUG = `see-${STAMP}`;
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL (.env.local)");
// A click that waits for ever would hold the test until its timeout; none of these should wait longer than this.
test.use({ actionTimeout: 20_000 });

const ROSA = "Rosa Raiserwood"; // member: the not-now, the better idea, the link to a hidden case
const MAX = "Max Matefield"; // member: the first of two near-identical ideas; a private idea of his goes to the same desk
const TINA = "Tina Twinfield"; // member: the second near-identical idea, raised on the raise page; merged away
const TOM = "Tom Talkfield"; // member: his idea goes into a discussion
const GINA = "Gina Goneby"; // member: raised by name, then leaves
const PIA = "Pia Privatewood"; // member: a private idea for the other desk
const DESK = "Quentin Qualityfield"; // leader, Quality lead: the route's owner, says no, merges, links
const OTHER = "Olga Otherdesk"; // leader, Tool lead: the other desk, which Quentin does not share
const UNIT = "QA";
const OWNER_ROLE = "Quality lead";
const OTHER_ROLE = "Tool lead";

const NRP_TITLE = "A second tray cart for the small tools beside the packing table";
const NRP_REASON = "The packing area has no floor space left this year, and a second cart would block the escape route";
const NRP_IF = "A floor plan that keeps the escape route free and a place for the cart";
const BETTER_TITLE = "A wall rack for the small tools above the table"; // a raise keeps about 50 characters of the line
const DUP1_TITLE = "Setters wait for the crane during every changeover";
const DUP2_TITLE = "Setters wait for crane during changeover again";
const MERGE_NOTE = "Same wait, same crane, Max raised it first";
const D3_TITLE = "Floor markings at the gauge cabinet fade within a month";
const TALK_TITLE = "The rework table lacks a light for checking the seal surface";
const GONE_TITLE = "Pallet labels peel off in the cold store within a week";
const HID_TITLE = "Pegasus fixture for the paint booth door latch";
const HID_BODY = "zephyr-marker the fixture for the booth door latch is missing";
const HID2_TITLE = "Andromeda bracket for the torque wrench rack";
const HID2_BODY = "quasar-marker the bracket for the torque wrench rack is bent";

const codes = new Map<string, string>();
let companyId = "";
let n = 0;
const id: Record<"rosa" | "max" | "tina" | "tom" | "gina" | "pia" | "desk" | "other", string> = { rosa: "", max: "", tina: "", tom: "", gina: "", pia: "", desk: "", other: "" };

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
const statusOf = async (caseId: string) => (await db().caseView.findFirstOrThrow({ where: { companyId, caseId }, select: { status: true } })).status;
/** The case a raise on the page stored under `title`; the page says "Open the case" a moment before the append is in the log. */
const caseIdOf = async (title: string): Promise<string> => {
  let found: string | null = null;
  await expect.poll(async () => {
    const rows = await db().caseEvent.findMany({ where: { companyId, type: "case.raised" }, select: { targetId: true, payload: true } });
    found = rows.find((r) => (r.payload as { title?: string }).title === title)?.targetId ?? null;
    return found !== null;
  }, { message: `the case raised as "${title}"`, timeout: 20_000 }).toBe(true);
  return found as unknown as string;
};

/** Append an event the way the app would store it. */
async function append(type: string, actor: string, actorUserId: string, targetId: string, payload: Record<string, unknown>) {
  const r = await appendEventRow(companyId, { id: `${SLUG}-e${n++}`, day: 0, type, actor, targetId, payload } as never, { actorUserId });
  if (!r.ok) throw new Error(r.error);
}

/** An idea of `who`, sent to the desk of `routeId`; open to everyone unless it is private. */
const raise = (caseId: string, who: string, whoId: string, title: string, desk: string, routeId: string, extra: { body?: string; visibility?: "everyone" | "private" } = {}) =>
  append("case.raised", who, whoId, caseId, { kind: "idea", title, body: extra.body ?? "The setters wait for the crane at every changeover.", assignee: desk, fromDept: UNIT, routeId, visibility: extra.visibility ?? "everyone" });

/** The first day of a not-now after today that the sheet takes, as the date input writes it. */
function nextDays(count: number): string[] {
  const out: string[] = [];
  for (let k = 1; out.length < count; k++) {
    const d = new Date(Date.now() + k * 86_400_000);
    if (d.getDay() !== 0 && d.getDay() !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Every response body the page gets while it loads `path`: the document, the flight payloads, the server actions. A cancelled fetch has no body: bounded. */
const FETCH_BODY_MS = 10_000;
async function payloadOf(page: Page, path: string): Promise<string> {
  const bodies: Promise<string>[] = [];
  let documents = 0;
  const onResponse = (r: { request(): { resourceType(): string }; text(): Promise<string> }) => {
    const kind = r.request().resourceType();
    if (kind === "document") {
      documents++;
      bodies.push(r.text().catch(() => ""));
    } else if (kind === "fetch" || kind === "xhr") {
      const read = r.text().catch(() => "");
      const cancelled = new Promise<string>((done) => setTimeout(() => done(""), FETCH_BODY_MS));
      bodies.push(Promise.race([read, cancelled]));
    }
  };
  page.on("response", onResponse);
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  page.off("response", onResponse);
  expect(documents, `the document of ${path} was read`).toBeGreaterThan(0);
  return (await Promise.all(bodies)).join("\n");
}

/** Remember the server actions the page sends that write `type`: the real request, with its action id, to send again with other ids. */
type Sent = { url: string; headers: Record<string, string>; body: string };
function recordActions(page: Page, type: string): Sent[] {
  const sent: Sent[] = [];
  page.on("request", (r) => {
    const body = r.postData();
    if (r.method() === "POST" && r.headers()["next-action"] && body !== null && body.includes(`"${type}"`)) sent.push({ url: r.url(), headers: r.headers(), body });
  });
  return sent;
}

/** The answer of the append action to a request the same as `template`, for another case: the first `{"ok": …}` of the flight text. */
async function resend(page: Page, template: Sent, changes: { target: string; into?: string; to?: string }): Promise<{ ok: boolean; error?: string }> {
  const args = JSON.parse(template.body) as { id: string; target: string; payload: Record<string, unknown> }[];
  expect(Array.isArray(args) && args.length === 1, "the action's arguments").toBe(true);
  const call = args[0];
  call.id = `${SLUG}-forged-${n++}`;
  call.target = changes.target;
  if (changes.into !== undefined) call.payload.into = changes.into;
  if (changes.to !== undefined) call.payload.to = changes.to;
  const headers = Object.fromEntries(Object.entries(template.headers).filter(([k]) => !["content-length", "host", "cookie"].includes(k)));
  const res = await page.request.post(template.url, { headers, data: JSON.stringify(args) });
  const found = /\{"ok":(true|false)[^}]*\}/.exec(await res.text());
  expect(found, "the action answered with an outcome").not.toBeNull();
  return JSON.parse((found as RegExpExecArray)[0]) as { ok: boolean; error?: string };
}

/** The desk's case page: the open case by id. */
const openCase = async (page: Page, caseId: string) => {
  await page.goto(`/${SLUG}/cases/${caseId}`);
  await page.waitForLoadState("networkidle");
};

test.describe("SEE acceptance: the raiser follows the idea and sees why", () => {
  test.beforeAll(async () => {
    const people = [
      { name: ROSA, role: "member" }, { name: MAX, role: "member" }, { name: TINA, role: "member" }, { name: TOM, role: "member" },
      { name: GINA, role: "member" }, { name: PIA, role: "member" }, { name: DESK, role: "leader" }, { name: OTHER, role: "leader" },
    ] as const;
    const made = await createTestCompany({
      slug: SLUG, name: `SEE ${STAMP}`, template: "empty", stage: "sandbox",
      people: people.map((p) => ({ name: p.name, role: p.role, dept: UNIT, email: emailOf(p.name, SLUG) })),
    });
    for (const [name, code] of made) codes.set(name, code);
    companyId = (await db().company.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } })).id;
    id.rosa = await userId(ROSA); id.max = await userId(MAX); id.tina = await userId(TINA); id.tom = await userId(TOM);
    id.gina = await userId(GINA); id.pia = await userId(PIA); id.desk = await userId(DESK); id.other = await userId(OTHER);

    // The structure: two desks side by side, each with its own route. Quentin is not on Olga's desk and Olga not on his.
    const unit = await addUnit(companyId, "see-z1", { key: UNIT, name: UNIT, kind: "dept", headcount: 0, parentId: null });
    const role = (title: string) => addRole(companyId, "see-z1", { orgUnitId: unit, title, reportsToId: null, decides: [], spendLimitEur: null });
    const ownerRole = await role(OWNER_ROLE);
    const otherRole = await role(OTHER_ROLE);
    await addSeat(companyId, ownerRole, DESK, id.desk);
    await addSeat(companyId, otherRole, OTHER, id.other);
    await saveRoute(companyId, "see-z1", { key: "r-see", type: "Changeover", keywords: ["changeover", "crane"], ownerRoleId: ownerRole, deputyRoleId: null, buddyRoleId: null, wait: "3 d" });
    await saveRoute(companyId, "see-z1", { key: "r-tools", type: "Tools", keywords: ["torque", "bracket"], ownerRoleId: otherRole, deputyRoleId: null, buddyRoleId: null, wait: "3 d" });

    // D4: nothing that calls out is on, and every notice of the loop goes by mail (skipped on a sandbox).
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
    if (process.env.SEE_KEEP) return;
    await deleteTestCompany(SLUG);
  });

  test("SEE acceptance: the raiser follows the idea and sees why", async ({ browser }) => {
    test.setTimeout(600_000);
    const nrp = `${SLUG}-case-nrp`;
    const dup1 = `${SLUG}-case-dup1`;
    const d3 = `${SLUG}-case-d3`;
    const talk = `${SLUG}-case-talk`;
    const gone = `${SLUG}-case-gone`;
    const hid = `${SLUG}-case-hid`;
    const hid2 = `${SLUG}-case-hid2`;
    const outboxBefore = await db().outboxMessage.count({ where: { companyId } });

    // ── a no with its reason, what would make it a yes and the day it comes back ───────────────────────────────────
    await raise(nrp, ROSA, id.rosa, NRP_TITLE, DESK, "r-see");
    let revisit = "";
    await test.step("the desk says not now, with a reason, what would make it a yes and a date", async () => {
      const page = await signIn(browser, DESK);
      await page.goto(`/${SLUG}/inbox`);
      await page.getByRole("main").getByText(NRP_TITLE).first().click();
      await page.getByRole("button", { name: "No, and why" }).click();
      await page.getByRole("button", { name: /Not now/ }).first().click();
      await page.getByLabel(/Your reason, which/).fill(NRP_REASON);
      await page.getByLabel(/What would make it a yes/).fill(NRP_IF);
      for (const date of nextDays(8)) {
        await page.locator("#no-revisit").fill(date);
        if (await page.getByRole("button", { name: "Send the no" }).isVisible()) { revisit = date; break; }
      }
      expect(revisit, "a working day the sheet accepts").not.toBe("");
      await page.getByRole("button", { name: "Send the no" }).click();
      await expect.poll(async () => (await eventsOf("case.decided", nrp)).length).toBe(1);
      expect((await eventsOf("case.decided", nrp))[0].payload).toMatchObject({ answer: "no", category: "not-now", changeIf: NRP_IF, revisitDay: expect.any(Number) });
      await page.context().close();
    });

    await test.step("My cases draws the track with the decision, the reason, what would make it a yes and the day it is back; the case page has the no block", async () => {
      const page = await signIn(browser, ROSA);
      await page.goto(`/${SLUG}/team`);
      const card = page.getByRole("article", { name: NRP_TITLE });
      await expect(card).toBeVisible();
      const track = card.getByRole("list", { name: "Progress" });
      await expect(track).toContainText("Raised");
      await expect(track).toContainText("With the desk");
      await expect(track).toContainText("Decision");
      await expect(track).toContainText("No · Not now");
      await expect(card).toContainText(NRP_REASON);
      await expect(card).toContainText("What would make it a yes");
      await expect(card).toContainText(NRP_IF);
      await expect(card).toContainText("Back on the desk on");

      await openCase(page, nrp);
      const block = page.getByTestId("no-block");
      await expect(block.getByTestId("no-category")).toHaveText("Not now");
      await expect(block.getByTestId("no-reason")).toHaveText(NRP_REASON);
      await expect(block.getByTestId("no-change-if")).toContainText(NRP_IF);
      await expect(block.getByTestId("no-revisit")).toContainText("Back on the desk on");
      await expect(page.getByTestId("second-look-ask")).toBeVisible();
      await expect(page.getByTestId("second-look")).toContainText(/until/);
      await page.context().close();
    });

    // ── a better idea from the no, linked both ways ────────────────────────────────────────────────────────────────
    await test.step("the raiser starts a better idea from the no; both cases show the link", async () => {
      const page = await signIn(browser, ROSA);
      await openCase(page, nrp);
      await page.getByTestId("start-better").click();
      await expect(page).toHaveURL(/\/raise\?follows=/);
      await expect(page.getByTestId("raise-follows")).toContainText(`Follows up on “${NRP_TITLE}”`);
      await expect(page.getByRole("textbox", { name: "Share an idea that would make work better…" })).toHaveValue(NRP_TITLE);
      await raiseLine(page, BETTER_TITLE);
      await answerCoach(page, DEVELOP);
      await answerRail(page);
      await publishTo(page, DESK);
      const better = await caseIdOf(BETTER_TITLE);
      expect((await eventsOf("case.raised", better))[0].payload).toMatchObject({ follows: nrp });

      await openCase(page, better);
      await expect(page.getByTestId("case-relations")).toContainText(`Follows up on “${NRP_TITLE}”`);
      await openCase(page, nrp);
      await expect(page.getByTestId("case-relations")).toContainText(`Followed by “${BETTER_TITLE}”`);
      await expect(page.getByTestId("no-block"), "the old case keeps its no").toBeVisible();
      expect(await statusOf(nrp), "the old case is not reopened").toBe("decided");
      await page.context().close();
    });

    // ── two near-identical ideas: the desk merges the second into the first ───────────────────────────────────────
    await raise(dup1, MAX, id.max, DUP1_TITLE, DESK, "r-see");
    await raise(d3, MAX, id.max, D3_TITLE, DESK, "r-see");
    let mergeTemplate: Sent[] = [];
    let dup2 = "";
    const raisedFor = (userIdOf: string) => db().outboxMessage.count({ where: { companyId, recipientUserId: userIdOf } });
    await test.step("the second idea is raised on the raise page and keeps what it looked like", async () => {
      const page = await signIn(browser, TINA);
      await page.goto(`/${SLUG}/raise`);
      await publishIdea(page, DUP2_TITLE, DESK);
      dup2 = await caseIdOf(DUP2_TITLE);
      expect((await eventsOf("case.raised", dup2))[0].payload).toMatchObject({ proposal: { sameAs: dup1 } });
      await page.context().close();
    });

    const tinaMailBefore = await raisedFor(id.tina);
    await test.step("the desk sees Maybe the same as the first and merges the second into it with a note", async () => {
      const page = await signIn(browser, DESK);
      mergeTemplate = recordActions(page, "case.merged");
      await openCase(page, dup2);
      const same = page.getByTestId("maybe-same");
      await expect(same).toContainText(`Maybe the same as “${DUP1_TITLE}”`);
      await same.getByRole("button", { name: "Merge into it" }).click();
      await page.locator(`#merge-note-${dup2}`).fill(MERGE_NOTE);
      await page.getByTestId("merge-confirm").click();
      await expect.poll(async () => (await eventsOf("case.merged", dup2)).length).toBe(1);
      expect((await eventsOf("case.merged", dup2))[0].payload).toMatchObject({ into: dup1, note: MERGE_NOTE });
      expect(await statusOf(dup2)).toBe("merged");
      expect(mergeTemplate.length, "the page sent the merge as a server action").toBeGreaterThan(0);

      await page.goto(`/${SLUG}/inbox`);
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("main").getByText(DUP1_TITLE).first()).toBeVisible();
      await expect(page.getByRole("main").getByText(DUP2_TITLE), "a merged case is off the desk").toHaveCount(0);
      await page.context().close();
    });

    await test.step("the merged raiser sees Merged into on My cases and on the case page", async () => {
      const page = await signIn(browser, TINA);
      await page.goto(`/${SLUG}/team`);
      const card = page.getByRole("article", { name: DUP2_TITLE });
      await expect(card).toContainText(`Merged into “${DUP1_TITLE}”`);
      await expect(card).toContainText("Merged");
      await openCase(page, dup2);
      await expect(page.getByTestId("case-relations").or(page.getByRole("main"))).toContainText(`Merged into “${DUP1_TITLE}”`);
      await page.context().close();
    });

    await test.step("the server refuses a chain, a merge back and a merge into a case the desk may not open, in the words it uses for a case that is not there", async () => {
      const page = await signIn(browser, DESK);
      const [template] = mergeTemplate;
      // The desk of Pia's private idea is the other desk: Quentin may not open it.
      await raise(hid2, PIA, id.pia, HID2_TITLE, OTHER, "r-tools", { body: HID2_BODY, visibility: "private" });
      const forged = await resend(page, template, { target: d3, into: hid2 });
      const missing = await resend(page, template, { target: d3, into: `${SLUG}-case-nobody` });
      expect(forged.ok, "a private case of another desk").toBe(false);
      expect(forged, "the same answer as for a case that is not there").toEqual(missing);
      expect(await eventsOf("case.merged", d3)).toHaveLength(0);

      // dup1 absorbed dup2. A merge back into dup2 would be a cycle, the same merge again a repeat, and merging dup1 itself on into another case a
      // chain (D25): all three are refused and write nothing.
      expect((await resend(page, template, { target: dup1, into: dup2 })).ok, "a merge back into the merged case").toBe(false);
      expect((await resend(page, template, { target: dup2, into: dup1 })).ok, "the same merge again").toBe(false);
      expect((await resend(page, template, { target: dup1, into: d3 })).ok, "a case that absorbed another is merged on").toBe(false);
      expect(await eventsOf("case.merged", dup1)).toHaveLength(0);
      expect(await eventsOf("case.merged", dup2), "dup2's merge is the only one that counts").toHaveLength(1);
      expect(await statusOf(dup1)).toBe("open");
      expect(await statusOf(d3)).toBe("open");
      expect(await statusOf(hid2)).toBe("open");
      await page.context().close();
    });

    // ── what a viewer may not open stays unnamed ───────────────────────────────────────────────────────────────────
    await raise(hid, MAX, id.max, HID_TITLE, DESK, "r-see", { body: HID_BODY, visibility: "private" });
    await test.step("a link from a visible case to a case private to someone else: the owner of the visible case never gets the other's title or text", async () => {
      const desk = await signIn(browser, DESK);
      await openCase(desk, nrp);
      await desk.getByTestId("pick-related").click();
      await desk.getByRole("textbox", { name: "Search by title" }).fill("Pegasus");
      await desk.getByRole("button", { name: HID_TITLE }).click();
      await expect.poll(async () => (await eventsOf("case.linked", nrp)).length).toBe(1);
      expect((await eventsOf("case.linked", nrp))[0].payload).toMatchObject({ to: hid });
      await openCase(desk, nrp);
      await expect(desk.getByTestId("case-relations"), "the desk, which may open both, sees the link by name").toContainText(`Related: “${HID_TITLE}”`);
      await desk.context().close();

      const rosa = await signIn(browser, ROSA);
      for (const path of [`/${SLUG}/cases/${nrp}`, `/${SLUG}/team`]) {
        const body = await payloadOf(rosa, path);
        expect(body, `${path}: the private title in a response`).not.toContain(HID_TITLE);
        expect(body, `${path}: the private text in a response`).not.toContain(HID_BODY);
        await expect(rosa.getByText(HID_TITLE)).toHaveCount(0);
        await expect(rosa.locator(`a[href*="${hid}"]`), `${path}: a link to the private case`).toHaveCount(0);
      }
      await rosa.context().close();
    });

    await test.step("a hidden case merged into a visible one: the visible one's raiser never gets the hidden title or text", async () => {
      const other = await signIn(browser, OTHER);
      await openCase(other, hid2);
      await other.getByTestId("pick-same").click();
      await other.getByRole("textbox", { name: "Search by title" }).fill("Setters wait");
      await other.getByRole("button", { name: DUP1_TITLE }).click();
      await other.getByTestId("merge-confirm").click();
      await expect.poll(async () => (await eventsOf("case.merged", hid2)).length).toBe(1);
      expect((await eventsOf("case.merged", hid2))[0].payload).toMatchObject({ into: dup1 });
      expect(await statusOf(hid2)).toBe("merged");
      await other.context().close();

      const max = await signIn(browser, MAX);
      for (const path of [`/${SLUG}/cases/${dup1}`, `/${SLUG}/team`]) {
        const body = await payloadOf(max, path);
        expect(body, `${path}: the hidden title in a response`).not.toContain(HID2_TITLE);
        expect(body, `${path}: the hidden text in a response`).not.toContain(HID2_BODY);
        await expect(max.getByText(HID2_TITLE)).toHaveCount(0);
        await expect(max.locator(`a[href*="${hid2}"]`), `${path}: a link to the hidden case`).toHaveCount(0);
      }
      await max.context().close();
    });

    // ── a case in a discussion ─────────────────────────────────────────────────────────────────────────────────────
    await raise(talk, TOM, id.tom, TALK_TITLE, DESK, "r-see");
    await append("case.discussion", DESK, id.desk, talk, { invited: [], missing: "Which light the standard names for the seal surface" });
    await test.step("the raiser of a case in a discussion sees Decision expected by, on My cases, on the case page and in the discussion mail", async () => {
      const page = await signIn(browser, TOM);
      await page.goto(`/${SLUG}/team`);
      await expect(page.getByRole("article", { name: TALK_TITLE })).toContainText(/Decision expected by/);
      await openCase(page, talk);
      await expect(page.getByTestId("case-answer-by")).toContainText(/Decision expected by/);
      await page.context().close();

      await expect.poll(async () => {
        await dispatchOnce();
        return (await db().outboxMessage.findMany({ where: { companyId, recipientUserId: id.tom, channel: "mail" } })).filter((m) => /Decision expected by/.test(m.text ?? "")).length;
      }, { message: "the one mail of the discussion carries the day", timeout: 45_000, intervals: [500, 1_000, 2_000] }).toBe(1);
    });

    // ── the raiser has left ────────────────────────────────────────────────────────────────────────────────────────
    await raise(gone, GINA, id.gina, GONE_TITLE, DESK, "r-see");
    await test.step("the desk sees (inactive) after the name of a raiser who left", async () => {
      const page = await signIn(browser, DESK);
      await openCase(page, gone);
      await expect(page.getByTestId("raiser-inactive")).toHaveCount(0);
      await page.context().close();

      await deactivateUser(companyId, id.gina);
      const again = await signIn(browser, DESK);
      await openCase(again, gone);
      await expect(again.getByTestId("raiser-inactive")).toHaveText("(inactive)");
      await expect(again.getByTestId("raiser-inactive").locator("..")).toContainText(GINA);
      await again.context().close();
    });

    // ── no notice of its own (D21) ─────────────────────────────────────────────────────────────────────────────────
    await test.step("no merge, link or follow-up sent a notice of its own; the sandbox sent nothing outside", async () => {
      await dispatchOnce();
      const rows = await db().outboxMessage.findMany({ where: { companyId } });
      expect(rows.length, "the loop's own mails exist").toBeGreaterThan(outboxBefore);
      for (const row of rows) expect(row.template, "a notice of a merge, a link or a follow-up").not.toMatch(/merge|link|follow/i);
      expect(await raisedFor(id.tina), "the raiser of the merged case was not mailed about the merge").toBe(tinaMailBefore);
      for (const row of rows.filter((r) => r.channel !== "inapp")) expect({ status: row.status, lastError: row.lastError }, `${row.template} (${row.channel}) on a sandbox`).toEqual({ status: "skipped", lastError: "sandbox" });
    });
  });
});
