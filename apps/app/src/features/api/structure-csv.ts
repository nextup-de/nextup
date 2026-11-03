// The four structure files of the CSV import and export (API D13). Pure: file texts and the company's current
// structure in, every error (file, line, column, message key) and a plan of adds and changes out. Nothing
// here writes; lib/db/structure-csv.ts applies a plan. Matching: units and routes by key, roles by unit key
// + title, members by email. An import never deletes.
import type { Knowledge } from "@/features/knowledge";
import { keywordsRule, ROUTE_KEY, UNIT_KEY, UNIT_KINDS } from "@/features/org-edit";
import type { MessageKey } from "@/i18n";
import { parseCsv, writeCsv } from "./csv";

export const KINDS = ["units", "roles", "members", "routes"] as const;
export type FileKind = (typeof KINDS)[number];
export type StructureFiles = Partial<Record<FileKind, string>>;

export const MAX_ROWS = 5000;
export const MAX_BYTES = 5 * 1024 * 1024;

export const COLUMNS: Record<FileKind, readonly string[]> = {
  units: ["key", "name", "kind", "parent_key", "headcount"],
  roles: ["unit_key", "title", "reports_to_unit_key", "reports_to_title", "seats", "spend_limit_eur", "decides"],
  members: ["name", "email", "department", "app_role", "language", "seat_unit_key", "seat_role_title"],
  routes: ["key", "keywords", "owner_unit_key", "owner_role_title"],
};
const REQUIRED: Record<FileKind, readonly string[]> = {
  units: ["key", "name", "kind"],
  roles: ["unit_key", "title"],
  members: ["name", "email"],
  routes: ["key", "keywords", "owner_unit_key", "owner_role_title"],
};

export type ImportMessage = Extract<MessageKey, `settingsImport.err${string}`>;
/** `line` 0 and `column` "" for an error that belongs to the whole file. */
export type CsvError = { file: FileKind; line: number; column: string; message: ImportMessage; values?: Record<string, string | number> };

export type MemberRow = { id: string; name: string; email: string; dept: string; role: string; locale: string | null; active: boolean };
export type Current = Knowledge & { members: MemberRow[] };
export type RoleRef = { unitKey: string; title: string };

export type UnitPlan = { op: "add" | "change"; line: number; key: string; name: string; kind: string; headcount: number; parentKey: string | null };
export type RolePlan = {
  op: "add" | "change"; line: number; unitKey: string; title: string; reportsTo: RoleRef | null;
  decides: string[]; spendLimitEur: number | null; seats: number | null;
};
export type MemberPlan = { op: "add" | "change"; line: number; name: string; email: string; dept: string; role: string; locale: string | null; seat: RoleRef | null };
export type RoutePlan = { op: "add" | "change"; line: number; key: string; keywords: string[]; owner: RoleRef };

export type Plan = {
  units: UnitPlan[]; roles: RolePlan[]; members: MemberPlan[]; routes: RoutePlan[];
  /** Rows that match the current structure exactly. */
  same: Record<FileKind, number>;
  /** Columns of each file that are not part of the layout; they are ignored. */
  ignored: Partial<Record<FileKind, string[]>>;
  /** Rows read per file. */
  rows: Partial<Record<FileKind, number>>;
};
export type CheckResult = { ok: boolean; errors: CsvError[]; plan: Plan };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sep = "\u0000";
const roleId = (r: RoleRef) => `${r.unitKey}${sep}${r.title}`;
const integer = (s: string, max: number): number | null => (/^\d{1,10}$/.test(s) && Number(s) <= max ? Number(s) : null);
const list = (s: string) => s.split(";").map((x) => x.trim()).filter(Boolean);
const same = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((x, i) => x === b[i]);

type Table = { rows: { line: number; row: number; get: (c: string) => string }[]; ok: boolean };

