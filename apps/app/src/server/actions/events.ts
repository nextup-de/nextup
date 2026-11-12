"use server";
// The one write path for domain state. "Events, not edits": the UI appends a fact and everything
// is re-derived by reduce(seed, log).
//
// The client mints the event id and sends the event it optimistically rendered; the server
// decides who the actor is. A client cannot post as somebody else, and cannot pick the day.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { meFor, type Actor } from "@/features/auth/identity";
import { choosesPosting, DEFAULT_POST_AS, eventLabel } from "@/features/ideas/posting";
import { getViewerFor } from "@/features/auth/session";
import type { CaseEventType, EventPayload } from "@/features/cases/events";
import { APP_EVENT_TYPES, DISCUSSION_EVENT_TYPES, needsProjectsFlag } from "@/features/cases/persist";
import { isEnabled } from "@/features/flags";
import { mayAppend, needsCaseAccess } from "@/features/cases/permissions";
import { reduce } from "@/features/cases/reducer";
import { seedFor } from "@/features/demo";
import { appendEventRow, deleteEventsForTargets, loadLogForSlug, resetCompanyLog } from "@/lib/db/events";
import { markPublished } from "@/lib/db/ideas";
import type { Tx } from "@/lib/db/integrations";
import { draftToPublish } from "@/server/ideas";
import { stampAudience } from "@/lib/db/audience";
import { getDb, hasDatabase } from "@/lib/db/client";
import { loadMembers } from "@/lib/db/knowledge";
import { issueSession } from "@/server/issue-session";
import { prepareAgentAppend } from "./append/agent";
import { prepareApprovalAppend } from "./append/approval";
import { prepareCaseAppend } from "./append/case";
import { prepareOverloadAppend } from "./append/overload";
import { prepareProjectAppend } from "./append/project";
import { entryFor } from "@/server/setup-open";
import { policyFor } from "@/features/admin/stages";
import { stampDept, stampEvent, underHandle } from "@/features/cases/stamp";
import { loadUnitPeople } from "@/lib/db/pseudonymise";
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
  /** A case.raised from the idea studio: the draft it publishes, with the case or not at all (Q1.11). */
  draftId: z.string().min(1).max(64).optional(),
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
  const { slug, id, type, target, draftId } = parsed.data;
  let { payload } = parsed.data;
  if (draftId && type !== "case.raised") return { ok: false, error: t("cases.actionBadEvent") };

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
  const state = reduce(seed, log);
  // Composer (docs/process/README.md): a phase checks or stamps its events in append/<area>.ts, never here.
  for (const prepare of [prepareCaseAppend, prepareProjectAppend, prepareAgentAppend, prepareApprovalAppend, prepareOverloadAppend]) {
    const hook = await prepare({ companyId: viewer.companyId, viewer: { userId: viewer.userId, role: viewer.role }, type, target, payload, state, seed, locale });
    if (!hook.ok) return { ok: false, error: hook.error };
    payload = hook.payload;
  }
  const verdict = mayAppend(who, { type, target, payload }, state, locale, access);
  if (!verdict.ok) return verdict;

  if (type === "day.advanced" && !(await mayRewriteHistory(viewer.companyId))) {
    return { ok: false, error: t("cases.actionRealCompany") };
  }

  // The actor is derived here, never taken from the client: a member posts under their handle, or by name when they
  // chose so for this raise (decision Q1.7); everyone else by name. On their own case a raiser keeps the label they
  // raised it with, so a handle and a name never meet on one case (features/ideas/posting.ts).
  const own = target ? state.cases.find((c) => c.id === target) : undefined;
  const actor = eventLabel(viewer, { type, payload }, own, seed.postAs ?? DEFAULT_POST_AS);

  // The seat a raise lands on is the server's call, whatever the client sent (features/cases/stamp.ts).
  let stored = await stampAudience(viewer.companyId, type, stampEvent(type, payload, seed));
  // The choice is kept as a fact only where it took effect: a member who posted by name.
  if (type === "case.raised") {
    const rest = { ...stored };
    delete rest.asName;
    stored = choosesPosting(viewer) && actor === viewer.name ? { ...rest, asName: true } : rest;
  }
  // So is the department next to a handle: kept only when the raiser's own unit is big enough to hide in.
  if (type === "case.raised" && underHandle(actor) && stored.fromDept) {
    stored = stampDept(type, stored, { label: actor, userId: viewer.userId }, await loadUnitPeople(viewer.companyId));
  }
  // So is the routing proposal: the brain's or the keywords', whatever the browser sent (server/routing.ts).
  if (type === "case.raised") stored = { ...stored, proposal: await proposeOnRaise(slug, viewer.companyId, stored) };

  // A raise from a draft publishes it in the same transaction, so a refused raise leaves the draft open and a
  // published draft always has its case (Q1.11). Another tab that published it first makes this raise fail too.
  const pub = draftId ? await draftToPublish(slug, viewer, draftId) : null;
  if (draftId && !pub) return { ok: false, error: t("cases.actionDraftClosed") };
  const along = draftId && pub && target
    ? async (tx: Tx) => {
        if (!(await markPublished(viewer.companyId, viewer.userId, draftId, target, pub, tx))) throw new Error(t("cases.actionDraftClosed"));
      }
    : undefined;
  const result = await appendEventRow(
    viewer.companyId,
    { id, day: 0, type: type as CaseEventType, actor, targetId: target, payload: stored },
    { actorUserId: viewer.userId, along },
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
