// PIL acceptance (plan PIL, PIL-Z1): a sample company of 1,000 people is bootstrapped by the scripted command, goes
// through the Go-live checklist to the pilot stage, and produces its first report: the page, the CSV, and the weekly
// mail row. Run it through fixtures/run-pil.ts, which gives it a mail port (SMTP_URL) and a backup folder
// (BACKUP_STATUS_DIR) of its own. No real mail, directory or model: the relay is fixtures/fake-smtp.ts.
// Own company, deleted at the end, like structure.spec.ts. People are found by email, never by display name.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Browser, Page } from "@playwright/test";
import { expect, passSecondFactor, test, vis } from "../helpers";
import { parseCsv } from "../../../src/features/api/csv";
import { berlinDate, isWorkday } from "../../../src/features/clock/calendar";
import { calendarSpec } from "../../../src/features/clock";
import { translate } from "../../../src/i18n";
import { addDays, isoWeekNumber, mondayOf } from "../../../src/features/pilot/weeks";
import { getDb } from "../../../src/lib/db/client";
import { calendarOf } from "../../../prisma/generators/pilot/config";
import { createTestCompany, deleteTestCompany, emailOf } from "./company-fixture";
import { startFakeSmtp, type FakeSmtp } from "./fixtures/fake-smtp";

const STAMP = Date.now().toString(36);
const SLUG = `pil-${STAMP}`;
const OTHER = `pil2-${STAMP}`;
const OTHER_ADMIN = "Zora Quillfeather";
const NEEDED = ["structure", "routes", "calendar", "signIn", "secondFactor", "mail", "ai", "backups", "support", "agreements"] as const;
const RECOMMENDED = ["notifications", "directory", "recipients", "baseline"] as const;
const SMALL_UNIT_BELOW = 5;

// A click or a check that misses fails in half a minute, not after the whole test's time.
test.use({ actionTimeout: 30_000 });
test.skip(!process.env.DATABASE_URL, "needs DATABASE_URL (.env.local)");
test.skip(!process.env.SMTP_URL || !process.env.BACKUP_STATUS_DIR, "run it through tests/e2e/db/fixtures/run-pil.ts: it sets SMTP_URL and BACKUP_STATUS_DIR");

// The sample's people read German (members.csv, language `de`), so the pages do: expected texts come from the message catalog.
const de = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => translate("de", key, values);
type Key = Parameters<typeof translate>[1];
/** A regular expression for a catalog text: `any` names the values whose text is not known here (dates), the rest are given. */
function textLike(key: Key, given: Record<string, string | number>, any: string[]): RegExp {
  const values = { ...given, ...Object.fromEntries(any.map((k) => [k, `@@${k}@@`])) };
  let re = de(key, values).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const k of any) re = re.replace(`@@${k}@@`, ".+?");
  return new RegExp(re);
}

/** `npx tsx prisma/generators/pilot/run.ts ...` from apps/app; the child inherits the environment, mail port included. */
function pilot(...args: string[]): string {
  return execFileSync("npx", ["tsx", "prisma/generators/pilot/run.ts", ...args], {
    cwd: process.cwd(), env: process.env, encoding: "utf8", timeout: 240_000, maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32",
  });
}

/** The instant of `hour`:00 on a Berlin date, as an ISO string with its offset (summer or winter time). */
function berlinAt(date: string, hour: number): string {
  for (const offset of [1, 2]) {
    const instant = new Date(`${date}T${String(hour).padStart(2, "0")}:00:00+0${offset}:00`);
    const shown = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(instant));
    if (shown === hour && berlinDate(instant) === date) return instant.toISOString();
  }
  throw new Error(`no Berlin time ${hour}:00 on ${date}`);
}

const column = (csv: ReturnType<typeof parseCsv>, name: string) => {
  const at = csv.header.indexOf(name);
  if (at < 0) throw new Error(`no column ${name}`);
  return at;
};

