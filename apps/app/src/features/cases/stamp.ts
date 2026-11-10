// What the server decides about a raise, whatever the client sent (IDN/D13). Pure: the seed or the
// org in, the payload out.
import { HANDLE_PREFIX } from "@/features/auth/handle";
import type { Seed } from "@/features/demo/types";
import { MIN_GROUP } from "@/features/metrics/types";
import type { EventPayload } from "./events";

/**
 * case.raised: assigneeRoleHolderId is the owner seat of the route the payload names, or null.
 * Whatever the client sent there is dropped. Every other type passes unchanged.
 */
export function stampEvent(type: string, payload: EventPayload, seed: Pick<Seed, "routes">): EventPayload {
  if (type !== "case.raised") return payload;
  const route = seed.routes.find((r) => r.id === payload.routeId);
  return { ...payload, assigneeRoleHolderId: route?.ownerSeatId ?? null };
}

// ── The department on an anonymous raise ─────────────────────────────────────────────────────────
// A handle next to a department of three people names the person. So a raise under a handle keeps its
// department only when the raiser's own unit has at least MIN_GROUP active people (the limit the
// metrics already hide below, MET D6). The unit is the server's: the label is never read or matched.

/** The part of the org the rule counts on: ids only. */
export type DeptOrg = {
  units: readonly { id: string; parentId: string | null }[];
  roles: readonly { id: string; orgUnitId: string }[];
  /** The occupied seats of active people, in seat order. */
  seats: readonly { roleId: string; userId: string }[];
  /** The active people without a seat, and the unit their department names (null: none). */
  members: readonly { userId: string; unitId: string | null }[];
};

export type UnitPeople = {
  /** How many active people this person's own unit has, or null for a person without a unit. */
  ofUser: (userId: string | null | undefined) => number | null;
  /** How many active people the unit has, its sub-units included, as the metrics count them. */
  ofUnit: (unitId: string) => number;
};

export const NO_UNITS: UnitPeople = { ofUser: () => null, ofUnit: () => 0 };

/** A person's unit is the unit of their first seat, else the one their department names (lib/db/metrics.ts counts the same way). */
export function unitPeople(org: DeptOrg): UnitPeople {
  const unitOfRole = new Map(org.roles.map((r) => [r.id, r.orgUnitId]));
  const unitOfUser = new Map<string, string>();
  for (const s of org.seats) {
    const unit = unitOfRole.get(s.roleId);
    if (unit !== undefined && !unitOfUser.has(s.userId)) unitOfUser.set(s.userId, unit);
  }
  for (const m of org.members) if (m.unitId !== null && !unitOfUser.has(m.userId)) unitOfUser.set(m.userId, m.unitId);

  const sizes = new Map<string, number>();
  const ofUnit = (unitId: string): number => {
    const known = sizes.get(unitId);
    if (known !== undefined) return known;
    const ids = new Set<string>();
    const walk = (id: string) => {
      ids.add(id);
      for (const u of org.units) if (u.parentId === id && !ids.has(u.id)) walk(u.id);
    };
    walk(unitId);
    const people = new Set<string>();
    for (const s of org.seats) if (ids.has(unitOfRole.get(s.roleId) ?? "")) people.add(s.userId);
    for (const m of org.members) if (m.unitId !== null && ids.has(m.unitId)) people.add(m.userId);
    sizes.set(unitId, people.size);
    return people.size;
  };
  return {
    ofUser: (userId) => {
      const unit = userId ? unitOfUser.get(userId) : undefined;
      return unit === undefined ? null : ofUnit(unit);
    },
    ofUnit,
  };
}

/** Does this actor label hide who it is? A member's handle does; a name does not. */
export const underHandle = (label: string): boolean => label.startsWith(HANDLE_PREFIX);

/** May a raise that hides its raiser name a department with this many people? */
export const deptIsBigEnough = (people: number | null): boolean => people !== null && people >= MIN_GROUP;

/**
 * case.raised at write time: under a handle, the department is blanked unless the raiser's own unit is big
 * enough. A named raiser's payload passes unchanged, and so does every other type.
 */
export function stampDept(type: string, payload: EventPayload, raiser: { label: string; userId: string | null }, people: UnitPeople): EventPayload {
  if (type !== "case.raised" || !payload.fromDept || !underHandle(raiser.label)) return payload;
  return deptIsBigEnough(people.ofUser(raiser.userId)) ? payload : { ...payload, fromDept: "" };
}

/** Does this actor label leave the person unnamed? A handle does, and so does a system actor (system:api). */
const hidesRaiser = (label: string): boolean => underHandle(label) || label.startsWith("system:");

/**
 * The department on a raise the server writes for a person (Teams, API v1): their own users.dept, which is what
 * the web raise sends. Next to a label that does not name them it follows stampDept's rule. No person: none.
 */
export function raiserDept(dept: string | null | undefined, raiser: { label: string; userId: string | null }, people: UnitPeople): string {
  const own = (dept ?? "").trim();
  if (!own || raiser.userId === null) return "";
  return !hidesRaiser(raiser.label) || deptIsBigEnough(people.ofUser(raiser.userId)) ? own : "";
}

type RaisedRow = { type: string; actor: string; actorUserId?: string | null; payload: unknown };

/** Would the rule look at this stored row at all? Lets a caller skip loading the org. */
export function namesDeptUnderHandle(row: RaisedRow): boolean {
  const fromDept = (row.payload as EventPayload | null)?.fromDept;
  return row.type === "case.raised" && underHandle(row.actor) && typeof fromDept === "string" && fromDept !== "";
}

/**
 * The same rule for events already stored, as they leave the server: copies with the department blanked
 * where today's org says the unit is too small. The stored event is never changed.
 */
export function hideSmallDepts<T extends RaisedRow>(rows: readonly T[], people: UnitPeople): readonly T[] {
  if (!rows.some(namesDeptUnderHandle)) return rows;
  return rows.map((r) =>
    namesDeptUnderHandle(r) && !deptIsBigEnough(people.ofUser(r.actorUserId)) ? { ...r, payload: { ...(r.payload as object), fromDept: "" } } : r,
  );
}
