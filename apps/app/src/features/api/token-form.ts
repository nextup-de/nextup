// The rules of the API token form (API-E1, D12). Pure: no database, no next/*.
import { OLD_SCOPES, SCOPES } from "@/features/integrations";
import type { MessageKey } from "@/i18n";

export const TOKEN_NAME_MAX = 60;
export const EXPIRY_CHOICES = ["30d", "90d", "1y", "never"] as const;
export type ExpiryChoice = (typeof EXPIRY_CHOICES)[number];
export const DEFAULT_EXPIRY: ExpiryChoice = "90d";

export type TokenInput = { name: string; scopes: readonly string[] };
export type TokenCheck = { ok: true; value: { name: string; scopes: string[] } } | { ok: false; error: MessageKey };

/** `namesInUse` are the names of the company's unrevoked tokens. Names compare without case and outer spaces. */
export function checkToken(input: TokenInput, namesInUse: readonly string[]): TokenCheck {
  const name = input.name.trim();
  if (name.length < 1 || name.length > TOKEN_NAME_MAX) return { ok: false, error: "settingsApiTokens.errName" };
  const key = name.toLowerCase();
  if (namesInUse.some((n) => n.trim().toLowerCase() === key)) return { ok: false, error: "settingsApiTokens.errNameInUse" };
  const known = SCOPES as readonly string[];
  if (input.scopes.some((s) => !known.includes(s))) return { ok: false, error: "settingsApiTokens.errScopeUnknown" };
  const scopes = known.filter((s) => input.scopes.includes(s));
  if (scopes.length === 0) return { ok: false, error: "settingsApiTokens.errNoScope" };
  return { ok: true, value: { name, scopes } };
}

export function isExpiryChoice(v: string): v is ExpiryChoice {
  return (EXPIRY_CHOICES as readonly string[]).includes(v);
}

/** When a token made at `now` stops working; null for never. */
export function expiryOf(choice: ExpiryChoice, now: Date): Date | null {
  if (choice === "never") return null;
  const d = new Date(now.getTime());
  if (choice === "1y") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCDate(d.getUTCDate() + (choice === "30d" ? 30 : 90));
  return d;
}

/** A token with old scopes only works on the events API, not on v1 (D12). */
export function isOldApiToken(scopes: readonly string[]): boolean {
  const old = OLD_SCOPES as readonly string[];
  return scopes.length > 0 && scopes.every((s) => old.includes(s));
}
