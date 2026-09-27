// Is a signed session still good? The cookie proves who signed in and when; this checks that the
// facts it carries are still true, so a session ends when the company, the person or their role
// changes underneath it - not eight hours later.
//
// One indexed read per server render or action. The proxy stays signature-only (no database in
// the hot path); the layout and every server action come through here.
import type { SessionClaims } from "@/features/auth/cookie";
import { getDb } from "./client";

export async function sessionStillValid(c: Pick<SessionClaims, "cid" | "slug" | "uid" | "role" | "ep">): Promise<boolean> {
  const user = await getDb().user.findFirst({
    where: { id: c.uid, companyId: c.cid },
    select: { role: true, company: { select: { slug: true, sessionEpoch: true } } },
  });
  return Boolean(user && user.role === c.role && user.company.slug === c.slug && user.company.sessionEpoch === c.ep);
}
