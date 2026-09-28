// What the app talks to and whether it answers: Postgres, the case notices and their tasks. Read
// by the platform /admin Connections page (behind its cookie, server/actions/admin.ts) and by the
// health report a company stack sends to admin.sellux.ch (server/health-report.ts).
//
// NOT a "use server" module on purpose: nothing here checks a cookie, so nothing here may be
// callable from a browser. Callers do the checking.
import { databaseOutage, getDb, hasDatabase, orDemo, reconnectDatabase } from "@/lib/db/client";
import { automationFor, raiseCountFor, raisesFor } from "@/lib/db/automation";
import { databaseFacts, type DatabaseFacts } from "@/lib/db/health";
import { companySeed } from "@/lib/db/companies";
import { describeDatabase, type DatabaseReport } from "@/features/admin/health";
import { summarise, type AutomationReport, type NoticeFacts } from "@/features/integrations/automation";
import { classify, type AutomationTaskView } from "@/features/integrations/tasks";
import { buildRaisedNotice } from "@/features/cases/notice";
import type { EventPayload } from "@/features/cases/events";
import { companyBaseUrl } from "@/server/case-notice";
import type { MailStatus } from "@/server/mail";

/** Takes the relay status rather than checking it again - adminContext already asked once. */
export async function noticesSnapshot(mail: Pick<MailStatus, "configured" | "reachable" | "target">): Promise<AutomationReport | null> {
  if (!hasDatabase()) return null;

  const companies = await getDb().company.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, slug: true, name: true },
  });
  const [rows, raises] = await Promise.all([
    automationFor(companies),
    raiseCountFor(companies.map((c) => c.id)),
  ]);

  const facts: NoticeFacts = { configured: mail.configured, reachable: mail.reachable, target: mail.target };
  return { facts, companies: rows, summary: summarise(facts, rows, raises) };
}

/**
 * One timestamp, rendered on the server in a zone that does not depend on where it runs. The
 * container is UTC and a browser is not, so letting a client component format this is a
 * hydration mismatch - see AutomationTaskView.
 */
function stamp(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: process.env.TZ || "Europe/Zurich",
  });
}

/**
 * Every raise and whether its owner was told, newest first.
 *
 * The owner is resolved with buildRaisedNotice - the same function the real notice uses - so this
 * page cannot disagree with what was actually sent about who owns a route.
 */
export async function noticeTasks(limit = 25): Promise<AutomationTaskView[]> {
  if (!hasDatabase()) return [];

  const companies = await getDb().company.findMany({
    select: { id: true, slug: true, name: true, demoDay: true, seedJson: true, users: { select: { name: true, email: true } } },
  });
  if (companies.length === 0) return [];

  const byId = new Map(companies.map((c) => [c.id, c]));
  const seeds = new Map(await Promise.all(companies.map(async (c) => [c.id, await companySeed(c)] as const)));
  const raises = await raisesFor(companies.map((c) => c.id), limit);
  const now = Date.now();

  return raises.map((r) => {
    const company = byId.get(r.companyId);
    const payload = (r.payload ?? {}) as EventPayload;
    const notice = company
      ? buildRaisedNotice({
          slug: company.slug,
          eventId: r.eventId,
          caseId: r.caseId ?? "",
          payload,
          seed: seeds.get(company.id)!,
          people: company.users,
          day: company.demoDay,
          baseUrl: companyBaseUrl(company.slug),
        })
      : null;

    const task = classify(
      {
        eventId: r.eventId,
        slug: company?.slug ?? "",
        companyName: company?.name ?? "",
        caseId: r.caseId ?? "",
        title: payload.title ?? "Untitled",
        ownerName: notice?.route.ownerName ?? null,
        ownerEmail: notice?.route.ownerEmail ?? null,
        raisedAt: r.raisedAt,
        noticeAt: r.noticeAt,
      },
      now,
    );
    return { ...task, raisedLabel: stamp(r.raisedAt) };
  });
}

/**
 * What Postgres says about itself. Never throws: if the read fails mid-flight the page shows the
 * "not answering" state, which is the honest answer and the one the card exists for.
 */
export async function databaseSnapshot(): Promise<DatabaseReport> {
  const configured = Boolean(process.env.DATABASE_URL);
  // Down? Ask again now rather than wait for the background retry: the page polls while the
  // database is off (DatabaseCard), so this is what turns "Postgres is back" into live data.
  if (!hasDatabase()) await reconnectDatabase();

  // orDemo, not a bare try/catch: a connection error here must also FLIP the mode flag, because
  // that is what makes hasDatabase() false for the rest of this render and sends the page down
  // the demo path instead of throwing a 500 at a reader who only wanted to know what was wrong.
  const facts = hasDatabase()
    ? await orDemo<DatabaseFacts | null>(() => databaseFacts(), () => null)
    : null;
  return describeDatabase({ configured, outage: databaseOutage(), facts });
}
