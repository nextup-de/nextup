// The audit core (GDP D11, D12): which actions exist, who may be named as the actor, and how a change is
// written down. Pure: no database, no React. A change never holds a name or an email (D9) and never a
// secret's value (D5).

export const AUDIT_ACTIONS = [
  "audit.company.created",
  "audit.company.stage",
  "audit.company.saved",
  "audit.settings.rules",
  "audit.settings.calendar",
  "audit.settings.org",
  "audit.settings.routing",
  "audit.settings.goals",
  "audit.settings.areas",
  "audit.settings.notifications",
  "audit.settings.webhooks",
  "audit.settings.metrics_baseline",
  "audit.member.added",
  "audit.member.invited",
  "audit.member.code",
  "audit.member.role",
  "audit.member.deactivated",
  "audit.member.deleted",
  "audit.member.seat",
  "audit.member.totp_reset",
  "audit.token.created",
  "audit.token.revoked",
  "audit.connector.saved",
  "audit.connector.on",
  "audit.connector.off",
  "audit.connector.secret",
  "audit.connector.removed",
  "audit.connector.disconnected",
  "audit.assistant.saved",
  "audit.assistant.ideas",
  "audit.directory.on",
  "audit.directory.off",
  "audit.directory.run",
  "audit.access.break_glass",
  "audit.access.entra_tenant",
  "audit.access.stack_admin",
  "audit.access.support_granted",
  "audit.access.support_revoked",
  "audit.access.support_signin",
  "audit.privacy.exported",
  "audit.privacy.downloaded",
  "audit.privacy.pseudonymised",
  "audit.privacy.retention",
  "audit.privacy.retention_run",
  "audit.privacy.screenshots",
  "audit.privacy.audit_exported",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_AREAS = ["company", "settings", "member", "token", "connector", "assistant", "directory", "access", "privacy"] as const;
export type AuditArea = (typeof AUDIT_AREAS)[number];

/** Who did it. There is no kind for a model (D6). */
export type ActorKind = "admin" | "console" | "break-glass" | "support" | "platform" | "system" | "directory" | "api-token";
export const ACTOR_KINDS: readonly ActorKind[] = ["admin", "console", "break-glass", "support", "platform", "system", "directory", "api-token"];

/** Where the change was made. */
export type AuditSource = "settings" | "console" | "platform" | "scheduler" | "directory" | "api";
export const AUDIT_SOURCES: readonly AuditSource[] = ["settings", "console", "platform", "scheduler", "directory", "api"];

export function isAuditAction(s: unknown): s is AuditAction {
  return typeof s === "string" && (AUDIT_ACTIONS as readonly string[]).includes(s);
}

/** The area of an action: `audit.member.role` is `member`. */
export function areaOf(action: AuditAction): AuditArea {
  return action.split(".")[1] as AuditArea;
}

/** The message key (in `settingsAudit`) of an action: dots become underscores. */
export const actionLabelKey = (action: AuditAction): string => action.replaceAll(".", "_");

/** The message key (in `settingsAudit`) of an actor kind: `break-glass` is `actor_breakGlass`, `api-token` is `actor_apiToken`. */
export const actorLabelKey = (kind: ActorKind): string => "actor_" + kind.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());

export type AuditChange = { before: unknown; after: unknown };
export type AuditChanges = Record<string, AuditChange>;

const present = (v: unknown): boolean => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);

// Key order must not matter: {a:1,b:2} equals {b:2,a:1}.
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v === undefined ? null : v);
}

/**
 * The fields that differ between two states, each as { before, after }. A field in `secretFields` never
 * shows its value: it is written as { before: null, after: "set" | "replaced" | "removed" }.
 */
export function auditChanges(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  secretFields: readonly string[] = [],
): AuditChanges {
  const b = before ?? {};
  const a = after ?? {};
  const out: AuditChanges = {};
  for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (canonical(b[key]) === canonical(a[key])) continue;
    if (secretFields.includes(key)) {
      const was = present(b[key]);
      const is = present(a[key]);
      if (!was && !is) continue;
      out[key] = { before: null, after: !was ? "set" : is ? "replaced" : "removed" };
    } else {
      out[key] = { before: b[key] === undefined ? null : b[key], after: a[key] === undefined ? null : a[key] };
    }
  }
  return out;
}
