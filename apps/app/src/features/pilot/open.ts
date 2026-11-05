// Closed until opened (docs/SETTINGS.md, Setup). A company starts closed: only the people setting it up
// get a session, and "Open NextUp" lets everyone else in. Pure: lib/db/go-live.ts and server/setup-open.ts
// read the rows, this file decides.
import type { SetupStep } from "@/features/settings/sections";
import { blockers, type GoLiveCheck } from "./go-live";

export type SetupPerson = { role: string; active: boolean; isStackAdmin: boolean };

/** Who works in setup: an active manager or a stack admin. */
export function isSetupPerson(p: SetupPerson): boolean {
  return p.active && (p.role === "manager" || p.isStackAdmin);
}

/** "refused": no session. "setup": a session, and home is the setup process. "home": a session, and home is the role's. */
export type SignInEntry = "refused" | "setup" | "home";

export function signInEntry(openedAt: Date | null, person: SetupPerson): SignInEntry {
  if (openedAt !== null) return "home";
  return isSetupPerson(person) ? "setup" : "refused";
}

export type OpenRefusal = "opened" | "setup" | "blocked";
export type OpenVerdict = { ok: true } | { ok: false; reason: OpenRefusal };

/** Open needs every setup step done and every needed go-live check done. There is no override. */
export function canOpen(s: { openedAt: Date | null; step: SetupStep; checks: readonly GoLiveCheck[] }): OpenVerdict {
  if (s.openedAt !== null) return { ok: false, reason: "opened" };
  if (s.step !== "done") return { ok: false, reason: "setup" };
  if (blockers(s.checks).length > 0) return { ok: false, reason: "blocked" };
  return { ok: true };
}
