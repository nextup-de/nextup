// What an export file holds (GDP D14). Pure: rows in, a JSON-ready object out. No database, no React.
// Two rules decide everything here: nothing of D5 (personnel number, login code hashes, TOTP secrets,
// Entra object ids, API token hashes, sealed values, session data) reaches the file at any depth, and
// a person is named by their user id, with the label they have now (D9), never by a stored display string.
import { formatDate } from "@/i18n/format";
import { translate, type Locale, type MessageKey } from "@/i18n";

export type Row = Record<string, unknown>;

/** How long a ready export can be fetched. */
export const EXPORT_TTL_DAYS = 7;
export const EXPORT_FORMAT = "nextup-export";
export const EXPORT_VERSION = 1;

/**
 * Keys that never appear in a file, compared case-insensitively. Generic `hash` and `file` keys are not
 * listed on purpose: a case reference hash or an attached file name is data, not a credential.
 * Every key ending in `Sealed` is denied too (see isDenied).
 */
export const EXPORT_DENY: readonly string[] = [
  "employeeId",
  "loginCodeHash",
  "entraOid",
  "aadObjectId",
  "apiTokenHash",
  "totpSecretSealed",
  "tokenHash",
  "pairCodeHash",
  "codeHash",
  "accessCodeHash",
  "secret",
  "secrets",
  "password",
  "passwordHash",
  "refreshToken",
  "accessToken",
  "sessionToken",
  "sessionEpoch",
  "session",
  "cookie",
];

const DENIED = new Set(EXPORT_DENY.map((k) => k.toLowerCase()));

export const isDenied = (key: string): boolean => DENIED.has(key.toLowerCase()) || /sealed$/i.test(key);

/** Deep copy without denied keys; a Date becomes its ISO string, bytes become base64. */
export function stripDenied(value: unknown): unknown {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (value instanceof Uint8Array) return Buffer.from(value).toString("base64");
  if (Array.isArray(value)) return value.map(stripDenied);
  if (value && typeof value === "object") {
    const out: Row = {};
    for (const [k, v] of Object.entries(value as Row)) {
      if (isDenied(k) || v === undefined) continue;
      out[k] = stripDenied(v);
    }
    return out;
  }
  return value;
}

/** What the database layer hands over. `identities` maps a user id to the label that person has now. */
export type ExportRows = {
  company: Row;
  exportedAt: Date;
  identities: Record<string, string>;
  tables: Record<string, Row[]>;
};

export type ExportFile = {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  kind: "company" | "person";
  company: Row;
  exportedAt: string;
  tables: Record<string, Row[]>;
};

/** Shown where a person's current label is unknown (the user row is gone). Never the stored actor string. */
export const UNKNOWN_PERSON = "former member";

const rowsOf = (rows: ExportRows, table: string): Row[] => rows.tables[table] ?? [];
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** The company as the file shows it: id, slug, name, mark, stage, when it was made. No access code, no seed. */
function companyHead(company: Row): Row {
  const { id, slug, name, mark, stage, createdAt, anonymousHandles } = company;
  return stripDenied({ id, slug, name, mark, stage, anonymousHandles, createdAt }) as Row;
}

/** An event with its actor read from the person's current identity. `actorUserId` stays; a stale `actor` text does not. */
function eventOf(ev: Row, rows: ExportRows): Row {
  const uid = str(ev.actorUserId);
  return uid ? { ...ev, actor: rows.identities[uid] ?? UNKNOWN_PERSON } : ev;
}

const finish = (kind: ExportFile["kind"], rows: ExportRows, tables: Record<string, Row[]>): ExportFile => ({
  format: EXPORT_FORMAT,
  version: EXPORT_VERSION,
  kind,
  company: companyHead(rows.company),
  exportedAt: rows.exportedAt.toISOString(),
  tables: Object.fromEntries(Object.entries(tables).map(([name, list]) => [name, list.map((r) => stripDenied(r) as Row)])),
});

/** Never the bytes of a screenshot in the company file; whether there is one is enough. */
const withoutShot = (t: Row): Row => {
  const { screenshot, ...rest } = t;
  delete rest.screenshotMime;
  return { ...rest, hasScreenshot: screenshot != null };
};

/** A ticket the person reported, its screenshot inline as base64. */
const withShot = (t: Row): Row => {
  const { screenshot, ...rest } = t;
  return { ...rest, screenshotBase64: screenshot instanceof Uint8Array ? Buffer.from(screenshot).toString("base64") : null };
};

// AiCall (plan AIB D9) holds tokens and timings, no user id and no text: a company-level table like
// integrations, so it is in no person's export (buildPersonExport lists only what names the person).

/** Tables a company export carries as the database gave them; the ones in buildCompanyExport are filtered or rewritten. */
const COMPANY_PLAIN = [
  "users", "companyProfile", "companyContextRun", "orgUnits", "orgRoles", "seats", "routingRules", "goals", "companyRules", "floorAreas",
  "floorDevices", "calendar", "companyConfig", "caseViews", "assistTurns", "ticketReplies", "integrations", "auditEvents",
  "retentionRules", "privacyPolicy",
] as const;

