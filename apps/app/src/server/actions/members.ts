"use server";
// Settings -> Members: a company's managers look after their own people - list them, add one,
// change a role, hand out a personal login code. /admin can do the same across every company;
// this is the in-company version, so onboarding a pilot does not need us.
//
// The role is re-read from the database on every call, not taken from the session cookie: the
// cookie carries the role the person had when they logged in, and a manager demoted a minute ago
// must not keep handing out codes until their session expires.
import { revalidatePath } from "next/cache";
import { needsHandle, newHandle } from "@/features/auth/handle";
import { getViewerFor } from "@/features/auth/session";
import { generateLoginCode, hashLoginCode } from "@/features/auth/login-code";
import { initialsOf, seedNameWarnings } from "@/features/tenant/create";
import { isRole, reactivateProblem, roleChangeProblem, validateNewMember, type Member } from "@/features/tenant/members";
import { companySeed } from "@/lib/db/companies";
import type { Seed } from "@/features/demo/types";
import { getDb, hasDatabase } from "@/lib/db/client";
import { deactivateUser } from "@/lib/db/directory";
import { pseudonymOf } from "@/lib/db/pseudonymise";
import { hasVerifiedEmail } from "@/features/privacy/export";
import { linkSeat } from "@/lib/db/org-edit";
import { inviteMail } from "@/features/auth/invite-mail";
import { companyUrl } from "@/features/tenant/urls";
import { localeForEmail } from "@/i18n/server";
import { sendMail } from "@/server/mail";
import { recordAudit, settingsActor } from "@/server/audit/record";
import { audited } from "./settings/audited";
import { companyAdminOf } from "./settings/guard";

const auditFailed = "Nothing was changed: the change could not be written to the audit trail. Try again.";

export type SeatLabel = { id: string; label: string };
export type MemberRow = Member & {
  dept: string; codeIssuedAt: string | null; microsoft: boolean; active: boolean;
  /** An address a data export can be mailed to (GDP D19); the address itself is already in `email`. */
  hasEmail: boolean;
  /** ISO time the person was pseudonymised, or null. The name is then the pseudonym label. */
  pseudonymisedAt: string | null;
  /** The seats this member holds (OrgRoleHolder rows, by sort). */
  seats: SeatLabel[];
};

type Manager = { userId: string; companyId: string; slug: string };

/** The signed-in person, if they are a manager of `slug` right now according to the database. */
async function managerOf(slug: string): Promise<Manager | null> {
  if (!hasDatabase()) return null;
  const viewer = await getViewerFor(slug);
  if (!viewer) return null;
  const me = await getDb().user.findFirst({
    where: { id: viewer.userId, companyId: viewer.companyId },
    select: { role: true },
  });
  return me?.role === "manager" ? { userId: viewer.userId, companyId: viewer.companyId, slug } : null;
}

/** A handle no one in the company has yet (IDN/D11). */
async function freshHandle(companyId: string): Promise<string> {
  const taken = await getDb().user.findMany({ where: { companyId, handle: { not: null } }, select: { handle: true } });
  return newHandle(taken.flatMap((t) => (t.handle ? [t.handle] : [])));
}

async function membersOf(companyId: string): Promise<MemberRow[]> {
  const held = await getDb().orgRoleHolder.findMany({
    where: { companyId, userId: { not: null } },
    orderBy: { sort: "asc" },
    select: { id: true, name: true, userId: true, role: { select: { title: true } } },
  });
  const rows = await getDb().user.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, dept: true, loginCodeAt: true, entraOid: true, active: true, directorySyncedAt: true },
  });
  const pseudonyms = await pseudonymOf(companyId, rows.map((u) => u.id));
  return rows
    .filter((u) => isRole(u.role))
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role as Member["role"],
      dept: u.dept,
      codeIssuedAt: u.loginCodeAt?.toISOString() ?? null,
      microsoft: Boolean(u.entraOid),
      active: u.active,
      hasEmail: !pseudonyms.has(u.id) && hasVerifiedEmail(u),
      pseudonymisedAt: pseudonyms.get(u.id)?.at.toISOString() ?? null,
      seats: held.filter((h) => h.userId === u.id).map((h) => ({ id: h.id, label: `${h.role.title} · ${h.name}` })),
    }));
}

