// The raise page with the model's reading (docs/IDEAS.md): the demo suite has no brain, so the idea turn
// answers from here, in the route's own events. With a reading the page shows it and says it is the AI's; with
// none, or when a reading stops coming, it says the rules checked it; a slow answer shows it is on its way, and
// a message cut off by a reload comes back. What the reading itself says is services/brain's test.
import type { Page, Route } from "@playwright/test";
import { aiMessages, ANSWER, expect, START, test } from "../helpers";

type Dials = { value: number; feasibility: number; cost: number; fit: number; risk: number };
const reading = (d: Dials, open: string[]) => ({
  dials: (Object.keys(d) as (keyof Dials)[]).map((key) => ({ key, score: d[key], note: `The ${key} note from the model.`, basis: `What would move ${key}.` })),
  overall: 50, summary: "The summary from the model.", advice: "pilot", advice_why: "The advice from the model.",
  pattern: "The pattern from the model.", route_id: null, route_reason: "", same_as: null, related: null, open,
  model: "test", version: "t1", similar: [{ id: "x1", title: "An earlier item from the model", status: "open", same: false }], checked: 7,
});
const PARTS = ["fit", "impact", "feasibility", "clarity"].map((id) => ({ id, label: id, value: 40, found: [], missing: ["Which company goal does it serve?"] }));
const sse = (reply: string, r: ReturnType<typeof reading> | null) => [
  ["scores", { overall: r?.overall ?? 40, parts: PARTS, sameAs: null, threshold: 70, delta: null, replies: [], reading: r }],
  ["text", { text: reply }],
  ["done", { text: reply, overall: r?.overall ?? 40 }],
].map(([event, data]) => `event: ${String(event)}\ndata: ${JSON.stringify(data)}\n\n`).join("");

/** The next answers of the idea turn, in order; `wait` holds one back that long. */
function answers(page: Page, list: { reply: string; read: ReturnType<typeof reading> | null; wait?: number }[]) {
  return page.route("**/ideas/turn", async (route: Route) => {
    const next = list.shift();
    if (!next) return route.abort();
    if (next.wait) await new Promise((r) => setTimeout(r, next.wait));
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: sse(next.reply, next.read) }).catch(() => undefined); // the page may be gone
  });
}
const Q1 = "How many minutes does it save?", Q2 = "Who decides this on line 3?";
const LOW: Dials = { value: 20, feasibility: 25, cost: 45, fit: 30, risk: 40 }, HIGH: Dials = { ...LOW, value: 65, fit: 70 };
const full = (page: Page) => page.getByRole("group", { name: "Full analysis" });

async function raise(page: Page, text = "Book the test rig by slot") {
  await page.goto("/acme/raise");
  await page.getByRole("textbox", { name: START }).fill(text);
  await page.getByRole("button", { name: "Ask NextUp" }).click();
}
async function say(page: Page, text: string) {
  const box = page.getByRole("textbox", { name: ANSWER });
  await box.fill(text);
  await box.press("Enter");
}

test("with a reading: the dials, what it found and each question once, then what the answer moved", async ({ page }) => {
  await answers(page, [{ reply: "First reply.", read: reading(LOW, [Q1, Q2]) }, { reply: "Second reply.", read: reading(HIGH, [Q2]) }]);
  await raise(page);

  await expect(aiMessages(page).first()).toContainText("First reply.");
  await expect(full(page)).toContainText("What the AI found");
  await expect(full(page)).toContainText("The summary from the model.");
  await expect(full(page)).toContainText("The advice from the model.");
  await expect(full(page)).toContainText("The pattern from the model.");
  await expect(full(page)).toContainText("An earlier item from the model");
  await expect(full(page)).toContainText("Open"); // the status in the page's words, not the case's own code
  await expect(full(page)).not.toContainText("Checked by rules");
  await expect(page.getByRole("group", { name: "Still unclear" }).getByText(Q1)).toHaveCount(1);
  await expect(page.getByRole("group", { name: "Still unclear" })).not.toContainText(Q1.replace("?", "") + "How");

  await say(page, "About 20 minutes per changeover on every shift.");
  const read = page.getByRole("group", { name: "AI analysis" });
  await expect(read).toContainText("The value note from the model.");
  await expect(read).toContainText("The fit note from the model.");
  await expect(read).not.toContainText("The cost note"); // it did not move
  await expect(full(page)).toContainText("20"); // the first reply stands as it was read
  // What it asked before stays: reworded or answered, the page cannot tell, so no tick.
  const asked = page.getByRole("group", { name: "Asked" });
  await expect(asked).toContainText(Q1);
  await expect(asked.getByLabel("Answered")).toHaveCount(0);

  await page.getByRole("button", { name: "View full analysis" }).click();
  await expect(page.getByText("AI suggestions only. You make the decision.")).toBeVisible();
});

