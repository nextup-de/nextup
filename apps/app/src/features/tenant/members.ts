// A company's people, managed from inside the company (Settings -> Members): the rules, as pure
// functions. The database writes live in src/server/actions/members.ts.
import { ROLES, type Role } from "@/config/roles";
import type { NewPerson } from "./create";

export type Member = { id: string; name: string; email: string; role: Role };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/** Everything wrong with adding this person, so the form can show it all at once. */
export function validateNewMember(input: NewPerson, existing: readonly Member[]): string[] {
  const problems: string[] = [];
  if (!input.name.trim()) problems.push("A name is required.");
  const email = input.email.trim().toLowerCase();
  if (!EMAIL.test(email)) {
    problems.push(`"${input.email}" is not an email address.`);
  } else if (existing.some((m) => m.email.toLowerCase() === email)) {
    problems.push(`${input.email} is already in this company.`);
  }
  if (!isRole(input.role)) problems.push("Pick a role: manager, leader or member.");
  return problems;
}

/**
 * Why this role change may not happen, or null when it may. Two ways to lock a company out of
 * its own settings: a manager demoting themselves by accident, and the last manager going.
 */
export function roleChangeProblem(people: readonly Member[], actorId: string, targetId: string, role: string): string | null {
  if (!isRole(role)) return "Pick a role: manager, leader or member.";
  const target = people.find((p) => p.id === targetId);
  if (!target) return "No such person in this company.";
  if (target.role === role) return null;
  if (targetId === actorId) return "You can't change your own role. Ask another manager.";
  const managers = people.filter((p) => p.role === "manager").length;
  if (target.role === "manager" && managers <= 1) return "This is the only manager. Make someone else a manager first.";
  return null;
}
