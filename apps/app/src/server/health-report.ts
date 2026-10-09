// This stack's health -> admin.sellux.ch (@nextup/contracts health.ts). The company's own /admin
// has no Connections page; the NextUp team reads every stack's verdicts there instead.
//
// Once a minute, on the ticket sync's timer (server/tickets-sync.ts). Only a one-company stack
// reports: its token names that company, and admin refuses a report for any other slug.
// Not a "use server" module.
import { HEALTH_CONTRACT_VERSION, type HealthReport } from "@nextup/contracts";
import { connectionChecks } from "@/features/admin/connections";
import { describeEnvironment } from "@/features/admin/environment";
import { flagReport } from "@/features/flags";
import { countByState } from "@/features/integrations/tasks";
import { companyForFlags } from "@/lib/db/flags";
import { singleCompany } from "@/features/tenant/urls";
import { databaseSnapshot, noticeTasks, noticesSnapshot } from "@/server/connections";
import { mailStatus } from "@/server/mail";
import { call, opsConfig } from "@/server/tickets-sync";

/** What this stack would report right now. Never throws: a broken part is a verdict, not an error. */
export async function healthReport(slug: string): Promise<HealthReport> {
  const [database, mail] = await Promise.all([databaseSnapshot(), mailStatus()]);
  const automation = await noticesSnapshot(mail).catch(() => null);
  const tasks = automation ? await noticeTasks().catch(() => []) : [];
  const stage = await companyForFlags(slug).then((c) => c?.stage).catch(() => undefined);
  const environment = describeEnvironment(process.env, stage);
  const flags = await flagReport(slug).catch(() => undefined);
  const checks = connectionChecks({
    database: database.state,
    databaseHeadline: database.headline,
    automation: automation?.summary.state ?? null,
    taskCounts: automation ? countByState(tasks) : null,
    taskTotal: tasks.length,
    mail: !mail.configured ? "off" : mail.reachable ? "up" : "down",
    environment,
  });
  return {
    contractVersion: HEALTH_CONTRACT_VERSION,
    companySlug: slug,
    reportedAt: new Date().toISOString(),
    appCommit: process.env.NEXTUP_COMMIT?.slice(0, 40) || null,
    checks: checks.map((c) => ({ ...c, label: c.label.slice(0, 40), value: c.value.slice(0, 120), ...(c.detail ? { detail: c.detail.slice(0, 500) } : {}) })),
    environment: environment.map((r) => ({
      label: r.label.slice(0, 60),
      value: r.value.slice(0, 200),
      tone: r.tone,
      ...(r.hint ? { hint: r.hint.slice(0, 300) } : {}),
    })),
    ...(flags ? { flags } : {}),
  };
}

let sending: Promise<void> | null = null;

/** Send one report. Overlapping calls share the one in flight; a failure is logged and retried next minute. */
export function reportHealth(): Promise<void> {
  const ops = opsConfig();
  const slug = singleCompany();
  if (!ops || !slug) return Promise.resolve();
  sending ??= (async () => {
    try {
      const res = await call(ops, "/api/stack-health", { method: "POST", body: JSON.stringify(await healthReport(slug)) });
      if (!res.ok) throw new Error(`stack-health answered ${res.status}`);
    } catch (e) {
      console.warn(`[health] ${slug} not reported: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      sending = null;
    }
  })();
  return sending;
}
