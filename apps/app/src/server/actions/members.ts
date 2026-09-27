"use server";
// Settings -> Members: a company's managers look after their own people - list them, add one,
// change a role, hand out a personal login code. /admin can do the same across every company;
// this is the in-company version, so onboarding a pilot does not need us.
//
// The role is re-read from the database on every call, not taken from the session cookie: the
// cookie carries the role the person had when they logged in, and a manager demoted a minute ago
// must not keep handing out codes until their session expires.
import { revalidatePath } from "next/cache";
import { getViewerFor } from "@/features/auth/session";
import { generateLoginCode, hashLoginCode } from "@/features/auth/login-code";
import { initialsOf, seedNameWarnings } from "@/features/tenant/create";
import { isRole, roleChangeProblem, validateNewMember, type Member } from "@/features/tenant/members";
import { companySeed } from "@/lib/db/companies";
import type { Seed } from "@/features/demo/types";
import { getDb, hasDatabase } from "@/lib/db/client";

export type MemberRow = Member & { dept: string; codeIssuedAt: string | null; microsoft: boolean };

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

async function membersOf(companyId: string): Promise<MemberRow[]> {
  const rows = await getDb().user.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, dept: true, loginCodeAt: true, entraOid: true },
  });
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
    }));
}

export type MembersPage =
  | { status: "ok"; me: string; members: MemberRow[] }
  | { status: "no-database" }
  | { status: "forbidden" };

/** What the Members page renders. Addresses only ever reach a manager of this company. */
export async function loadMembers(slug: string): Promise<MembersPage> {
  if (!hasDatabase()) return { status: "no-database" };
  const manager = await managerOf(slug);
  if (!manager) return { status: "forbidden" };
  return { status: "ok", me: manager.userId, members: await membersOf(manager.companyId) };
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
  await getDb().user.update({
    where: { id: user.id, companyId: manager.companyId },
    data: { loginCodeHash: hashLoginCode(code), loginCodeAt: new Date() },
  });
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

  await getDb().user.update({ where: { id: userId, companyId: manager.companyId }, data: { role } });
  revalidatePath(`/${manager.slug}/settings/members`);
  return { saved: `${members.find((m) => m.id === userId)?.name} is now a ${role}. It applies from their next login.` };
}

export type AddState = { added?: { name: string; code: string }; problems?: string[]; warnings?: string[] };

/** Adds a person and issues their first login code in one step - there is no code-less state worth having. */
export async function addMemberAction(_prev: AddState, form: FormData): Promise<AddState> {
  const manager = await managerOf(String(form.get("slug") ?? ""));
  if (!manager) return { problems: [forbidden] };

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
  await getDb().user.create({
    data: {
      companyId: manager.companyId,
      name: person.name,
      email: person.email.toLowerCase(),
      role: person.role,
      dept: person.dept,
      ini: initialsOf(person.name),
      loginCodeHash: hashLoginCode(code),
      loginCodeAt: new Date(),
    },
  });
  revalidatePath(`/${manager.slug}/settings/members`);
  return { added: { name: person.name, code }, warnings: seed ? seedNameWarnings(seed, [person]) : [] };
}
