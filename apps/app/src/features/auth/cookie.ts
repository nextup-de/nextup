// The session cookie: a signed, stateless claim set.
//
// Stateless on purpose. src/proxy.ts runs on every request and Next's own docs say a proxy "is
// not intended for slow data fetching" - so it verifies a signature and nothing else. No session
// table, no database round trip in the hot path.
//
// Not a JWT library, and not Auth.js: people sign in with a personal code or Microsoft, so
// HMAC-SHA256 over base64url JSON is the whole requirement and it costs no dependency.
// Revocation is by rotating AUTH_SECRET (per-person revocation: docs/SECURITY.md).
//
// Pure: node:crypto only. No React, no DOM, no next/* - this file is imported by the proxy.
import { createHmac, timingSafeEqual } from "node:crypto";
import { ROLES, type Role } from "@/config/roles";

export const SESSION_COOKIE = "nextup_session";
export const ADMIN_COOKIE = "nextup_admin";

/** Eight hours: long enough for a working day of demoing, short enough to matter. */
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export type SessionClaims = {
  v: 1;
  cid: string; // company id
  slug: string; // company slug - checked against the URL, so one company's cookie is useless on another
  uid: string; // user id
  name: string; // display name; what the event log records as `actor`
  handle: string | null; // anonymous handle for members
  role: Role;
  ep: number; // Company.sessionEpoch at sign-in - a stage change bumps it and ends this session
  exp: number; // unix seconds
};

const b64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

function sign(payload: string, secret: string): string {
  return b64url(createHmac("sha256", secret).update(payload).digest());
}

/** `<base64url(json)>.<base64url(hmac)>` */
export function signSession(claims: SessionClaims, secret: string): string {
  const payload = b64url(JSON.stringify(claims));
  return `${payload}.${sign(payload, secret)}`;
}

/** Same for the admin cookie, which carries only an expiry - there is no admin user. */
export function signAdmin(exp: number, secret: string): string {
  const payload = b64url(JSON.stringify({ v: 1, admin: true, exp }));
  return `${payload}.${sign(payload, secret)}`;
}

function verifyRaw(raw: string | undefined, secret: string): Record<string, unknown> | null {
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot < 1) return null;

  const payload = raw.slice(0, dot);
  const given = fromB64url(raw.slice(dot + 1));
  const want = fromB64url(sign(payload, secret));
  // Length check first: timingSafeEqual throws on a mismatch rather than returning false.
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  try {
    const parsed: unknown = JSON.parse(fromB64url(payload).toString("utf8"));
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const isRole = (v: unknown): v is Role => ROLES.includes(v as Role);

/** Null for anything not currently valid: tampered, wrong secret, malformed or expired. */
export function verifySession(
  raw: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): SessionClaims | null {
  const c = verifyRaw(raw, secret);
  if (!c) return null;

  if (c.v !== 1) return null;
  if (typeof c.exp !== "number" || c.exp <= nowSeconds) return null;
  if (typeof c.cid !== "string" || typeof c.slug !== "string" || typeof c.uid !== "string") return null;
  if (typeof c.name !== "string") return null;
  if (!(typeof c.handle === "string" || c.handle === null)) return null;
  if (!isRole(c.role)) return null;
  // Cookies from before the epoch existed carry none: they count as epoch 0.
  const ep = c.ep === undefined ? 0 : c.ep;
  if (typeof ep !== "number") return null;

  return {
    v: 1,
    cid: c.cid,
    slug: c.slug,
    uid: c.uid,
    name: c.name,
    handle: c.handle,
    role: c.role,
    ep,
    exp: c.exp,
  };
}

export function verifyAdmin(
  raw: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const c = verifyRaw(raw, secret);
  return Boolean(c && c.v === 1 && c.admin === true && typeof c.exp === "number" && c.exp > nowSeconds);
}