test("no reading: the page says the rules checked it and claims no AI", async ({ page }) => {
  await answers(page, [{ reply: "First reply.", read: null }, { reply: "Second reply.", read: null }]);
  await raise(page);

  await expect(full(page)).toContainText("Checked by rules - no AI answered");
  await expect(full(page)).not.toContainText("What the AI found");
  await say(page, "About 20 minutes per changeover on every shift.");
  await expect(aiMessages(page).last()).toContainText("Second reply.");
  await expect(page.getByRole("group", { name: "Checked by rules" })).toBeVisible();
  await expect(page.getByRole("group", { name: "AI analysis" })).toHaveCount(0);
  await page.getByRole("button", { name: "View full analysis" }).click();
  await expect(page.getByText("AI suggestions only. You make the decision.")).toHaveCount(0);
});

test("reading, none, reading: each reply says who answered it and the dials compare across the gap", async ({ page }) => {
  await answers(page, [
    { reply: "First reply.", read: reading(LOW, [Q1, Q2]) },
    { reply: "Rules reply.", read: null },
    { reply: "Third reply.", read: reading(HIGH, [Q2]) },
  ]);
  await raise(page);
  await expect(aiMessages(page).first()).toContainText("First reply.");

  await say(page, "An answer the rules read.");
  await expect(aiMessages(page).last()).toContainText("Rules reply.");
  await expect(page.getByRole("group", { name: "Checked by rules" })).toBeVisible();
  await expect(full(page)).toContainText("What the AI found"); // the first reply was the model's, and stays so
  await expect(full(page)).toContainText("The summary from the model.");
  await expect(full(page)).not.toContainText("checks improved");

  await say(page, "An answer the model reads again.");
  await expect(aiMessages(page).last()).toContainText("Third reply.");
  const read = page.getByRole("group", { name: "AI analysis" });
  await expect(read).toContainText("The value note from the model."); // moved since the last reading
  await expect(read).not.toContainText("did not move");
});

test("none, then the first reading: nothing to compare, and the page does not say nothing moved", async ({ page }) => {
  await answers(page, [{ reply: "First reply.", read: null }, { reply: "Second reply.", read: reading(HIGH, [Q2]) }]);
  await raise(page);
  await expect(full(page)).toContainText("Checked by rules");
  await say(page, "An answer the model reads.");
  await expect(aiMessages(page).last()).toContainText("Second reply.");
  await expect(page.getByRole("group", { name: "AI analysis" })).toContainText("for the first time");
  await expect(full(page)).toContainText("Checked by rules"); // the first reply was the rules'
});

test("a slow answer shows it is on its way, and nothing can be sent meanwhile", async ({ page }) => {
  await answers(page, [{ reply: "First reply.", read: reading(LOW, [Q1]) }, { reply: "Second reply.", read: reading(HIGH, []), wait: 6_000 }]);
  await raise(page);
  await expect(aiMessages(page).first()).toContainText("First reply.");

  await say(page, "About 20 minutes per changeover.");
  await expect(page.getByLabel("NextUp is typing")).toContainText("Reading your answer.");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await expect(aiMessages(page).last()).toContainText("Second reply.", { timeout: 20_000 });
  await expect(page.getByLabel("NextUp is typing")).toHaveCount(0);
});

