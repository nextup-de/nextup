// Small steps both suites repeat. Locators go by role and visible text - what a person sees -
// so a class rename never breaks a test, and a changed label does (which is worth knowing).
import { test as base, expect, type Locator, type Page } from "@playwright/test";

/** `test` with one extra rule: any uncaught error in the page fails the test, not only a wrong assertion. */
export const test = base.extend<{ failOnPageError: void }>({
  failOnPageError: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await use();
      expect(errors, "uncaught errors in the page").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

/** A test id's visible element: for a moment after a load the streamed page holds a hidden second copy, which strict mode refuses. */
export const vis = (from: Page | Locator, id: string) => from.getByTestId(id).filter({ visible: true });

// What the second message adds so any one-line idea clears the publish line (docs/IDEAS.md): a
// goal, a number, who it reaches, why, and a first step with no spend.
export const DEVELOP_MORE = "Thomas Vogel owns it and checks the slot plan every Monday; if the rig is needed for a customer test, our day moves, it is never dropped.";
// The usual first answer. Publishing waits until every point on the rail is answered (answerRail).
export const DEVELOP = "It serves the changeover goal: setup waits cost about 20 minutes per changeover on every shift, because the team waits for a slot. First step: a one-week pilot on line 3, no spend needed.";

// The raise page (docs/IDEAS.md): the start composer, the chat composer, and the window that asks
// who should get a published idea.
export const START = "Share an idea that would make work better…";
export const ANSWER = "Answer, or add more detail…";
export const aiMessages = (page: Page) => page.locator('[data-role="ai"]');

// The evaluation under the first message plays only until the coach answers. Without the brain the
// offline coach answers in a few milliseconds, so the next reply is held back this long for it to be seen.
export const holdNextReply = (page: Page, ms = 1_500) =>
  page.route("**/ideas/turn", async (route) => { await new Promise((r) => setTimeout(r, ms)); await route.continue(); }, { times: 1 });

/**
 * Raise one line from the start page and wait for the coach's first answer. NextUp evaluates it,
 * and may open its analysis of that first answer: closed again here, so the chat is in front.
 */
export async function raiseLine(page: Page, title: string) {
  await page.getByRole("textbox", { name: START }).fill(title);
  await page.getByRole("button", { name: "Ask NextUp" }).click();
  const close = page.getByRole("button", { name: "Close analysis" });
  const answer = page.getByRole("textbox", { name: ANSWER });
  await expect(close.or(answer).first()).toBeVisible({ timeout: 30_000 });
  if (await close.isVisible()) await close.click();
  await expect(aiMessages(page).first()).toBeVisible({ timeout: 30_000 });
}

/**
 * Send an answer to the coach and wait for its reply. On a live stack the reply shows while it
 * streams, but Enter is ignored until it is stored - Send turns on then, so wait for that first.
 */
export async function answerCoach(page: Page, text: string) {
  const before = await aiMessages(page).count();
  const box = page.getByRole("textbox", { name: ANSWER });
  await box.fill(text);
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled({ timeout: 30_000 });
  await box.press("Enter");
  await expect(aiMessages(page)).toHaveCount(before + 1, { timeout: 30_000 });
}

/**
 * The raise page's sidebar starts closed: opened first for what lives there (Publish idea, Analysis, the drafts, ...).
 * Open already: nothing to do. Right after a reload the first click can land before the page is hydrated, so it tries again.
 */
export async function showSidebar(page: Page) {
  const show = page.getByRole("button", { name: "Show sidebar" });
  await expect(async () => {
    if (await show.isVisible()) await show.click();
    await expect(show).toBeHidden({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

/**
 * "Publish idea", the last look before it goes out (its preview window) and "Choose a desk",
 * then "Where should it go?": pick the desk whose title or holders name `to`, or find it under "Choose another desk".
 * Waits until the case is raised (the chat offers "Open the case").
 * An already open preview goes straight on.
 */
export async function publishTo(page: Page, to: string) {
  const look = page.getByRole("dialog", { name: "Last look before it goes out" });
  if (!(await look.isVisible())) {
    await showSidebar(page);
    await page.getByRole("button", { name: "Publish idea" }).click();
  }
  await look.getByRole("button", { name: /Choose a desk/ }).click({ timeout: 30_000 });
  const who = page.getByRole("dialog", { name: "Where should it go?" });
  await expect(who).toBeVisible({ timeout: 30_000 });
  const offered = who.getByRole("radio").filter({ hasText: to }); // by its text: no pattern built from the name
  if (await offered.count()) await offered.first().click();
  else {
    const other = who.getByTestId("raise-desk-other").getByRole("button").first(); // the search usually starts closed
    if ((await other.getAttribute("aria-expanded")) !== "true") await other.click();
    await who.getByRole("textbox").fill(to);
    await who.getByRole("button").filter({ hasText: to }).first().click();
  }
  await who.getByTestId("raise-send").click();
  await expect(who.getByTestId("raise-sent")).toBeVisible({ timeout: 30_000 });
  await who.getByRole("button", { name: "Close", exact: true }).last().click(); // the footer's
  await expect(page.getByRole("link", { name: "Open the case" })).toBeVisible({ timeout: 30_000 });
}

/**
 * Publish an idea from the member home: the one line, DEVELOP and DEVELOP_MORE as the answers to the coach, then
 * publish it to `to` (the team lead in the demo). Waits until the case is raised.
 */
export async function publishIdea(page: Page, title: string, to = "T. Vogel") {
  await raiseLine(page, title);
  await answerCoach(page, DEVELOP);
  await answerCoach(page, DEVELOP_MORE);
  await answerRail(page);
  await publishTo(page, to);
}

// Plain answers for the points the rail still asks: each one checks off the point being asked (answeredOf).
const RAIL_ANSWERS = [
  "The team lead of line 3 decides it; it needs no budget beyond our own hours.",
  "We measure it on the weekly report: waiting minutes per changeover, before and after.",
  "It reaches the eight people of the late shift on line 3 first.",
  "If it does not help within two weeks we stop and go back to the old plan.",
];

/**
 * Publishing waits until the rail is done (components/ideas/Raise.tsx, railDone): answer the point the coach
 * is asking until none is open or being asked. A precise idea needs no extra answer, a vague one several.
 */
export async function answerRail(page: Page) {
  const open = page.locator('[data-rail-seg][data-s="open"], [data-rail-seg][data-s="active"]');
  for (let i = 0; i < 20 && (await open.count()) > 0; i++) await answerCoach(page, RAIL_ANSWERS[i % RAIL_ANSWERS.length]);
  await expect(open).toHaveCount(0);
}

/** The sheet that opens for "No, and why", "Ask a question", "Answer …". */
export const sheet = (page: Page) => page.getByRole("dialog").filter({ has: page.locator("textarea") });

/** Type into the open sheet and press its confirm button. */
export async function confirmSheet(page: Page, text: string, confirm: string) {
  await sheet(page).locator("textarea").fill(text);
  await page.getByRole("button", { name: confirm }).click();
  await expect(sheet(page)).toBeHidden();
}

// Managers sign in with a second factor (ADM-E1). Secrets of people who enrolled in this run, by key.
const totpSecrets = new Map<string, string>();

/**
 * After the code step: if the page asks for an authenticator code, answer it. A manager who has not
 * enrolled yet sees the key as text; we read it, confirm with the code it gives, and remember it.
 */
export async function passSecondFactor(page: Page, who: string) {
  const field = page.locator("#totp");
  const next = page.waitForURL((url) => !/\/login/.test(url.pathname), { timeout: 15_000 }).then(() => "in", () => "stuck");
  const asked = field.waitFor({ timeout: 15_000 }).then(() => "totp", () => "none");
  if ((await Promise.race([next, asked])) === "in") return;
  await field.waitFor();
  let secret = totpSecrets.get(who);
  if (!secret) {
    const shown = await page.locator("code").first().innerText();
    secret = shown.replace(/\s+/g, "");
    totpSecrets.set(who, secret);
  }
  const { totpAt } = await import("../../src/features/auth/totp");
  await field.fill(totpAt(secret, Date.now()));
  await page.locator("form button[type=submit]").last().click();
}

/** Demo mode: the id of the case raised with this title, from the log in this browser's localStorage. */
export const raisedCaseId = (page: Page, title: string) =>
  page.evaluate((wanted) => {
    for (const key of Object.keys(localStorage)) {
      const text = localStorage.getItem(key) ?? "";
      if (!text.includes("case.raised") || !text.includes(wanted)) continue;
      const found: Record<string, unknown>[] = [];
      const walk = (v: unknown) => {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object") {
          const o = v as Record<string, unknown>;
          if (o.type === "case.raised") found.push(o);
          Object.values(o).forEach(walk);
        }
      };
      walk(JSON.parse(text) as unknown);
      const hit = found.find((e) => JSON.stringify(e.payload).includes(wanted));
      if (hit && typeof hit.target === "string") return hit.target;
    }
    return null;
  }, title);
