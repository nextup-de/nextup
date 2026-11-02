// NextUp support access codes (ITC/D8). Pure: node:crypto only, no database, no React.
import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

/** No I, O, 0 or 1: a code read over the phone is not mistaken. */
export const SUPPORT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const SUPPORT_CODE_LENGTH = 12;
/** How long a grant lasts. */
export const SUPPORT_GRANT_HOURS = 24;

export function newSupportCode(): string {
  let out = "";
  for (let i = 0; i < SUPPORT_CODE_LENGTH; i++) out += SUPPORT_CODE_ALPHABET[randomInt(SUPPORT_CODE_ALPHABET.length)];
  return out;
}

/** What a person typed, as the code: upper case, without spaces or dashes. */
export function normalizeSupportCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, "");
}

const KEY_BYTES = 32;

/** `salt:hash`, both hex, scrypt with a random salt. */
export function hashSupportCode(code: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(code, salt, KEY_BYTES).toString("hex")}`;
}

export function verifySupportCode(code: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const want = Buffer.from(hashHex, "hex");
  if (want.length !== KEY_BYTES) return false;
  return timingSafeEqual(scryptSync(code, Buffer.from(saltHex, "hex"), KEY_BYTES), want);
}

export type GrantTimes = { expiresAt: Date; revokedAt: Date | null };

export function grantActive(grant: GrantTimes, now: Date): boolean {
  return grant.revokedAt === null && grant.expiresAt.getTime() > now.getTime();
}

/** The new sign-in list: the time appended, the last 20 kept. Anything that is not a time string is dropped. */
export function appendSignin(existing: unknown, at: Date): string[] {
  const old = Array.isArray(existing) ? existing.filter((x): x is string => typeof x === "string") : [];
  return [...old, at.toISOString()].slice(-20);
}