test("leaving during the wait and coming back finds the message still on its way", async ({ page }) => {
  await answers(page, [{ reply: "First reply.", read: reading(LOW, [Q1]) }, { reply: "Second reply.", read: reading(HIGH, []), wait: 6_000 }]);
  await raise(page);
  await expect(aiMessages(page).first()).toContainText("First reply.");

  await say(page, "Sent, then off to the feed.");
  await page.getByRole("link", { name: "Feed" }).click();
  await expect(page).toHaveURL(/\/acme\/feed/);
  await page.getByRole("link", { name: "Ideas" }).click();
  await expect(page).toHaveURL(/\/acme\/raise/);
  await expect(page.getByText("Sent, then off to the feed.")).toBeVisible();
  await expect(page.getByLabel("NextUp is typing")).toBeVisible();
  await expect(aiMessages(page).last()).toContainText("Second reply.", { timeout: 20_000 });
});

test("a reload during the wait puts the message back in the box", async ({ page }) => {
  await answers(page, [{ reply: "First reply.", read: reading(LOW, [Q1]) }, { reply: "Never seen.", read: null, wait: 20_000 }]);
  await raise(page);
  await expect(aiMessages(page).first()).toContainText("First reply.");

  await say(page, "Sent, then the page reloads.");
  await expect(page.getByLabel("NextUp is typing")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: ANSWER })).toHaveValue("Sent, then the page reloads.");
});

test("a reload during the first wait: the idea is back on the start page and leaves no empty draft", async ({ page }) => {
  await answers(page, [{ reply: "Never seen.", read: null, wait: 20_000 }]);
  await raise(page, "An idea cut off by a reload");
  await expect(page.getByRole("region", { name: "Evaluating" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: START })).toHaveValue("An idea cut off by a reload");
  await expect(page.getByText("Untitled idea")).toHaveCount(0);
});

test("the reading stays after a reload, from what was kept with the turn", async ({ page }) => {
  await answers(page, [{ reply: "First reply.", read: reading(LOW, [Q1]) }, { reply: "Second reply.", read: reading(HIGH, [Q2]) }]);
  await raise(page);
  await expect(aiMessages(page).first()).toContainText("First reply.");
  await say(page, "About 20 minutes per changeover.");
  await expect(aiMessages(page).last()).toContainText("Second reply.");

  await page.reload();
  await expect(aiMessages(page).last()).toContainText("Second reply.");
  await expect(full(page)).toContainText("What the AI found");
  await expect(page.getByRole("group", { name: "AI analysis" })).toContainText("The value note from the model.");
  await expect(page.getByRole("group", { name: "Still unclear" })).toContainText(Q2);
});

test.describe("in German", () => {
  test.use({ locale: "de-DE" });
  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ name: "nextup_locale", value: "de", domain: "localhost", path: "/" }]);
  });

  test("the page's own words are German with a reading and without", async ({ page }) => {
    await answers(page, [{ reply: "Erste Antwort.", read: reading(LOW, [Q1]) }, { reply: "Regeln.", read: null }]);
    await page.goto("/acme/raise");
    await page.getByRole("textbox", { name: /Teile eine Idee/ }).fill("Prüfstand nach Slots buchen");
    await page.getByRole("button", { name: "NextUp fragen" }).click();
    await expect(full(page).or(page.getByRole("group", { name: "Vollständige Analyse" })).first()).toContainText("Das hat die KI gefunden");

    const box = page.getByRole("textbox", { name: /Antworte oder ergänze/ });
    await box.fill("Etwa 20 Minuten pro Umrüstung.");
    await box.press("Enter");
    await expect(page.getByRole("group", { name: "Nach Regeln geprüft" })).toBeVisible();
  });
});
