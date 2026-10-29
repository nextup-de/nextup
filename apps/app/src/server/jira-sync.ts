// The in-app Jira sync (docs/plans/2026-10-29_jira-in-app.md), replacing the n8n workflow.
//
// Once a minute, for every company that has Jira switched on: take the company's lease (one runner
// at a time, also across processes), push what people did to Jira, pull what changed in Jira, record
// how it went on the Integration row. server/jira/round.ts does the round; this file is the loop, the
// lease, the vault and the database. Follows server/tickets-sync.ts: started from instrumentation.ts,
// idempotent, never throws. `kickJira` starts a round early (after a person's project event, or
// Jira's webhook).
//
//   JIRA_SYNC_INTERVAL_MS   the round interval; default 60000 (the e2e run uses 2000)
//
// Not a "use server" module.
import type { CaseEventType } from "@/features/cases/events";
import { reduce } from "@/features/cases/reducer";
import { logFromRows } from "@/features/cases/persist";
import { open, integrationContext, vaultKey } from "@/features/connectors/vault";
import { seedFor } from "@/features/demo";
import { JIRA_ACTOR, JIRA_SOURCE } from "@/features/integrations";
import { parseJiraSettings } from "@/features/integrations/jira/settings";
import { JiraError, type JiraAccount, type JiraApiFactory } from "@/features/integrations/jira/types";
import { getDb, hasDatabase } from "@/lib/db/client";
import { appendEventRow, loadLog } from "@/lib/db/events";
import {
  claimLease, companiesWithIntegrationOn, getIntegration, integrationSecrets, JIRA, recordRun, releaseLease,
} from "@/lib/db/integrations";
import { cloudApi } from "@/server/jira/cloud";
import { dcApi } from "@/server/jira/dc";
import { runRound, type RoundStore } from "@/server/jira/round";

const FACTORIES: Record<"cloud" | "dc", JiraApiFactory> = { cloud: cloudApi, dc: dcApi };
/** A round that dies without releasing loses its lease after this. Longer than any round should take. */
const LEASE_MS = 5 * 60_000;
const RECONCILE_EVERY_MS = 60 * 60_000;
/** Several events in a row (a person editing a board) start one round, not one each. */
const KICK_DELAY_MS = 1_500;

const intervalMs = (): number => {
  const n = Number(process.env.JIRA_SYNC_INTERVAL_MS);
  return Number.isFinite(n) && n >= 500 ? n : 60_000;
};

const accountOf = (v: unknown): JiraAccount | null => {
  if (typeof v !== "object" || v === null) return null;
  const a = v as Record<string, unknown>;
  return typeof a.id === "string" && typeof a.name === "string" ? { id: a.id, name: a.name } : null;
};

/** The company's log as a RoundStore. Every query names the company. */
function dbStore(company: { id: string; slug: string }): RoundStore {
  return {
    async state() {
      const row = await getDb().company.findUnique({ where: { id: company.id }, select: { demoDay: true } });
      const log = await loadLog(company.id, row?.demoDay ?? 0);
      return reduce(await seedFor(company.slug), log);
    },
    async eventsSince(after) {
      const rows = await getDb().caseEvent.findMany({
        where: { companyId: company.id, seq: { gt: after }, type: { startsWith: "project." } },
        orderBy: { seq: "asc" },
        select: { id: true, seq: true, day: true, ts: true, type: true, actor: true, targetId: true, payload: true },
      });
      const log = logFromRows(rows, 0);
      return log.events.map((e, i) => ({ ...e, seq: rows[i].seq }));
    },
    async append(ev) {
      // The id comes from the idempotency key (and the company, as in the events API): a repeat
      // collides on the primary key as well as on the unique index and comes back as a duplicate.
      return appendEventRow(
        company.id,
        { id: `e_jira_${company.id}_${ev.idemKey}`, day: 0, type: ev.type as CaseEventType, actor: JIRA_ACTOR, targetId: ev.target, payload: ev.payload },
        { source: JIRA_SOURCE, idemKey: ev.idemKey },
      );
    },
  };
}

const lastReconcile = new Map<string, number>();
/** Companies Jira asked us to leave alone for a while (429). */
const backoffUntil = new Map<string, number>();
const running = new Map<string, Promise<void>>();

