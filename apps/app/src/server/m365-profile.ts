// What the "Microsoft 365" card on a person's own profile shows (phase 2 of
// docs/plans/2026-10-22_sso-and-data-access.md). Not a "use server" module: a loader the page calls.
import { isMicrosoftError, MICROSOFT_ERRORS } from "@/features/auth/entra";
import { getViewerFor } from "@/features/auth/session";
import { companyPrefix } from "@/features/tenant/urls";
import { connectionStatus, m365SearchOn } from "@/lib/db/connections";
import { hasDatabase } from "@/lib/db/client";
import { microsoftEnabledFor } from "@/server/microsoft-login";

export type M365Card = {
  slug: string;
  /** Switched on for the company; when off, a person who is still connected can only disconnect. */
  available: boolean;
  connectedAt: string | null; // YYYY-MM-DD
  /** Microsoft refused the stored token (revoked, expired, blocked): connect again. */
  renew: boolean;
  connectHref: string;
  /** The outcome of the last connect or disconnect, from ?m365=. */
  notice: { text: string; tone: "ok" | "error" } | null;
};

const OUTCOMES: Record<string, string> = {
  connected: "Connected. When you ask the assistant, it can now search the files you can open in Microsoft 365.",
  disconnected: "Disconnected. NextUp no longer holds any access to your Microsoft 365 files.",
};

/** Null: nothing to show (no database, Microsoft sign-in off, or switched off and never connected). */
export async function m365Card(slug: string, outcome: string | undefined): Promise<M365Card | null> {
  if (!hasDatabase()) return null;
  const viewer = await getViewerFor(slug);
  if (!viewer || !(await microsoftEnabledFor(slug))) return null;
  const [available, status] = await Promise.all([m365SearchOn(viewer.companyId), connectionStatus(viewer.companyId, viewer.userId)]);
  // Switched off and never connected: nothing to offer - unless a connect attempt just came back here.
  if (!available && !status && !outcome) return null;

  const notice = outcome && Object.hasOwn(OUTCOMES, outcome)
    ? { text: OUTCOMES[outcome], tone: "ok" as const }
    : isMicrosoftError(outcome) ? { text: MICROSOFT_ERRORS[outcome], tone: "error" as const } : null;
  return {
    slug,
    available,
    connectedAt: status ? status.connectedAt.toISOString().slice(0, 10) : null,
    renew: Boolean(status?.lastError),
    connectHref: `${companyPrefix(slug)}/login/microsoft?as=connect`,
    notice,
  };
}
