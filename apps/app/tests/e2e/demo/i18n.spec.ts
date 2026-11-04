// LNG acceptance: with the locale de, every page of the demo suite renders in German. The page
// files are read from disk, so a new page must be put in the table below (or left out with a reason).
// Seed and demo content (case titles, personas) is data and may be English; only catalog texts are checked.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { de } from "../../../src/i18n/de";
import { en } from "../../../src/i18n/en";
import { test, expect } from "../helpers";

type Route = {
  /** The page file, relative to src/app, with forward slashes. */
  file: string;
  /** The address, with acme for [company] and ids from the acme seed. */
  path: string;
  /** Where the page ends when the role home redirects. Defaults to `path`. */
  lands?: string;
  /** The person to view it as (the dev-panel switch the other specs use). */
  as?: "Employee" | "Team leader" | "Manager";
};

const CASE = "c1"; // acme seed: the first case
const PERSON = "u2"; // acme seed: the team leader (user id)

const ROUTES: Route[] = [
  { file: "[company]/(app)/page.tsx", path: "/acme", lands: "/acme/raise" },
  { file: "[company]/(app)/raise/page.tsx", path: "/acme/raise" },
  { file: "[company]/(app)/team/page.tsx", path: "/acme/team" },
  { file: "[company]/(app)/profile/page.tsx", path: "/acme/profile" },
  { file: "[company]/(app)/reports/page.tsx", path: "/acme/reports" },
  { file: "[company]/(app)/people/[userId]/page.tsx", path: `/acme/people/${PERSON}` },
  { file: "[company]/(app)/projects/page.tsx", path: "/acme/projects" },
  { file: "[company]/(app)/projects/[projectId]/page.tsx", path: "/acme/projects/pj2" },
  { file: "[company]/(app)/leader/page.tsx", path: "/acme/leader", as: "Team leader" },
  { file: "[company]/(app)/cases/[caseId]/page.tsx", path: `/acme/cases/${CASE}`, as: "Manager" },
  { file: "[company]/(app)/dashboard/page.tsx", path: "/acme/dashboard", as: "Manager" },
  { file: "[company]/(app)/manager/page.tsx", path: "/acme/manager", lands: "/acme/dashboard", as: "Manager" },
  { file: "[company]/(app)/overview/page.tsx", path: "/acme/overview", as: "Manager" },
  { file: "[company]/(app)/collaboration/page.tsx", path: "/acme/collaboration", as: "Manager" },
  { file: "[company]/(app)/feed/page.tsx", path: "/acme/feed", as: "Manager" },
  { file: "[company]/(app)/decisions/page.tsx", path: "/acme/decisions", as: "Manager" },
  { file: "[company]/(app)/ideas/page.tsx", path: "/acme/ideas", as: "Manager" },
  { file: "[company]/(app)/problems/page.tsx", path: "/acme/problems", as: "Manager" },
  { file: "[company]/(app)/progress/page.tsx", path: "/acme/progress", as: "Manager" },
  { file: "[company]/login/page.tsx", path: "/acme/login" },

  { file: "demo/(app)/page.tsx", path: "/demo", lands: "/demo/raise" },
  { file: "demo/(app)/login/page.tsx", path: "/demo/login", lands: "/demo/raise" },
  { file: "demo/(app)/raise/page.tsx", path: "/demo/raise" },
  { file: "demo/(app)/team/page.tsx", path: "/demo/team" },
  { file: "demo/(app)/profile/page.tsx", path: "/demo/profile" },
  { file: "demo/(app)/projects/page.tsx", path: "/demo/projects" },
  { file: "demo/(app)/projects/[projectId]/page.tsx", path: "/demo/projects/pj2" },
  { file: "demo/(app)/leader/page.tsx", path: "/demo/leader", as: "Team leader" },
  { file: "demo/(app)/cases/[caseId]/page.tsx", path: `/demo/cases/${CASE}`, as: "Manager" },
  { file: "demo/(app)/dashboard/page.tsx", path: "/demo/dashboard", as: "Manager" },
  { file: "demo/(app)/manager/page.tsx", path: "/demo/manager", lands: "/demo/dashboard", as: "Manager" },
  { file: "demo/(app)/overview/page.tsx", path: "/demo/overview", as: "Manager" },
  { file: "demo/(app)/collaboration/page.tsx", path: "/demo/collaboration", as: "Manager" },
  { file: "demo/(app)/feed/page.tsx", path: "/demo/feed", as: "Manager" },
  { file: "demo/(app)/ideas/page.tsx", path: "/demo/ideas", as: "Manager" },
  { file: "demo/(app)/problems/page.tsx", path: "/demo/problems", as: "Manager" },
  { file: "demo/(app)/progress/page.tsx", path: "/demo/progress", as: "Manager" },
];

