// Who may hand the app a pilot request from outside: the public site (nextup-landing), which has
// no database of its own and forwards its /contact form here with a shared bearer token.
//
// Pure: no Next, no database. The route (src/app/api/pilot-requests/route.ts) does the I/O.
import { createHash, timingSafeEqual } from "node:crypto";
import { bearerFrom } from "@/features/integrations";

/**
 * True only when an intake token is configured and the header carries exactly that token.
 * Both sides are hashed first so the compare is constant-time whatever their lengths.
 */
export function intakeTokenMatches(header: string | null | undefined, expected: string | undefined): boolean {
  if (!expected) return false;
  const given = bearerFrom(header);
  if (!given) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(given), digest(expected));
}
