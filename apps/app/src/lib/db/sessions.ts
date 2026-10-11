// Is a signed session still good? The cookie proves who signed in and when; this checks that the
// facts it carries are still true, so a session ends when the company, the person or their role
// changes underneath it - not eight hours later. A new personal login code ends it too: replacing
// a lost or leaked code is how it is shut out, and a session opened with the old one goes with it.
//
// One indexed read per server render or action. The proxy stays signature-only (no database in
// the hot path); the layout and every server action come through here.
import type { SessionClaims } from "@/features/auth/cookie";
import { getDb } from "./client";

export async function sessionStillValid(
  c: Pick<SessionClaims, "cid" | "slug" | "uid" | "role" | "ep"> & { iat: number },
): Promise<boolean> {
  const user = await getDb().user.findFirst({
    where: { id: c.uid, companyId: c.cid },
    select: { role: true, loginCodeAt: true, company: { select: { slug: true, sessionEpoch: true } } },
  });
  // Whole seconds, like the cookie: a login with the new code in the same second it was issued stays.
  const codeAt = user?.loginCodeAt ? Math.floor(user.loginCodeAt.getTime() / 1000) : 0;
  return Boolean(
    user && user.role === c.role && user.company.slug === c.slug && user.company.sessionEpoch === c.ep && c.iat >= codeAt,
  );
}