async function signIn(browser: Browser, email: string, code: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/${SLUG}/login`);
  await page.locator("#code:visible").fill(code);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await passSecondFactor(page, `${SLUG}|${email}`);
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

test("PIL acceptance: bootstrap to pilot stage and first report", async ({ browser, page }) => {
  test.setTimeout(600_000);
  const work = mkdtempSync(path.join(tmpdir(), "nextup-pil-"));
  const smtpUrl = new URL(process.env.SMTP_URL ?? "");
  const backupDir = process.env.BACKUP_STATUS_DIR ?? "";
  let smtp: FakeSmtp | null = null;
  const db = getDb();
  rmSync(path.join(backupDir, "last.json"), { force: true }); // a retry starts with no backup report, like the first run

  try {
    // The sample: 1,000 people, exactly one manager, a unit under 5 people.
    const files = path.join(work, "files");
    pilot("sample", "--people", "1000", "--seed", "7", "--out", files);
    const members = parseCsv(readFileSync(path.join(files, "members.csv"), "utf8"));
    const units = parseCsv(readFileSync(path.join(files, "units.csv"), "utf8"));
    expect(members.rows).toHaveLength(1000);
    const roleAt = column(members, "app_role");
    const emailAt = column(members, "email");
    const nameAt = column(members, "name");
    const managers = members.rows.filter((r) => r[roleAt] === "manager");
    expect(managers).toHaveLength(1);
    const [managerName, managerEmail] = [managers[0][nameAt], managers[0][emailAt]];
    const memberEmail = members.rows.find((r) => r[roleAt] === "member")?.[emailAt] ?? "";
    const keyAt = column(units, "key");
    const unitNameAt = column(units, "name");
    const parentAt = column(units, "parent_key");
    const headAt = column(units, "headcount");
    const kindAt = column(units, "kind");
    const small = units.rows.filter((r) => r[kindAt] === "team" && Number(r[headAt]) < SMALL_UNIT_BELOW);
    // If the sample has no unit under 5 people, the sample (D13) is wrong: that is a blocked report, not a test to bend.
    expect(small.length, "the sample has a unit of fewer than 5 people").toBeGreaterThan(0);
    // The units in tree order: a site, then its teams, in the file's order. Team names repeat in the sample, so a unit
    // is found by its place in this order, never by its name.
    const treeOrder: { key: string; name: string }[] = [];
    const walk = (parent: string) => {
      for (const r of units.rows) if (r[parentAt] === parent) { treeOrder.push({ key: r[keyAt], name: r[unitNameAt] }); walk(r[keyAt]); }
    };
    walk("");
    const smallAt = treeOrder.findIndex((u) => u.key === small[0][keyAt]);
    expect(smallAt).toBeGreaterThanOrEqual(0);

    const config = path.join(work, "pilot.json");
    writeFileSync(config, JSON.stringify({
      slug: SLUG, name: `PIL ${STAMP}`, admin: { name: managerName, email: managerEmail },
      calendar: "de-by", promiseDays: 5, ai: { choice: "off" }, structureDir: "files",
    }));
    const codesFile = path.join(work, "codes.tsv");

    // 1. Bootstrap. Its output names every check, and every open needed check is on its last line.
    let codes = new Map<string, string>();
    await test.step("bootstrap names every check, and the open ones", async () => {
      const out = pilot("bootstrap", "--config", config, "--codes", codesFile);
      const lines = [...out.matchAll(/^\[(\w+)\] (needed|recommended) (\w+): /gm)].map((m) => ({ state: m[1], level: m[2], key: m[3] }));
      expect(lines.filter((l) => l.level === "needed").map((l) => l.key).sort()).toEqual([...NEEDED].sort());
      expect(lines.filter((l) => l.level === "recommended").map((l) => l.key).sort()).toEqual([...RECOMMENDED].sort());
      const open = lines.filter((l) => l.level === "needed" && l.state !== "done").map((l) => l.key);
      expect(open).toEqual(expect.arrayContaining(["backups", "mail", "secondFactor", "agreements"]));
      expect(out).toContain(`needed and open: ${open.join(", ")}`);
      expect(out).not.toMatch(/login code[^\n]*[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/); // the codes stay in the file
      codes = new Map(readFileSync(codesFile, "utf8").trim().split("\n").map((l) => l.split("\t") as [string, string]));
      expect(codes.size).toBe(1000);
    });

    // 2. The admin signs in: pilot is not yet possible.
    await test.step("go-live: the switch is disabled, backups unknown, another check open", async () => {
      await page.goto(`/${SLUG}/login`);
      await page.locator("#code:visible").fill(codes.get(managerEmail) ?? "");
      await page.getByRole("button", { name: "Log in", exact: true }).click();
      await passSecondFactor(page, `${SLUG}|${managerEmail}`);
      await expect(page).not.toHaveURL(/\/login/);
      await page.goto(`/${SLUG}/settings/go-live`);
      const sw = vis(page, "settings-golive-switch");
      await expect(sw).toHaveAttribute("data-to", "pilot");
      await expect(sw).toBeDisabled();
      await expect(vis(page, "settings-golive-blocked")).toBeVisible();
      await expect(vis(page, "settings-golive-check-backups")).toHaveAttribute("data-state", "unknown");
      await expect(vis(page, "settings-golive-check-mail")).not.toHaveAttribute("data-state", "done");
      await expect(vis(page, "settings-golive-check-agreements")).toHaveAttribute("data-state", "needs");
      expect(await page.locator('[data-testid^="settings-golive-check-"]:not([data-state="done"])').count()).toBeGreaterThan(1);
    });

    // 3. The backup status file and the relay appear, the admin records the agreements (the AI is off, so the DPA and
    // the works agreement are what is needed) and turns reminders on, which the move to pilot needs (#726, Q9.4, Q9.7):
    // every check the pilot gate needs is green.
    await test.step("go-live: backups, mail relay, agreements and reminders make every check the pilot needs green", async () => {
      mkdirSync(backupDir, { recursive: true });
      writeFileSync(path.join(backupDir, "last.json"), JSON.stringify({ at: new Date().toISOString(), offbox: true }));
      smtp = await startFakeSmtp(Number(smtpUrl.port));

      await vis(page, "settings-agreement-edit-dpa").click();
      await vis(page, "settings-agreement-date-dpa").fill(berlinDate(new Date()));
      await vis(page, "settings-agreement-signer-dpa").fill("Managing director");
      await vis(page, "settings-agreement-save-dpa").click();
      await expect(vis(page, "settings-agreement-dpa")).toHaveAttribute("data-state", "done");
      await vis(page, "settings-agreement-edit-works").click();
      await vis(page, "settings-agreement-notneeded-works").check();
      await vis(page, "settings-agreement-reason-works").fill("This site has no works council.");
      await vis(page, "settings-agreement-save-works").click();
      await expect(vis(page, "settings-agreement-works")).toHaveAttribute("data-state", "done");

      await page.goto(`/${SLUG}/settings/notifications`);
      await vis(page, "settings-notifications-switch").check();
      await vis(page, "settings-notifications-save").click();
      await expect(vis(page, "settings-notifications-saved")).toBeVisible();

      await page.goto(`/${SLUG}/settings/go-live`);
      await vis(page, "settings-golive-recheck").click();
      for (const key of [...NEEDED, "notifications"]) await expect(vis(page, `settings-golive-check-${key}`), key).toHaveAttribute("data-state", "done");
      await expect(vis(page, "settings-golive-switch")).toBeEnabled();
    });

    // 4. The company is still closed (a bootstrap leaves it so): Open NextUp comes before the move to pilot, with the
    // same checks. Nobody is held, so no invitation mail goes out; the move itself is the Go-live switch.
    await test.step("Open NextUp, then the switch to pilot: the admin stays signed in, the page and the history say pilot", async () => {
      // The wizard counts the Company step as done once the admin has saved it (the bootstrap writes no profile row),
      // and sends everyone to the first step not done: so it is saved here, then Open follows.
      await page.goto(`/${SLUG}/setup/company`);
      await vis(page, "setup-company-name").fill(`PIL ${STAMP}`);
      await vis(page, "setup-company-save").click();
      await expect(vis(page, "setup-next")).toBeEnabled();
      await page.goto(`/${SLUG}/setup/open`);
      await expect(vis(page, "setup-step-open")).toBeVisible();
      await expect(vis(page, "setup-open-button")).toBeEnabled();
      await vis(page, "setup-open-button").click();
      await vis(page, "setup-open-dialog").getByRole("button", { name: de("settingsSetupOpen.dialogConfirm"), exact: true }).click();
      await expect(vis(page, "setup-open-opened")).toBeVisible({ timeout: 30_000 });
      await page.goto(`/${SLUG}/settings/go-live`);
      await vis(page, "settings-golive-switch").click();
      const dialog = vis(page, "settings-golive-dialog");
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: de("settingsGoLive.switchToPilot"), exact: true }).click();
      await expect(vis(page, "settings-golive-notice")).toContainText(de("settingsGoLive.toastPilot", { company: `PIL ${STAMP}` }));
      await page.reload();
      await expect(page).toHaveURL(new RegExp(`/${SLUG}/settings/go-live`)); // not the sign-in
      await expect(page.locator('[data-testid="settings-golive-track"] [data-stage="pilot"]')).toHaveAttribute("aria-current", "step");
      await expect(vis(page, "settings-golive")).toContainText(`${de("settingsGoLive.stagePilot")}.`);
      await expect(vis(page, "settings-golive-switch")).toHaveAttribute("data-to", "sandbox");
      await expect(vis(page, "settings-golive-history")).toContainText(de("settingsGoLive.historyMove", { from: de("settingsGoLive.stageSandbox"), to: de("settingsGoLive.stagePilot") }));
    });

    // 5. The pilot report: week 1, four tiles, the small unit hidden, units in tree order, the CSV.
    let csvText = "";
    await test.step("the pilot report: week 1, four tiles, 'Too few to show', tree order, CSV", async () => {
      await page.goto(`/${SLUG}/settings/pilot-report`);
      const week = isoWeekNumber(mondayOf(berlinDate(new Date())));
      await expect(page.getByRole("main").getByText(textLike("settingsPilotReport.lead", { week, n: 1 }, ["from", "to"]))).toBeVisible();
      const tiles = vis(page, "pilot-tiles").locator("[data-tile]");
      await expect(tiles).toHaveCount(4);
      expect(await tiles.evaluateAll((els) => els.map((e) => e.getAttribute("data-tile")))).toEqual(["casesPer10", "firstReasonedAnswer", "withinPromisePct", "participationPct"]);

      const table = vis(page, "pilot-units");
      const rows = table.getByRole("row").filter({ has: page.getByRole("cell") });
      await expect(rows).toHaveCount(treeOrder.length);
      // The first cell's text starts with its column's name (shown on a narrow screen); the unit's own name follows.
      const labels = await rows.evaluateAll((els) => els.map((e) => e.querySelector('[role="cell"]')?.textContent?.trim() ?? ""));
      expect(labels.map((l) => l.replace(de("settingsPilotReport.colUnit"), ""))).toEqual(treeOrder.map((u) => u.name));
      await expect(rows.nth(smallAt).getByTestId("too-few-to-show")).toContainText(de("settingsPilotReport.tooFewToShow"));

      const download = page.waitForEvent("download");
      await page.getByRole("link", { name: de("settingsPilotReport.downloadCsv") }).click();
      const file = await download;
      expect(file.suggestedFilename()).toMatch(new RegExp(`^${SLUG}-pilot-report-\\d{4}-\\d{2}-\\d{2}-\\d{4}-\\d{2}-\\d{2}\\.csv$`));
      const saved = path.join(work, "report.csv");
      await file.saveAs(saved);
      csvText = readFileSync(saved, "utf8");
      const csv = parseCsv(csvText);
      const hiddenAt = column(csv, "hidden");
      const unitAt = column(csv, "unit");
      const rowAt = column(csv, "row");
      // The unit rows follow the tree order too: the small unit's row is hidden and its numbers are empty.
      const unitRows = csv.rows.filter((r) => r[rowAt] === "unit");
      expect(unitRows.map((r) => r[unitAt])).toEqual(treeOrder.map((u) => u.name));
      const hiddenRow = unitRows[smallAt];
      expect(hiddenRow[hiddenAt]).toBe(de("settingsPilotReport.csvHiddenReason"));
      expect(hiddenRow.slice(hiddenAt + 1).every((c) => c === ""), "its numbers are empty").toBe(true);

      // The print view of the same week.
      await page.goto(`/${SLUG}/settings/pilot-report/print?week=${mondayOf(berlinDate(new Date()))}`);
      await expect(page.getByRole("heading", { name: de("settingsPilotReport.title") })).toBeVisible();
      await expect(page.getByText(textLike("settingsPilotReport.printFooter", {}, ["date"]))).toBeVisible();
    });
    expect(csvText.length).toBeGreaterThan(0);

    // 6. The weekly mail, on the first working day of next week at 08:00 Berlin.
    await test.step("report: one pilot.report row for the admin, a second run adds none", async () => {
      const calendar = calendarSpec(calendarOf("de-by"));
      let day = addDays(mondayOf(berlinDate(new Date())), 7);
      while (!isWorkday(day, calendar)) day = addDays(day, 1);
      const now = berlinAt(day, 8);
      const company = await db.company.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
      const admin = await db.user.findFirstOrThrow({ where: { companyId: company.id, email: { equals: managerEmail, mode: "insensitive" } }, select: { id: true } });
      const rows = () => db.outboxMessage.findMany({ where: { companyId: company.id, template: "pilot.report" } });

      expect(pilot("report", "--slug", SLUG, "--now", now)).toContain("1 outbox row(s) written");
      const first = await rows();
      expect(first).toHaveLength(1);
      expect(first[0].recipientUserId).toBe(admin.id);
      expect(first[0].key).toMatch(new RegExp(`^pilot:\\d{4}-W\\d{2}:${admin.id}$`));
      expect(first[0].status).toBe("pending");
      expect(pilot("report", "--slug", SLUG, "--now", now)).toContain("0 outbox row(s) written");
      expect(await rows()).toHaveLength(1);
    });

    // 7. Others get not found: a member of this company, and the admin of another company.
    await test.step("a member and another company's admin get not found on both pages, the CSV and the print view", async () => {
      const other = await createTestCompany({
        slug: OTHER, name: `PIL other ${STAMP}`, template: "empty", stage: "sandbox",
        people: [{ name: OTHER_ADMIN, role: "manager", dept: "Other", email: emailOf(OTHER_ADMIN, OTHER) }],
      });
      const member = await signIn(browser, memberEmail, codes.get(memberEmail) ?? "");
      const stranger = await (await browser.newContext()).newPage();
      await stranger.goto(`/${OTHER}/login`);
      await stranger.locator("#code:visible").fill(other.get(OTHER_ADMIN) ?? "");
      await stranger.getByRole("button", { name: "Log in", exact: true }).click();
      await passSecondFactor(stranger, `${OTHER}|${OTHER_ADMIN}`);
      await expect(stranger).not.toHaveURL(/\/login/);

      const monday = mondayOf(berlinDate(new Date()));
      // Not a member's or a stranger's page: the proxy and the settings layout turn them away before the pages' own
      // notFound() is reached (a member goes to their home, a person not signed in to this company to its login), and a
      // request that follows no redirect sees a redirect or a 404 - never the report, the checklist or the CSV.
      const paths = [`/${SLUG}/settings/go-live`, `/${SLUG}/settings/pilot-report`, `/${SLUG}/settings/pilot-report/print?week=${monday}`, `/${SLUG}/settings/pilot-report/export`];
      for (const [name, who] of [["member", member], ["stranger", stranger]] as const) {
        for (const url of paths) {
          const res = await who.request.get(url, { maxRedirects: 0 });
          const status = res.status();
          expect(status === 404 || (status >= 300 && status < 400), `${name} ${url}: ${status}`).toBe(true);
          expect(res.headers()["content-type"] ?? "", `${name} ${url}`).not.toContain("text/csv");
        }
        for (const url of paths.slice(0, 3)) {
          await who.goto(url);
          expect(new URL(who.url()).pathname, `${name} ${url} lands elsewhere`).not.toBe(url.split("?")[0]);
          await expect(who.getByTestId("pilot-tiles")).toHaveCount(0);
          await expect(who.getByTestId("settings-golive")).toHaveCount(0);
        }
      }
    });
  } finally {
    const open = smtp as FakeSmtp | null;
    if (open) await open.close();
    await deleteTestCompany(SLUG);
    await deleteTestCompany(OTHER);
    rmSync(work, { recursive: true, force: true });
  }
});
