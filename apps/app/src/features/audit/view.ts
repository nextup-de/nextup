// The audit view's rules (GDP D13): the filter in the address bar, the arguments of `listAudit`, the labels and
// the CSV. Pure: no database, no React. The view lists actions; it never ranks, sorts or counts by person (D2).
import {
  ACTOR_KINDS, AUDIT_ACTIONS, AUDIT_AREAS, actionLabelKey as actionKey, actorLabelKey as actorKey, areaOf, isAuditAction,
  type ActorKind,
} from "./index";

export const AUDIT_PERIODS = ["7d", "30d", "12m", "24m"] as const;
export type AuditPeriod = (typeof AUDIT_PERIODS)[number];
export const AUDIT_PAGE_SIZE = 50;
export const AUDIT_EXPORT_MAX = 10_000;

export type AuditFilter = { period: AuditPeriod; areas?: string[]; actorKinds?: ActorKind[]; actorUserId?: string; cursor?: string };

/** What the view needs of an audit row. `at` is a Date or an ISO string. */
export type AuditViewRow = {
  id: string;
  at: Date | string;
  actorKind: string;
  actorUserId: string | null;
  action: string;
  targetKind: string | null;
  targetId: string | null;
  changes: unknown;
  source?: string;
};

type Params = URLSearchParams | Record<string, string | string[] | undefined>;

function all(p: Params, key: string): string[] {
  if (p instanceof URLSearchParams) return p.getAll(key).flatMap((v) => v.split(","));
  const v = p[key];
  return (Array.isArray(v) ? v : v === undefined ? [] : [v]).flatMap((s) => s.split(","));
}
const first = (p: Params, key: string): string | undefined => all(p, key)[0] || undefined;

/** The filter of the address bar. Anything unknown is dropped; the period defaults to 30 days. */
export function parseAuditFilter(p: Params): AuditFilter {
  const period = first(p, "period");
  const areas = [...new Set(all(p, "area").filter((a) => (AUDIT_AREAS as readonly string[]).includes(a)))];
  const kinds = [...new Set(all(p, "actor").filter((k): k is ActorKind => (ACTOR_KINDS as readonly string[]).includes(k)))];
  const person = first(p, "person");
  const cursor = first(p, "cursor");
  const filter: AuditFilter = { period: (AUDIT_PERIODS as readonly string[]).includes(period ?? "") ? (period as AuditPeriod) : "30d" };
  if (areas.length) filter.areas = areas;
  if (kinds.length) filter.actorKinds = kinds;
  if (person) filter.actorUserId = person;
  if (cursor && parseCursor(cursor)) filter.cursor = cursor;
  return filter;
}

/** The filter as query parameters, the inverse of `parseAuditFilter` (the default period is left out). */
export function auditSearch(f: AuditFilter): URLSearchParams {
  const q = new URLSearchParams();
  if (f.period !== "30d") q.set("period", f.period);
  if (f.areas?.length) q.set("area", f.areas.join(","));
  if (f.actorKinds?.length) q.set("actor", f.actorKinds.join(","));
  if (f.actorUserId) q.set("person", f.actorUserId);
  if (f.cursor) q.set("cursor", f.cursor);
  return q;
}

export const cursorOf = (row: { at: Date; id: string }): string => `${row.at.toISOString()}|${row.id}`;

export function parseCursor(s: string): { at: Date; id: string } | null {
  const i = s.indexOf("|");
  if (i < 1 || i === s.length - 1) return null;
  const at = new Date(s.slice(0, i));
  return Number.isNaN(at.getTime()) ? null : { at, id: s.slice(i + 1) };
}

function since(period: AuditPeriod, now: Date): Date {
  const d = new Date(now);
  if (period === "7d") d.setUTCDate(d.getUTCDate() - 7);
  else if (period === "30d") d.setUTCDate(d.getUTCDate() - 30);
  else d.setUTCMonth(d.getUTCMonth() - (period === "12m" ? 12 : 24));
  return d;
}

export type AuditQuery = {
  from: Date;
  actions?: string[];
  actorKinds?: ActorKind[];
  actorUserId?: string;
  cursor?: { at: Date; id: string };
  take: number;
};