/** One company's round. Never throws: a failure is recorded on the Integration row. */
export async function syncCompany(company: { id: string; slug: string }, now = new Date()): Promise<void> {
  const inFlight = running.get(company.id);
  if (inFlight) return inFlight;
  const p = (async () => {
    if ((backoffUntil.get(company.id) ?? 0) > now.getTime()) return;
    if (!(await claimLease(company.id, JIRA, LEASE_MS, now))) return;
    try {
      const row = await getIntegration(company.id, JIRA);
      if (!row || !row.on) return;
      const parsed = parseJiraSettings(row.settings);
      if (!parsed.ok) return void (await recordRun(company.id, JIRA, { error: "Settings: " + parsed.errors[0] }));
      const key = vaultKey();
      const sealed = (await integrationSecrets(company.id, JIRA))?.secretSealed ?? null;
      const token = key && sealed ? open(sealed, key, integrationContext(company.id, JIRA)) : null;
      if (!token) {
        return void (await recordRun(company.id, JIRA, { error: key ? "The API token cannot be read. Enter it again." : "The vault key is not set on this server." }));
      }
      const api = FACTORIES[parsed.settings.flavor](parsed.settings, token);
      const reconcile = row.pulledAt === null || now.getTime() - (lastReconcile.get(company.id) ?? 0) >= RECONCILE_EVERY_MS;
      const r = await runRound(api, dbStore(company), {
        settings: parsed.settings, enabledAt: row.enabledAt, pushedSeq: row.pushedSeq, pulledAt: row.pulledAt,
        account: accountOf(row.account), reconcile, now,
      });
      if (reconcile) lastReconcile.set(company.id, now.getTime());
      backoffUntil.delete(company.id);
      await recordRun(company.id, JIRA, { pushedSeq: r.pushedSeq, pulledAt: r.pulledAt, account: r.account });
      // The round got through, but something in it was refused: the admin sees the first reason.
      if (r.warnings.length) await recordRun(company.id, JIRA, { error: r.warnings[0] });
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      if (e instanceof JiraError && e.status === 429) backoffUntil.set(company.id, now.getTime() + (e.retryAfterMs ?? 60_000));
      console.warn(`[jira] ${company.slug}: ${why}`);
      await recordRun(company.id, JIRA, { error: why }).catch(() => undefined);
    } finally {
      await releaseLease(company.id, JIRA).catch(() => undefined);
    }
  })().finally(() => running.delete(company.id));
  running.set(company.id, p);
  return p;
}

/** One pass over every company that has Jira on. */
export async function syncJira(): Promise<void> {
  if (!hasDatabase()) return;
  try {
    const companies = await companiesWithIntegrationOn(JIRA);
    enabled = new Map(companies.map((c) => [c.slug, c]));
    await Promise.all(companies.map((c) => syncCompany(c)));
  } catch (e) {
    console.warn(`[jira] sync: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** The companies that had Jira on at the last pass: kickJira ignores everyone else without a database trip. */
let enabled = new Map<string, { id: string; slug: string }>();
const pending = new Set<string>();
let kickTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Ask for a round for this company soon instead of waiting for the minute. Called after a person's
 * project event and by Jira's webhook. Does nothing for a company without Jira on; never throws.
 */
export function kickJira(slug: string): void {
  try {
    if (!enabled.has(slug)) return;
    pending.add(slug);
    kickTimer ??= setTimeout(() => {
      kickTimer = null;
      const slugs = [...pending];
      pending.clear();
      for (const s of slugs) {
        const c = enabled.get(s);
        if (c) void syncCompany(c);
      }
    }, KICK_DELAY_MS);
  } catch {
    // A kick is a nicety; the minute loop does the work anyway.
  }
}

const globalForJira = globalThis as unknown as { __nextupJiraSync?: ReturnType<typeof setInterval> };

/** Start the loop from instrumentation.ts. Idempotent (dev reloads this module). */
export function startJiraSync(): void {
  if (!hasDatabase() || globalForJira.__nextupJiraSync) return;
  globalForJira.__nextupJiraSync = setInterval(() => void syncJira(), intervalMs());
  void syncJira();
}
