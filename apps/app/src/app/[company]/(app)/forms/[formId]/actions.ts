"use server";
// Sending an answer: the person and the company come from the session, the project and the revision from the log. The event itself goes through
// the one append action, so every rule of project.form.answered (REQ D4) is asked there; nothing here takes an id of a user or a company.
import { getViewer } from "@/features/auth/session";
import { createT } from "@/i18n";
import { getLocale } from "@/i18n/server";
import { appendEventAction } from "@/server/actions/events";
import { answerTarget, formForAnswer, type AnswerForm } from "@/server/forms";

export type AnswerOutcome = { ok: true } | { ok: false; error: string; changed?: AnswerForm };

export async function answerFormAction(input: { formId: string; formRev: number; answers: Record<string, string> }): Promise<AnswerOutcome> {
  const t = createT(await getLocale());
  const target = await answerTarget(input.formId);
  if (!target || !(await getViewer())) return { ok: false, error: t("projectRequests.permNoForm") };
  // The form changed under the person: hand over the new revision, so the page keeps what still fits (D8).
  if (input.formRev !== target.rev) {
    const fresh = await formForAnswer(input.formId);
    return { ok: false, error: t("projectRequests.permFormChanged"), ...(fresh ? { changed: fresh } : {}) };
  }
  const id = crypto.randomUUID();
  const result = await appendEventAction({
    slug: target.slug, id, type: "project.form.answered", target: target.projectId,
    payload: { formId: input.formId, formRev: input.formRev, requestId: "req_" + id.slice(0, 12), answers: input.answers },
  });
  return result.ok ? result : { ok: false, error: result.error };
}
