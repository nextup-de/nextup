"use server";
// The one write path for domain state. "Events, not edits": the UI appends a fact and everything
// is re-derived by reduce(seed, log).
//
// The client mints the event id and sends the event it optimistically rendered; the server
// decides who the actor is. A client cannot post as somebody else, and cannot pick the day.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actorLabel, meFor, type Actor } from "@/features/auth/identity";
import { getViewerFor } from "@/features/auth/session";
import type { CaseEventType, EventPayload } from "@/features/cases/events";
import { APP_EVENT_TYPES, DISCUSSION_EVENT_TYPES, needsProjectsFlag } from "@/features/cases/persist";
import { isEnabled } from "@/features/flags";
import { mayAppend, needsCaseAccess } from "@/features/cases/permissions";
import { reduce } from "@/features/cases/reducer";
import { seedFor } from "@/features/demo";
import { appendEventRow, deleteEventsForTargets, loadLogForSlug, resetCompanyLog } from "@/lib/db/events";
import { stampAudience } from "@/lib/db/audience";
import { getDb, hasDatabase } from "@/lib/db/client";
import { loadMembers } from "@/lib/db/knowledge";
import { issueSession } from "@/server/issue-session";
import { entryFor } from "@/server/setup-open";
import { policyFor } from "@/features/admin/stages";
import { stampEvent } from "@/features/cases/stamp";
import { kickJira } from "@/server/jira-sync";
import { proposeOnRaise } from "@/server/routing";
import { getLocale } from "@/i18n/server";
import { createT } from "@/i18n";

// Same ceiling as the integration endpoint (features/integrations MAX_PAYLOAD_BYTES): one event
// is a title, a body and a few ids, never a file.
const MAX_PAYLOAD_CHARS = 16 * 1024;
const Payload: z.ZodType<EventPayload> = z
  .looseObject({})
  .refine((p) => JSON.stringify(p).length <= MAX_PAYLOAD_CHARS) as unknown as z.ZodType<EventPayload>;

const Input = z.object({
  slug: z.string().min(1),
  id: z.string().min(1).max(64),
  type: z.enum(APP_EVENT_TYPES),
  target: z.string().min(1).max(64).nullable(),
  payload: Payload,
});

export type AppendInput = z.input<typeof Input>;
export type AppendOutcome = { ok: true } | { ok: false; error: string };

/** Only a manager may move everyone's clock or wipe the company's history. */
const isDemoOwner = (role: string) => role === "manager";

/**
 * And only in a demo company. From sandbox on the history is real people's cases: nobody rewinds
 * it, wipes it or moves its clock from a dev panel (policyFor in features/admin/stages.ts).
 */
async function mayRewriteHistory(companyId: string): Promise<boolean> {
  const company = await getDb().company.findUnique({ where: { id: companyId }, select: { stage: true } });
  return Boolean(company && policyFor(company.stage).rewriteHistory);
}

