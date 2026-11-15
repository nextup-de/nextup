// Phone width (runs in the "phone" project only, Pixel 7): every page a person reaches fits the
// screen - nothing scrolls sideways - and publishing an idea works with a thumb.
import { addPages, expect, publishIdea, test } from "../helpers";

const PAGES = ["/acme/raise", "/acme/team", "/acme/overview", "/acme/inbox", "/acme/dashboard", "/acme/feed", "/acme/problems", "/acme/projects/pj2"];

for (const path of PAGES) {
  test(`${path} fits a phone screen`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "pixels the page is wider than the screen").toBeLessThanOrEqual(1);
  });
}

test("publishing an idea works on a phone", async ({ page }) => {
  await page.goto("/acme/raise");
  await publishIdea(page, "Locker room on line 2 has no working light since Monday");
  await expect(page.getByText(/’s desk/).first()).toBeVisible();
});

test("on a phone a card is dragged by its grip: up its column, then across into Doing", async ({ page }) => {
  await page.goto("/acme");
  await page.getByRole("button", { name: "Dev" }).click();
  await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: "Manager", exact: true }).click();
  await page.keyboard.press("Escape");
  // A project starts with its Idea and Files; pages are added from the sidebar, at laptop width.
  const phone = page.viewportSize()!;
  await page.setViewportSize({ width: 1280, height: 800 });
  await addPages(page, "/acme/projects/pj2", ["Steps"]);
  await page.setViewportSize(phone);
  await page.goto("/acme/projects/pj2?tab=board");
  const todo = page.getByRole("group", { name: "To do" });
  const card = "Retire the paper job sheet at Ulm";
  const grip = page.getByRole("button", { name: "Move step: " + card, exact: true });
  await expect(grip).toBeVisible();
  await todo.scrollIntoViewIfNeeded(); // the mouse works in screen coordinates: the column has to be on screen

  // Up: hold the grip and drop it on the top half of the first card.
  const from = (await grip.boundingBox())!;
  const first = (await todo.getByRole("article").first().boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + 40, first.y + 8, { steps: 8 });
  await page.mouse.up();
  await expect(todo.getByRole("article").first()).toContainText(card);

  // Into Doing: on a phone the columns stack, so the card is held and the page scrolled until Doing is under the finger.
  const doing = page.getByRole("group", { name: "Doing" });
  await grip.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const g = (await grip.boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  const height = page.viewportSize()!.height;
  for (let k = 0; k < 20 && ((await doing.boundingBox())?.y ?? height) > height / 2; k++) await page.mouse.wheel(0, 200);
  const target = (await doing.boundingBox())!; // anywhere on the column drops into it
  await page.mouse.move(target.x + 40, Math.max(target.y + 20, 140), { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("group", { name: "Doing" }).getByRole("article").filter({ hasText: card })).toHaveCount(1);
});
