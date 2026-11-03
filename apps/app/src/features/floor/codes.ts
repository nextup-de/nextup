// Shop-floor secrets and cookie names (FLR D9, D10). Pure: node:crypto only. A pairing code and a floor code
// are drawn here; what is stored is only a hash (hashFloor in lib/db/floor.ts, hashDeviceToken below).
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const FLOOR_DEVICE_COOKIE = "nextup_floor_device";
export const FLOOR_ANON_COOKIE = "nextup_floor_anon";

/** No I, O, 0 or 1: a pairing code is read off a screen and typed on a shared phone. */
export const PAIR_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const PAIR_CODE_LENGTH = 6;
export const FLOOR_CODE_LENGTH = 6;
/** A pairing code works for thirty minutes, once. */
export const PAIR_CODE_MINUTES = 30;
/** The device cookie lives 400 days (the longest a browser keeps one). */
export const DEVICE_COOKIE_SECONDS = 400 * 24 * 60 * 60;

export function newPairCode(): string {
  return Array.from({ length: PAIR_CODE_LENGTH }, () => PAIR_ALPHABET[randomInt(PAIR_ALPHABET.length)]).join("");
}

export function newFloorCode(): string {
  return Array.from({ length: FLOOR_CODE_LENGTH }, () => String(randomInt(10))).join("");
}

/** 32 random bytes, base64url. */
export function newDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What a typed pairing code is compared as: capitals, no spaces or hyphens. */
export function normalizePairCode(raw: string): string {
  return raw.normalize("NFKC").toUpperCase().replace(/[\s-]+/g, "");
}

export function looksLikePairCode(code: string): boolean {
  return code.length === PAIR_CODE_LENGTH && [...code].every((c) => PAIR_ALPHABET.includes(c));
}

/** sha256 hex of the device token - what FloorDevice.tokenHash stores. */
export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** `d:<device id>` for a paired device, else `a:<anonymous id>` - the key of the floor rate limits. */
export function deviceKey(who: { deviceId?: string | null; anonId?: string | null }): string {
  return who.deviceId ? `d:${who.deviceId}` : `a:${who.anonId ?? ""}`;
}

const sign = (value: string, secret: string) => createHmac("sha256", secret).update(value).digest("base64url");

/** `<value>.<hmac>`: a cookie value nobody can make up without AUTH_SECRET. */
export function signCookieValue(value: string, secret: string): string {
  return `${value}.${sign(value, secret)}`;
}

/** The value inside a signed cookie, or null when it is missing, altered or signed with another secret. */
export function readSignedValue(raw: string | undefined, secret: string): string | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  const value = raw.slice(0, dot);
  const given = Buffer.from(raw.slice(dot + 1));
  const want = Buffer.from(sign(value, secret));
  return given.length === want.length && timingSafeEqual(given, want) ? value : null;
}