export function checkStructureCsv(files: StructureFiles, current: Current): CheckResult {
  const errors: CsvError[] = [];
  const plan: Plan = {
    units: [], roles: [], members: [], routes: [],
    same: { units: 0, roles: 0, members: 0, routes: 0 }, ignored: {}, rows: {},
  };
  const fail = (file: FileKind, line: number, column: string, message: ImportMessage, values?: CsvError["values"]) =>
    errors.push({ file, line, column, message, ...(values ? { values } : {}) });

  const read = (kind: FileKind): Table | null => {
    const text = files[kind];
    if (text === undefined) return null;
    const p = parseCsv(text);
    plan.rows[kind] = p.rows.length;
    if (p.unterminated) fail(kind, p.lines.at(-1) ?? 1, "", "settingsImport.errQuote");
    const header = p.header.map((h) => h.toLowerCase());
    const missing = REQUIRED[kind].filter((c) => !header.includes(c));
    for (const c of missing) fail(kind, 1, c, "settingsImport.errColumnMissing", { column: c });
    const extra = p.header.filter((h) => h && !COLUMNS[kind].includes(h.toLowerCase()));
    if (extra.length) plan.ignored[kind] = extra;
    if (p.rows.length > MAX_ROWS) {
      fail(kind, 0, "", "settingsImport.errRows", { max: MAX_ROWS });
      return { rows: [], ok: false };
    }
    if (missing.length) return { rows: [], ok: false };
    return {
      ok: true,
      rows: p.rows.map((cells, i) => ({
        line: p.lines[i], row: i + 1,
        get: (c) => (cells[header.indexOf(c)] ?? "").trim(),
      })),
    };
  };
  const tables = { units: read("units"), roles: read("roles"), members: read("members"), routes: read("routes") };

  // Duplicate keys inside one file.
  const unique = <T extends { line: number }>(kind: FileKind, column: string, rows: T[], id: (r: T) => string, show: (r: T) => string) => {
    const seen = new Map<string, number>();
    for (const r of rows) {
      const k = id(r);
      const first = seen.get(k);
      if (first !== undefined) fail(kind, r.line, column, "settingsImport.errDuplicate", { key: show(r), a: first, b: r.line });
      else seen.set(k, r.line);
    }
  };

  // ---- units
  const curUnitByKey = new Map(current.units.map((u) => [u.key, u]));
  const curUnitKeyById = new Map(current.units.map((u) => [u.id, u.key]));
  const unitKeys = new Set(curUnitByKey.keys());
  const parentOf = new Map<string, string | null>(current.units.map((u) => [u.key, u.parentId ? (curUnitKeyById.get(u.parentId) ?? null) : null]));
  if (tables.units?.ok) {
    const rows = tables.units.rows;
    for (const r of rows) unitKeys.add(r.get("key"));
    unique("units", "key", rows, (r) => r.get("key"), (r) => r.get("key"));
    const valid: UnitPlan[] = [];
    for (const r of rows) {
      const key = r.get("key");
      const name = r.get("name");
      const kind = r.get("kind");
      const parent = r.get("parent_key");
      const hc = r.get("headcount");
      const before = errors.length;
      if (!UNIT_KEY.test(key)) fail("units", r.line, "key", "settingsImport.errKeyFormat", { value: key });
      if (name.length < 1 || name.length > 120) fail("units", r.line, "name", "settingsImport.errLength");
      if (!(UNIT_KINDS as readonly string[]).includes(kind)) fail("units", r.line, "kind", "settingsImport.errKind");
      const cur = curUnitByKey.get(key);
      const headcount = hc === "" ? (cur?.headcount ?? 0) : integer(hc, 1_000_000_000);
      if (headcount === null) fail("units", r.line, "headcount", "settingsImport.errNumber", { value: hc });
      if (parent && !unitKeys.has(parent)) fail("units", r.line, "parent_key", "settingsImport.errParentUnknown", { key: parent });
      if (errors.length > before || headcount === null) continue;
      parentOf.set(key, parent || null);
      valid.push({ op: cur ? "change" : "add", line: r.line, key, name, kind, headcount, parentKey: parent || null });
    }
    // A unit may not end up above itself.
    const looped = new Set<string>();
    for (const u of valid) {
      const seen = new Set<string>();
      for (let c = u.parentKey; c; c = parentOf.get(c) ?? null) {
        if (c === u.key) { looped.add(u.key); fail("units", u.line, "parent_key", "settingsImport.errUnitLoop"); break; }
        if (seen.has(c)) break;
        seen.add(c);
      }
    }
    // Parents first, so the writer always knows the parent's id.
    const byKey = new Map(valid.map((u) => [u.key, u]));
    const done = new Set<string>();
    const place = (u: UnitPlan) => {
      if (done.has(u.key) || looped.has(u.key)) return;
      done.add(u.key);
      const p = u.parentKey ? byKey.get(u.parentKey) : undefined;
      if (p) place(p);
      const cur = curUnitByKey.get(u.key);
      const curParent = cur?.parentId ? (curUnitKeyById.get(cur.parentId) ?? null) : null;
      if (cur && cur.name === u.name && cur.kind === u.kind && cur.headcount === u.headcount && curParent === u.parentKey) plan.same.units++;
      else plan.units.push(u);
    };
    valid.forEach(place);
  }

  // ---- roles
  const curUnitById = new Map(current.units.map((u) => [u.id, u]));
  const curRoleByRef = new Map<string, Current["roles"][number]>();
  const curRoleRefById = new Map<string, RoleRef>();
  for (const r of current.roles) {
    const u = curUnitById.get(r.orgUnitId);
    if (!u) continue;
    const ref = { unitKey: u.key, title: r.title };
    if (!curRoleByRef.has(roleId(ref))) curRoleByRef.set(roleId(ref), r);
    curRoleRefById.set(r.id, ref);
  }
  const roleRefs = new Set(curRoleByRef.keys());
  const bossOf = new Map<string, string | null>(
    [...curRoleByRef].map(([id, r]) => [id, r.reportsToId ? (curRoleRefById.get(r.reportsToId) ? roleId(curRoleRefById.get(r.reportsToId)!) : null) : null]),
  );
  const holdersOf = new Map<string, number>();
  for (const h of current.holders) holdersOf.set(h.roleId, (holdersOf.get(h.roleId) ?? 0) + 1);

  if (tables.roles?.ok) {
    const rows = tables.roles.rows;
    for (const r of rows) roleRefs.add(roleId({ unitKey: r.get("unit_key"), title: r.get("title") }));
    unique("roles", "title", rows, (r) => roleId({ unitKey: r.get("unit_key"), title: r.get("title") }), (r) => `${r.get("unit_key")} / ${r.get("title")}`);
    const valid: RolePlan[] = [];
    for (const r of rows) {
      const unitKey = r.get("unit_key");
      const title = r.get("title");
      const bu = r.get("reports_to_unit_key");
      const bt = r.get("reports_to_title");
      const seats = r.get("seats");
      const spend = r.get("spend_limit_eur");
      const before = errors.length;
      if (!unitKeys.has(unitKey)) fail("roles", r.line, "unit_key", "settingsImport.errUnitUnknown", { key: unitKey });
      if (title.length < 1 || title.length > 120) fail("roles", r.line, "title", "settingsImport.errLength");
      if (!bu !== !bt) fail("roles", r.line, bu ? "reports_to_title" : "reports_to_unit_key", "settingsImport.errReportsPair");
      else if (bu && !roleRefs.has(roleId({ unitKey: bu, title: bt }))) fail("roles", r.line, "reports_to_title", "settingsImport.errReportsUnknown", { value: `${bu} / ${bt}` });
      const seatN = seats === "" ? null : integer(seats, 1000);
      if (seats !== "" && seatN === null) fail("roles", r.line, "seats", "settingsImport.errNumber", { value: seats });
      const spendN = spend === "" ? null : integer(spend, 1_000_000_000);
      if (spend !== "" && spendN === null) fail("roles", r.line, "spend_limit_eur", "settingsImport.errNumber", { value: spend });
      if (errors.length > before) continue;
      const ref = { unitKey, title };
      bossOf.set(roleId(ref), bu ? roleId({ unitKey: bu, title: bt }) : null);
      valid.push({
        op: curRoleByRef.has(roleId(ref)) ? "change" : "add", line: r.line, ...ref,
        reportsTo: bu ? { unitKey: bu, title: bt } : null, decides: list(r.get("decides")), spendLimitEur: spendN, seats: seatN,
      });
    }
    const looped = new Set<string>();
    for (const p of valid) {
      const id = roleId(p);
      const seen = new Set<string>();
      for (let c = bossOf.get(id) ?? null; c; c = bossOf.get(c) ?? null) {
        if (c === id) { looped.add(id); fail("roles", p.line, "reports_to_title", "settingsImport.errReportsLoop"); break; }
        if (seen.has(c)) break;
        seen.add(c);
      }
    }
    const byRef = new Map(valid.map((p) => [roleId(p), p]));
    const done = new Set<string>();
    const place = (p: RolePlan) => {
      const id = roleId(p);
      if (done.has(id) || looped.has(id)) return;
      done.add(id);
      const boss = p.reportsTo ? byRef.get(roleId(p.reportsTo)) : undefined;
      if (boss) place(boss);
      const cur = curRoleByRef.get(id);
      const curBoss = cur?.reportsToId ? curRoleRefById.get(cur.reportsToId) : undefined;
      const unchanged = cur
        && (curBoss ? roleId(curBoss) : null) === (p.reportsTo ? roleId(p.reportsTo) : null)
        && cur.spendLimitEur === p.spendLimitEur && same(cur.decides, p.decides)
        && (p.seats === null || (holdersOf.get(cur.id) ?? 0) >= p.seats);
      if (unchanged) plan.same.roles++;
      else plan.roles.push(p);
    };
    valid.forEach(place);
  }

  // ---- members
  const curByEmail = new Map(current.members.map((m) => [m.email.toLowerCase(), m]));
  const seatOfUser = new Map<string, Set<string>>();
  for (const h of current.holders) {
    const ref = curRoleRefById.get(h.roleId);
    if (h.userId && ref) seatOfUser.set(h.userId, (seatOfUser.get(h.userId) ?? new Set()).add(roleId(ref)));
  }
  if (tables.members?.ok) {
    const rows = tables.members.rows;
    unique("members", "email", rows, (r) => r.get("email").toLowerCase(), (r) => r.get("email"));
    const demoted: number[] = [];
    let managers = current.members.filter((m) => m.active && m.role === "manager").length;
    for (const r of rows) {
      const name = r.get("name");
      const email = r.get("email").toLowerCase();
      const role = r.get("app_role");
      const lang = r.get("language");
      const su = r.get("seat_unit_key");
      const st = r.get("seat_role_title");
      const dept = r.get("department");
      const before = errors.length;
      if (name.length < 1 || name.length > 120) fail("members", r.line, "name", "settingsImport.errLength");
      if (!EMAIL.test(email) || email.length > 200) fail("members", r.line, "email", "settingsImport.errEmail", { value: r.get("email") });
      if (role !== "" && !["member", "leader", "manager"].includes(role)) fail("members", r.line, "app_role", "settingsImport.errAppRole");
      if (lang !== "" && !["de", "en"].includes(lang)) fail("members", r.line, "language", "settingsImport.errLanguage");
      if (dept.length > 120) fail("members", r.line, "department", "settingsImport.errLength");
      const cur = curByEmail.get(email);
      if (!su !== !st) fail("members", r.line, su ? "seat_role_title" : "seat_unit_key", "settingsImport.errSeatPair");
      else if (su && !roleRefs.has(roleId({ unitKey: su, title: st }))) fail("members", r.line, "seat_role_title", "settingsImport.errSeatUnknown", { value: `${su} / ${st}` });
      else if (su && cur && !cur.active) fail("members", r.line, "email", "settingsImport.errInactive");
      if (errors.length > before) continue;
      const final = role || cur?.role || "member";
      const wasManager = Boolean(cur?.active && cur.role === "manager");
      const willManager = (cur ? cur.active : true) && final === "manager";
      managers += Number(willManager) - Number(wasManager);
      if (wasManager && !willManager) demoted.push(r.line);
      const seat = su ? { unitKey: su, title: st } : null;
      const hasSeat = !seat || (cur && seatOfUser.get(cur.id)?.has(roleId(seat)));
      const unchanged = cur && cur.name === name && cur.dept === dept && cur.role === final && (cur.locale ?? "") === lang && hasSeat;
      if (unchanged) { plan.same.members++; continue; }
      plan.members.push({ op: cur ? "change" : "add", line: r.line, name, email, dept, role: final, locale: lang || null, seat });
    }
    // Never leave the company without a manager: nobody could open these settings again.
    if (managers < 1 && demoted.length) fail("members", demoted[0], "app_role", "settingsImport.errNoManager");
  }

  // ---- routes
  const curRouteByKey = new Map(current.rules.map((x) => [x.key, x]));
  if (tables.routes?.ok) {
    const rows = tables.routes.rows;
    unique("routes", "key", rows, (r) => r.get("key"), (r) => r.get("key"));
    for (const r of rows) {
      const key = r.get("key");
      const keywords = list(r.get("keywords"));
      const owner = { unitKey: r.get("owner_unit_key"), title: r.get("owner_role_title") };
      const before = errors.length;
      if (!ROUTE_KEY.test(key)) fail("routes", r.line, "key", "settingsImport.errKeyFormat", { value: key });
      if (keywordsRule(keywords)) fail("routes", r.line, "keywords", "settingsImport.errKeywords");
      if (!roleRefs.has(roleId(owner))) fail("routes", r.line, "owner_role_title", "settingsImport.errOwnerUnknown", { value: `${owner.unitKey} / ${owner.title}` });
      if (errors.length > before) continue;
      const cur = curRouteByKey.get(key);
      const curOwner = cur && curRoleRefById.get(cur.ownerRoleId);
      if (cur && curOwner && roleId(curOwner) === roleId(owner) && same(cur.keywords, keywords)) plan.same.routes++;
      else plan.routes.push({ op: cur ? "change" : "add", line: r.line, key, keywords, owner });
    }
  }

  const order = (e: CsvError) => KINDS.indexOf(e.file);
  errors.sort((a, b) => order(a) - order(b) || a.line - b.line);
  return { ok: errors.length === 0, errors, plan };
}

