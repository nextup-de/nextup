"use server";
// The settle operation of plan GAT (D22, D32): the only writer of `case.approval` and of the system:approvals decision and stop. One answer of an approval step
// and, when it finishes the run, the decision it leads to are inserted in one database transaction under a per-case lock (lib/db/case-lock.ts), or not at all.
// The answer's event id is derived from the request id, so a retried request returns what it committed, even after the step's revision has moved on.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { meFor, type Actor } from "@/features/auth/identity";
import { mayAnswerStep } from "@/features/approvals/rights";
import { currentStep, stepDueDay } from "@/features/approvals/steps";
import { BACK_REASON_MIN, CONDITIONS_MAX, PRESENT_MAX } from "@/features/approvals/types";
import { getViewerFor } from "@/features/auth/session";
import type { EventPayload } from "@/features/cases/events";
import { CHANGE_IF_MAX, NO_CATEGORIES, NOT_NOW_MAX_IN_ROW, REASON_MAX, REVISIT_MAX_AHEAD, revisitAllowed, revisitRequired } from "@/features/cases/no";
import { reduce, type ReducedCase, type State } from "@/features/cases/reducer";
import { createT, DEFAULT_LOCALE, type Locale, type T } from "@/i18n";
import { getLocale } from "@/i18n/server";
import { getDb, hasDatabase } from "@/lib/db/client";
import { companySeed } from "@/lib/db/companies";
import { insertEventRows, withCaseLock, type NewRow } from "@/lib/db/case-lock";
import type { Tx } from "@/lib/db/integrations";
import { kickJira } from "@/server/jira-sync";

/** What a person sends when they answer an approval step. `runId`, `stepId` and `dueRev` are the ones the form was opened for; `requestId` is minted once per submit. */
export type ApprovalAnswerInput = {
  runId: string;
  stepId: string;
  dueRev: number;
  approvalAnswer: "yes" | "conditions" | "back" | "no";
  reason?: string;
  conditions?: string;
  /** A council's answer: how many were present, 0 to 200; never who voted how. */
  present?: number;
  /** A no's fields, as NOR's no has them. */
  category?: (typeof NO_CATEGORIES)[number];
  changeIf?: string;
  revisitDay?: number;
  duplicateOf?: string;
  requestId: string;
};

/** `settled`: what the answer decided the case as (the final yes, or the no); null while the run goes on. `duplicate`: a retry, read back from the log. */
export type SettleResult =
  | { ok: true; duplicate: boolean; answer: ApprovalAnswerInput["approvalAnswer"]; settled: "yes" | "no" | null }
  | { ok: false; error: string };

/** Who answers: the signed-in person, as the viewer resolves them. */
export type SettleActor = { userId: string; role: Actor["role"]; name: string; handle?: string | null };

/** Test hooks: `afterAnswer` runs after the answer is inserted and before the decision, inside the transaction; a throw there leaves nothing behind. */
export type SettleHooks = { afterAnswer?: (tx: Tx) => Promise<void>; locale?: Locale };

const REQUEST_ID = /^[A-Za-z0-9_-]{1,100}$/;
const SYSTEM_ACTOR = "system:approvals";
const SOURCE = "approvals";

/** The first refusal of an answer that is not about the run: the form's fields, in the order a person fills them. */
function checkAnswer(input: ApprovalAnswerInput, step: { kind: string }, kase: ReducedCase, state: State, t: T): string | null {
  const answer = input.approvalAnswer;
  if (input.present !== undefined) {
    if (step.kind !== "council" || !Number.isInteger(input.present) || input.present < 0 || input.present > PRESENT_MAX) return t("approvals.permPresent");
  }
  if (answer === "conditions") {
    const text = (input.conditions ?? "").trim();
    if (text.length < 1 || text.length > CONDITIONS_MAX) return t("approvals.permConditionsText");
  }
  if (answer === "back" && (input.reason ?? "").trim().length < BACK_REASON_MIN) return t("approvals.permBackReason");
  if (answer !== "no") return null;
  // The no is NOR's: a category, a reason of the company's fewest characters, what would make it a yes, the day it comes back (D17).
  const category = input.category;
  if (category === undefined || !(NO_CATEGORIES as readonly string[]).includes(category)) return t("cases.permNoCategory");
  const min = state.rules.noReasonMin;
  const reason = (input.reason ?? "").trim();
  if (reason.length < min) return t("cases.permNoReasonShort", { n: min });
  if ((input.reason ?? "").length > REASON_MAX) return t("cases.permNoReasonLong", { n: REASON_MAX });
  if (input.changeIf !== undefined && input.changeIf.length > CHANGE_IF_MAX) return t("cases.permChangeIf", { n: CHANGE_IF_MAX });
  const day = input.revisitDay;
  if (day !== undefined) {
    if (!revisitAllowed(category)) return t("cases.permRevisitNotAllowed");
    if (!(Number.isInteger(day) && day > state.day && day <= state.day + REVISIT_MAX_AHEAD)) return t("cases.permRevisitRange", { n: REVISIT_MAX_AHEAD });
  } else if (revisitRequired(category)) return t("cases.permRevisitNeeded");
  if (category === "not-now" && kase.notNowInRow >= NOT_NOW_MAX_IN_ROW) return t("cases.permNotNowLimit", { n: NOT_NOW_MAX_IN_ROW });
  if (category === "duplicate") {
    if (!(typeof input.duplicateOf === "string" && input.duplicateOf.length >= 1 && input.duplicateOf.length <= 64) || input.duplicateOf === kase.id) return t("cases.permDuplicateTarget");
  } else if (input.duplicateOf !== undefined) return t("cases.permDuplicateNotAllowed");
  return null;
}

