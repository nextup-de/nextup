// The SCIM user operations (EID-S1, D10). Every write goes through applyDirectoryDelta(companyId, "scim", page, now)
// with a page of one entry, or removedExternalIds for a delete. No name, email or personnel number is logged.
import type { DirectoryEntry } from "@nextup/contracts/public";
import { Prisma } from "@prisma/client";
import { getDb } from "@/lib/db/client";
import { applyDirectoryDelta, deactivateUser } from "@/lib/db/directory";
import { SCIM_LINK_ISSUER } from "@/features/identity";
import type { DirectoryCounts } from "@/features/directory";
import {
  applyPatch, listResponse, operationsOf, parseFilter, ScimFailure, toDirectoryEntry, toScimUser,
  type ScimDoc, type ScimUserRow,
} from "@/features/scim";
import { recordAudit, tokenActor } from "@/server/audit/record";
import type { ResolvedToken } from "@/lib/db/tokens";

const USER_SELECT = { id: true, email: true, name: true, active: true, line: true, dept: true, managerId: true } as const;
const LINKS = { where: { provider: "scim", issuer: SCIM_LINK_ISSUER }, select: { subject: true } } as const;

type Found = { row: ScimUserRow; subject: string | null };

async function find(companyId: string, id: string): Promise<Found | null> {
  const u = await getDb().user.findFirst({ where: { id, companyId }, select: { ...USER_SELECT, externalIdentities: LINKS } });
  if (!u) return null;
  const { externalIdentities, ...row } = u;
  return { row, subject: externalIdentities[0]?.subject ?? null };
}

const docOf = (f: Found): ScimDoc => toScimUser(f.row, f.subject ? { subject: f.subject } : null);

async function findBySubject(companyId: string, subject: string): Promise<Found | null> {
  const l = await getDb().externalIdentity.findFirst({ where: { companyId, provider: "scim", issuer: SCIM_LINK_ISSUER, subject }, select: { userId: true } });
  return l ? find(companyId, l.userId) : null;
}

/** manager.value is a SCIM id: the subject of that user's link, else the id itself when it is one of our users. */
async function managerResolver(companyId: string): Promise<(id: string) => string | null> {
  const [links, users] = await Promise.all([
    getDb().externalIdentity.findMany({ where: { companyId, provider: "scim", issuer: SCIM_LINK_ISSUER }, select: { userId: true, subject: true } }),
    getDb().user.findMany({ where: { companyId }, select: { id: true } }),
  ]);
  const subject = new Map(links.map((l) => [l.userId, l.subject]));
  const ids = new Set(users.map((u) => u.id));
  return (id) => subject.get(id) ?? (ids.has(id) ? id : null);
}

const page = (entries: DirectoryEntry[], removed: string[] = []) => ({ entries, groups: [], removedExternalIds: removed, nextCursor: null });
const changed = (c: DirectoryCounts) => c.added + c.updated + c.deactivated + c.handed > 0;

async function audit(token: ResolvedToken, c: DirectoryCounts): Promise<void> {
  if (!changed(c)) return;
  await recordAudit(token.companyId, {
    actor: tokenActor(token.id), action: "audit.directory.scim", source: "api",
    changes: {
      added: { before: null, after: c.added }, updated: { before: null, after: c.updated },
      deactivated: { before: null, after: c.deactivated }, handed: { before: null, after: c.handed },
    },
  });
}

async function apply(token: ResolvedToken, entry: DirectoryEntry | null, removed: string[] = []): Promise<DirectoryCounts> {
  try {
    const counts = await applyDirectoryDelta(token.companyId, "scim", page(entry ? [entry] : [], removed), new Date());
    await audit(token, counts);
    return counts;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new ScimFailure(409, "uniqueness", "Another request created this user first.");
    throw err;
  }
}

const notFound = () => new ScimFailure(404, null, "No such user.");

export async function getUser(companyId: string, id: string): Promise<ScimDoc> {
  const f = await find(companyId, id);
  if (!f) throw notFound();
  return docOf(f);
}

