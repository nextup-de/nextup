// The settings guard (ADM D6). Not a "use server" module: a helper every settings page and
// settings action calls first, before it reads or writes anything.
import { getViewerFor, type Viewer } from "@/features/auth/session";
import { getDb } from "@/lib/db/client";

/**
 * The viewer when the database still says they are an active manager of company `slug`, else null.
 * Every write of a settings action names `viewer.companyId` from here, never an id from the form.
 */
export async function companyAdminOf(slug: string): Promise<Viewer | null> {
  const viewer = await getViewerFor(slug);
  if (!viewer || viewer.role !== "manager") return null;
  const row = await getDb()
    .user.findFirst({
      where: { id: viewer.userId, companyId: viewer.companyId, role: "manager", active: true },
      select: { id: true },
    })
    .catch(() => null); // fail closed
  return row ? viewer : null;
}
