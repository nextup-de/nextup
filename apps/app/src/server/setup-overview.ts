// What the setup overview shows (features/settings/setup-phases.ts decides). Read on every load, never
// stored. Not a "use server" module: a loader the /setup and /admin/setup pages call.
import { notFound } from "next/navigation";
import { aiStatus, directoryStatus, jiraStatus, m365Status } from "@/features/connectors/status";
import { adminBase } from "@/features/admin/nav";
import { getViewerFor, type Viewer } from "@/features/auth/session";
import type { GoLiveInput } from "@/features/pilot/go-live";
import { setupIsWaiting, setupPhases, type ContextStatus, type ItFacts, type SetupPhase, type SetupViewer } from "@/features/settings/setup-phases";
import { companyPrefix, singleCompany } from "@/features/tenant/urls";
import { loadConnectors } from "@/app/admin/connectors/load";
import { getDb } from "@/lib/db/client";
import { loadGoLiveInput } from "@/lib/db/go-live";
import { readBackupStatus } from "@/server/backup-status";
import { consoleOverviewFacts } from "@/server/console-guard";
import { mailStatus } from "@/server/mail";
import { guardPage } from "@/server/page-guard";
import { setupCounts } from "@/server/actions/settings/setup";
import { setupIsDemo } from "@/server/setup-page";

/** A person who works on setup, and on which side. */
export type SetupPerson = { viewer: Viewer; manager: boolean; stackAdmin: boolean };

/**
 * The viewer when the database still says they are an active manager or stack admin of company `slug`,
 * else null. "Manager" means what companyAdminOf means, since the steps behind the links ask that. A
 * stack admin counts on a one-company stack only: elsewhere there is no console to be an admin of.
 */
export async function setupPersonOf(slug: string): Promise<SetupPerson | null> {
  const viewer = await getViewerFor(slug);
  if (!viewer) return null;
  const row = await getDb()
    .user.findFirst({ where: { id: viewer.userId, companyId: viewer.companyId, active: true }, select: { role: true, isStackAdmin: true } })
    .catch(() => null); // fail closed
  if (!row) return null;
  const manager = viewer.role === "manager" && row.role === "manager";
  const stackAdmin = row.isStackAdmin && singleCompany() !== null;
  return manager || stackAdmin ? { viewer, manager, stackAdmin } : null;
}

const viewerOf = (p: SetupPerson): SetupViewer => (p.manager && p.stackAdmin ? "both" : p.manager ? "manager" : "stackAdmin");

/**
 * ==== INTEGRATION POINT ====
 * The two facts other PRs bring, in this one place. Give it the company id and replace the body with
 *   const [openedAt, context] = await Promise.all([loadOpenedAt(companyId), loadContextStatus(companyId)]);
 *   return { openedAt, context };
 * once `server/setup-open.ts` (loadOpenedAt) and `server/setup-context.ts` (loadContextStatus) are merged.
 */
async function pendingFacts(): Promise<{ openedAt: Date | null; context: ContextStatus }> {
  return { openedAt: null, context: "notUsed" };
}

async function itFacts(company: { companyId: string; slug: string }): Promise<ItFacts | null> {
  if (singleCompany() === null) return null;
  const [connectors, overview] = await Promise.all([loadConnectors(company), consoleOverviewFacts(company.companyId)]);
  return {
    consoleBase: adminBase(),
    admins: overview.admins,
    connectors: {
      m365: m365Status(connectors.m365),
      jira: jiraStatus(connectors.jira),
      ai: aiStatus(connectors.ai),
      directory: directoryStatus(connectors.directory),
    },
  };
}

export type SetupOverviewData = {
  /** Null when the facts could not be read: the page says so and tries again. */
  phases: SetupPhase[] | null;
  /** The page looks again by itself. Off when nothing is waiting. */
  poll: boolean;
};

async function overviewOf(company: { companyId: string; slug: string }, viewer: SetupViewer): Promise<SetupOverviewData> {
  try {
    const [goLive, it, counts, pending] = await Promise.all([
      loadGoLiveInput(company.companyId, new Date(), { mailStatus, readBackupStatus }),
      itFacts(company),
      setupCounts(company.companyId),
      pendingFacts(),
    ]);
    const phases = setupPhases({ viewer, prefix: companyPrefix(company.slug), goLive, it, counts, ...pending });
    return { phases, poll: setupIsWaiting(phases) };
  } catch {
    return { phases: null, poll: true };
  }
}

/** What the sample company shows without a database. Nothing is real and nothing polls. */
const SAMPLE_GO_LIVE: GoLiveInput = {
  now: new Date(0),
  units: [],
  roles: [],
  routes: [],
  hasCalendar: false,
  people: { active: 1, canSignIn: 1 },
  microsoftOn: true,
  managers: { withCode: 1, withTotp: 1 },
  mail: "ok",
  ai: { choice: "off", dpaSignedAt: null },
  backup: null,
  supportOpenUntil: null,
  notifications: false,
  directory: { on: true, lastRunAt: null, lastOkAt: null, lastError: null },
  recipients: 0,
  baseline: false,
};

function sampleOverview(slug: string): SetupOverviewData {
  return {
    poll: false,
    phases: setupPhases({
      viewer: "manager",
      prefix: companyPrefix(slug),
      goLive: SAMPLE_GO_LIVE,
      it: { consoleBase: adminBase(), admins: 1, connectors: { m365: "off", jira: "off", ai: "off", directory: "on" } },
      counts: { named: false, units: 0, seats: 0, routes: 0, members: 1 },
      openedAt: null,
      context: "notUsed",
    }),
  };
}

/** /setup: setup people only, everyone else gets a 404. */
export async function loadSetupOverview(slug: string): Promise<SetupOverviewData> {
  if (setupIsDemo()) return sampleOverview(slug);
  await guardPage(slug, "/setup");
  const person = await setupPersonOf(slug);
  if (!person) notFound();
  return overviewOf({ companyId: person.viewer.companyId, slug }, viewerOf(person));
}

/** /admin/setup: the page has been through consoleCompany(), so this only reads. */
export function loadConsoleSetupOverview(company: { companyId: string; slug: string }): Promise<SetupOverviewData> {
  return overviewOf(company, "console");
}