/** The arguments of `listAudit` (without the company) for a filter at `now`. The cursor is not part of a count. */
export function auditQuery(filter: AuditFilter, now: Date): AuditQuery {
  const cursor = filter.cursor ? parseCursor(filter.cursor) : null;
  return {
    from: since(filter.period, now),
    ...(filter.areas?.length ? { actions: AUDIT_ACTIONS.filter((a) => filter.areas?.includes(areaOf(a))) } : {}),
    ...(filter.actorKinds?.length ? { actorKinds: filter.actorKinds } : {}),
    ...(filter.actorUserId ? { actorUserId: filter.actorUserId } : {}),
    ...(cursor ? { cursor } : {}),
    take: AUDIT_PAGE_SIZE,
  };
}

/** One person in view hides the total (D2): the page then has only newer and older. */
export const showTotal = (filter: AuditFilter): boolean => !filter.actorUserId;

/** The key (in `settingsAudit`) of the actor's kind. */
export const actorLabelKey = (row: Pick<AuditViewRow, "actorKind">): string => actorKey(row.actorKind as ActorKind);

/** The key (in `settingsAudit`) of an action. An action this build does not know has no label: the caller shows it as written. */
export const actionLabelKey = (action: string): string | null => (isAuditAction(action) ? actionKey(action) : null);

const PERSON_KINDS = ["user", "member"];

/** A person by user id: the name resolved at read time (D9), or null when the person no longer exists. */
export const personName = (userId: string | null, names: Record<string, string>): string | null => (userId ? (names[userId] ?? null) : null);

export type TargetLabel = { kind: "none" } | { kind: "deletedPerson" } | { kind: "person"; name: string } | { kind: "ref"; targetKind: string; id: string };

export function targetLabel(row: Pick<AuditViewRow, "targetKind" | "targetId">, names: Record<string, string>): TargetLabel {
  if (!row.targetKind && !row.targetId) return { kind: "none" };
  if (row.targetKind && PERSON_KINDS.includes(row.targetKind) && row.targetId) {
    const name = personName(row.targetId, names);
    return name === null ? { kind: "deletedPerson" } : { kind: "person", name };
  }
  return { kind: "ref", targetKind: row.targetKind ?? "", id: row.targetId ?? "" };
}

export type ChangeEntry = { field: string; before: unknown; after: unknown };

/** The `changes` column as a list; anything that is not `{ field: { before, after } }` gives an empty list. */
export function changeEntries(changes: unknown): ChangeEntry[] {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return [];
  return Object.entries(changes as Record<string, unknown>).map(([field, v]) => {
    const c = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    return c && ("before" in c || "after" in c) ? { field, before: c.before ?? null, after: c.after ?? null } : { field, before: null, after: v ?? null };
  });
}

const SHORT = 24;
const isShort = (v: unknown): boolean =>
  v === null || typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && v.length <= SHORT);

/** The changes in one line when they are few and small (one or two fields, short plain values), else null. */
export function shortChanges(changes: unknown): ChangeEntry[] | null {
  const list = changeEntries(changes);
  if (list.length === 0 || list.length > 2) return null;
  return list.every((c) => isShort(c.before) && isShort(c.after)) ? list : null;
}

/** A value for a table cell or the CSV: plain text for scalars, JSON for the rest. */
export const valueText = (v: unknown): string => (v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v));

const csvField = (s: string): string => (/[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);

export const AUDIT_CSV_HEADER = "at,actorKind,actor,action,targetKind,target,changes";

/**
 * The rows as CSV (RFC 4180: CRLF, a field with a comma, quote or line break in quotes, quotes doubled). The
 * actor and the target are user ids, never names (D9); the changes are JSON.
 */
export function auditCsv(rows: readonly AuditViewRow[]): string {
  const lines = rows.map((r) =>
    [
      typeof r.at === "string" ? r.at : r.at.toISOString(),
      r.actorKind,
      r.actorUserId ?? "",
      r.action,
      r.targetKind ?? "",
      r.targetId ?? "",
      JSON.stringify(r.changes ?? {}),
    ].map(csvField).join(","),
  );
  return [AUDIT_CSV_HEADER, ...lines].join("\r\n") + "\r\n";
}

/** `<slug>-audit-<yyyy-mm-dd>.csv` */
export const auditCsvName = (slug: string, now: Date): string => `${slug}-audit-${now.toISOString().slice(0, 10)}.csv`;
