// Set and read the admin cookie. Shared by the admin code and by "Continue with Microsoft", so
// there is exactly one place that decides what an admin session looks like.
//
// Not a "use server" module: in one, every export is a public action anyone can call by id, and
// issueAdminSession would then hand out admin cookies to anybody.
import { cookies } from "next/headers";
import { ADMIN_COOKIE, ADMIN_TTL_SECONDS, adminBreakGlass, adminBy, adminVia, signAdmin, type AdminVia } from "@/features/auth/cookie";
import { BREAK_GLASS_BY } from "@/features/admin/break-glass";
import { usableSecret } from "@/features/admin/environment";
import { secureCookies } from "@/server/issue-session";

/**
 * Unlock /admin in this browser. `by` is the Microsoft sign-in name when there is one; with the
 * shared admin code there is nobody to name.
 *
 * strict: the admin area is never entered from a link on another site, so the cookie never needs
 * to travel on one - which also takes cross-site request forgery off the table.
 */
export async function issueAdminSession(by?: string, breakGlass = false, via?: AdminVia, expiresAt?: Date): Promise<void> {
  const secret = usableSecret(process.env.AUTH_SECRET);
  if (!secret) throw new Error("AUTH_SECRET is not configured, or is still the .env.example placeholder");
  const now = Math.floor(Date.now() / 1000);
  // A support session ends with its grant, never later than the usual admin lifetime.
  const exp = expiresAt ? Math.min(Math.floor(expiresAt.getTime() / 1000), now + ADMIN_TTL_SECONDS) : now + ADMIN_TTL_SECONDS;
  (await cookies()).set(ADMIN_COOKIE, signAdmin(exp, secret, by, breakGlass, via ?? (breakGlass ? "break-glass" : undefined)), {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    secure: secureCookies(),
    maxAge: Math.max(exp - now, 1),
  });
}

/** A support session carries its grant id as `by`, so a new grant ends the old session. */
const SUPPORT_BY = "support:";

/** The window this break-glass session was opened with (its openedAt), or null (shared code, or not break-glass). */
export async function breakGlassOpenedAt(): Promise<string | null> {
  const secret = usableSecret(process.env.AUTH_SECRET);
  const by = secret ? adminBy((await cookies()).get(ADMIN_COOKIE)?.value, secret) : null;
  return by?.startsWith(BREAK_GLASS_BY) ? by.slice(BREAK_GLASS_BY.length) : null;
}

/** Who is signed in to /admin with Microsoft, or null (admin code, support, or nobody). */
export async function adminActor(): Promise<string | null> {
  const secret = usableSecret(process.env.AUTH_SECRET);
  const by = secret ? adminBy((await cookies()).get(ADMIN_COOKIE)?.value, secret) : null;
  return by && !by.startsWith(SUPPORT_BY) && !by.startsWith(BREAK_GLASS_BY) ? by : null;
}

/** The support grant this session was opened with, or null (not a support session). */
export async function supportGrantId(): Promise<string | null> {
  const secret = usableSecret(process.env.AUTH_SECRET);
  const raw = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!secret || adminVia(raw, secret) !== "support") return null;
  const by = adminBy(raw, secret);
  return by?.startsWith(SUPPORT_BY) ? by.slice(SUPPORT_BY.length) : null;
}

/** The `by` value of a support session for this grant. */
export const supportBy = (grantId: string) => SUPPORT_BY + grantId;

/** True when this /admin session was opened with the shared code (the layout shows a banner). */
export async function adminBreakGlassActive(): Promise<boolean> {
  const secret = usableSecret(process.env.AUTH_SECRET);
  return secret ? adminBreakGlass((await cookies()).get(ADMIN_COOKIE)?.value, secret) : false;
}

/** How this /admin session was opened, or null without a valid admin cookie. */
export async function adminWayIn(): Promise<AdminVia | null> {
  const secret = usableSecret(process.env.AUTH_SECRET);
  return secret ? adminVia((await cookies()).get(ADMIN_COOKIE)?.value, secret) : null;
}
