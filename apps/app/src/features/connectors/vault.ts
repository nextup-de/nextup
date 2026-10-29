// Seal and open the tokens NextUp keeps to read a source on a person's behalf (Connection rows,
// docs/plans/2026-10-22_sso-and-data-access.md, phase 2) and the secrets of a company's integration
// (Integration rows, docs/plans/2026-10-29_jira-in-app.md). AES-256-GCM with CONNECTOR_VAULT_KEY.
//
// Each sealed value is bound to its context (GCM's additional data): a person's token is bound to
// its company and person, an integration secret to its company and system. One copied into another
// row, or another company's, does not open. The key never leaves the
// stack's .env; a database dump alone holds nothing usable.
//
// Format: "v1.<iv>.<tag>.<ciphertext>", each part base64url. The version lets a later key or
// algorithm sit next to this one while old rows are re-sealed.
//
// Pure: node:crypto only.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const KEY_HEX = /^[0-9a-f]{64}$/i;

/** The 32-byte key, or null when CONNECTOR_VAULT_KEY is missing or not 64 hex characters. */
export function vaultKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  const hex = env.CONNECTOR_VAULT_KEY?.trim();
  return hex && KEY_HEX.test(hex) ? Buffer.from(hex, "hex") : null;
}

/** What a sealed value is bound to: the row's company and person. */
export const vaultContext = (companyId: string, userId: string) => `connection:${companyId}:${userId}`;

/**
 * What a company's integration secret (Integration.secretSealed, webhookSecretSealed) is bound to:
 * the company and the system, not a person - the token belongs to the company's integration account.
 * The prefix differs from vaultContext's, so a person's token never opens as an integration secret.
 * Both secrets of one row share this context; they are different values, not different contexts.
 */
export const integrationContext = (companyId: string, system: string) => `integration:${companyId}:${system}`;

export function seal(plain: string, key: Buffer, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), body].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

/** The plain value, or null when it was sealed with another key, for another row, or tampered with. */
export function open(sealed: string, key: Buffer, context: string): string | null {
  const [version, iv, tag, body, ...rest] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || body === undefined || rest.length) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
