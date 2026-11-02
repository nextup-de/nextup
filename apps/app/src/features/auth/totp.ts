// Second factor: TOTP, RFC 6238 (HMAC-SHA1, 6 digits, 30 s steps, one step of drift) over RFC 4226.
// The secret is kept sealed with the connector vault (features/connectors/vault.ts, context
// `totp:<companyId>:<userId>`); this file only does the arithmetic.
//
// Pure: node:crypto only. `time` and `now` are milliseconds, as Date.now() gives them.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

/** What a TOTP secret is sealed to: the company and the person. */
export const totpContext = (companyId: string, userId: string) => `totp:${companyId}:${userId}`;

/** RFC 4648 base32, upper case, no padding - what authenticator apps take as a key. */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** Bytes of a base32 string; spaces, hyphens, padding and case are ignored. Null for any other character. */
export function base32Decode(text: string): Buffer | null {
  const clean = text.toUpperCase().replace(/[\s-]+/g, "").replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) return null;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh 160-bit secret, base32. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The code for the 30 s step that contains `time` (ms). `digits` is 6 unless a test asks for 8. */
export function totpAt(secret: string, time: number, digits: number = TOTP_DIGITS): string {
  const key = base32Decode(secret);
  if (!key) throw new Error("not a base32 secret");
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 1000 / TOTP_STEP_SECONDS)));
  const mac = createHmac("sha1", key).update(counter).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/** True when `code` is the code of the current step or the one before or after it. Not two steps away. */
export function verifyTotp(secret: string, code: string, now: number): boolean {
  const given = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(given) || !base32Decode(secret)) return false;
  let ok = false;
  for (const drift of [-1, 0, 1]) {
    const want = totpAt(secret, now + drift * TOTP_STEP_SECONDS * 1000);
    // No early exit: every step is compared, so timing does not say which one matched.
    if (timingSafeEqual(Buffer.from(want), Buffer.from(given))) ok = true;
  }
  return ok;
}

/** The otpauth:// link an authenticator takes (shown as text; there is no QR image). */
export function otpauthUrl(issuer: string, account: string, secret: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const q = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(TOTP_DIGITS), period: String(TOTP_STEP_SECONDS) });
  return `otpauth://totp/${label}?${q.toString()}`;
}
