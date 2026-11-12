// TST acceptance: the proof flows of the test phase, through the browser, on a Musterwerk (TST-Z1).
//
// Local run: generates a small Musterwerk in beforeAll (codes file in a temp dir), runs the flows, deletes it.
// Remote run: with TST_BASE_URL set the same flows run against that server, on a company the runbook
// already generated (docs/test-phase/README.md, "Remote mode"):
//   TST_BASE_URL   the stack's URL            TST_SLUG        its company slug
//   TST_CODES_FILE the generator's --codes    DATABASE_URL    the SSH tunnel to its Postgres (reads who sits where)
// A stack runs TENANT_MODE=single, so its addresses carry no slug; TST_TENANT_MODE=path is for a path-mode server.
// A remote run leaves the company in place; it only adds the cases it raises.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, Page } from "@playwright/test";
import { confirmSheet, expect, passSecondFactor, publishIdea, test } from "../helpers";
import { getDb } from "../../../src/lib/db/client";
import { generateMusterwerk } from "../../../prisma/generators/musterwerk";

const REMOTE = process.env.TST_BASE_URL?.replace(/\/+$/, "") ?? "";
const SLUG = REMOTE ? (process.env.TST_SLUG ?? "") : `tst-${Date.now().toString(36)}`;
const PREFIX = REMOTE && process.env.TST_TENANT_MODE !== "path" ? "" : `/${SLUG}`;
const PEOPLE = 80;
const STAMP = Date.now().toString(36);
const TITLE = `Presse 4 verliert Oeldruck nach dem Anfahren ${STAMP}`;

test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL (the test database, or the tunnel to the remote stack)");
test.skip(!!REMOTE && (!SLUG || !process.env.TST_CODES_FILE), "remote mode needs TST_SLUG and TST_CODES_FILE");
if (REMOTE) test.use({ baseURL: REMOTE });

type Who = { id: string; name: string; email: string; role: string };
const codes = new Map<string, string>(); // email -> login code
let dir = "";
let companyId = "";
let raiser: Who;
let owner: Who;
let deputy: Who;
let outsider: Who;
let manager: Who;
let handedTitle = "";
let handedId = "";
let caseId = "";
let smallUnitId = "";

const url = (path: string) => `${PREFIX}${path}`;

/** A fresh browser (own cookies) signed in as one person with their personal code. */
async function signIn(browser: Browser, who: Who): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(url("/login"));
  await page.locator("#code").fill(codes.get(who.email) ?? "");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await passSecondFactor(page, `${SLUG}|${who.email}`);
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

async function who(where: object): Promise<Who> {
  const u = await getDb().user.findFirstOrThrow({ where: { companyId, active: true, ...where }, orderBy: { id: "asc" }, select: { id: true, name: true, email: true, role: true } });
  return u;
}

async function holderOf(roleTitle: string): Promise<Who> {
  const h = await getDb().orgRoleHolder.findFirstOrThrow({ where: { companyId, role: { title: roleTitle } }, select: { userId: true } });
  return who({ id: h.userId ?? "" });
}

