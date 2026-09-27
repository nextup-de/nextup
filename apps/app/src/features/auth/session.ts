// Session shape and helpers. Pages and layouts call getSession()/requireSession() - they never
// read cookies themselves, which is what the original version of this file promised.
//
// Architecture note for Kevin: features/ is meant to carry no Next imports, and this one file
// imports next/headers. The alternative was to move getSession() out of features/auth and change
// every future caller, against this file's own stated contract. All the logic that can be pure
// IS pure and lives next door - cookie.ts (sign/verify) and request.ts (routing + ROLE_ACCESS) -
// and that is what tests/unit/{session,access}.test.ts cover. This file is only the glue that
// hands them the current request's cookie.
import { cookies } from "next/headers";
import type { Role } from "@/config/roles";
import { SESSION_COOKIE, verifySession, type SessionClaims } from "./cookie";
import { hasDatabase } from "@/lib/db/mode";
import { sessionStillValid } from "@/lib/db/sessions";

export type Session = { userId: string; companySlug: string; role: Role };

/** Everything the shell needs about the signed-in person, not just the guard fields. */
export type Viewer = {
  userId: string;
  companyId: string;
  companySlug: string;
  name: string;
  handle: string | null;
  role: Role;
  epoch: number;
};

function toViewer(c: SessionClaims): Viewer {
  return {
    userId: c.uid,
    companyId: c.cid,
    companySlug: c.slug,
    name: c.name,
    handle: c.handle,
    role: c.role,
    epoch: c.ep,
  };
}

/** Null when signed out, tampered, expired, or when AUTH_SECRET is not configured. */
export async function getViewer(): Promise<Viewer | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  const claims = verifySession(raw, secret);
  return claims ? toViewer(claims) : null;
}

export async function getSession(): Promise<Session | null> {
  const v = await getViewer();
  return v ? { userId: v.userId, companySlug: v.companySlug, role: v.role } : null;
}

/**
 * The viewer, but only if they belong to `slug`. The proxy already redirects, but layouts and
 * server actions re-check: a proxy is routing, not a security boundary, and server actions are
 * not covered by its matcher at all.
 *
 * With a database it also asks whether the cookie still describes reality: same company id (a
 * deleted and re-created slug is a different company), the person still exists with the same role,
 * and the company's session epoch has not moved (a stage change ends every older session). A
 * database error counts as "no": fail closed, the login page is the worst case.
 */
export async function getViewerFor(slug: string): Promise<Viewer | null> {
  const v = await getViewer();
  if (!v || v.companySlug !== slug) return null;
  if (!hasDatabase()) return v;
  const live = await sessionStillValid({ cid: v.companyId, slug, uid: v.userId, role: v.role, ep: v.epoch }).catch(() => false);
  return live ? v : null;
}
