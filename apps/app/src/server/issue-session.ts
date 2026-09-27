// Mint and set the session cookie. Shared by login and by the dev panel's "switch person", so
// there is exactly one place that decides what a session looks like and how the cookie is scoped.
//
// Not a "use server" module: it is a helper those actions call, not an action itself.
import { cookies } from "next/headers";
import type { Role } from "@/config/roles";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/features/auth/cookie";
import { getDb } from "@/lib/db/client";

/**
 * Send login cookies over https only. COOKIE_SECURE=true forces it; a public https scheme turns it
 * on by itself, so a production box cannot end up sending sessions in the clear because one of
 * two env vars was forgotten.
 */
export function secureCookies(): boolean {
  return process.env.COOKIE_SECURE === "true" || process.env.PUBLIC_SCHEME === "https";
}

export type SessionUser = { id: string; name: string; handle: string | null; role: string };

export async function issueSession(companyId: string, slug: string, user: SessionUser): Promise<void> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured");
  const company = await getDb().company.findUniqueOrThrow({ where: { id: companyId }, select: { sessionEpoch: true } });

  const token = signSession(
    {
      v: 1,
      cid: companyId,
      slug,
      uid: user.id,
      name: user.name,
      handle: user.handle,
      role: user.role as Role,
      ep: company.sessionEpoch,
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    },
    secret,
  );

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Scoped to this exact host, never ".<root>" - otherwise one company's subdomain could read
    // another's cookie, which is the isolation we are claiming.
    path: "/",
    secure: secureCookies(),
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