/** Seats nobody holds, for the "link a seat" choice. */
async function freeSeatsOf(companyId: string): Promise<SeatLabel[]> {
  const rows = await getDb().orgRoleHolder.findMany({
    where: { companyId, userId: null },
    orderBy: { sort: "asc" },
    select: { id: true, name: true, role: { select: { title: true } } },
  });
  return rows.map((h) => ({ id: h.id, label: `${h.role.title} · ${h.name}` }));
}

export type MembersPage =
  | { status: "ok"; me: string; members: MemberRow[]; freeSeats: SeatLabel[] }
  | { status: "no-database" }
  | { status: "forbidden" };

/** What the Members page renders. Addresses only ever reach a manager of this company. */
export async function loadMembers(slug: string): Promise<MembersPage> {
  if (!hasDatabase()) return { status: "no-database" };
  const manager = await managerOf(slug);
  if (!manager) return { status: "forbidden" };
  return { status: "ok", me: manager.userId, members: await membersOf(manager.companyId), freeSeats: await freeSeatsOf(manager.companyId) };
}

const forbidden = "Only a manager of this company can do that.";

export type CodeState = { name?: string; code?: string; error?: string };

/** A new personal login code. The previous one stops working at once. Shown once. */
export async function issueMemberCodeAction(_prev: CodeState, form: FormData): Promise<CodeState> {
  const manager = await managerOf(String(form.get("slug") ?? ""));
  if (!manager) return { error: forbidden };
  const user = await getDb().user.findFirst({
    where: { id: String(form.get("userId") ?? ""), companyId: manager.companyId },
    select: { id: true, name: true },
  });
  if (!user) return { error: "No such person in this company." };

  const code = generateLoginCode(manager.slug);
  const saved = await audited(
    manager.companyId,
    () => ({ actor: settingsActor(manager), action: "audit.member.code", target: { kind: "user", id: user.id }, changes: {}, source: "settings" }),
    (tx) => tx.user.update({
      where: { id: user.id, companyId: manager.companyId },
      data: { loginCodeHash: hashLoginCode(code), loginCodeAt: new Date() },
    }),
  );
  if (!saved.ok) return { error: auditFailed };
  revalidatePath(`/${manager.slug}/settings/members`);
  return { name: user.name, code };
}

export type RoleState = { saved?: string; error?: string };

/** Takes effect at the person's next login - the session cookie carries the role it was issued with. */
export async function setMemberRoleAction(_prev: RoleState, form: FormData): Promise<RoleState> {
  const manager = await managerOf(String(form.get("slug") ?? ""));
  if (!manager) return { error: forbidden };
  const userId = String(form.get("userId") ?? "");
  const role = String(form.get("role") ?? "");

  const members = await membersOf(manager.companyId);
  const problem = roleChangeProblem(members, manager.userId, userId, role);
  if (problem) return { error: problem };

  // A user who becomes a member gets a handle if they have none; an existing handle never changes.
  const before = await getDb().user.findFirst({ where: { id: userId, companyId: manager.companyId }, select: { handle: true } });
  const handle = isRole(role) && needsHandle(role) && before && !before.handle ? await freshHandle(manager.companyId) : null;
  const wasRole = members.find((m) => m.id === userId)?.role ?? null;
  const saved = await audited(
    manager.companyId,
    () => ({ actor: settingsActor(manager), action: "audit.member.role", target: { kind: "user", id: userId }, changes: { role: { before: wasRole, after: role } }, source: "settings" }),
    (tx) => tx.user.update({ where: { id: userId, companyId: manager.companyId }, data: { role, ...(handle ? { handle } : {}) } }),
  );
  if (!saved.ok) return { error: auditFailed };
  revalidatePath(`/${manager.slug}/settings/members`);
  return { saved: `${members.find((m) => m.id === userId)?.name} is now a ${role}. It applies from their next login.` };
}

export type AddState = { added?: { name: string; code: string }; problems?: string[]; warnings?: string[] };

type Scope = { companyId: string; slug: string };

