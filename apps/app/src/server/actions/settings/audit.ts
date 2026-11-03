// The audit view's reads (GDP D13). Not a "use server" module: the page and the export route call it, and
// each call starts with the company-admin guard. Names are resolved here, at read time, from user ids (D9).
import { cursorOf, auditQuery, showTotal, AUDIT_EXPORT_MAX, type AuditFilter, type AuditViewRow } from "@/features/audit/view";
import { countAudit, listAudit, type AuditRow } from "@/lib/db/audit";
import { getDb } from "@/lib/db/client";
import { companyAdminOf } from "@/server/actions/settings/guard";
import type { Viewer } from "@/features/auth/session";

export type AuditRowData = Omit<AuditViewRow, "at"> & { at: string; source: string };
export type AuditPageData = {
  companyName: string;
  rows: AuditRowData[];
  names: Record<string, string>;
  next: string | null;
  total: number | null;
  people: { id: string; name: string }[];
  error?: boolean;
};

const toData = (r: AuditRow): AuditRowData => ({
  id: r.id, at: r.at.toISOString(), actorKind: r.actorKind, actorUserId: r.actorUserId, action: r.action,
  targetKind: r.targetKind, targetId: r.targetId, changes: r.changes, source: r.source,
});

const NAME_PAGE = 200;

async function namesOf(companyId: string, rows: readonly AuditRow[]): Promise<Record<string, string>> {
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.actorUserId) ids.add(r.actorUserId);
    if ((r.targetKind === "user" || r.targetKind === "member") && r.targetId) ids.add(r.targetId);
  }
  if (!ids.size) return {};
  const users = await getDb().user.findMany({ where: { companyId, id: { in: [...ids] } }, select: { id: true, name: true } });
  return Object.fromEntries(users.map((u) => [u.id, u.name]));
}

/** One page of the log for a company admin, else null. A failed read gives `{ error: true }`. */
export async function loadAuditPage(slug: string, filter: AuditFilter): Promise<AuditPageData | null> {
  const viewer = await companyAdminOf(slug);
  if (!viewer) return null;
  const { companyId } = viewer;
  const empty: AuditPageData = { companyName: slug, rows: [], names: {}, next: null, total: null, people: [], error: true };
  try {
    const q = auditQuery(filter, new Date());
    const { cursor: _cursor, take, ...where } = q;
    void _cursor;
    const [fetched, company, people, total] = await Promise.all([
      listAudit(companyId, { ...q, take: take + 1 }),
      getDb().company.findUnique({ where: { id: companyId }, select: { name: true } }),
      getDb().user.findMany({
        where: { companyId, OR: [{ role: "manager" }, { isStackAdmin: true }] },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      showTotal(filter) ? countAudit(companyId, where) : Promise.resolve(null),
    ]);
    const page = fetched.slice(0, take);
    return {
      companyName: company?.name ?? slug,
      rows: page.map(toData),
      names: await namesOf(companyId, page),
      next: fetched.length > take ? cursorOf(page[page.length - 1]) : null,
      total,
      people,
    };
  } catch {
    return empty;
  }
}

/** Up to AUDIT_EXPORT_MAX rows of the filter (no cursor), newest first, for the CSV; null unless a company admin. */
export async function loadAuditExport(slug: string, filter: AuditFilter): Promise<{ viewer: Viewer; rows: AuditRowData[] } | null> {
  const viewer = await companyAdminOf(slug);
  if (!viewer) return null;
  const { cursor: _cursor, take: _take, ...q } = auditQuery({ ...filter, cursor: undefined }, new Date());
  void _cursor; void _take;
  const rows: AuditRow[] = [];
  let cursor: { at: Date; id: string } | undefined;
  while (rows.length < AUDIT_EXPORT_MAX) {
    const batch = await listAudit(viewer.companyId, { ...q, cursor, take: Math.min(NAME_PAGE, AUDIT_EXPORT_MAX - rows.length) });
    rows.push(...batch);
    if (batch.length < NAME_PAGE) break;
    const last = batch[batch.length - 1];
    cursor = { at: last.at, id: last.id };
  }
  return { viewer, rows: rows.map(toData) };
}
