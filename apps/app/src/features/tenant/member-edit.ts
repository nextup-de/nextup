// Correcting a member's name and email from Settings -> Members (RES-M1, D23): the rules as a pure function.
// Only a person NextUp created itself can be corrected here; a person from the directory is corrected at the
// source, and a pseudonymised person has nothing left to correct. The database write is in
// src/server/actions/members.ts.
import type { MessageKey } from "@/i18n";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The longest name a member can have, after trimming. */
export const MEMBER_NAME_MAX = 120;

/** What decides whether a member can be corrected: where the person comes from. */
export type EditableUser = { entraOid: string | null; directorySyncedAt: Date | null; pseudonymisedAt: Date | null };

/** Whether the person comes from the directory (a sync created them or Microsoft sign-in bound them). */
export const fromDirectory = (u: Pick<EditableUser, "entraOid" | "directorySyncedAt">): boolean => u.entraOid !== null || u.directorySyncedAt !== null;

/**
 * The message key of what is wrong with this correction, or null when it may be saved. `emailTaken` is
 * whether another member of the company (case-insensitive) already has the address.
 */
export function memberEditProblem(input: { name: string; email: string }, user: EditableUser, emailTaken: boolean): MessageKey | null {
  if (user.pseudonymisedAt !== null) return "settings.memberEditPseudonymised";
  if (fromDirectory(user)) return "settings.memberEditDirectory";
  const name = input.name.trim();
  if (name.length < 1) return "settings.memberEditNameRequired";
  if (name.length > MEMBER_NAME_MAX) return "settings.memberEditNameLong";
  const email = input.email.trim();
  if (email !== "" && !EMAIL.test(email)) return "settings.memberEditEmailInvalid";
  if (email !== "" && emailTaken) return "settings.memberEditEmailTaken";
  return null;
}
