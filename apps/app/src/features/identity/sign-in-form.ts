// The forms of the Sign-in page (EID-P1), on top of settings.ts: one parser per card and the state each
// card shows. Pure: strings in, a value or a list of what is wrong out. The client secret is write-only:
// it comes in with the form, never goes back out, and an empty field means "keep the one we have".
import {
  parseLogExportSettings,
  parseOidcSettings,
  parseSamlSettings,
  type LogExportSettings,
  type OidcSettings,
  type Parsed,
  type SamlSettings,
} from "@/features/identity/settings";
import { METADATA_MAX_BYTES, certStatus, type IdpMetadata } from "@/features/identity/saml-metadata";

const text = (v: unknown): string => (typeof v === "string" ? v : "");
const orNull = (v: unknown): string | null => (text(v).trim() ? text(v).trim() : null);
/** Blank fields fall back to the defaults of settings.ts. */
const orUndefined = (v: unknown): string | undefined => (text(v).trim() ? text(v).trim() : undefined);

const fail = (...errors: string[]): { ok: false; errors: string[] } => ({ ok: false, errors });

export type OidcForm = { settings: OidcSettings; clientSecret: string | null };

/** The OIDC card. `clientSecret` is null when the field was left empty (keep the stored one). */
export function parseOidcForm(raw: Record<string, unknown>): Parsed<OidcForm> {
  const r = parseOidcSettings({
    buttonText: raw.buttonText,
    issuer: raw.issuer,
    clientId: raw.clientId,
    scopes: orUndefined(raw.scopes),
    tokenAuth: orUndefined(raw.tokenAuth),
    emailClaim: orUndefined(raw.emailClaim),
    nameClaim: orUndefined(raw.nameClaim),
    departmentClaim: orNull(raw.departmentClaim),
  });
  if (!r.ok) return r;
  const secret = text(raw.clientSecret).trim();
  if (secret.length > 2000) return fail("clientSecret: is too long");
  return { ok: true, value: { settings: r.value, clientSecret: secret || null } };
}

export type SamlSource = { kind: "url"; url: string } | { kind: "file"; xml: string } | { kind: "keep" };
export type SamlForm = {
  buttonText: string;
  source: SamlSource;
  emailAttribute?: string;
  nameAttribute?: string;
  departmentAttribute: string | null;
};

/** The SAML card before the metadata is read: what the admin typed. The metadata itself is fetched by the action. */
export function parseSamlForm(raw: Record<string, unknown>): Parsed<SamlForm> {
  const errors: string[] = [];
  const buttonText = text(raw.buttonText).trim();
  if (buttonText.length < 1 || buttonText.length > 40) errors.push("buttonText: must be 1-40 characters");
  let source: SamlSource = { kind: "keep" };
  if (raw.source === "url") {
    const url = text(raw.metadataUrl).trim();
    if (!url) errors.push("metadataUrl: is required");
    source = { kind: "url", url };
  } else if (raw.source === "file") {
    const xml = text(raw.metadataXml);
    if (!xml.trim()) errors.push("metadataXml: is required");
    else if (Buffer.byteLength(xml, "utf8") > METADATA_MAX_BYTES) errors.push("metadataXml: is larger than 1 MB");
    source = { kind: "file", xml };
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      buttonText, source,
      emailAttribute: orUndefined(raw.emailAttribute),
      nameAttribute: orUndefined(raw.nameAttribute),
      departmentAttribute: orNull(raw.departmentAttribute),
    },
  };
}

/** The identity provider's side (from metadata or from the row we keep) plus the form's: the stored SAML settings. */
export function samlSettingsFrom(form: SamlForm, idp: IdpMetadata, metadataUrl: string | null): Parsed<SamlSettings> {
  return parseSamlSettings({
    buttonText: form.buttonText,
    idpEntityId: idp.entityId,
    ssoUrl: idp.ssoUrl,
    idpCerts: idp.certs,
    certExpiresAt: idp.certExpiresAt,
    metadataUrl,
    emailAttribute: form.emailAttribute,
    nameAttribute: form.nameAttribute,
    departmentAttribute: form.departmentAttribute,
  });
}

/** The log export card. Host, port, transport and CA matter for syslog only (settings.ts drops them for a file). */
export function parseLogExportForm(raw: Record<string, unknown>): Parsed<LogExportSettings> {
  const portText = text(raw.port).trim();
  const port = portText === "" ? null : /^\d+$/.test(portText) ? Number(portText) : Number.NaN;
  if (Number.isNaN(port)) return fail("port: must be a whole number from 1 to 65535");
  return parseLogExportSettings({
    target: raw.target,
    host: orNull(raw.host),
    port,
    transport: orUndefined(raw.transport),
    caPem: orNull(raw.caPem),
    appName: orUndefined(raw.appName),
  });
}

// ── What a card shows ───────────────────────────────────────────────────────────────────────────

export type CardState = "off" | "on" | "needsYou" | "error" | "demo";
export type CardKind = "oidc" | "saml" | "scim" | "logsink";

/** What cardState needs from an Integration row. */
export type CardRow = { on: boolean; settings: unknown; account: unknown; lastError: string | null };
/** `demo`: the company is a demo company (OIDC, SAML and SCIM are read-only there). */
export type CardExtra = { kind: CardKind; demo: boolean };

export type LastTest = { at: string; ok: boolean; detail: string };

/** `account.lastTest` of a row, or null. */
export function lastTestOf(account: unknown): LastTest | null {
  if (typeof account !== "object" || account === null) return null;
  const t = (account as { lastTest?: unknown }).lastTest;
  if (typeof t !== "object" || t === null) return null;
  const o = t as Record<string, unknown>;
  if (typeof o.at !== "string" || typeof o.ok !== "boolean") return null;
  return { at: o.at, ok: o.ok, detail: typeof o.detail === "string" ? o.detail : "" };
}

/** The soonest-expiring certificate of a SAML row, ISO, or null. */
export function soonestCertExpiry(settings: unknown): string | null {
  const s = parseSamlSettings(settings);
  if (!s.ok || s.value.certExpiresAt.length === 0) return null;
  return [...s.value.certExpiresAt].sort()[0];
}

/**
 * off: no row or switched off. demo: OIDC, SAML and SCIM of a demo company. Then, for a card that is on:
 * error when the last test failed, the last round failed, or the SAML certificate has expired; needsYou
 * when the SAML certificate expires in 30 days or less; else on.
 */
export function cardState(row: CardRow | null, extra: CardExtra, now: Date): CardState {
  if (extra.demo && extra.kind !== "logsink") return "demo";
  if (!row || !row.on) return "off";
  const test = lastTestOf(row.account);
  if ((test && !test.ok) || row.lastError) return "error";
  if (extra.kind === "saml") {
    const expiry = soonestCertExpiry(row.settings);
    if (expiry) {
      const s = certStatus(expiry, now);
      if (s === "expired") return "error";
      if (s === "soon") return "needsYou";
    }
  }
  return "on";
}
