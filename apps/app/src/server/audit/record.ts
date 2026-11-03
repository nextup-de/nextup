// Writing the audit trail (GDP D11). Server only; deliberately not a "use server" module, so none of
// this is callable from a browser.
//
// A failed write propagates. A caller that changes data puts the change and its audit row in one
// transaction and hands the transaction client in, so a failed audit write rolls the change back. An
// effect outside the database (a mail, a call to another system) is recorded durably first and is not
// reported as done until that record exists.
import type { Prisma } from "@prisma/client";
import { ACTOR_KINDS, AUDIT_SOURCES, isAuditAction, type ActorKind, type AuditAction, type AuditChanges, type AuditSource } from "@/features/audit";
import { appendAudit, type AuditClient, type AuditRow } from "@/lib/db/audit";
import { consoleCompany } from "@/server/console-guard";

/** A person (by user id only, D9), a shared code, a rule, the directory, a token, support or the platform. */
export type AuditActor = { kind: ActorKind; userId: string | null; tokenId?: string };

export type AuditEntry = {
  actor: AuditActor;
  action: AuditAction;
  /** What was changed: a kind (member, token, connector…) and its id - a user id for a person, never a name. */
  target?: { kind: string; id: string };
  changes?: AuditChanges | Record<string, unknown>;
  source: AuditSource;
};

/** A company admin, signed in to /<company>/settings. */
export const settingsActor = (viewer: { userId: string }): AuditActor => ({ kind: "admin", userId: viewer.userId });

/** A rule that ran by itself: the scheduler, the retention run. */
export const SYSTEM_ACTOR: AuditActor = { kind: "system", userId: null };
export const DIRECTORY_ACTOR: AuditActor = { kind: "directory", userId: null };
export const PLATFORM_ACTOR: AuditActor = { kind: "platform", userId: null };
export const tokenActor = (tokenId: string): AuditActor => ({ kind: "api-token", userId: null, tokenId });

/**
 * The actor of the signed-in /admin session. Entra and stack-admin sessions are the console; the shared
 * code and support are their own kinds. The /admin cookie names a person by sign-in name, not by user id,
 * so there is no user id to record (D9). Without a console session this refuses: a write that nobody is
 * entitled to make must not pass as the platform's.
 */
export async function consoleActor(): Promise<AuditActor> {
  const c = await consoleCompany();
  if (!c) throw new Error("audit: no console session, no actor");
  if (c.via === "break-glass") return { kind: "break-glass", userId: null };
  if (c.via === "support") return { kind: "support", userId: null };
  return { kind: "console", userId: null };
}

/** Append one audit row. Throws on an action that is not in AUDIT_ACTIONS, and on a failed write. */
export async function recordAudit(companyId: string, entry: AuditEntry, client?: AuditClient): Promise<AuditRow> {
  if (!isAuditAction(entry.action)) throw new Error(`audit: unknown action ${String(entry.action)}`);
  if (!ACTOR_KINDS.includes(entry.actor.kind)) throw new Error(`audit: unknown actor kind ${String(entry.actor.kind)}`);
  if (!AUDIT_SOURCES.includes(entry.source)) throw new Error(`audit: unknown source ${String(entry.source)}`);
  return appendAudit(
    {
      companyId,
      actorKind: entry.actor.kind,
      actorUserId: entry.actor.userId,
      action: entry.action,
      targetKind: entry.target?.kind ?? null,
      targetId: entry.target?.id ?? null,
      // An API token's id is kept in the change; through JSON so a Date or an undefined cannot reach the column as something else.
      changes: JSON.parse(JSON.stringify({ ...(entry.changes ?? {}), ...(entry.actor.tokenId ? { apiTokenId: { before: null, after: entry.actor.tokenId } } : {}) })) as Prisma.InputJsonValue,
      source: entry.source,
    },
    client,
  );
}