/** Pages not in the table, and why. */
const LEFT_OUT: Record<string, string> = {
  "[company]/(app)/settings/page.tsx": "settings need a database and a signed-in manager",
  "[company]/(app)/dashboard/kpis/page.tsx": "the KPI report needs a database and a signed-in manager",
  "[company]/(app)/settings/company/page.tsx": "settings need a database and a signed-in manager",
  "[company]/(app)/settings/rules/page.tsx": "settings need a database and a signed-in manager",
  "[company]/(app)/settings/import-export/page.tsx": "settings need a database and a signed-in manager",
  "[company]/(app)/settings/calendar/page.tsx": "settings need a database and a signed-in manager",
  "[company]/(app)/settings/members/page.tsx": "settings need a database and a signed-in manager",
  "[company]/(app)/settings/routing/page.tsx": "settings need a database and a signed-in manager",
  "[company]/(app)/settings/org/page.tsx": "settings need a database and a signed-in manager",
  "[company]/(app)/settings/notifications/page.tsx": "settings need a database and a signed-in manager",
  "[company]/(app)/settings/audit/page.tsx": "settings need a database and a signed-in manager",
  "[company]/(app)/settings/privacy/page.tsx": "settings need a database and a signed-in manager",
  "[company]/(app)/settings/api-tokens/page.tsx": "settings need a database and a signed-in manager",
  "[company]/(app)/settings/webhooks/page.tsx": "settings need a database and a signed-in manager",
  "[company]/(app)/settings/areas/page.tsx": "settings need a database and a signed-in manager",
  "[company]/(app)/settings/areas/[key]/poster/page.tsx": "settings need a database and a signed-in manager",
  "[company]/(app)/settings/areas/devices/page.tsx": "settings need a database and a signed-in manager",
  "[company]/(app)/settings/setup/page.tsx": "settings need a database and a signed-in manager",
  "[company]/(app)/exports/[id]/page.tsx": "the export page needs a database and the person the export was made for",
  "[company]/floor/[area]/page.tsx": "floor pages need a database (areas, devices) and a phone session",
  "[company]/floor/[area]/sign-in/page.tsx": "floor pages need a database (areas, devices) and a phone session",
  "[company]/floor/sent/page.tsx": "floor pages need a database (areas, devices) and a phone session",
  "[company]/floor/pair/page.tsx": "floor pages need a database (areas, devices) and a phone session",
  "[company]/floor/status/page.tsx": "floor pages need a database (areas, devices) and a phone session",
};

function pageFilesOf(dir: string, match: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) pageFilesOf(full, match, out);
    else if (match.test(name)) out.push(full);
  }
  return out;
}
const pageFiles = (dir: string) => pageFilesOf(dir, /^page\.tsx$/);

const APP = join(__dirname, "../../../src/app");
const clean = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

// Demo and seed content is data and stays English (LNG D9). A catalog text that the data also says word for
// word (a role such as "Team lead") cannot tell a leak from the data, so it is no sentinel.
const SRC = join(__dirname, "../../../src");
const DATA_FILES = [
  "features/ideas/brief.ts", // builds the English case brief from demo cases; no catalog text
  "features/ideas/brief-demo.ts",
  "features/ideas/demo-script.ts",
  "features/ideas/demo-loop.ts",
  "features/ideas/static-demo-briefs.ts",
];
function dataText(): string {
  const files = pageFilesOf(join(SRC, "features/demo"), /\.tsx?$/).concat(DATA_FILES.map((f) => join(SRC, f)).filter((f) => existsSync(f)));
  return clean(files.map((f) => readFileSync(f, "utf8")).join(" "));
}

/** Catalog texts of two or more words, without a placeholder, that German words differently. */
function sentinels(): string[] {
  const out = new Set<string>();
  const data = dataText();
  const enCat = en as unknown as Record<string, Record<string, string>>;
  const deCat = de as unknown as Record<string, Record<string, string>>;
  for (const ns of Object.keys(enCat)) {
    for (const [key, value] of Object.entries(enCat[ns])) {
      if (typeof value !== "string" || value.includes("{")) continue;
      if (clean(value).split(" ").length < 2) continue;
      if (clean(deCat[ns]?.[key] ?? "") === clean(value)) continue;
      if (data.includes(clean(value))) continue;
      out.add(clean(value));
    }
  }
  return [...out];
}

/** Whole words only: "team lead" is not "team leader". */
function containsWords(text: string, needle: string): boolean {
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) {
    const before = text[at - 1] ?? " ";
    const after = text[at + needle.length] ?? " ";
    if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) return true;
  }
  return false;
}

test.describe("LNG acceptance: every route renders in German without an English fallback", () => {
  test("every page file is in the route table or left out with a reason", () => {
    const files = pageFiles(join(APP, "[company]")).concat(pageFiles(join(APP, "demo")))
      .map((f) => relative(APP, f).replace(/\\/g, "/"));
    const known = new Set([...ROUTES.map((r) => r.file), ...Object.keys(LEFT_OUT)]);
    expect(files.filter((f) => !known.has(f)), "page files neither in ROUTES nor in LEFT_OUT").toEqual([]);
    expect([...known].filter((f) => !files.includes(f)), "table entries without a page file").toEqual([]);
  });

  const words = sentinels();

  for (const route of ROUTES) {
    test(route.path, async ({ page, context }) => {
      await context.addCookies([{ name: "nextup_locale", value: "de", domain: "localhost", path: "/" }]);
      if (route.as) {
        // Switch person on the company's home, then open the page as that person.
        await page.goto("/" + route.path.split("/")[1]);
        await page.getByRole("button", { name: "Dev" }).click();
        await page.getByRole("dialog", { name: "Demo controls" }).getByRole("button", { name: route.as, exact: true }).click();
        await page.keyboard.press("Escape");
      }
      await page.goto(route.path);
      const end = (route.lands ?? route.path).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      await expect(page).toHaveURL(new RegExp(end + "$"));
      await expect(page.locator("html")).toHaveAttribute("lang", "de");
      await expect(page.getByRole("main")).toBeVisible();
      await page.waitForLoadState("networkidle");
      const text = clean(await page.evaluate(() => document.body.innerText));
      const found = words.find((w) => containsWords(text, w));
      const at = found ? text.indexOf(found) : 0;
      expect(found, `${route.path} shows the English catalog text «${found}» (…${text.slice(Math.max(0, at - 60), at + 80)}…)`).toBeUndefined();
    });
  }

  test("the language switch on the profile page turns a page without a cookie to German", async ({ page }) => {
    await page.goto("/acme/profile");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.getByRole("radio", { name: "Deutsch" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
  });
});
