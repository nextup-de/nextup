// Authenticated shell: the chrome around every app page, and the one place the server hands the
// dashboard its data.
//
// With a session and a database this loads the company's event log from Postgres, so everyone
// looking at the company sees the same cases. Without one it falls back to the built-in demo
// seed and DemoProvider keeps the log in localStorage - which is what makes `npm run dev` and
// the CI build work with no Postgres anywhere.
//
// The proxy already redirects an unauthenticated visitor, but the check is repeated here: a proxy
// is routing, not a security boundary, and this layout is what actually hands over the data.
import { notFound, redirect } from "next/navigation";
import { companyPrefix } from "@/features/tenant/urls";
import { findTenant } from "@/features/tenant";
import { seedFor } from "@/features/demo";
import { getViewerFor } from "@/features/auth/session";
import { loadLogFor, membersOfViewer, seedForViewer } from "@/lib/db/viewer-log";
import { hasDatabase, orDemo } from "@/lib/db/client";
import { consoleHrefFor, personLinksFor } from "@/lib/db/people";
import { pseudonymLabelsFor } from "@/lib/db/pseudonymise";
import { policyFor } from "@/features/admin/stages";
import { flagsFor } from "@/features/flags";
import { DemoProvider, type ViewerInfo } from "@/components/dashboard/DemoProvider";
import { AppShell } from "@/components/shell/AppShell";
import { ReportButton } from "@/components/report/ReportButton";
import { reportTicket } from "@/server/actions/tickets";
import { reportScreenshotsAllowed } from "@/server/actions/settings/privacy";

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ company: string }>;
}) {
  const { company } = await params;
  // Nested layouts render in parallel, so the parent's notFound() does not stop this one.
  // Every stray single-segment URL (/favicon.ico, typos) lands here - 404 it ourselves.
  const tenant = await findTenant(company);
  if (!tenant) notFound();

  const [fullSeed, flags] = await Promise.all([seedFor(tenant.slug), flagsFor(tenant.slug)]);

  // Server mode only when there is both a database and a session for THIS company.
  let viewer = hasDatabase() ? await getViewerFor(tenant.slug) : null;
  if (hasDatabase() && process.env.AUTH_SECRET && !viewer) {
    redirect(prefixFor(tenant.slug) + "/login");
  }

  // Server mode ships only what this viewer may open inside the window (VIS/D8); the rest of a case
  // loads on its own page. No CaseView rows yet = the full log and the full seed.
  const who = viewer;
  const [shipped, members] = who
    ? await Promise.all([
        orDemo(() => loadLogFor(who.companyId, { userId: who.userId, role: who.role }, new Date(), fullSeed), () => null),
        orDemo(() => membersOfViewer(who.companyId, who.userId), () => []),
      ])
    : [null, []];
  const initialLog = shipped?.log ?? null;
  const cut = shipped?.caseIds && shipped.projectIds ? seedForViewer(fullSeed, shipped.caseIds, shipped.projectIds) : fullSeed;
  const seed = members.length ? { ...cut, members } : cut;
  // Postgres went away between the checks above and this read: show the demo, not a 500.
  if (!hasDatabase()) viewer = null;

  const viewerInfo: ViewerInfo | null = viewer
    ? {
        userId: viewer.userId,
        name: viewer.name,
        handle: viewer.handle,
        role: viewer.role,
        line: tenant.users.find((u) => u.id === viewer.userId)?.dept,
      }
    : null;

  // A demo company's people are ours, and the dev panel needs all of them to switch between. A
  // real company's staff list and addresses stay on the server: the browser gets the viewer only.
  const demoTools = policyFor(tenant.stage ?? "demo").switchPerson;
  const people = demoTools ? tenant.users : tenant.users.filter((u) => u.id === viewer?.userId);

  // Who has a person page: user id -> display label. Empty without a database or a viewer.
  // Former members: user id -> pseudonym, so old events show the label they have now (GDP D15).
  const viewerCompanyId = viewer?.companyId;
  const [personLinks, actorLabels] = viewerCompanyId
    ? await Promise.all([orDemo(() => personLinksFor(viewerCompanyId), () => ({})), orDemo(() => pseudonymLabelsFor(viewerCompanyId), () => ({}))])
    : [{}, {}];

  const consoleHref = who && viewerCompanyId ? await orDemo(() => consoleHrefFor(viewerCompanyId, who.userId), () => null) : null;

  return (
    <DemoProvider
      tenant={{
        slug: tenant.slug,
        prefix: prefixFor(tenant.slug),
        name: tenant.name,
        users: people.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role })),
        personLinks,
        actorLabels,
        consoleHref,
        demoTools,
        demoDataDefault: process.env.DEMO_DATA_DEFAULT === "on",
        flags,
      }}
      seed={seed}
      initialLog={initialLog ?? undefined}
      viewer={viewerInfo}
    >
      <AppShell>{children}</AppShell>
      {/* The bug icon (docs/plans/2026-09-27_platform.md, "Tickets"): only where a report can be stored. */}
      {hasDatabase() && viewer ? (
        <ReportButton submit={reportTicket.bind(null, tenant.slug)} reportsHref={prefixFor(tenant.slug) + "/reports"} team={demoTools}
          screenshotsAllowed={reportScreenshotsAllowed.bind(null, tenant.slug)} />
      ) : null}
    </DemoProvider>
  );
}

/** Where the company IS the host (subdomain, single), links carry no slug. */
function prefixFor(slug: string): string {
  return companyPrefix(slug);
}
