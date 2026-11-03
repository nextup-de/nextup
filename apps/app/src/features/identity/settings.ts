// Parse and check the settings of the four identity systems (EID D7): Integration.settings for oidc,
// saml, scim and logsink. Pure: the stored JSON or an admin's form in, a value or a list of what is
// wrong out. Unknown fields are dropped. Secrets (the OIDC client secret) are never in settings.
import { z } from "zod";

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

/**
 * Every URL an admin gives is https. The one exception is http://127.0.0.1:<port> and
 * http://localhost:<port> while `env.VITEST` is set: the fakes of the tests.
 */
export function allowedUrl(url: string, env: Record<string, string | undefined> = process.env): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.username || u.password) return false;
  if (u.protocol === "https:") return u.hostname.length > 0;
  return u.protocol === "http:" && !!env.VITEST && LOCAL_HOSTS.has(u.hostname) && u.port !== "";
}

const url = z.string().trim().max(500).refine((v) => allowedUrl(v), "must be an https address");
const nullableText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const PEM = /^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----\s*$/;
const pem = z.string().trim().max(10_000).regex(PEM, "must be a PEM certificate");

const buttonText = z.string().trim().min(1).max(40);

const oidcSchema = z.object({
  buttonText,
  issuer: url,
  clientId: z.string().trim().min(1).max(200),
  scopes: z.string().trim().max(500).default("openid email profile")
    .refine((s) => s.split(/\s+/).includes("openid"), "must contain openid"),
  tokenAuth: z.enum(["client_secret_basic", "client_secret_post"]).default("client_secret_basic"),
  emailClaim: z.string().trim().min(1).max(100).default("email"),
  nameClaim: z.string().trim().min(1).max(100).default("name"),
  departmentClaim: nullableText(100),
});
export type OidcSettings = z.output<typeof oidcSchema>;

const CLAIM_EMAIL = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress";
const CLAIM_NAME = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name";

const samlSchema = z.object({
  buttonText,
  idpEntityId: z.string().trim().min(1).max(500),
  ssoUrl: url,
  idpCerts: z.array(pem).min(1).max(3),
  certExpiresAt: z.array(z.iso.datetime()).max(3).default([]),
  metadataUrl: z.string().trim().max(500).nullish()
    .refine((v) => !v || allowedUrl(v), "must be an https address")
    .transform((v) => (v ? v : null)),
  emailAttribute: z.string().trim().min(1).max(300).default(CLAIM_EMAIL),
  nameAttribute: z.string().trim().min(1).max(300).default(CLAIM_NAME),
  departmentAttribute: nullableText(300),
});
export type SamlSettings = z.output<typeof samlSchema>;

const scimSchema = z.object({ tokenId: z.string().trim().min(1).max(100) });
export type ScimSettings = z.output<typeof scimSchema>;

const logSchema = z.object({
  target: z.enum(["syslog", "file"]),
  host: nullableText(253),
  port: z.number().int().min(1).max(65535).nullish().transform((v) => v ?? null),
  transport: z.enum(["tls", "tcp", "udp"]).nullish(),
  caPem: nullableText(10_000),
  appName: z.string().trim().regex(/^[\x21-\x7e]{1,48}$/, "must be 1-48 printable characters without spaces").default("nextup"),
});
export type LogExportSettings = {
  target: "syslog" | "file";
  host: string | null;
  port: number | null;
  transport: "tls" | "tcp" | "udp" | null;
  caPem: string | null;
  appName: string;
};

function run<T extends z.ZodType>(schema: T, raw: unknown): Parsed<z.output<T>> {
  const r = schema.safeParse(raw);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, errors: r.error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)) };
}

export const parseOidcSettings = (raw: unknown): Parsed<OidcSettings> => run(oidcSchema, raw);
export const parseSamlSettings = (raw: unknown): Parsed<SamlSettings> => run(samlSchema, raw);
export const parseScimSettings = (raw: unknown): Parsed<ScimSettings> => run(scimSchema, raw);

/** Host, port and transport belong to syslog only: a file target stores them as null. */
export function parseLogExportSettings(raw: unknown): Parsed<LogExportSettings> {
  const r = run(logSchema, raw);
  if (!r.ok) return r;
  const v = r.value;
  if (v.target === "file") return { ok: true, value: { target: "file", host: null, port: null, transport: null, caPem: null, appName: v.appName } };
  const errors: string[] = [];
  if (!v.host) errors.push("host: is required for syslog");
  if (v.port === null) errors.push("port: is required for syslog");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { target: "syslog", host: v.host, port: v.port, transport: v.transport ?? "tls", caPem: v.caPem, appName: v.appName } };
}