/** The structure as the four files (comma separated, UTF-8). Never a login code, token, secret or personnel number. */
export function structureToCsv(k: Knowledge, members: readonly MemberRow[]): Record<FileKind, string> {
  const unitKey = new Map(k.units.map((u) => [u.id, u.key]));
  const roleRef = new Map(k.roles.map((r) => [r.id, { unitKey: unitKey.get(r.orgUnitId) ?? "", title: r.title }]));
  const seats = new Map<string, number>();
  for (const h of k.holders) seats.set(h.roleId, (seats.get(h.roleId) ?? 0) + 1);
  const seatOf = new Map<string, RoleRef>();
  for (const h of k.holders) {
    const ref = roleRef.get(h.roleId);
    if (h.userId && ref && !seatOf.has(h.userId)) seatOf.set(h.userId, ref);
  }
  return {
    units: writeCsv(COLUMNS.units, k.units.map((u) => [u.key, u.name, u.kind, (u.parentId && unitKey.get(u.parentId)) || "", String(u.headcount)])),
    roles: writeCsv(COLUMNS.roles, k.roles.map((r) => {
      const boss = r.reportsToId ? roleRef.get(r.reportsToId) : undefined;
      return [unitKey.get(r.orgUnitId) ?? "", r.title, boss?.unitKey ?? "", boss?.title ?? "", String(seats.get(r.id) ?? 0), r.spendLimitEur === null ? "" : String(r.spendLimitEur), r.decides.join(";")];
    })),
    members: writeCsv(COLUMNS.members, members.filter((m) => m.active).map((m) => {
      const s = seatOf.get(m.id);
      return [m.name, m.email, m.dept, m.role, m.locale ?? "", s?.unitKey ?? "", s?.title ?? ""];
    })),
    routes: writeCsv(COLUMNS.routes, k.rules.map((x) => {
      const o = roleRef.get(x.ownerRoleId);
      return [x.key, x.keywords.join(";"), o?.unitKey ?? "", o?.title ?? ""];
    })),
  };
}
