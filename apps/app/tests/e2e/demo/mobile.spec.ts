// Phone width (runs in the "phone" project only, Pixel 7): every page a person reaches fits the
// screen - nothing scrolls sideways - and publishing an idea works with a thumb.
import { expect, publishIdea, test } from "../helpers";

const PAGES = ["/acme/raise", "/acme/team", "/acme/overview", "/acme/leader", "/acme/dashboard", "/acme/ideas", "/acme/problems", "/acme/projects/pj2"];

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
  await page.goto("/acme/projects/pj2");
  const todo = page.getByRole("group", { name: "To do" });
  const card = "Retire the paper job sheet at Ulm";
  const grip = page.getByRole("button", { name: "Drag “" + card + "”" });
  await expect(grip).toBeVisible();
  await todo.scrollIntoViewIfNeeded(); // the mouse works in screen coordinates: the column has to be on screen

  // Up: hold the grip and drop it on the top half of the first card.
  const from = (await grip.boundingBox())!;
  const first = (await todo.getByRole("article").first().boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + 40, first.y + 8, { steps: 8 });
  await page.mouse.up();
  await expect(todo.getByRole("article").first()).toHaveAccessibleName(card);

  // Across: held at the board's right edge the columns scroll along until Doing is under the finger.
  await grip.scrollIntoViewIfNeeded();
  const g = (await grip.boundingBox())!;
  const board = (await todo.boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  const width = page.viewportSize()!.width;
  const doing = page.getByRole("group", { name: "Doing" });
  for (let k = 0; k < 60 && ((await doing.boundingBox())?.x ?? width) > width / 3; k++) await page.mouse.move(width - 20 - (k % 2), board.y + 60);
  const target = (await doing.boundingBox())!;
  await page.mouse.move(Math.max(target.x + 40, 30), board.y + 60, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole("group", { name: "Doing" }).getByRole("article", { name: card })).toHaveCount(1);
});