/** Validates and creates one member with a fresh login code; the code is returned, never stored. */
async function createMember(manager: Scope & { userId: string }, form: FormData, action: "audit.member.added" | "audit.member.invited"): Promise<AddState & { email?: string }> {
  const person = {
    name: String(form.get("name") ?? "").trim(),
    email: String(form.get("email") ?? "").trim(),
    role: String(form.get("role") ?? "member") as Member["role"],
    dept: String(form.get("dept") ?? "").trim(),
  };
  const problems = validateNewMember(person, await membersOf(manager.companyId));
  if (problems.length) return { problems };

  const company = await getDb().company.findUnique({ where: { id: manager.companyId }, select: { id: true, seedJson: true } });
  // Only for the "their inbox will look empty" warning - a seed that fails to parse skips it.
  let seed: Seed | null = null;
  try {
    seed = company ? await companySeed(company) : null;
  } catch {
    seed = null;
  }

  const code = generateLoginCode(manager.slug);
  const handle = needsHandle(person.role) ? await freshHandle(manager.companyId) : null;
  // The row names the new person by user id only; their name and email stay in the user table (D9).
  const saved = await audited(
    manager.companyId,
    (created: { id: string }) => ({ actor: settingsActor(manager), action, target: { kind: "user", id: created.id }, changes: {}, source: "settings" }),
    (tx) => tx.user.create({
      data: {
        companyId: manager.companyId,
        name: person.name,
        email: person.email.toLowerCase(),
        role: person.role,
        dept: person.dept,
        ...(handle ? { handle } : {}),
        ini: initialsOf(person.name),
        loginCodeHash: hashLoginCode(code),
        loginCodeAt: new Date(),
      },
      select: { id: true },
    }),
  );
  if (!saved.ok) return { problems: [auditFailed] };
  revalidatePath(`/${manager.slug}/settings/members`);
  return { added: { name: person.name, code }, warnings: seed ? seedNameWarnings(seed, [person]) : [], email: person.email.toLowerCase() };
}

/** Adds a person and issues their first login code in one step - there is no code-less state worth having. */
export async function addMemberAction(_prev: AddState, form: FormData): Promise<AddState> {
  const manager = await managerOf(String(form.get("slug") ?? ""));
  if (!manager) return { problems: [forbidden] };
  const created = await createMember(manager, form, "audit.member.added");
  return { added: created.added, problems: created.problems, warnings: created.warnings };
}

export type InviteState = AddState & { mailed?: boolean; mailError?: string };

/** Add, then mail the person their code and the company's login address (ADM D11). The code is in the body only. */
export async function inviteMemberAction(_prev: InviteState, form: FormData): Promise<InviteState> {
  const admin = await companyAdminOf(String(form.get("slug") ?? ""));
  if (!admin) return { problems: [forbidden] };
  const { email, ...result } = await createMember({ companyId: admin.companyId, slug: admin.companySlug, userId: admin.userId }, form, "audit.member.invited");
  if (!result.added || !email) return result;

  const company = await getDb().company.findUnique({ where: { id: admin.companyId }, select: { name: true } });
  const locale = await localeForEmail(admin.companyId, email);
  const mail = inviteMail(
    { name: result.added.name },
    { name: company?.name ?? admin.companySlug, loginUrl: `${companyUrl(admin.companySlug)}/login` },
    result.added.code,
    locale,
  );
  const sent = await sendMail({ to: email, subject: mail.subject, text: mail.text });
  return sent.ok ? { ...result, mailed: true } : { ...result, mailed: false, mailError: sent.error };
}

export type SeatState = { done?: boolean; error?: string };

/** Link a free seat to a member, or (intent "unlink") clear a seat that member holds. Through linkSeat. */
export async function memberSeatAction(_prev: SeatState, form: FormData): Promise<SeatState> {
  const admin = await companyAdminOf(String(form.get("slug") ?? ""));
  if (!admin) return { error: forbidden };
  const userId = String(form.get("userId") ?? "");
  const seatId = String(form.get("seatId") ?? "");
  const unlink = form.get("intent") === "unlink";
  const seat = await getDb().orgRoleHolder.findFirst({ where: { id: seatId, companyId: admin.companyId }, select: { userId: true } });
  if (!seat) return { error: "No such seat in this company." };
  if (unlink ? seat.userId !== userId : seat.userId !== null) return { error: unlink ? "That member does not hold this seat." : "That seat is taken." };
  const after = unlink ? null : userId;
  const saved = await audited(
    admin.companyId,
    (ok: boolean) => (ok ? { actor: settingsActor(admin), action: "audit.member.seat", target: { kind: "seat", id: seatId }, changes: { userId: { before: seat.userId, after } }, source: "settings" } : null),
    (tx) => linkSeat(admin.companyId, seatId, after, tx),
  );
  if (!saved.ok) return { error: auditFailed };
  if (!saved.value) return { error: "That person is not an active member of this company." };
  revalidatePath(`/${admin.companySlug}/settings/members`);
  return { done: true };
}

