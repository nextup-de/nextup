// Musterwerk's people: one person for every seat (the roles match the seats), the rest members of
// the leaf units as the structure's headcounts say. Managers are set (the seat's boss, or the unit's
// lead), login codes are deterministic per slug and person.
import { createHash } from "node:crypto";
import { hashLoginCode } from "../../../src/features/auth/login-code";
import type { HolderRow, Knowledge } from "../../../src/features/knowledge";
import { ascii, nameAt, namePermutation } from "./names";
import type { Rng } from "./rng";
import { roleLevel } from "./structure";

export type UserRow = {
  id: string; name: string; email: string; role: "manager" | "leader" | "member"; dept: string; line: string; ini: string;
  handle: string | null; managerId: string | null; loginCodeHash: string;
};
export type PeopleResult = {
  /** Managers before the people who report to them, so a chunked createMany never points forward. */
  users: UserRow[];
  /** The structure's holders with `userId` set. */
  holders: HolderRow[];
  /** The plain login codes, in `users` order. Written to a file only on request. */
  codes: { email: string; code: string }[];
};

// Same alphabet as src/features/auth/login-code.ts: no 0/o, 1/l/i.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

/** "<slug>-xxxx-xxxx-xxxx", from the slug and the person's number alone: the same company gives the same codes. */
export function loginCodeFor(slug: string, index: number): string {
  const bytes = createHash("sha256").update(`musterwerk:${slug}:${index}`).digest();
  const chars = Array.from({ length: 12 }, (_, i) => ALPHABET[bytes[i] % ALPHABET.length]).join("");
  return `${slug}-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}

export const userIdOf = (slug: string, index: number): string => `${slug}-p${index}`;

const initials = (name: string): string => name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

/** `n` people for `structure`: its holders first (in seat order), then members. */
export function musterwerkPeople(rng: Rng, structure: Knowledge, n: number, slug = "mw", emailDomain = "musterwerk.test"): PeopleResult {
  const order = namePermutation(rng);
  const roleById = new Map(structure.roles.map((r) => [r.id, r]));
  const unitById = new Map(structure.units.map((u) => [u.id, u]));
  const holderOfRole = new Map(structure.holders.map((h) => [h.roleId, h]));
  const userOfHolder = new Map<string, string>();
  const users: UserRow[] = [];
  const codes: { email: string; code: string }[] = [];

  const add = (name: string, role: UserRow["role"], dept: string, line: string, managerId: string | null, handle: string | null): UserRow => {
    const index = users.length;
    const [first, ...rest] = name.split(" ");
    const email = `${ascii(first)}.${ascii(rest.join(""))}${index}@${emailDomain}`;
    const code = loginCodeFor(slug, index);
    const row: UserRow = { id: userIdOf(slug, index), name, email, role, dept, line, ini: initials(name), handle, managerId, loginCodeHash: hashLoginCode(code) };
    users.push(row);
    codes.push({ email, code });
    return row;
  };

  // Seats: roles were made boss first, so the boss's user already exists.
  const holders: HolderRow[] = structure.holders.map((h) => {
    const role = roleById.get(h.roleId)!;
    const unit = unitById.get(role.orgUnitId)!;
    const bossHolder = role.reportsToId ? holderOfRole.get(role.reportsToId) : undefined;
    const managerId = bossHolder ? userOfHolder.get(bossHolder.id) ?? null : null;
    const u = add(h.name, roleLevel(role.title), unit.key, `${role.title}`, managerId, null);
    userOfHolder.set(h.id, u.id);
    return { ...h, userId: u.id };
  });

  // The lead of a leaf unit: its team lead, or the department head.
  const leadOfUnit = (unitId: string): string | null => {
    const lead = structure.roles.find((r) => r.orgUnitId === unitId && /^(Schichtleiter|Leiter )/.test(r.title));
    const h = lead ? holderOfRole.get(lead.id) : undefined;
    return h ? userOfHolder.get(h.id) ?? null : null;
  };
  const seatsIn = (unitId: string) => structure.roles.filter((r) => r.orgUnitId === unitId).length;
  const isLeaf = (unitId: string) => !structure.units.some((u) => u.parentId === unitId);

  let nameIx = holders.length;
  for (const unit of structure.units) {
    if (!isLeaf(unit.id)) continue;
    const parent = unit.parentId ? unitById.get(unit.parentId) : undefined;
    const where = parent && parent.parentId ? unitById.get(parent.parentId) : parent;
    const site = where?.name ?? unit.name;
    for (let k = unit.headcount - seatsIn(unit.id); k > 0; k--) {
      const { first, last } = nameAt(order, nameIx++);
      add(`${first} ${last}`, "member", unit.key, `Mitarbeiter · ${unit.name}, ${site}`, leadOfUnit(unit.id), `Anonymous #${1000 + users.length}`);
    }
  }
  if (users.length !== n) throw new Error(`musterwerkPeople: structure has ${users.length} people, asked for ${n}`);
  return { users, holders, codes };
}
