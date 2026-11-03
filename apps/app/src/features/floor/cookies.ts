// The signed cookies of the shop-floor pages (plan FLR, D8-D10): HMAC-SHA256 like signFlow in
// features/auth/entra.ts. Not a NextUp session: these open nothing outside /<slug>/floor.
import { createHmac, timingSafeEqual } from "node:crypto";

/** Names as FLR-D1's features/floor/codes.ts spells them. */
export const FLOOR_USER_COOKIE = "nextup_floor_user";
export const FLOOR_SENT_COOKIE = "nextup_floor_sent";
export const FLOOR_DEVICE_COOKIE = "nextup_floor_device";
export const FLOOR_ANON_COOKIE = "nextup_floor_anon";

/** Every floor cookie says when it ends, in epoch seconds. */
export type FloorClaims = { exp: number; [key: string]: unknown };

const b64url = (b: Buffer) => b.toString("base64url");
const mac = (payload: string, secret: string) => b64url(createHmac("sha256", secret).update(`floor:${payload}`).digest());

export function signFloorCookie(payload: FloorClaims, secret: string): string {
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  return `${body}.${mac(body, secret)}`;
}

/** The claims, or null when the signature is wrong, the value is malformed or `exp` has passed. */
export function verifyFloorCookie(raw: string | undefined, secret: string, now: number = Math.floor(Date.now() / 1000)): FloorClaims | null {
  if (!raw || !secret) return null;
  const dot = raw.indexOf(".");
  if (dot < 1) return null;
  const body = raw.slice(0, dot);
  const given = Buffer.from(raw.slice(dot + 1));
  const want = Buffer.from(mac(body, secret));
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<FloorClaims> | null;
    if (!claims || typeof claims !== "object" || typeof claims.exp !== "number") return null;
    return claims.exp > now ? (claims as FloorClaims) : null;
  } catch {
    return null;
  }
}
