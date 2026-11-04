// TST-L1 (D8): a Musterwerk of TST_ACCOUNTS people (default 2,000; the proof and CI use 200), every leader and
// manager on the inbox and everyone on the cases they may open, against the built app. Budget: p95 < 1 s for both
// pages, errors < 1 %, no response over 2 MB. The figures are printed and written to test-results/load/.
// TST_KEEP=1 keeps the company afterwards (the k6 run of record needs it).
import { mkdirSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Role } from "@/config/roles";
import { getDb } from "@/lib/db/client";
import { mayOpen } from "@/lib/db/viewer-log";
import { generateMusterwerk } from "../../prisma/generators/musterwerk";
import { BUDGET, formatReport, overBudget, runLoad, selectAccounts, type Selection } from "./driver";

const SLUG = "tstload";
const ACCOUNTS = Math.max(150, Number(process.env.TST_ACCOUNTS) || 2000);
const BASE = process.env.TST_BASE_URL ?? `http://127.0.0.1:${Number(process.env.TST_PORT) || 3103}`;
const VUS = Number(process.env.TST_VUS) || Math.min(200, ACCOUNTS);
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

  it("inbox and case pages stay within the budget at the given accounts", async () => {
    expect(selection.accounts.length).toBeGreaterThanOrEqual(Math.floor(ACCOUNTS * 0.9));
    expect(selection.accounts.some((a) => a.inbox)).toBe(true);
    expect(selection.accounts.some((a) => a.cases.length > 0)).toBe(true);

    // The cases picked really are ones the account may open (mayOpen is what the case page asks).
    const checked = selection.accounts.filter((a) => a.cases.length > 0).slice(0, 5);
    for (const a of checked) {
      expect(await mayOpen(selection.companyId, { userId: a.userId, role: a.role as Role }, a.cases[0])).toBe(true);
    }

    const report = await runLoad({ baseUrl: BASE, slug: SLUG, accounts: selection.accounts, vus: VUS, durationSeconds: DURATION });
    const text = formatReport(report);
    console.log(text);
    mkdirSync("test-results/load", { recursive: true });
    writeFileSync("test-results/load/figures.json", JSON.stringify(report, null, 2));
    writeFileSync("test-results/load/figures.txt", text + "\n");
    expect(overBudget(report), `budget p95<${BUDGET.p95Ms} ms, errors<${BUDGET.maxErrorRate * 100} %\n${text}`).toEqual([]);
  });
});