const isUniqueViolation = (err: unknown): boolean => typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";

/**
 * Answers one step of the case's active approval run and settles what the answer decides, in one transaction under the case's lock (D32). Exported for the
 * database tests; the page calls answerApprovalAction.
 *
 * First the request is looked up (`approval-answer:<requestId>`): a retry returns what was committed, whatever the step's revision is now. Otherwise the log is
 * reduced and the answer refused unless it is for the run and step revision the form was opened for (permStaleStep) and the actor may answer that step
 * (mayAnswerStep); then the answer's own checks. The answer is inserted; a yes that finishes the run adds `case.decided` yes, a no `case.decided` no and, for a
 * run that opened a new draft, `project.stopped`, as system:approvals with a key of their own run. A supplement run decides nothing: the reducer ends it.
 */
export async function settleApproval(companyId: string, caseId: string, input: ApprovalAnswerInput, actor: SettleActor, hooks: SettleHooks = {}): Promise<SettleResult> {
  const t = createT(hooks.locale ?? DEFAULT_LOCALE);
  const refuse = (error: string): SettleResult => ({ ok: false, error });
  if (!REQUEST_ID.test(input.requestId)) return refuse(t("cases.actionBadEvent"));
  const company = await getDb().company.findUnique({ where: { id: companyId }, select: { id: true, seedJson: true, stage: true } });
  if (!company) return refuse(t("cases.permNoCase"));
  const seed = await companySeed(company);
  const answerId = `approval-answer:${input.requestId}`;
  try {
    return await withCaseLock(companyId, caseId, async (tx, log): Promise<SettleResult> => {
      const state = reduce(seed, log);
      const kase = state.cases.find((c) => c.id === caseId);
      // A retry: the answer is there already. Its result is read back from the log, never decided again.
      const done = log.events.find((e) => e.id === answerId);
      if (done) {
        const run = [kase?.approvals, ...(kase?.approvalRuns ?? [])].find((r) => r != null && r.runId === done.payload.runId);
        return { ok: true, duplicate: true, answer: done.payload.approvalAnswer ?? input.approvalAnswer, settled: run?.done && !run.supplement ? run.outcome : null };
      }
      if (!kase) return refuse(t("cases.permNoCase"));
      const run = kase.approvals;
      const step = run === null ? null : currentStep(run);
      if (run === null || run.done || step === null || run.runId !== input.runId || step.id !== input.stepId || step.dueRev !== input.dueRev) return refuse(t("approvals.permStaleStep"));
      const who: Actor = { role: actor.role, userId: actor.userId, me: meFor(actor.userId, state.seats), name: actor.name, handle: actor.handle ?? null };
      if (!mayAnswerStep(who, kase, state, { runId: input.runId, stepId: input.stepId, dueRev: input.dueRev })) {
        return refuse(t(actor.userId === run.deciderUserId ? "approvals.permDeciderNoApprove" : "approvals.permStepHolder"));
      }
      const bad = checkAnswer(input, step, kase, state, t);
      if (bad !== null) return refuse(bad);

      const answer = input.approvalAnswer;
      const index = run.steps.indexOf(step);
      const next = run.steps[index + 1];
      const finishes = (answer === "yes" || answer === "conditions") && next === undefined;
      // The due day of the step that waits next (D22, D23): the next step's, the same step's again after a send-back; none after the last yes or a no.
      const nextStepDueDay = answer === "back" ? stepDueDay(step, state.day, state.approvals) : (answer === "yes" || answer === "conditions") && next ? stepDueDay(next, state.day, state.approvals) : null;
      const payload: EventPayload = {
        runId: run.runId, stepId: step.id, dueRev: step.dueRev, step: index, approvalAnswer: answer, nextStepDueDay,
        ...(input.reason !== undefined ? { reason: input.reason.trim() } : {}),
        ...(answer === "conditions" ? { conditions: (input.conditions ?? "").trim() } : {}),
        ...(input.present !== undefined ? { present: input.present } : {}),
        ...(answer === "no" ? { category: input.category, ...(input.changeIf !== undefined ? { changeIf: input.changeIf } : {}), ...(input.revisitDay !== undefined ? { revisitDay: input.revisitDay } : {}), ...(input.duplicateOf !== undefined ? { duplicateOf: input.duplicateOf } : {}) } : {}),
      };
      await insertEventRows(tx, companyId, [{ id: answerId, type: "case.approval", actor: actor.name, actorUserId: actor.userId, targetId: caseId, payload }]);
      await hooks.afterAnswer?.(tx);

      // The decision, for the run that decides the case: one key per run, so a second write of it cannot happen (D32). A supplement decides nothing (D33).
      const system: NewRow[] = [];
      if (!run.supplement && finishes) {
        system.push({ id: `e_approvals_${run.runId}`, type: "case.decided", actor: SYSTEM_ACTOR, targetId: caseId, payload: { answer: "yes", ...(run.projectId !== null ? { projectId: run.projectId } : {}) }, source: SOURCE, idemKey: `approvals:${run.runId}` });
      }
      if (!run.supplement && answer === "no") {
        system.push({
          id: `e_approvals_no_${run.runId}`, type: "case.decided", actor: SYSTEM_ACTOR, targetId: caseId, source: SOURCE, idemKey: `approvals-no:${run.runId}`,
          payload: { answer: "no", category: input.category, reason: (input.reason ?? "").trim(), ...(input.changeIf !== undefined ? { changeIf: input.changeIf } : {}), ...(input.revisitDay !== undefined ? { revisitDay: input.revisitDay } : {}), ...(input.duplicateOf !== undefined ? { duplicateOf: input.duplicateOf } : {}) },
        });
        // A refused new draft is stopped and stays archived; a join touches nothing of the project it asked to join (D22).
        if (run.opened && run.projectId !== null) {
          system.push({ id: `e_approvals_stop_${run.runId}`, type: "project.stopped", actor: SYSTEM_ACTOR, targetId: run.projectId, payload: { why: (input.reason ?? "").trim() }, source: SOURCE, idemKey: `approvals-stop:${run.runId}` });
        }
      }
      if (system.length > 0) await insertEventRows(tx, companyId, system);
      const settled = answer === "no" ? "no" : finishes ? "yes" : null;
      return { ok: true, duplicate: false, answer, settled };
    });
  } catch (err) {
    // The same request id under another case, or a decision written twice: the primary key or the run's key says no.
    if (isUniqueViolation(err)) return refuse(t("cases.actionBadEvent"));
    throw err;
  }
}

