// Reads the current structure for the CSV check and applies a checked plan (API D13). Every write goes through
// the org-edit writers, so import and editor never disagree; a member is found by email. All of it runs in
// one transaction: a failure anywhere leaves nothing behind. Never deletes.
import type { Current, FileKind, Plan, RoleRef } from "@/features/api/structure-csv";
import { getDb } from "./client";
import { loadKnowledge } from "./knowledge";
import * as write from "./org-edit";
import type { Tx } from "./org-edit";

export async function loadCurrent(companyId: string): Promise<Current> {
  const [k, members] = await Promise.all([
    loadKnowledge(companyId),
    getDb().user.findMany({ where: { companyId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, dept: true, role: true, locale: true, active: true } }),
  ]);
  return { ...k, members };
}

export type Applied = Record<FileKind, { added: number; changed: number }>;

const refId = (r: RoleRef) => `${r.unitKey}\u0000${r.title}`;
const gone = (what: string) => new Error(`import: ${what} is gone; the structure changed since the check`);

/**
 * Write `plan` for the company. With `outer` it joins that transaction (so the caller can add its audit
 * row); without, it opens one of its own. `by` is the admin's display name for the `updatedBy` columns.
 */
export async function applyStructureCsv(companyId: string, plan: Plan, by: string, outer?: Tx): Promise<Applied> {
  const run = async (tx: Tx): Promise<Applied> => {
    const out: Applied = { units: { added: 0, changed: 0 }, roles: { added: 0, changed: 0 }, members: { added: 0, changed: 0 }, routes: { added: 0, changed: 0 } };
    const count = (k: FileKind, op: "add" | "change") => { out[k][op === "add" ? "added" : "changed"]++; };

    const units = await tx.orgUnit.findMany({ where: { companyId }, select: { id: true, key: true } });
    const unitId = new Map(units.map((u) => [u.key, u.id]));
    for (const u of plan.units) {
      const parentId = u.parentKey === null ? null : (unitId.get(u.parentKey) ?? null);
      if (u.parentKey !== null && parentId === null) throw gone(`unit ${u.parentKey}`);
      const fields = { name: u.name, kind: u.kind, headcount: u.headcount, parentId };
      if (u.op === "add") unitId.set(u.key, await write.addUnit(companyId, by, { key: u.key, ...fields }, tx));
      else {
        const id = unitId.get(u.key);
        if (!id) throw gone(`unit ${u.key}`);
        await write.updateUnit(companyId, by, id, fields, tx);
      }
      count("units", u.op);
    }

    const unitKeyOf = new Map([...unitId].map(([k, id]) => [id, k]));
    const roles = await tx.orgRole.findMany({ where: { companyId }, orderBy: { sort: "asc" }, select: { id: true, title: true, orgUnitId: true } });
    const roleId = new Map<string, string>();
    for (const r of roles) {
      const ref = refId({ unitKey: unitKeyOf.get(r.orgUnitId) ?? "", title: r.title });
      if (!roleId.has(ref)) roleId.set(ref, r.id);
    }
    const need = (r: RoleRef): string => {
      const id = roleId.get(refId(r));
      if (!id) throw gone(`role ${r.title}`);
      return id;
    };
    const holders = new Map<string, { id: string; name: string; userId: string | null }[]>();
    for (const h of await tx.orgRoleHolder.findMany({ where: { companyId }, orderBy: { sort: "asc" }, select: { id: true, roleId: true, name: true, userId: true } })) {
      holders.set(h.roleId, [...(holders.get(h.roleId) ?? []), h]);
    }
    const addHolder = async (rid: string, name: string, userId: string | null) => {
      const have = holders.get(rid) ?? [];
      let n = name;
      for (let i = 2; have.some((h) => h.name === n); i++) n = `${name} ${i}`;
      const id = await write.addSeat(companyId, rid, n, null, tx);
      const h = { id, name: n, userId: null as string | null };
      holders.set(rid, [...have, h]);
      if (userId !== null && !(await write.linkSeat(companyId, id, userId, tx))) throw gone("a member");
      h.userId = userId;
    };

    for (const r of plan.roles) {
      const fields = {
        orgUnitId: unitId.get(r.unitKey) ?? "", title: r.title, decides: r.decides, spendLimitEur: r.spendLimitEur,
        reportsToId: r.reportsTo ? need(r.reportsTo) : null,
      };
      if (!fields.orgUnitId) throw gone(`unit ${r.unitKey}`);
      if (r.op === "add") roleId.set(refId(r), await write.addRole(companyId, by, fields, tx));
      else await write.updateRole(companyId, by, need(r), fields, tx);
      const rid = need(r);
      if (r.seats !== null) for (let i = (holders.get(rid) ?? []).length; i < r.seats; i++) await addHolder(rid, r.title, null);
      count("roles", r.op);
    }

    for (const m of plan.members) {
      const found = await tx.user.findFirst({ where: { companyId, email: { equals: m.email, mode: "insensitive" } }, select: { id: true } });
      let userId: string;
      if (found) {
        userId = found.id;
        await tx.user.updateMany({ where: { id: found.id, companyId }, data: { name: m.name, dept: m.dept, role: m.role, locale: m.locale } });
      } else {
        // No login code: the member gets one the usual way (invite or console).
        userId = (await tx.user.create({ data: { companyId, name: m.name, email: m.email, dept: m.dept, role: m.role, locale: m.locale }, select: { id: true } })).id;
      }
      if (m.seat) {
        const rid = need(m.seat);
        const have = holders.get(rid) ?? [];
        if (!have.some((h) => h.userId === userId)) {
          const free = have.find((h) => h.userId === null);
          if (free) {
            if (!(await write.linkSeat(companyId, free.id, userId, tx))) throw gone("a member");
            free.userId = userId;
          } else await addHolder(rid, m.name, userId);
        }
      }
      count("members", m.op);
    }

    const existing = new Map((await tx.routingRule.findMany({ where: { companyId }, select: { key: true, type: true, deputyRoleId: true, buddyRoleId: true, wait: true } })).map((x) => [x.key, x]));
    for (const r of plan.routes) {
      const old = existing.get(r.key);
      await write.saveRoute(companyId, by, {
        key: r.key, type: old?.type ?? r.key, keywords: r.keywords, ownerRoleId: need(r.owner),
        deputyRoleId: old?.deputyRoleId ?? null, buddyRoleId: old?.buddyRoleId ?? null, wait: old?.wait ?? "",
      }, tx);
      count("routes", r.op);
    }
    return out;
  };
  return outer ? run(outer) : getDb().$transaction(run, { timeout: 300_000, maxWait: 10_000 });
}