test.describe.serial("TST acceptance: Musterwerk scenario suite", () => {
  test.beforeAll(async () => {
    const db = getDb();
    if (REMOTE) {
      for (const line of readFileSync(process.env.TST_CODES_FILE!, "utf8").split("\n")) {
        const [email, code] = line.split("\t");
        if (email && code) codes.set(email.trim(), code.trim());
      }
      companyId = (await db.company.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } })).id;
    } else {
      dir = mkdtempSync(join(tmpdir(), "tst-musterwerk-"));
      const file = join(dir, "codes.tsv");
      companyId = (await generateMusterwerk(db, { slug: SLUG, people: PEOPLE, weeks: 2, seed: 7, now: new Date(), codesFile: file })).companyId;
      for (const line of readFileSync(file, "utf8").split("\n")) {
        const [email, code] = line.split("\t");
        if (email && code) codes.set(email, code);
      }
    }

    // Who sits where: the maintenance route's owner and deputy seats, a member of a team in Werk Nord,
    // a member of Werk Sued, and the managing director.
    const route = await db.routingRule.findFirstOrThrow({ where: { companyId, key: "maintenance" }, select: { ownerRoleId: true, deputyRoleId: true } });
    const holder = async (roleId: string | null) => who({ id: (await db.orgRoleHolder.findFirstOrThrow({ where: { companyId, roleId: roleId! }, select: { userId: true } })).userId! });
    owner = await holder(route.ownerRoleId);
    deputy = await holder(route.deputyRoleId);
    raiser = await who({ role: "member", dept: "nord-production-a" });
    outsider = await who({ role: "member", dept: { startsWith: "sued-" } });
    manager = await holderOf("Geschäftsführer");

    // A hand-over the scheduler or the history wrote, with its case title.
    const handed = await db.caseEvent.findFirstOrThrow({ where: { companyId, type: "case.handed" }, orderBy: { seq: "desc" } });
    handedId = handed.targetId ?? "";
    const to = (handed.payload as { toRoleHolderId?: string }).toRoleHolderId;
    const toUser = await db.orgRoleHolder.findFirstOrThrow({ where: { companyId, id: to ?? "" }, select: { userId: true } });
    deputy = await who({ id: toUser.userId! });
    const raised = await db.caseEvent.findFirstOrThrow({ where: { companyId, type: "case.raised", targetId: handedId } });
    handedTitle = (raised.payload as { title: string }).title;

    // A unit below five people, for the dashboard.
    const small = await db.orgUnit.findFirst({ where: { companyId, headcount: { lt: 5, gt: 0 } }, select: { id: true } });
    smallUnitId = small?.id ?? "";
  });

  test.afterAll(async () => {
    if (!REMOTE) {
      await getDb().company.deleteMany({ where: { slug: SLUG } });
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the generated company is what the suite expects: sandbox stage, AI off, every person has a code", async () => {
    const company = await getDb().company.findUniqueOrThrow({ where: { id: companyId }, include: { config: true } });
    expect(company.name).toBe("Musterwerk GmbH");
    expect(company.stage).toBe("sandbox");
    expect(company.config?.aiRouting).toBe(false);
    for (const p of [raiser, owner, deputy, outsider, manager]) expect(codes.has(p.email), p.email).toBe(true);
  });

  test("a member raises a case and it lands on the owner desk of the route", async ({ browser }) => {
    const member = await signIn(browser, raiser);
    await expect(member).toHaveURL(new RegExp(`${PREFIX}/raise$`));
    await publishIdea(member, TITLE, "Leiter Instandhaltung Werk Nord");

    const raised = await getDb().caseEvent.findFirstOrThrow({ where: { companyId, type: "case.raised", payload: { path: ["title"], equals: TITLE } } });
    caseId = raised.targetId ?? "";
    expect(raised.actorUserId).toBe(raiser.id);
  });

  test("the owner desk answers with a question, the member answers, the desk decides yes", async ({ browser }) => {
    const desk = await signIn(browser, owner);
    await desk.goto(url("/leader"));
    const row = desk.getByRole("main").getByText(TITLE).first();
    await expect(row).toBeVisible();
    await row.click();
    await desk.getByRole("button", { name: "Ask a question" }).click();
    await confirmSheet(desk, "Which shift, and since when does the pressure drop?", "Send the question");

    const member = await signIn(browser, raiser);
    await member.goto(url("/team"));
    await member.getByRole("button", { name: `Answer ${owner.name}` }).click();
    await confirmSheet(member, "Late shift, since Monday.", "Send the answer");

    await desk.reload();
    await expect(desk.getByRole("main").getByText(TITLE).first()).toBeVisible();
    await desk.getByRole("button", { name: "Yes, do it" }).click();
    await desk.getByRole("dialog", { name: "Yes, do it" }).getByRole("button", { name: "Say yes and open the draft" }).click();

    await member.reload();
    await expect(member.getByRole("article", { name: TITLE })).toContainText("Approved");
  });

  test("a deputy sees a case that was handed over to their seat", async ({ browser }) => {
    const page = await signIn(browser, deputy);
    await page.goto(url("/leader"));
    await expect(page.getByRole("main").getByText(handedTitle).first()).toBeVisible();
    const open = await page.request.get(url(`/cases/${handedId}`));
    expect(open.status()).toBe(200);
  });

  test("a manager sees the dashboard with the small units hidden", async ({ browser }) => {
    test.skip(!smallUnitId, "this Musterwerk has no unit below five people");
    const page = await signIn(browser, manager);
    await page.goto(url("/dashboard?period=quarter"));
    await expect(page.getByRole("main")).toBeVisible();
    // The small unit is left out of the breakdown; one line counts what is not shown.
    await expect(page.getByTestId("dashboard-hidden-count")).toBeVisible();
    await page.goto(url(`/dashboard?period=quarter&unit=${smallUnitId}`));
    // Scoped to the small unit: one sentence, and no tile or chart with a number.
    await expect(page.getByTestId("dashboard-scope-hidden")).toBeVisible();
    await expect(page.locator('[data-testid^="dashboard-tile-"]')).toHaveCount(0);
    await expect(page.getByTestId("dashboard-trend")).toHaveCount(0);
  });

  test("a member of another unit cannot open the case", async ({ browser }) => {
    const page = await signIn(browser, outsider);
    // A streamed not-found can still answer 200, so the proof is what the page and its payload carry.
    await page.goto(url(`/cases/${caseId}`));
    await expect(page.getByText(TITLE)).toHaveCount(0);
    await page.goto(url("/team"));
    await expect(page.getByText(TITLE)).toHaveCount(0);
    const body = await page.request.get(url(`/cases/${caseId}`));
    expect(await body.text()).not.toContain(TITLE);
    // The owner, by contrast, gets the case from the same address.
    const desk = await signIn(browser, owner);
    expect(await (await desk.request.get(url(`/cases/${caseId}`))).text()).toContain(TITLE);
  });
});
