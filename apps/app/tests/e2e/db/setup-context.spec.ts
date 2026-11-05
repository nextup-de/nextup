// The company context draft on setup's Company step, on the real server (docs/COMPANY_KNOWLEDGE.md). No Microsoft and
// no model is called: the connection below holds nothing usable, so a started run finds nothing and fails on the
// server's own scheduler, and a ready draft is written straight to the table. tests/db/context-run.test.ts has the
// run itself, with the mock provider.
import type { Browser, Page } from "@playwright/test";
import { getDb } from "../../../src/lib/db/client";
import { expect, passSecondFactor, test, vis } from "../helpers";
import { createTestCompany, deleteTestCompany } from "./company-fixture";

const STAMP = Date.now().toString(36);
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL (.env.local)");

const DRAFT = {
  sources: [
    { id: "S1", title: "Leitbild.pdf", url: "https://sp.example/leitbild.pdf" },
    { id: "S2", title: "Strategy 2026.docx", url: "https://sp.example/strategy.docx" },
  ],
  fields: {
    vision: { text: "Proposed vision", sources: ["S1"] },
    mission: { text: "Proposed mission", sources: ["S2"] },
  },
};

async function company(tag: string): Promise<{ slug: string; id: string; userId: string; page: (b: Browser) => Promise<Page> }> {
  const slug = `ctx-${tag}-${STAMP}`;
  const name = "Wilhelmina Quarterfoil";
  const made = await createTestCompany({
    slug, name: `Context ${tag}`, template: "empty", stage: "sandbox",
    people: [{ name, email: `w@${slug}.test`, role: "manager", dept: "Management" }],
  });
  const db = getDb();
  const row = await db.company.findUniqueOrThrow({ where: { slug }, select: { id: true } });
  const user = await db.user.findFirstOrThrow({ where: { companyId: row.id }, select: { id: true } });
  return {
    slug, id: row.id, userId: user.id,
    page: async (browser) => {
      const page = await (await browser.newContext()).newPage();
      await page.goto(`/${slug}/login`);
      await page.locator("#code:visible").fill(made.get(name) ?? "");
      await page.getByRole("button", { name: "Log in", exact: true }).click();
      await passSecondFactor(page, `${slug}|${name}`);
      await expect(page).not.toHaveURL(/\/login/);
      return page;
    },
  };
}

/** Everything a run needs but a real source and model: the switch, the AI choice, the agreement, a connection. */
async function usable(c: { id: string; userId: string }) {
  const db = getDb();
  await db.companyConfig.update({ where: { companyId: c.id }, data: { m365Search: true, dpaSignedAt: new Date() } });
  await db.integration.create({ data: { companyId: c.id, system: "ai", on: true, settings: { choice: "openai-compatible", model: "m", endpoint: "https://llm.example" } } });
  await db.connection.create({ data: { companyId: c.id, userId: c.userId, provider: "m365", scopes: [], refreshTokenSealed: "nothing usable" } });
}

const errorsOn = (page: Page) => {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
};