const NoCategorySchema = z.enum(NO_CATEGORIES);
const Input = z.object({
  runId: z.string().min(1).max(100),
  stepId: z.string().min(1).max(120),
  dueRev: z.number().int().min(0).max(1000),
  approvalAnswer: z.enum(["yes", "conditions", "back", "no"]),
  reason: z.string().max(REASON_MAX).optional(),
  conditions: z.string().max(CONDITIONS_MAX * 2).optional(),
  present: z.number().optional(),
  category: NoCategorySchema.optional(),
  changeIf: z.string().max(CHANGE_IF_MAX * 2).optional(),
  revisitDay: z.number().int().optional(),
  duplicateOf: z.string().max(100).optional(),
  requestId: z.string().regex(REQUEST_ID),
});

/**
 * The page's answer of an approval step: the signed-in person answers `input.stepId` of run `input.runId`, as it stood at revision `input.dueRev`. One request
 * id per submit: a retry returns what the first one committed (`duplicate: true`), never a second row.
 */
export async function answerApprovalAction(slug: string, caseId: string, input: ApprovalAnswerInput): Promise<SettleResult> {
  const locale = await getLocale();
  const t = createT(locale);
  if (!hasDatabase()) return { ok: false, error: t("cases.actionNoDatabase") };
  const parsed = Input.safeParse(input);
  if (!parsed.success || typeof caseId !== "string" || caseId === "" || caseId.length > 64) return { ok: false, error: t("cases.actionBadEvent") };
  const viewer = await getViewerFor(slug);
  if (!viewer) return { ok: false, error: t("cases.actionSessionExpired") };
  const result = await settleApproval(viewer.companyId, caseId, parsed.data, { userId: viewer.userId, role: viewer.role, name: viewer.name, handle: viewer.handle }, { locale });
  if (result.ok && !result.duplicate) {
    if (result.settled !== null) kickJira(slug);
    revalidatePath("/" + slug, "layout");
    revalidatePath("/", "layout"); // subdomain mode: the company is the host, so the path has no slug
  }
  return result;
}
