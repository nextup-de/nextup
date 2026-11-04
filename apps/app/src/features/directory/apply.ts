// Planning a directory page against the company's users (DIR/D4, D8, D9). Pure: no database, no fetch.
// People are matched by source key only (Graph: entraOid, else the same email; SuccessFactors:
// employeeId) - a display name is a label and is never compared.
import { needsHandle, newHandle } from "@/features/auth/handle";
import { initialsOf } from "@/features/tenant/create";
import type { DirectoryPage } from "@nextup/contracts/public";
import type { DirectorySourceKind } from "./index";

export type PlanUnit = { key: string; name: string; sort: number };
export type PlanUser = {
  id: string;
  entraOid: string | null;
  employeeId: string | null;
  email: string;
  /** SCIM only: the subject of the user's SCIM link (EID D6), null when the user has none. */
  scimSubject?: string | null;
  active: boolean;
  managerId: string | null;
  dept: string;
  /** Optional: when missing, the field is not compared. */
  name?: string;
  line?: string;
};

/**
 * The unit whose name or key equals `department` (case-insensitive, trimmed, first by sort) - the same
 * comparison as `jitSeatRole` in features/auth/entra.ts (IDN/D12). Null for an empty or unknown one.
 */
export function unitForDepartment<U extends { key: string; name: string; sort: number }>(
  units: readonly U[],
  department: string | null | undefined,
): U | null {
  const want = (department ?? "").trim().toLowerCase();
  if (!want) return null;
  return [...units].sort((a, b) => a.sort - b.sort).find((u) => u.name.toLowerCase() === want || u.key.toLowerCase() === want) ?? null;
}

/** A user in the plan: one that exists (by id) or one the plan creates (by index into `creates`). */
export type PlanRef = { userId: string } | { create: number };

export type PlanCreate = {
  externalId: string;
  name: string;
  email: string;
  dept: string;
  line: string;
  role: "member";
  handle: string;
  ini: string;
  entraOid: string | null;
  employeeId: string | null;
};
export type PlanUpdate = {
  userId: string;
  /** Only what changed. `active: true` is a comeback (the writer also clears deactivatedAt). */
  fields: Partial<{ name: string; email: string; dept: string; line: string; entraOid: string; employeeId: string; active: true }>;
};
export type PlanSkip = { externalId: string; reason: "no-unit" | "no-email" | "email-taken" | "duplicate" | "inactive" };

export type DirectoryPlan = {
  creates: PlanCreate[];
  updates: PlanUpdate[];
  /** Only where the manager differs from what is stored (or a new user has one). `manager` null = none. */
  managers: { who: PlanRef; manager: PlanRef | null }[];
  /** Ids of active users the page switches off. */
  leavers: string[];
  skipped: PlanSkip[];
  /** SCIM only: existing users without a SCIM link that the page matched by email; the writer links them. */
  links: { userId: string; subject: string }[];
  /** Ids of every existing user the page named (matched, changed or not): the writer stamps directorySyncedAt. */
  seen: string[];
};