test.describe.serial("the company context draft", () => {
  const slugs: string[] = [];
  test.afterAll(async () => { for (const s of slugs) await deleteTestCompany(s); });

  test("with no source and no AI, the panel says so and setup goes on", async ({ browser }) => {
    const c = await company("off");
    slugs.push(c.slug);
    const page = await c.page(browser);
    const errors = errorsOn(page);
    await page.goto(`/${c.slug}/setup/company`);
    await expect(vis(page, "setup-context")).toHaveAttribute("data-status", "notUsed");
    await expect(vis(page, "setup-context-not-used")).toContainText("Settings → Company");
    await expect(page.getByTestId("setup-context-start")).toHaveCount(0);

    await vis(page, "setup-company-save").click();
    await expect(page.getByRole("status").filter({ hasText: /saved/i })).toBeVisible();
    await page.reload();
    await vis(page, "setup-next").click();
    await expect(page).toHaveURL(/\/setup\/units/);
    expect(errors).toEqual([]);
    await page.context().close();
  });

  test("the start waits for the person's own account, runs on the scheduler, and a failure says why", async ({ browser }) => {
    test.setTimeout(150_000);
    const c = await company("run");
    slugs.push(c.slug);
    const page = await c.page(browser);
    const errors = errorsOn(page);
    const db = getDb();
    await db.companyConfig.update({ where: { companyId: c.id }, data: { m365Search: true, dpaSignedAt: new Date() } });
    await db.integration.create({ data: { companyId: c.id, system: "ai", on: true, settings: { choice: "openai-compatible", model: "m", endpoint: "https://llm.example" } } });

    await page.goto(`/${c.slug}/setup/company`);
    await expect(vis(page, "setup-context")).toHaveAttribute("data-status", "idle");
    await expect(vis(page, "setup-context-start")).toBeDisabled();
    await expect(vis(page, "setup-context-connect")).toBeVisible();

    await db.connection.create({ data: { companyId: c.id, userId: c.userId, provider: "m365", scopes: [], refreshTokenSealed: "nothing usable" } });
    await page.reload();
    await vis(page, "setup-context-start").click();
    await expect(vis(page, "setup-context-running")).toBeVisible();
    expect((await db.companyContextRun.findUnique({ where: { companyId: c.id } }))?.startedById).toBe(c.userId);

    // The page comes back by itself: nothing could be searched, so the run ends without calling a model.
    await expect(vis(page, "setup-context-failed")).toBeVisible({ timeout: 90_000 });
    const run = await db.companyContextRun.findUnique({ where: { companyId: c.id } });
    expect(run?.status).toBe("failed");
    expect(run?.error).toBe("no_hits");
    expect(await db.aiCall.count({ where: { companyId: c.id } })).toBe(0);
    await expect(vis(page, "setup-context-start")).toBeEnabled();
    expect(errors).toEqual([]);
    await page.context().close();
  });

  test("a draft is reviewed field by field, and nothing is stored before Save", async ({ browser }, info) => {
    const c = await company("review");
    slugs.push(c.slug);
    await usable(c);
    const db = getDb();
    await db.companyProfile.create({ data: { companyId: c.id, vision: "Old vision", mission: "Old mission", principles: ["Old principle"], businessModel: "Old model", complianceRules: "Old rules" } });
    const now = new Date();
    await db.companyContextRun.create({ data: { companyId: c.id, status: "ready", startedById: c.userId, startedAt: now, finishedAt: now, mailedAt: now, draft: DRAFT } });

    const page = await c.page(browser);
    const errors = errorsOn(page);
    await page.goto(`/${c.slug}/setup/company`);
    await expect(vis(page, "setup-context")).toHaveAttribute("data-status", "ready");
    const vision = vis(page, "setup-context-field-vision");
    await expect(vision).toContainText("Now in the profile: Old vision");
    await expect(vision.getByRole("link", { name: "Leitbild.pdf" })).toHaveAttribute("href", DRAFT.sources[0].url);
    await expect(vis(page, "setup-context-field-mission").getByRole("link", { name: "Strategy 2026.docx" })).toBeVisible();
    await expect(vis(page, "setup-context-save")).toBeDisabled();
    await page.screenshot({ path: info.outputPath("review-desktop.png"), fullPage: true });

    // Below the phone breakpoint: nothing runs off the side.
    await page.setViewportSize({ width: 390, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("review-phone.png"), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 800 });

    // Accepting is not saving.
    await vis(page, "setup-context-accept-vision").click();
    await vis(page, "setup-context-text-vision").fill("Proposed vision, edited");
    expect((await db.companyProfile.findUnique({ where: { companyId: c.id } }))?.vision).toBe("Old vision");

    // Leaving with an accepted field asks first.
    await vis(page, "setup-next").click();
    await expect(vis(page, "setup-unsaved")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.mouse.click(5, 5);

    await vis(page, "setup-context-save").click();
    await expect.poll(async () => (await db.companyProfile.findUnique({ where: { companyId: c.id } }))?.vision).toBe("Proposed vision, edited");
    const saved = await db.companyProfile.findUnique({ where: { companyId: c.id } });
    expect(saved).toMatchObject({ mission: "Old mission", principles: ["Old principle"], businessModel: "Old model", complianceRules: "Old rules" });

    // What was saved has left the review; the rest is still there to decide.
    await expect(page.getByTestId("setup-context-field-vision")).toHaveCount(0);
    await expect(vis(page, "setup-context-field-mission")).toBeVisible();

    // Discarding the rest removes its text and leaves the profile.
    await vis(page, "setup-context-discard").click();
    await expect(vis(page, "setup-context-settled")).toBeVisible();
    expect((await db.companyContextRun.findUnique({ where: { companyId: c.id } }))?.draft).toBeNull();
    expect((await db.companyProfile.findUnique({ where: { companyId: c.id } }))?.mission).toBe("Old mission");
    expect(errors).toEqual([]);
    await page.context().close();
  });
});
