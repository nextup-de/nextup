// POST /api/client-errors is public, so its gate is tested from outside: another site, an oversized
// or broken body never get counted; a same-origin report does (204). And a real script error in a
// page reaches it on its own. Plain @playwright/test, not ../helpers: that one fails a test on any
// page error, and the last test throws one on purpose.
import { expect, test } from "@playwright/test";

const report = { name: "TypeError", message: "x is not a function", stack: "", path: "/acme/raise" };

test.describe("POST /api/client-errors", () => {
  test("refuses another site and anything that isn't a small JSON report", async ({ request }) => {
    const cross = await request.post("/api/client-errors", { data: report, headers: { "sec-fetch-site": "cross-site" } });
    expect(cross.status()).toBe(403);

    const big = await request.post("/api/client-errors", {
      data: { ...report, stack: "x".repeat(20_000) },
      headers: { "sec-fetch-site": "same-origin" },
    });
    expect(big.status()).toBe(413);

    const broken = await request.post("/api/client-errors", { data: "{not json", headers: { "sec-fetch-site": "same-origin", "content-type": "text/plain" } });
    expect(broken.status()).toBe(400);

    const wrongShape = await request.post("/api/client-errors", { data: { message: 42 }, headers: { "sec-fetch-site": "same-origin" } });
    expect(wrongShape.status()).toBe(400);
  });

  test("counts a same-origin report", async ({ request }) => {
    const res = await request.post("/api/client-errors", { data: report, headers: { "sec-fetch-site": "same-origin" } });
    expect(res.status()).toBe(204);
  });

  test("a page's uncaught error is sent on its own", async ({ page }) => {
    await page.goto("/acme/login");
    const sent = page.waitForRequest((r) => r.url().endsWith("/api/client-errors") && r.method() === "POST");
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error("e2e check 12345");
      });
    });
    const body = JSON.parse((await sent).postData() ?? "{}") as typeof report;
    expect(body).toMatchObject({ name: "Error", message: "e2e check 12345", path: "/acme/login" });
  });
});
