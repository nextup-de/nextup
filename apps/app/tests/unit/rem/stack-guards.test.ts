// REM-O1 (B1): two guards of the stack (plan REM, Q9.5 and Q10.15). A platform job never moves a company out of demo or sandbox on a stack that serves other companies, and a
// retention run that failed two nights in a row is seen: in the report /api/health gives and on the company's Data and privacy page.
import { createElement as h } from "react";
import { renderToStaticMarkup as html } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ stage: "demo" as string | null, updates: [] as unknown[], posted: [] as { id: string; ok: boolean; code?: string }[], runs: [] as unknown[], dbError: false }));
vi.mock("@/lib/db/client", () => ({
  hasDatabase: () => true,
  getDb: () => ({
    company: {
      findUnique: async () => (store.stage === null ? null : { id: "co1", stage: store.stage }),
      update: async (a: unknown) => { store.updates.push(a); return {}; },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
      company: { findUnique: async () => ({ id: "co1", stage: store.stage }), update: async (a: unknown) => { store.updates.push(a); return {}; } },
      auditEvent: { create: async () => ({}) },
    }),
    retentionRun: { findMany: async () => { if (store.dbError) throw new Error("down"); return store.runs; } },
  }),
}));
vi.mock("@/server/audit/record", () => ({ PLATFORM_ACTOR: { kind: "platform" }, recordAudit: async () => undefined }));
vi.mock("@/server/tickets-sync", () => ({
  opsConfig: () => ({ url: "https://ops.test", token: "t", secret: "s" }),
  call: async (_ops: unknown, path: string, init?: RequestInit) => {
    if (init?.method === "POST") { store.posted.push(JSON.parse(String(init.body))); return new Response("{}", { status: 200 }); }
    return new Response(JSON.stringify({ contractVersion: 1, jobs: [{ id: `job-${store.posted.length}-${path.length}`, action: "set_stage", slug: "acme", stage: process.env.JOB_STAGE }] }), { status: 200 });
  },
}));

import { PrivacySettings } from "@/components/settings/PrivacySettings";
import { GET as health } from "@/app/api/health/route";
import { nightsSince, retentionHealth, type RetentionRunRow } from "@/features/privacy/retention-health";
import { I18nProvider } from "@/i18n/client";
import type { PrivacyPageData } from "@/server/actions/settings/privacy";
import { checkStageGuard, pullPlatformJobs } from "@/server/platform-jobs-sync";

const g = globalThis as unknown as { __nextupPlatformJobsDone?: Map<string, unknown> };
beforeEach(() => { store.updates = []; store.posted = []; store.runs = []; store.dbError = false; g.__nextupPlatformJobsDone = new Map(); });
afterEach(() => { delete process.env.TENANT_MODE; delete process.env.JOB_STAGE; });

/** A job the way admin sends it, through the stack's own pull: what it answers and what it wrote. */
async function job(from: string, to: string) {
  store.stage = from;
  process.env.JOB_STAGE = to;
  await pullPlatformJobs();
  return { answer: store.posted.at(-1), wrote: store.updates.length };
}

it("REM stack refuses set_stage on a shared stack", async () => {
  for (const mode of ["path", "subdomain"] as const) {
    for (const [from, to] of [["demo", "sandbox"], ["demo", "live"], ["sandbox", "live"]]) expect(checkStageGuard(from, to, mode), `${mode} ${from} ${to}`).toEqual({ ok: false, code: "bad-stage" });
    for (const [from, to] of [["demo", "demo"], ["sandbox", "sandbox"], ["sandbox", "demo"], ["pilot", "live"], ["pilot", "sandbox"], ["live", "live"]]) expect(checkStageGuard(from, to, mode), `${mode} ${from} ${to}`).toEqual({ ok: true });
  }
  process.env.TENANT_MODE = "subdomain";
  expect(await job("demo", "sandbox")).toEqual({ answer: expect.objectContaining({ ok: false, code: "bad-stage" }), wrote: 0 });
  expect(await job("sandbox", "live")).toEqual({ answer: expect.objectContaining({ ok: false, code: "bad-stage" }), wrote: 0 });
  delete process.env.TENANT_MODE;
  expect(await job("demo", "sandbox")).toEqual({ answer: expect.objectContaining({ ok: false, code: "bad-stage" }), wrote: 0 });
});

