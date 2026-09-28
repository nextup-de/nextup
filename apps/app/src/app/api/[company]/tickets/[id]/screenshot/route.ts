// GET /api/[company]/tickets/[id]/screenshot - the image sent with a bug report.
//
// Only for the person who filed it, or a signed-in admin. It can show anything that was on their
// screen, so it is never cached anywhere but the browser that asked, and never guessable: the id
// is a cuid, and a wrong one is the same 404 as a missing one.
import { findCompanyBySlug } from "@/lib/db/companies";
import { hasDatabase } from "@/lib/db/client";
import { ticketScreenshot } from "@/lib/db/tickets";
import { getViewerFor } from "@/features/auth/session";
import { isAdmin } from "@/server/actions/admin";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ company: string; id: string }> };

const notFound = () => new Response("Not found", { status: 404 });

export async function GET(_request: Request, { params }: Ctx) {
  if (!hasDatabase()) return notFound();
  const { company: slug, id } = await params;
  const company = await findCompanyBySlug(slug);
  if (!company) return notFound();

  const shot = await ticketScreenshot(company.id, id);
  if (!shot?.screenshot || !shot.screenshotMime) return notFound();

  const viewer = await getViewerFor(slug);
  const mine = viewer !== null && shot.reporterId !== null && viewer.userId === shot.reporterId;
  if (!mine && !(await isAdmin())) return notFound();

  return new Response(new Uint8Array(shot.screenshot), {
    headers: {
      "content-type": shot.screenshotMime,
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
    },
  });
}