export async function appendEventAction(input: AppendInput): Promise<AppendOutcome> {
  const locale = await getLocale();
  const t = createT(locale);
  if (!hasDatabase()) return { ok: false, error: t("cases.actionNoDatabase") };

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: t("cases.actionBadEvent") };
  const { slug, id, type, target, payload } = parsed.data;

  const viewer = await getViewerFor(slug);
  if (!viewer) return { ok: false, error: t("cases.actionSessionExpired") };

  // Behind a flag until admin.sellux.ch turns it on for this company (src/config/flags.ts).
  if (DISCUSSION_EVENT_TYPES.includes(type) && !(await isEnabled(slug, "discussion"))) {
    return { ok: false, error: t("cases.actionDiscussionOff") };
  }
  if (needsProjectsFlag(type, payload) && !(await isEnabled(slug, "projects"))) {
    return { ok: false, error: t("cases.actionProjectsOff") };
  }

  // Who may do this to this case? Answered against the reduced log, the same state every browser
  // renders - the buttons the UI hides are hidden here too (features/cases/permissions.ts).
  const log = await loadLogForSlug(slug);
  if (!log) return { ok: false, error: t("cases.actionSessionExpired") };
  const seed = await seedFor(slug);
  const who: Actor = { role: viewer.role, userId: viewer.userId, me: meFor(viewer.userId, seed.seats), name: viewer.name, handle: viewer.handle };
  const access = needsCaseAccess(type) ? { roles: seed.roles ?? [], members: await loadMembers(viewer.companyId) } : undefined;
  const verdict = mayAppend(who, { type, target, payload }, reduce(seed, log), locale, access);
  if (!verdict.ok) return verdict;

  if (type === "day.advanced" && !(await mayRewriteHistory(viewer.companyId))) {
    return { ok: false, error: t("cases.actionRealCompany") };
  }

  // The actor is derived here, never taken from the client: a member posts under their handle,
  // everyone else by name. Same rule the demo had.
  const actor = actorLabel(viewer);

  // The seat a raise lands on is the server's call, whatever the client sent (features/cases/stamp.ts).
  let stored = await stampAudience(viewer.companyId, type, stampEvent(type, payload, seed));
  // So is the routing proposal: the brain's or the keywords', whatever the browser sent (server/routing.ts).
  if (type === "case.raised") stored = { ...stored, proposal: await proposeOnRaise(slug, viewer.companyId, stored) };
  const result = await appendEventRow(
    viewer.companyId,
    { id, day: 0, type: type as CaseEventType, actor, targetId: target, payload: stored },
    { actorUserId: viewer.userId },
  );
  if (!result.ok) return { ok: false, error: result.error };

  // The mails for this event come from the outbox: server/notify/dispatch.ts plans them from the log.
  // A person's project event (or a yes that opens a project) is Jira's to hear about now, not in a minute.
  if (type.startsWith("project.") || type === "case.decided") kickJira(slug);

  revalidatePath("/" + slug, "layout");
  revalidatePath("/", "layout"); // subdomain mode: the company is the host, so the path has no slug
  return { ok: true };
}

/** Dev panel: put this company back to its seed. Shared - it resets for everyone. */
export async function resetCompanyAction(slug: string): Promise<AppendOutcome> {
  const t = createT(await getLocale());
  if (!hasDatabase()) return { ok: false, error: t("cases.actionNoDatabase") };
  const viewer = await getViewerFor(slug);
  if (!viewer) return { ok: false, error: t("cases.actionSessionExpired") };
  if (!isDemoOwner(viewer.role)) return { ok: false, error: t("cases.actionResetManager") };
  if (!(await mayRewriteHistory(viewer.companyId))) return { ok: false, error: t("cases.actionRealCompany") };

  await resetCompanyLog(viewer.companyId);
  revalidatePath("/" + slug, "layout");
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Dev panel: drop the cases raised during this demo, keeping the seed ones. */
export async function deleteAddedAction(slug: string, caseIds: string[]): Promise<AppendOutcome> {
  const t = createT(await getLocale());
  if (!hasDatabase()) return { ok: false, error: t("cases.actionNoDatabase") };
  const viewer = await getViewerFor(slug);
  if (!viewer) return { ok: false, error: t("cases.actionSessionExpired") };
  if (!isDemoOwner(viewer.role)) return { ok: false, error: t("cases.actionDeleteManager") };
  if (!(await mayRewriteHistory(viewer.companyId))) return { ok: false, error: t("cases.actionRealCompany") };

  await deleteEventsForTargets(viewer.companyId, caseIds.slice(0, 500));
  revalidatePath("/" + slug, "layout");
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Dev panel, demo stage only: become one of this company's other people. */
export async function switchUserAction(slug: string, userId: string): Promise<AppendOutcome> {
  const t = createT(await getLocale());
  if (!hasDatabase()) return { ok: false, error: t("cases.actionNoDatabase") };
  const viewer = await getViewerFor(slug);
  if (!viewer) return { ok: false, error: t("cases.actionSessionExpired") };

  const company = await getDb().company.findUnique({
    where: { slug },
    select: { id: true, stage: true },
  });
  if (!company || !policyFor(company.stage).switchPerson) {
    return { ok: false, error: t("cases.actionSwitchDemoOnly") };
  }
  const user = await getDb().user.findFirst({ where: { companyId: company.id, id: userId } });
  if (!user) return { ok: false, error: t("cases.actionNoPerson") };
  if ((await entryFor(company.id, user)) === "refused") return { ok: false, error: t("settingsSetupOpen.refused", { company: slug }) };

  await issueSession(company.id, slug, user);
  revalidatePath("/" + slug, "layout");
  revalidatePath("/", "layout");
  return { ok: true };
}
