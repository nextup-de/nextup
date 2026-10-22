// Set and read the admin cookie. Shared by the admin code and by "Continue with Microsoft", so
// there is exactly one place that decides what an admin session looks like.
//
// Not a "use server" module: in one, every export is a public action anyone can call by id, and
// issueAdminSession would then hand out admin cookies to anybody.
import { cookies } from "next/headers";
import { ADMIN_COOKIE, ADMIN_TTL_SECONDS, adminBy, signAdmin } from "@/features/auth/cookie";
import { usableSecret } from "@/features/admin/environment";
import { secureCookies } from "@/server/issue-session";

/**
 * Unlock /admin in this browser. `by` is the Microsoft sign-in name when there is one; with the
 * shared admin code there is nobody to name.
 *
 * strict: the admin area is never entered from a link on another site, so the cookie never needs
 * to travel on one - which also takes cross-site request forgery off the table.
 */
export async function issueAdminSession(by?: string): Promise<void> {
  const secret = usableSecret(process.env.AUTH_SECRET);
  if (!secret) throw new Error("AUTH_SECRET is not configured, or is still the .env.example placeholder");
  (await cookies()).set(ADMIN_COOKIE, signAdmin(Math.floor(Date.now() / 1000) + ADMIN_TTL_SECONDS, secret, by), {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    secure: secureCookies(),
    maxAge: ADMIN_TTL_SECONDS,
  });
}

/** Who is signed in to /admin with Microsoft, or null (admin code, or nobody). */
export async function adminActor(): Promise<string | null> {
  const secret = usableSecret(process.env.AUTH_SECRET);
  return secret ? adminBy((await cookies()).get(ADMIN_COOKIE)?.value, secret) : null;
}
