// SuccessFactors directory mapping (plan SFX, D3-D5). Pure: no network, no database. SAP's rows go in, one
// DirectoryPage comes out. The personnel number (personIdExternal) is an id for matching only: it appears in
// no message and no error here.
import type { DirectoryEntry, DirectoryGroup, DirectoryPage } from "@nextup/contracts/public";

export type SfEntity = "User" | "EmpEmployment" | "EmpJob" | "FODepartment";

/** D3: the only entities and fields NextUp ever asks SAP for. The one place they are written. */
export const SF_SELECT: Record<SfEntity, string[]> = {
  User: ["userId", "firstName", "lastName", "email", "lastModifiedDateTime"],
  EmpEmployment: ["personIdExternal", "userId", "startDate", "endDate", "lastModifiedDateTime"],
  EmpJob: ["userId", "startDate", "department", "jobTitle", "managerId", "lastModifiedDateTime"],
  FODepartment: ["externalCode", "name", "parent", "status", "lastModifiedDateTime"],
};

export type SapRows = {
  users: unknown[];
  employments: unknown[];
  jobs: unknown[];
  departments: unknown[];
  /** Employments of managers outside the rows above (a delta run), used only to resolve managerExternalId. */
  managerEmployments?: unknown[];
};

type Row = Record<string, unknown>;

/** The UTC date, yyyy-MM-dd. */
export function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** `/Date(<ms>)/` and `/Date(<ms>+0000)/`; null when it is neither. */
export function parseSapDate(s: unknown): Date | null {
  if (typeof s !== "string") return null;
  const m = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateOf(v: unknown): Date | null {
  const sap = parseSapDate(v);
  if (sap) return sap;
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function text(v: unknown): string | null {
  if (typeof v === "number") return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

const asRow = (v: unknown): Row | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : null);
const rowsOf = (list: unknown[] | undefined): Row[] => (list ?? []).map(asRow).filter((r): r is Row => r !== null);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The job in force on `today`: the latest startDate that is not after it. */
function currentJobs(jobs: Row[], today: string): Map<string, Row> {
  const best = new Map<string, { row: Row; start: number }>();
  for (const row of jobs) {
    const userId = text(row.userId);
    if (!userId) continue;
    const start = dateOf(row.startDate);
    if (start && utcDay(start) > today) continue;
    const t = start ? start.getTime() : Number.NEGATIVE_INFINITY;
    const have = best.get(userId);
    if (!have || t > have.start) best.set(userId, { row, start: t });
  }
  return new Map([...best].map(([k, v]) => [k, v.row]));
}

export function toDirectoryPage(input: SapRows & { today: Date }): { page: DirectoryPage; skipped: number } {
  const today = utcDay(input.today);
  let skipped = 0;

  const users = new Map<string, Row>();
  for (const u of rowsOf(input.users)) {
    const id = text(u.userId);
    if (id) users.set(id, u);
  }
  const departments = new Map<string, { name: string; active: boolean }>();
  const groups: DirectoryGroup[] = [];
  for (const dep of rowsOf(input.departments)) {
    const code = text(dep.externalCode);
    const name = text(dep.name);
    if (!code || !name) {
      skipped += 1;
      continue;
    }
    const active = text(dep.status) === "A";
    departments.set(code, { name: name.slice(0, 120), active });
    if (active) groups.push({ externalId: code, name: name.slice(0, 120), parentExternalId: text(dep.parent) });
  }
  const jobs = currentJobs(rowsOf(input.jobs), today);

  const employments = rowsOf(input.employments);
  const personOf = new Map<string, string>();
  for (const e of [...employments, ...rowsOf(input.managerEmployments)]) {
    const userId = text(e.userId);
    const person = text(e.personIdExternal);
    if (userId && person && !personOf.has(userId)) personOf.set(userId, person);
  }

  const entries: DirectoryEntry[] = [];
  const seen = new Set<string>();
  for (const e of employments) {
    const person = text(e.personIdExternal);
    const userId = text(e.userId);
    const user = userId ? users.get(userId) : undefined;
    const emailRaw = user ? text(user.email)?.toLowerCase() : null;
    const email = emailRaw && EMAIL.test(emailRaw) ? emailRaw : null;
    const name = user ? [text(user.firstName), text(user.lastName)].filter(Boolean).join(" ") || email : null;
    const end = dateOf(e.endDate);
    const endBad = text(e.endDate) !== null && end === null;
    if (!person || !userId || !user || !name || endBad || seen.has(person)) {
      skipped += 1;
      continue;
    }
    seen.add(person);
    const job = jobs.get(userId);
    const code = job ? text(job.department) : null;
    const dep = code ? departments.get(code) : undefined;
    const managerUser = job ? text(job.managerId) : null;
    const manager =
      managerUser && managerUser !== "NO_MANAGER" && managerUser !== userId ? (personOf.get(managerUser) ?? null) : null;
    entries.push({
      externalId: person,
      employeeId: person,
      displayName: name.slice(0, 120),
      email,
      department: dep ? dep.name : null,
      jobTitle: job ? text(job.jobTitle) : null,
      managerExternalId: manager,
      groupExternalIds: code && dep?.active ? [code] : [],
      active: end === null || utcDay(end) >= today,
    });
  }
  return { page: { entries, groups, removedExternalIds: [], nextCursor: null }, skipped };
}

// ---- cursor (D5) ----

export type SfCursor = { watermark: string | null; fullDay: string | null };

export function parseCursor(s: string | null | undefined): SfCursor | null {
  if (!s) return null;
  try {
    const o = JSON.parse(s) as Record<string, unknown> | null;
    if (!o || o.v !== 1) return null;
    const watermark = typeof o.watermark === "string" && !Number.isNaN(Date.parse(o.watermark)) ? o.watermark : null;
    const fullDay = typeof o.fullDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.fullDay) ? o.fullDay : null;
    return { watermark, fullDay };
  } catch {
    return null;
  }
}

/** The first run of each UTC day is a full read; so is any run without a usable cursor. */
export function isFullRun(cursor: SfCursor | null, today: Date): boolean {
  return !cursor || !cursor.watermark || cursor.fullDay !== utcDay(today);
}

/** The cursor to store: the highest lastModifiedDateTime seen (never going back) and the day of the last full read. */
export function nextCursor(args: { previous: SfCursor | null; rows: SapRows; full: boolean; today: Date }): string {
  let max = args.previous?.watermark ? Date.parse(args.previous.watermark) : Number.NEGATIVE_INFINITY;
  for (const list of [args.rows.users, args.rows.employments, args.rows.jobs, args.rows.departments]) {
    for (const row of rowsOf(list)) {
      const d = dateOf(row.lastModifiedDateTime);
      if (d && d.getTime() > max) max = d.getTime();
    }
  }
  return JSON.stringify({
    v: 1,
    watermark: Number.isFinite(max) ? new Date(max).toISOString() : null,
    fullDay: args.full ? utcDay(args.today) : (args.previous?.fullDay ?? null),
  });
}