/**
 * Everything of the company an admin may hold: structure, rules, calendar, people (without D5 fields), every
 * event, assistant turns as stored (masked), published ideas only, tickets without screenshot bytes,
 * integrations without sealed values, the audit log, retention and privacy settings. No idea drafts that are
 * drafts or discarded, no idea turns.
 */
export function buildCompanyExport(rows: ExportRows): ExportFile {
  const tables: Record<string, Row[]> = {};
  for (const name of COMPANY_PLAIN) tables[name] = rowsOf(rows, name);
  tables.events = rowsOf(rows, "events").map((e) => eventOf(e, rows));
  tables.ideaDrafts = rowsOf(rows, "ideaDrafts").filter((d) => d.status === "published");
  tables.tickets = rowsOf(rows, "tickets").map(withoutShot);
  return finish("company", rows, tables);
}

/**
 * One person's rows: their user row, seats, events they acted in, cases they raised, tickets they reported
 * (screenshots inline), mail choices, connections (provider and dates only), audit rows by or about them.
 * `toPerson`: also their assistant turns, idea drafts and idea turns; an admin's copy leaves those out.
 */
export function buildPersonExport(rows: ExportRows, opts: { userId: string; toPerson: boolean }): ExportFile {
  const { userId, toPerson } = opts;
  const mine = (t: string, key: string) => rowsOf(rows, t).filter((r) => r[key] === userId);
  const tickets = mine("tickets", "reporterId");
  const ticketIds = new Set(tickets.map((t) => t.id));
  const tables: Record<string, Row[]> = {
    users: rowsOf(rows, "users").filter((u) => u.id === userId),
    seats: mine("seats", "userId"),
    events: mine("events", "actorUserId").map((e) => eventOf(e, rows)),
    caseViews: mine("caseViews", "fromUserId"),
    tickets: tickets.map(withShot),
    ticketReplies: rowsOf(rows, "ticketReplies").filter((r) => ticketIds.has(r.ticketId)),
    notifyPreferences: mine("notifyPreferences", "userId"),
    connections: mine("connections", "userId").map(({ id, provider, lastUsedAt, createdAt, updatedAt }) => ({ id, provider, lastUsedAt, createdAt, updatedAt })),
    auditEvents: rowsOf(rows, "auditEvents").filter((a) => a.actorUserId === userId || a.targetId === userId),
  };
  if (toPerson) {
    tables.assistTurns = mine("assistTurns", "userId");
    const drafts = mine("ideaDrafts", "userId");
    const draftIds = new Set(drafts.map((d) => d.id));
    tables.ideaDrafts = drafts;
    tables.ideaTurns = rowsOf(rows, "ideaTurns").filter((t) => draftIds.has(t.draftId));
  }
  return finish("person", rows, tables);
}

/** The file as bytes. */
export const serializeExport = (file: ExportFile): Buffer => Buffer.from(JSON.stringify(file, null, 2), "utf8");

/** `<slug>-export-<yyyy-mm-dd>.json`, the day in UTC. */
export const exportFileName = (slug: string, at: Date): string => `${slug}-export-${at.toISOString().slice(0, 10)}.json`;

/** "812 B", "1.1 KB", "2.4 MB", in the locale's number format. */
export function formatSize(bytes: number, locale: Locale): string {
  const n = (x: number) => new Intl.NumberFormat(locale === "de" ? "de-DE" : "en-GB", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(x);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${n(bytes / 1024)} KB`;
  return `${n(bytes / (1024 * 1024))} MB`;
}

export const addDays = (from: Date, days: number): Date => new Date(from.getTime() + days * 86_400_000);

/** The address of a person is good enough to mail a link to: well-formed, and it came from the directory or Microsoft sign-in. */
export function hasVerifiedEmail(u: { email: string; entraOid: string | null; directorySyncedAt: Date | null }): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email.trim()) && (u.entraOid !== null || u.directorySyncedAt !== null);
}

export type ExportMail = { subject: string; text: string };

/** The mail to the person (spec 05): plain text, one link to the page, never to the file. */
export function composeExportMail(a: { name: string; companyName: string; sizeBytes: number; expiresAt: Date; url: string; locale: Locale }): ExportMail {
  const t = (key: MessageKey, p?: Record<string, string | number>) => translate(a.locale, key, p);
  const text = [
    `${a.name},`,
    "",
    t("privacyExport.mailIntro", { company: a.companyName }),
    "",
    `  ${t("privacyExport.mailWhat", { size: formatSize(a.sizeBytes, a.locale) })}`,
    "",
    t("privacyExport.mailLink", { url: a.url }),
    t("privacyExport.mailExpiry", { date: formatDate(a.locale, a.expiresAt, "day") }),
    "",
    t("privacyExport.mailNotYou"),
  ].join("\n");
  return { subject: t("privacyExport.mailSubject", { company: a.companyName }), text };
}
