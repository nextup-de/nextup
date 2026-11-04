// NextUp support access codes (ITC/D8). Pure: node:crypto only, no database, no React.
import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

/** No I, O, 0 or 1: a code read over the phone is not mistaken. */
export const SUPPORT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const SUPPORT_CODE_LENGTH = 12;
/** How long a grant lasts. */
export const SUPPORT_GRANT_HOURS = 24;
/** What a company admin can choose in Settings (SEC/D7), the default first shown, and the longest a grant may run from now. */
export const SUPPORT_GRANT_CHOICES = [1, 4, 24, 72] as const;
export type SupportGrantChoice = (typeof SUPPORT_GRANT_CHOICES)[number];
export const SUPPORT_GRANT_DEFAULT_HOURS: SupportGrantChoice = 4;
export const SUPPORT_GRANT_MAX_HOURS = 72;
export const SUPPORT_REASON_MAX = 200;

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

export function isGrantChoice(n: unknown): n is SupportGrantChoice {
  return typeof n === "number" && (SUPPORT_GRANT_CHOICES as readonly number[]).includes(n);
}

/** The reason as typed: trimmed, 1-200 characters. */
export function checkReason(raw: unknown): { ok: true; value: string } | { ok: false } {
  const value = typeof raw === "string" ? raw.trim() : "";
  return value.length >= 1 && value.length <= SUPPORT_REASON_MAX ? { ok: true, value } : { ok: false };
}

/** Extending moves the end by `hours` from max(now, end) and never past SUPPORT_GRANT_MAX_HOURS from now. */
export function extendTo(expiresAt: Date, hours: number, now: Date): Date {
  const from = Math.max(now.getTime(), expiresAt.getTime());
  return new Date(Math.min(from + hours * 3_600_000, now.getTime() + SUPPORT_GRANT_MAX_HOURS * 3_600_000));
}

export type SupportPageState =
  | { kind: "demo" }
  | { kind: "none"; breakGlassUntil: Date | null }
  | { kind: "open"; until: Date; canExtend: boolean; breakGlassUntil: Date | null };

/** What the page shows, from the company's stage, its open grant and the server's break-glass window. */
export function supportPageState(
  input: { stage: string; grant: GrantTimes | null; breakGlassUntil: Date | null },
  now: Date,
): SupportPageState {
  if (input.stage === "demo") return { kind: "demo" };
  const bg = input.breakGlassUntil && input.breakGlassUntil.getTime() > now.getTime() ? input.breakGlassUntil : null;
  if (!input.grant || !grantActive(input.grant, now)) return { kind: "none", breakGlassUntil: bg };
  const limit = now.getTime() + SUPPORT_GRANT_MAX_HOURS * 3_600_000;
  return { kind: "open", until: input.grant.expiresAt, canExtend: input.grant.expiresAt.getTime() < limit, breakGlassUntil: bg };
}