const lower = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export function planDirectoryDelta(input: {
  source: DirectorySourceKind;
  page: DirectoryPage;
  users: PlanUser[];
  units: PlanUnit[];
  takenHandles: string[];
}): DirectoryPlan {
  const { source, page, users, units } = input;
  const keyOf = (u: PlanUser) => (source === "successfactors" ? u.employeeId : source === "scim" ? (u.scimSubject ?? null) : u.entraOid);
  const byKey = new Map<string, PlanUser>();
  for (const u of users) {
    const k = keyOf(u);
    if (k) byKey.set(k, u);
  }
  // Graph and SCIM: a user the source never bound is found by the same email, lower case.
  const byEmail = new Map<string, PlanUser>();
  if (source === "graph") for (const u of users) if (!u.entraOid) byEmail.set(lower(u.email), u);
  if (source === "scim") for (const u of users) if (!u.scimSubject) byEmail.set(lower(u.email), u);

  const removed = new Set(page.removedExternalIds);
  const plan: DirectoryPlan = { creates: [], updates: [], managers: [], leavers: [], skipped: [], links: [], seen: [] };
  const emailsInUse = new Set(users.map((u) => lower(u.email)));
  const handles = new Set(input.takenHandles);
  // The personnel number is unique per company: one already held by another user is not written again.
  const employeeIds = new Set(users.flatMap((u) => (u.employeeId ? [u.employeeId] : [])));
  const employeeIdFree = (v: string | null | undefined): string | null => {
    const id = (v ?? "").trim();
    if (!id || employeeIds.has(id)) return null;
    employeeIds.add(id);
    return id;
  };
  const claimed = new Set<string>(); // user ids already matched by an earlier entry
  const refOf = new Map<string, PlanRef>(); // entry externalId -> the user it became
  const resolved: { entry: (typeof page.entries)[number]; ref: PlanRef; current: PlanUser | null }[] = [];

  for (const e of page.entries) {
    if (refOf.has(e.externalId)) { plan.skipped.push({ externalId: e.externalId, reason: "duplicate" }); continue; }
    let u = byKey.get(e.externalId);
    let linking = false;
    if (!u && (source === "graph" || source === "scim") && e.email) {
      const byMail = byEmail.get(lower(e.email));
      if (byMail && !claimed.has(byMail.id)) { u = byMail; linking = source === "scim"; }
    }
    if (u && claimed.has(u.id)) { plan.skipped.push({ externalId: e.externalId, reason: "duplicate" }); continue; }
    const leaving = !e.active || removed.has(e.externalId);
    const unit = unitForDepartment(units, e.department);

    if (!u) {
      if (leaving) { plan.skipped.push({ externalId: e.externalId, reason: "inactive" }); continue; }
      if (!unit) { plan.skipped.push({ externalId: e.externalId, reason: "no-unit" }); continue; }
      const email = lower(e.email);
      if (!email) { plan.skipped.push({ externalId: e.externalId, reason: "no-email" }); continue; }
      if (emailsInUse.has(email)) { plan.skipped.push({ externalId: e.externalId, reason: "email-taken" }); continue; }
      emailsInUse.add(email);
      const handle = needsHandle("member") ? newHandle(handles) : "";
      handles.add(handle);
      plan.creates.push({
        externalId: e.externalId, name: e.displayName, email, dept: unit.key, line: e.jobTitle ?? "", role: "member", handle,
        ini: initialsOf(e.displayName),
        entraOid: source === "graph" ? e.externalId : null,
        employeeId: source === "successfactors" ? e.externalId : employeeIdFree(e.employeeId),
      });
      const ref: PlanRef = { create: plan.creates.length - 1 };
      refOf.set(e.externalId, ref);
      resolved.push({ entry: e, ref, current: null });
      continue;
    }

    claimed.add(u.id);
    plan.seen.push(u.id);
    // A leaver found only by email stays unlinked: nothing to bind it for.
    if (linking && !leaving) plan.links.push({ userId: u.id, subject: e.externalId });
    const ref: PlanRef = { userId: u.id };
    refOf.set(e.externalId, ref);
    if (leaving) {
      if (u.active) plan.leavers.push(u.id);
      continue;
    }
    resolved.push({ entry: e, ref, current: u });

    const fields: PlanUpdate["fields"] = {};
    if (u.name !== undefined && u.name !== e.displayName) fields.name = e.displayName;
    const email = lower(e.email);
    if (email && email !== lower(u.email) && !emailsInUse.has(email)) { fields.email = email; emailsInUse.add(email); }
    // SCIM sends partial documents: an unknown or missing department leaves the unit alone.
    const dept = unit ? unit.key : source === "scim" ? u.dept : "";
    if (dept !== u.dept) fields.dept = dept;
    const line = e.jobTitle ?? "";
    if (u.line !== undefined && u.line !== line) fields.line = line;
    // A user found by email is bound to the source key now; so is a SuccessFactors one never seen by id.
    if (source === "graph" && u.entraOid !== e.externalId) fields.entraOid = e.externalId;
    if ((source === "graph" || source === "scim") && u.employeeId !== (e.employeeId ?? null)) {
      const id = employeeIdFree(e.employeeId);
      if (id) fields.employeeId = id;
    }
    if (!u.active) fields.active = true;
    // Linking an existing member is a change even when no field differs.
    if (Object.keys(fields).length > 0 || linking) plan.updates.push({ userId: u.id, fields });
  }

  // An id that is only named in removedExternalIds (Graph sends no entry for a deleted user) is a leaver too.
  for (const id of removed) {
    if (refOf.has(id)) continue;
    const u = byKey.get(id);
    if (!u || claimed.has(u.id)) continue;
    claimed.add(u.id);
    plan.seen.push(u.id);
    if (u.active) plan.leavers.push(u.id);
  }

  // Managers after the whole page: the entry's manager is the user with that source key, else none.
  const resolveKey = (externalId: string): PlanRef | null => {
    const r = refOf.get(externalId);
    if (r) return r;
    // SCIM: a manager without a SCIM link is named by the user id (the SCIM id).
    const u = byKey.get(externalId) ?? (source === "scim" ? users.find((x) => x.id === externalId) : undefined);
    return u ? { userId: u.id } : null;
  };
  const same = (a: PlanRef | null, b: PlanRef | null) =>
    a === null || b === null ? a === b : "userId" in a ? "userId" in b && a.userId === b.userId : "create" in b && a.create === b.create;
  for (const { entry, ref, current } of resolved) {
    let manager = entry.managerExternalId ? resolveKey(entry.managerExternalId) : null;
    if (manager && same(manager, ref)) manager = null;
    const now: PlanRef | null = current?.managerId ? { userId: current.managerId } : null;
    if (current ? !same(manager, now) : manager !== null) plan.managers.push({ who: ref, manager });
  }
  return plan;
}
