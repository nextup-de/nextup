// FX4: the raise page's "Who sees it" goes with the case. In demo mode the log is in this browser, so the test
// reads the raised event from there.
import type { Page } from "@playwright/test";
import { answerCoach, answerRail, DEVELOP, DEVELOP_MORE, expect, publishIdea, publishTo, raiseLine, test } from "../helpers";

/** The payload of the case.raised event with this title, from the log in localStorage. */
const raisedPayload = (page: Page, title: string) =>
  page.evaluate((wanted) => {
    for (const key of Object.keys(localStorage)) {
      const text = localStorage.getItem(key) ?? "";
      if (!text.includes("case.raised") || !text.includes(wanted)) continue;
      const parsed: unknown = JSON.parse(text);
      const found: Record<string, unknown>[] = [];
      const walk = (v: unknown) => {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object") {
          const o = v as Record<string, unknown>;
          if (o.type === "case.raised") found.push(o);
          Object.values(o).forEach(walk);
        }
      };
      walk(parsed);
      const hit = found.find((e) => JSON.stringify(e.payload).includes(wanted));
      if (hit) return hit.payload as Record<string, unknown>;
    }
    return null;
  }, title);

test("a case raised as Private is stored as private", async ({ page }) => {
  const title = "Night shift rota is decided without the team";
  await page.goto("/acme/raise");
  await raiseLine(page, title);
  // The choice sits in the chat's composer.
  const whoSees = page.getByRole("button", { name: "Who sees it" }).first();
  await whoSees.click();
  await page.getByRole("button", { name: "Private", exact: true }).click();
  await page.keyboard.press("Escape"); // a backdrop covers the page while the menu is open
  await answerCoach(page, DEVELOP);
  await answerCoach(page, DEVELOP_MORE);
  await answerRail(page);
  await publishTo(page, "T. Vogel");
  await expect.poll(() => raisedPayload(page, "Night shift rota")).toMatchObject({ visibility: "private" });
});

test("a case raised without touching the choice carries none", async ({ page }) => {
  const title = "Locker room on line 2 has no working light";
  await page.goto("/acme/raise");
  await publishIdea(page, title);
  await expect(page.getByText(/’s desk/).first()).toBeVisible();
  const payload = await expect.poll(() => raisedPayload(page, "Locker room")).not.toBeNull().then(() => raisedPayload(page, "Locker room"));
  expect(payload?.visibility).toBeUndefined();
});
