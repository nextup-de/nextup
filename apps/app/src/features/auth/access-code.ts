// The per-company access code: how people get in during the pilot.
//
// No passwords and no email. A company has one shared code; you enter it, then pick which of the
// company's people you are. That is enough to prove tenant isolation and role enforcement for
// real, which is the point of the pilot, without an auth provider or a mail sender.
//
// Pure: node:crypto only.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const N = 16384; // scrypt cost. Deliberately modest - this runs on one login, not on every request.
const KEYLEN = 64;

/** `scrypt$<saltHex>$<hashHex>` - what Company.accessCodeHash stores. */
export function hashAccessCode(code: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(code.normalize("NFKC"), salt, KEYLEN, { N });
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** Constant-time where it matters. False for a malformed stored value rather than throwing. */
export function verifyAccessCode(code: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  let salt: Buffer;
  let want: Buffer;
  try {
    salt = Buffer.from(parts[1], "hex");
    want = Buffer.from(parts[2], "hex");
  } catch {
    return false;
  }
  if (salt.length === 0 || want.length !== KEYLEN) return false;

  const got = scryptSync(code.normalize("NFKC"), salt, KEYLEN, { N });
  return timingSafeEqual(got, want);
}

/** A readable code to hand a colleague: "acme-7f3k-92xd". */
export function generateAccessCode(slug: string): string {
  const chunk = () => randomBytes(2).toString("hex");
  return `${slug}-${chunk()}-${chunk()}`;
}
