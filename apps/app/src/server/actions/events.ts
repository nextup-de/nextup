"use server";
// The one write path for domain state. "Events, not edits": the UI appends a fact and everything
// is re-derived by reduce(seed, log).
//
// The client mints the event id and sends the event it optimistically rendered; the server
// decides who the actor is. A client cannot post as somebody else, and cannot pick the day.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewerFor } from "@/features/auth/session";
import type { CaseEventType, EventPayload } from "@/features/cases/events";
import { APP_EVENT_TYPES } from "@/features/cases/persist";
import { mayAppend } from "@/features/cases/permissions";
import { reduce } from "@/features/cases/reducer";
import { seedFor } from "@/features/demo";
import { appendEventRow, deleteEventsForTargets, loadLogForSlug, resetCompanyLog } from "@/lib/db/events";
import { getDb, hasDatabase } from "@/lib/db/client";
import { issueSession } from "@/server/issue-session";
import { companySeed } from "@/lib/db/companies";
import { policyFor } from "@/features/admin/stages";
import { buildRaisedNotice } from "@/features/cases/notice";
import { companyBaseUrl, notifyCaseRaised } from "@/server/case-notice";
import { mailConfigured } from "@/server/mail";

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

const realCompany = "This company holds real people's cases - the demo tools are switched off.";

export async function appendEventAction(input: AppendInput): Promise<AppendOutcome> {
  if (!hasDatabase()) return { ok: false, error: "No database is configured." };

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That event did not look right." };
  const { slug, id, type, target, payload } = parsed.data;

  const viewer = await getViewerFor(slug);
  if (!viewer) return { ok: false, error: "Your session has expired. Log in again." };

  // Who may do this to this case? Answered against the reduced log, the same state every browser
  // renders - the buttons the UI hides are hidden here too (features/cases/permissions.ts).
  const log = await loadLogForSlug(slug);
  if (!log) return { ok: false, error: "Your session has expired. Log in again." };
  const verdict = mayAppend(viewer, { type, target, payload }, reduce(await seedFor(slug), log));
  if (!verdict.ok) return verdict;

  if (type === "day.advanced" && !(await mayRewriteHistory(viewer.companyId))) {
    return { ok: false, error: realCompany };
  }

  // The actor is derived here, never taken from the client: a member posts under their handle,
  // everyone else by name. Same rule the demo had.
  const actor = viewer.role === "member" && viewer.handle ? viewer.handle : viewer.name;

  const result = await appendEventRow(
    viewer.companyId,
    { id, day: 0, type: type as CaseEventType, actor, targetId: target, payload },
    { actorUserId: viewer.userId },
  );
  if (!result.ok) return { ok: false, error: result.error };

  // Email the route owner, but only after the row is safely committed, and never block on it.
  if (type === "case.raised" && target) {
    void notifyRaised(slug, viewer.companyId, id, target, payload);
  }

  revalidatePath("/" + slug, "layout");
  revalidatePath("/", "layout"); // subdomain mode: the company is the host, so the path has no slug
  return { ok: true };
}

/** Resolve the route owner and send them the notice. */
async function notifyRaised(
  slug: string,
  companyId: string,
  eventId: string,
  caseId: string,
  payload: EventPayload,
): Promise<void> {
  if (!mailConfigured()) return;
  try {
    const company = await getDb().company.findUnique({
      where: { slug },
      select: { id: true, demoDay: true, seedJson: true, users: { select: { name: true, email: true } } },
    });
    if (!company) return;
    notifyCaseRaised(
      companyId,
      buildRaisedNotice({
        slug,
        eventId,
        caseId,
        payload,
        seed: await companySeed(company),
        people: company.users,
        day: company.demoDay,
        baseUrl: companyBaseUrl(slug),
      }),
    );
  } catch {
    // Same rule as the delivery itself: a raise must never fail because of the notification.
  }
}

/** Dev panel: put this company back to its seed. Shared - it resets for everyone. */
export async function resetCompanyAction(slug: string): Promise<AppendOutcome> {
  if (!hasDatabase()) return { ok: false, error: "No database is configured." };
  const viewer = await getViewerFor(slug);
  if (!viewer) return { ok: false, error: "Your session has expired. Log in again." };
  if (!isDemoOwner(viewer.role)) return { ok: false, error: "Only a manager can reset the demo." };
  if (!(await mayRewriteHistory(viewer.companyId))) return { ok: false, error: realCompany };

  await resetCompanyLog(viewer.companyId);
  revalidatePath("/" + slug, "layout");
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Dev panel: drop the cases raised during this demo, keeping the seed ones. */
export async function deleteAddedAction(slug: string, caseIds: string[]): Promise<AppendOutcome> {
  if (!hasDatabase()) return { ok: false, error: "No database is configured." };
  const viewer = await getViewerFor(slug);
  if (!viewer) return { ok: false, error: "Your session has expired. Log in again." };
  if (!isDemoOwner(viewer.role)) return { ok: false, error: "Only a manager can delete cases." };
  if (!(await mayRewriteHistory(viewer.companyId))) return { ok: false, error: realCompany };

  await deleteEventsForTargets(viewer.companyId, caseIds.slice(0, 500));
  revalidatePath("/" + slug, "layout");
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Dev panel, demo stage only: become one of this company's other people. */
export async function switchUserAction(slug: string, userId: string): Promise<AppendOutcome> {
  if (!hasDatabase()) return { ok: false, error: "No database is configured." };
  const viewer = await getViewerFor(slug);
  if (!viewer) return { ok: false, error: "Your session has expired. Log in again." };

  const company = await getDb().company.findUnique({
    where: { slug },
    select: { id: true, stage: true },
  });
  if (!company || !policyFor(company.stage).switchPerson) {
    return { ok: false, error: "Switching people is only available while a company is in demo stage." };
  }
  const user = await getDb().user.findFirst({ where: { companyId: company.id, id: userId } });
  if (!user) return { ok: false, error: "No such person in this company." };

  await issueSession(company.id, slug, user);
  revalidatePath("/" + slug, "layout");
  revalidatePath("/", "layout");
  return { ok: true };
}