export type RemoveState = { done?: string; error?: string };

/** The leaver path of the directory sync for one person: inactive, seats vacated, open cases handed. Never oneself. */
export async function deactivateMemberAction(_prev: RemoveState, form: FormData): Promise<RemoveState> {
  const manager = await managerOf(String(form.get("slug") ?? ""));
  if (!manager) return { error: forbidden };
  const userId = String(form.get("userId") ?? "");
  if (userId === manager.userId) return { error: "You can't deactivate yourself. Ask another manager." };
  const user = await getDb().user.findFirst({ where: { id: userId, companyId: manager.companyId }, select: { name: true, active: true } });
  if (!user) return { error: "No such person in this company." };
  if (!user.active) return { error: `${user.name} is inactive already.` };
  // The user switch-off and the audit row commit together; the hand-over of open cases follows (idempotent events).
  let failed = false;
  await deactivateUser(manager.companyId, userId, new Date(), async (tx) => {
    try {
      await recordAudit(manager.companyId, { actor: settingsActor(manager), action: "audit.member.deactivated", target: { kind: "user", id: userId }, changes: {}, source: "settings" }, tx);
    } catch (err) {
      console.error(`[audit] audit.member.deactivated not written: ${err instanceof Error ? err.message : String(err)}`);
      failed = true;
      throw err;
    }
  }).catch((err: unknown) => {
    if (!failed) throw err;
  });
  if (failed) return { error: auditFailed };
  revalidatePath(`/${manager.slug}/settings/members`);
  return { done: `${user.name} is deactivated. Their open cases were handed on where someone else holds the role.` };
}

/**
 * Switches an inactive person on again. Their old login code is cleared, so a code that was lost is not
 * silently valid again: a manager issues a new one. Their seats stay vacant until someone links them.
 */
export async function reactivateMemberAction(_prev: RemoveState, form: FormData): Promise<RemoveState> {
  const manager = await managerOf(String(form.get("slug") ?? ""));
  if (!manager) return { error: forbidden };
  const userId = String(form.get("userId") ?? "");
  const user = await getDb().user.findFirst({ where: { id: userId, companyId: manager.companyId }, select: { name: true, active: true } });
  const problem = reactivateProblem(user, userId === manager.userId);
  if (problem || !user) return { error: problem ?? "No such person in this company." };
  const saved = await audited(
    manager.companyId,
    () => ({ actor: settingsActor(manager), action: "audit.member.reactivated", target: { kind: "user", id: userId }, changes: {}, source: "settings" }),
    (tx) => tx.user.updateMany({
      where: { id: userId, companyId: manager.companyId, active: false },
      data: { active: true, deactivatedAt: null, loginCodeHash: null, loginCodeAt: null },
    }),
  );
  if (!saved.ok) return { error: auditFailed };
  revalidatePath(`/${manager.slug}/settings/members`);
  return { done: `${user.name} is active again. Their old login code no longer works: issue a new one, and link their seats in Org.` };
}

/** Removes an inactive person. Their events stay with the label; the link to the user is cleared (SetNull). */
export async function deleteMemberAction(_prev: RemoveState, form: FormData): Promise<RemoveState> {
  const manager = await managerOf(String(form.get("slug") ?? ""));
  if (!manager) return { error: forbidden };
  const userId = String(form.get("userId") ?? "");
  if (userId === manager.userId) return { error: "You can't delete yourself. Ask another manager." };
  const user = await getDb().user.findFirst({ where: { id: userId, companyId: manager.companyId }, select: { name: true, active: true } });
  if (!user) return { error: "No such person in this company." };
  if (user.active) return { error: `${user.name} is still active. Deactivate them first.` };
  const saved = await audited(
    manager.companyId,
    () => ({ actor: settingsActor(manager), action: "audit.member.deleted", target: { kind: "user", id: userId }, changes: {}, source: "settings" }),
    async (tx) => {
      await tx.orgRoleHolder.updateMany({ where: { companyId: manager.companyId, userId }, data: { userId: null } });
      await tx.user.delete({ where: { id: userId, companyId: manager.companyId } });
    },
  );
  if (!saved.ok) return { error: auditFailed };
  revalidatePath(`/${manager.slug}/settings/members`);
  return { done: `${user.name} is deleted.` };
}
