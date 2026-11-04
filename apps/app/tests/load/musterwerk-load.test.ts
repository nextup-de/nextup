// TST-L1 (D8): a Musterwerk of TST_ACCOUNTS people (default 2,000; the proof and CI use 200), every leader and
// manager on the inbox and everyone on the cases they may open, against the built app. Budget: p95 < 1 s for both
// pages, errors < 1 %, no response over 2 MB. The figures are printed and written to test-results/load/.
// TST_KEEP=1 keeps the company afterwards (the k6 run of record needs it).
import { mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Role } from "@/config/roles";
import { getDb } from "@/lib/db/client";
import { mayOpen } from "@/lib/db/viewer-log";
import { generateMusterwerk } from "../../prisma/generators/musterwerk";
import { BUDGET, formatReport, overBudget, runLoad, selectAccounts, type Selection } from "./driver";

const SLUG = "tstload";
const ACCOUNTS = Math.max(150, Number(process.env.TST_ACCOUNTS) || 2000);
const BASE = process.env.TST_BASE_URL ?? `http://127.0.0.1:${Number(process.env.TST_PORT) || 3103}`;
// Working-day concurrency: one account in forty is on a page at any moment. TST_VUS overrides it.
const VUS = Number(process.env.TST_VUS) || Math.max(5, Math.ceil(ACCOUNTS / 40));
// Everyone at once (a shift change, a mail to all). Used to saturate one Node process: TST-FL1-1 in docs/test-phase/findings/TST-L1.md.
const STRESS_VUS = Number(process.env.TST_STRESS_VUS) || ACCOUNTS;
// Everyone at once asks for about 100 requests per second, which takes about five free cores of page rendering plus the driver, the proxy and
// Postgres. A machine with fewer than eight logical cores (a 4 vCPU CI runner) cannot host that and skips it, as the k6 run on a named machine
// does not run in CI either; TST_STRESS=1 runs it anyway, and a TST_BASE_URL run is always asked (the server is elsewhere).
const STRESS_HOST = availableParallelism() >= 8 || process.env.TST_STRESS === "1" || Boolean(process.env.TST_BASE_URL);
const DURATION = Number(process.env.TST_DURATION_S) || 60;

describe("TST acceptance: 2,000 accounts within budget", () => {
  let selection: Selection;

  beforeAll(async () => {
    if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET is not set");
    // The generator steps the clock for every company in the database: only ever on a throwaway one.
    if (!process.env.TST_BASE_URL && !/_test(\b|$|\?)/.test(process.env.DATABASE_URL ?? "")) throw new Error("DATABASE_URL must name a *_test database");
    await generateMusterwerk(getDb(), { slug: SLUG, people: ACCOUNTS, weeks: 2, seed: 1, now: new Date(), replace: true });
    selection = await selectAccounts({ slug: SLUG, secret: process.env.AUTH_SECRET });
  });

  afterAll(async () => {
    if (!process.env.TST_KEEP) await getDb().company.deleteMany({ where: { slug: SLUG } });
    await getDb().$disconnect();
  });

  async function within(vus: number, file: string, seconds: number) {
    const report = await runLoad({ baseUrl: BASE, slug: SLUG, accounts: selection.accounts, vus, durationSeconds: seconds });
    const text = formatReport(report);
    console.log(text);
    mkdirSync("test-results/load", { recursive: true });
    writeFileSync(`test-results/load/${file}.json`, JSON.stringify(report, null, 2));
    writeFileSync(`test-results/load/${file}.txt`, `${text}\n`);
    expect(overBudget(report), `budget p95<${BUDGET.p95Ms} ms, errors<${BUDGET.maxErrorRate * 100} %\n${text}`).toEqual([]);
  }

  it("inbox and case pages stay within the budget at the given accounts", async () => {
    // Every leader and manager is on the inbox; members join for the cases they raised or may otherwise open.
    const leaders = await getDb().user.count({ where: { companyId: selection.companyId, active: true, role: { in: ["leader", "manager"] } } });
    expect(selection.accounts.filter((a) => a.inbox)).toHaveLength(leaders);
    expect(selection.accounts.length).toBeGreaterThan(leaders);
    expect(selection.accounts.some((a) => a.inbox)).toBe(true);
    expect(selection.accounts.some((a) => a.cases.length > 0)).toBe(true);

    // The cases picked really are ones the account may open (mayOpen is what the case page asks).
    const checked = selection.accounts.filter((a) => a.cases.length > 0).slice(0, 5);
    for (const a of checked) {
      expect(await mayOpen(selection.companyId, { userId: a.userId, role: a.role as Role }, a.cases[0])).toBe(true);
    }

    await within(VUS, "figures", DURATION);
  });

  // TST-FL1-1 (fixed): the pages used to queue beyond about 15 requests per second. Company reads are kept for a few seconds
  // (COMPANY_CACHE_MS) and the app runs as several processes; see docs/test-phase/findings/TST-L1.md.
  it.skipIf(!STRESS_HOST)("TST-FL1-1: every account on a page at once stays within the budget", async () => {
    await within(STRESS_VUS, "figures-stress", 30);
  });
});
