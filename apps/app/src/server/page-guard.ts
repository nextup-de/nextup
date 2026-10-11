// The (app) layout's session check, repeated by a page that loads its own data.
//
// A layout is not a gate for its pages: they render in parallel, and a client navigation re-renders
// only the page (node_modules/next/dist/docs/01-app/02-guides/authentication.md, "Layouts and auth
// checks"). The proxy is no gate either: its matcher skips every path with a dot in it, so
// /acme/people/T.%20Vogel never meets it. A page that reads from the server checks for itself.
//
// Same rule as the layout: without a database or AUTH_SECRET it is the demo, and nobody signs in.
// Not a "use server" module: a helper the pages call.
import { redirect } from "next/navigation";
import { canAccess, ROLE_HOME } from "@/config/roles";
import { getViewerFor } from "@/features/auth/session";
import { companyPrefix } from "@/features/tenant/urls";
import { hasDatabase } from "@/lib/db/client";

/**
 * To the login without a live session for `slug`, to the role's home when its role may not open
 * `appPath` (ROLE_ACCESS). `slug` is a found tenant's, never the raw URL segment.
 */
export async function guardPage(slug: string, appPath: string): Promise<void> {
  if (!hasDatabase() || !process.env.AUTH_SECRET) return;
  const viewer = await getViewerFor(slug);
  if (!viewer) redirect(`${companyPrefix(slug)}/login?next=${encodeURIComponent(appPath)}`);
  if (!canAccess(viewer.role, appPath)) redirect(companyPrefix(slug) + ROLE_HOME[viewer.role]);
}
