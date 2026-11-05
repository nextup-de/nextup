"use server";
// The company context draft on the setup's Company step (docs/COMPANY_KNOWLEDGE.md). Every action starts with
// companyAdminOf and takes the company from the guard. The profile is written only by saveCompanyAction:
// a review saves through it and then takes what was saved out of the draft.
import { withoutFields } from "@/features/settings/context-draft";
import type { MessageKey } from "@/i18n";
import { connectionStatus } from "@/lib/db/connections";
import { beginContextRun, loadContextRun, settleContextDraft } from "@/lib/db/context-run";
import { settingsActor } from "@/server/audit/record";
import { contextFacts, contextUsable } from "@/server/setup-context";
import { revalidateSetup } from "@/server/setup-paths";
import { audited } from "./audited";
import { saveCompanyAction, type SettingsFormState } from "./company";
import { companyAdminOf } from "./guard";

export type ContextActionResult = { ok: true } | { ok: false; error: MessageKey };

/** Start a run: it searches as the viewer, so their own account has to be connected. */
export async function startContextRunAction(slug: string): Promise<ContextActionResult> {
  const viewer = await companyAdminOf(slug);
  if (!viewer) return { ok: false, error: "settingsSetupContext.errForbidden" };
  const { companyId, userId } = viewer;
  if (!contextUsable(await contextFacts(companyId))) return { ok: false, error: "settingsSetupContext.errNotUsable" };
  const connection = await connectionStatus(companyId, userId);
  if (!connection || connection.lastError) return { ok: false, error: "settingsSetupContext.errConnect" };
  const begun = await audited(
    companyId,
    (started: boolean) => (started
      ? { actor: settingsActor(viewer), action: "audit.company.context_started", target: { kind: "company", id: companyId }, source: "settings" }
      : null),
    (tx) => beginContextRun(companyId, userId, new Date(), tx),
  );
  if (!begun.ok) return { ok: false, error: "settingsSetupContext.errAudit" };
  if (!begun.value) return { ok: false, error: "settingsSetupContext.errRunning" };
  revalidateSetup();
  return { ok: true };
}

/**
 * The Company step's form. saveCompanyAction replaces the whole profile: the step sends the accepted text for
 * what was accepted and the current value for everything else. What was saved then leaves the draft.
 */
export async function saveContextReviewAction(prev: SettingsFormState, form: FormData): Promise<SettingsFormState> {
  const state = await saveCompanyAction(prev, form);
  const accepted = form.get("contextAccepted");
  const slug = form.get("slug");
  if (!state.ok || typeof accepted !== "string" || !accepted || typeof slug !== "string") return state;
  const viewer = await companyAdminOf(slug);
  if (!viewer) return state;
  const run = await loadContextRun(viewer.companyId);
  if (run?.draft) await settleContextDraft(viewer.companyId, withoutFields(run.draft, accepted.split(",")));
  revalidateSetup();
  return state;
}

/** Done with the draft: its text leaves the database, the profile stays as it is. */
export async function discardContextDraftAction(slug: string): Promise<ContextActionResult> {
  const viewer = await companyAdminOf(slug);
  if (!viewer) return { ok: false, error: "settingsSetupContext.errForbidden" };
  const { companyId } = viewer;
  const done = await audited(
    companyId,
    () => ({ actor: settingsActor(viewer), action: "audit.company.context_discarded", target: { kind: "company", id: companyId }, source: "settings" }),
    (tx) => settleContextDraft(companyId, null, new Date(), tx),
  );
  if (!done.ok) return { ok: false, error: "settingsSetupContext.errAudit" };
  revalidateSetup();
  return { ok: true };
}
