// SCIM user <-> directory entry (D11). Pure. Only the allow-listed attributes are ever read; every other
// attribute of a request is dropped here and never stored or logged.
import type { DirectoryEntry } from "@nextup/contracts/public";
import { ScimFailure } from "./errors";

export const SCIM_CORE_USER = "urn:ietf:params:scim:schemas:core:2.0:User";
export const SCIM_ENTERPRISE = "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User";

export type ScimDoc = Record<string, unknown>;

export const isObj = (v: unknown): v is ScimDoc => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Case-insensitive attribute lookup. */
export const docKey = (o: ScimDoc, name: string): unknown => {
  const k = Object.keys(o).find((x) => x.toLowerCase() === name.toLowerCase());
  return k === undefined ? undefined : o[k];
};

/** Entra sends "True" / "False"; some clients send real booleans. */
export function asBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return null;
}

/** The work email, else the primary, else the first. */
export function workEmail(emails: unknown): string | null {
  if (!Array.isArray(emails)) return null;
  const list = emails.filter(isObj).filter((e) => str(e.value));
  const pick = list.find((e) => String(e.type ?? "").toLowerCase() === "work") ?? list.find((e) => asBool(e.primary) === true) ?? list[0];
  return pick ? str(pick.value) : null;
}

export type ToEntryOptions = {
  /** manager.value is a SCIM id (our User.id): the subject of that user's SCIM link, or null when unknown. */
  managerSubject?: (scimId: string) => string | null;
  /** The subject to use instead of externalId / userName (a user that already has a link keeps its subject). */
  subject?: string;
};

/** The directory entry for a SCIM user, D11's allow-list only. Throws ScimFailure 400 when it has no userName. */
export function toDirectoryEntry(input: unknown, opts: ToEntryOptions = {}): DirectoryEntry {
  if (!isObj(input)) throw new ScimFailure(400, "invalidSyntax", "The body is not a SCIM user.");
  const userName = str(docKey(input, "userName"));
  if (!userName) throw new ScimFailure(400, "invalidValue", "userName is required.");
  const externalId = opts.subject ?? str(docKey(input, "externalId")) ?? userName;
  const nameRaw = docKey(input, "name");
  const name = isObj(nameRaw) ? nameRaw : {};
  const given = str(docKey(name, "givenName"));
  const family = str(docKey(name, "familyName"));
  const displayName =
    str(docKey(input, "displayName")) ?? str(docKey(name, "formatted")) ?? ([given, family].filter(Boolean).join(" ") || null) ?? userName;
  const email = workEmail(docKey(input, "emails")) ?? (userName.includes("@") ? userName : null);
  const extRaw = docKey(input, SCIM_ENTERPRISE);
  const ext = isObj(extRaw) ? extRaw : {};
  const mgr = docKey(ext, "manager");
  const mgrId = isObj(mgr) ? str(docKey(mgr, "value")) : str(mgr);
  const employeeNumber = docKey(ext, "employeeNumber");
  const active = asBool(docKey(input, "active"));
  return {
    externalId,
    displayName: displayName.slice(0, 120),
    email,
    department: str(docKey(ext, "department")),
    jobTitle: str(docKey(input, "title")),
    managerExternalId: mgrId ? (opts.managerSubject?.(mgrId) ?? null) : null,
    groupExternalIds: [],
    employeeId: typeof employeeNumber === "number" ? String(employeeNumber) : str(employeeNumber),
    active: active ?? true,
  };
}

export type ScimUserRow = { id: string; email: string; name: string; active: boolean; line: string; dept: string; managerId: string | null };

/** What we return for a user. No personnel number, ever (D11). `link` is the SCIM link subject, if any. */
export function toScimUser(user: ScimUserRow, link: { subject: string } | null): ScimDoc {
  return {
    schemas: [SCIM_CORE_USER, SCIM_ENTERPRISE],
    id: user.id,
    ...(link ? { externalId: link.subject } : {}),
    userName: user.email,
    name: { formatted: user.name },
    displayName: user.name,
    emails: [{ value: user.email, type: "work", primary: true }],
    active: user.active,
    ...(user.line ? { title: user.line } : {}),
    [SCIM_ENTERPRISE]: {
      ...(user.dept ? { department: user.dept } : {}),
      ...(user.managerId ? { manager: { value: user.managerId } } : {}),
    },
    meta: { resourceType: "User" },
  };
}