export async function listUsers(companyId: string, params: URLSearchParams): Promise<Record<string, unknown>> {
  const filter = params.get("filter") ? parseFilter(params.get("filter") as string) : null;
  const num = (k: string, d: number) => {
    const v = params.get(k);
    return v === null || !/^-?\d+$/.test(v) ? d : Number(v);
  };
  const startIndex = Math.max(1, num("startIndex", 1));
  const count = Math.min(100, Math.max(0, num("count", 100)));
  const where: Prisma.UserWhereInput = { companyId };
  if (filter?.attr === "externalId") where.externalIdentities = { some: { provider: "scim", issuer: SCIM_LINK_ISSUER, subject: filter.value } };
  if (filter?.attr === "userName") {
    where.OR = [
      { email: { equals: filter.value, mode: "insensitive" } },
      { externalIdentities: { some: { provider: "scim", issuer: SCIM_LINK_ISSUER, subject: filter.value } } },
    ];
  }
  const db = getDb();
  const [total, rows] = await Promise.all([
    db.user.count({ where }),
    count === 0 ? Promise.resolve([]) : db.user.findMany({
      where, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: startIndex - 1, take: count,
      select: { ...USER_SELECT, externalIdentities: LINKS },
    }),
  ]);
  const docs = rows.map(({ externalIdentities, ...row }) => docOf({ row, subject: externalIdentities[0]?.subject ?? null }));
  return listResponse(docs, total, startIndex);
}

export async function createUser(token: ResolvedToken, body: unknown): Promise<ScimDoc> {
  const entry = toDirectoryEntry(body, { managerSubject: await managerResolver(token.companyId) });
  if (!entry.email) throw new ScimFailure(400, "invalidValue", "A work email (or an email as userName) is required.");
  if (await findBySubject(token.companyId, entry.externalId)) throw new ScimFailure(409, "uniqueness", "A user with this externalId exists.");
  await apply(token, entry);
  const made = await findBySubject(token.companyId, entry.externalId);
  if (!made) {
    const taken = await getDb().user.findFirst({ where: { companyId: token.companyId, email: { equals: entry.email, mode: "insensitive" } }, select: { id: true } });
    if (taken) throw new ScimFailure(409, "uniqueness", "This email belongs to a user with another SCIM link.");
    if (!entry.active) throw new ScimFailure(400, "invalidValue", "An inactive user is not created.");
    throw new ScimFailure(400, "invalidValue", "The department does not match a unit of the company.");
  }
  return docOf(made);
}

async function update(token: ResolvedToken, id: string, build: (current: ScimDoc) => ScimDoc): Promise<ScimDoc> {
  const f = await find(token.companyId, id);
  if (!f) throw notFound();
  const entry = toDirectoryEntry(build(docOf(f)), { managerSubject: await managerResolver(token.companyId), subject: f.subject ?? undefined });
  // An unlinked user is found again by its email, so a change of it cannot be applied until it is linked.
  if (!f.subject && entry.email?.toLowerCase() !== f.row.email.toLowerCase()) throw new ScimFailure(400, "mutability", "The email of a user without a SCIM link cannot be changed.");
  await apply(token, entry);
  const after = await find(token.companyId, id);
  if (!after) throw notFound();
  return docOf(after);
}

export const replaceUser = (token: ResolvedToken, id: string, body: unknown) => update(token, id, () => (body as ScimDoc));
export const patchUser = (token: ResolvedToken, id: string, body: unknown) => update(token, id, (cur) => applyPatch(cur, operationsOf(body)));

/** Deactivate (never delete): seats vacated, open cases handed. 204 either way. */
export async function deleteUser(token: ResolvedToken, id: string): Promise<void> {
  const f = await find(token.companyId, id);
  if (!f) throw notFound();
  if (f.subject) await apply(token, null, [f.subject]);
  else {
    const c = await deactivateUser(token.companyId, id);
    await audit(token, { added: 0, updated: 0, ...c });
  }
}