it("REM stack allows set_stage on a single stack", async () => {
  process.env.TENANT_MODE = "single";
  for (const [from, to] of [["demo", "sandbox"], ["demo", "live"], ["sandbox", "demo"], ["sandbox", "sandbox"], ["pilot", "live"]]) expect(checkStageGuard(from, to, "single"), `${from} ${to}`).toEqual({ ok: true });
  const moved = await job("demo", "sandbox");
  expect(moved.answer).toMatchObject({ ok: true });
  expect(moved.wrote).toBe(1);
});

const NOW = new Date("2026-11-13T10:00:00+01:00");
const night = (daysAgo: number, hour = 3) => { const d = new Date(NOW); d.setDate(d.getDate() - daysAgo); d.setHours(hour, 0, 0, 0); return d; };
const row = (over: Partial<RetentionRunRow> = {}): RetentionRunRow => ({ lastRunAt: night(0, 4), lastOkAt: null, lastError: null, ...over });
const data = (lastFailure: PrivacyPageData["lastFailure"]): PrivacyPageData => ({
  rules: { assist_turns: null, idea_drafts: null, closed_cases: null } as never, lastRun: null, lastFailure, dpaSignedAt: null, reportScreenshots: true, exports: [], names: {},
} as unknown as PrivacyPageData);
const page = (locale: "en" | "de", d: PrivacyPageData) => html(h(I18nProvider, { locale, children: h(PrivacySettings, { slug: "acme", companyName: "Acme", data: d }) } as never));

it("REM stack retention warns after two failed nights", async () => {
  expect(nightsSince(night(2, 2), NOW)).toBeGreaterThanOrEqual(2);
  const failing = row({ lastOkAt: night(3, 3), lastError: "relation \"assist_turn\" does not exist" });
  expect(retentionHealth([failing], NOW)).toMatchObject({ status: "warn", error: "relation \"assist_turn\" does not exist" });
  expect(retentionHealth([row({ lastOkAt: night(1, 3), lastError: "boom" })], NOW)).toEqual({ status: "ok" });
  expect(retentionHealth([row({ lastOkAt: null, lastError: "boom" })], NOW)).toMatchObject({ status: "warn", error: "boom" });
  expect(retentionHealth([row({ lastOkAt: night(2, 3), lastError: "a" }), row({ lastOkAt: night(9, 3), lastError: "b" })], NOW)).toMatchObject({ status: "warn", error: "b" });
  store.runs = [failing, row({ lastOkAt: night(0, 3) })];
  expect(await (await health()).json()).toEqual({ ok: true, retention: "warn" });
  store.dbError = true;
  expect(await (await health()).json()).toEqual({ ok: true, retention: "unknown" });
  const warn = page("en", data({ at: night(0, 4).toISOString(), error: "relation \"assist_turn\" does not exist", warn: true }));
  expect(warn).toContain('data-testid="settings-privacy-last-failure"');
  expect(warn).toContain("assist_turn");
  const once = page("en", data({ at: night(0, 4).toISOString(), error: "boom", warn: false }));
  expect(once).toContain("boom");
  expect(warn.length).toBeGreaterThan(once.length);
});

it("REM stack retention ok after a good night", async () => {
  expect(retentionHealth([row({ lastOkAt: night(0, 3), lastError: null })], NOW)).toEqual({ status: "ok" });
  expect(retentionHealth([row({ lastOkAt: night(0, 3), lastError: "late attempt failed" })], NOW)).toEqual({ status: "ok" });
  expect(retentionHealth([row({ lastOkAt: night(30, 3), lastError: null })], NOW)).toEqual({ status: "ok" });
  expect(retentionHealth([], NOW)).toEqual({ status: "ok" });
  expect(retentionHealth([row({ lastOkAt: night(5, 3), lastError: "" })], NOW)).toEqual({ status: "ok" });
  store.runs = [row({ lastOkAt: night(0, 3) })];
  expect(await (await health()).json()).toEqual({ ok: true, retention: "ok" });
  expect(page("en", data(null))).not.toContain("settings-privacy-last-failure");
});
