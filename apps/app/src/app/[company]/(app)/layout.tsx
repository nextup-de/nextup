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
import { findTenant } from "@/features/tenant";
import { seedFor } from "@/features/demo";
import { getViewerFor } from "@/features/auth/session";
import { loadLogForSlug } from "@/lib/db/events";
import { hasDatabase, orDemo } from "@/lib/db/client";
import { policyFor } from "@/features/admin/stages";
import { DemoProvider, type ViewerInfo } from "@/components/dashboard/DemoProvider";
import { AppShell } from "@/components/shell/AppShell";

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

  const seed = await seedFor(tenant.slug);

  // Server mode only when there is both a database and a session for THIS company.
  let viewer = hasDatabase() ? await getViewerFor(tenant.slug) : null;
  if (hasDatabase() && process.env.AUTH_SECRET && !viewer) {
    redirect(prefixFor(tenant.slug) + "/login");
  }

  const initialLog = viewer ? await orDemo(() => loadLogForSlug(tenant.slug), () => null) : null;
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

  return (
    <DemoProvider
      tenant={{
        slug: tenant.slug,
        name: tenant.name,
        users: people.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role })),
        demoTools,
      }}
      seed={seed}
      initialLog={initialLog ?? undefined}
      viewer={viewerInfo}
    >
      <AppShell>{children}</AppShell>
    </DemoProvider>
  );
}

/** In subdomain mode the company IS the host, so links carry no slug. */
function prefixFor(slug: string): string {
  return process.env.TENANT_MODE === "subdomain" ? "" : "/" + slug;
}
