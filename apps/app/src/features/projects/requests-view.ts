// What the Requests tool shows (plan REQ, D4, D6). Pure: the reduced project in, plain rows out.
import type { Locale } from "@/i18n";
import { untouchedStepOf } from "./reduce";
import { fieldsOf, type Form, type FormField, type ReducedProject, type Request, type StepColumn } from "./types";
import type { MessageKey } from "@/i18n";

export type RequestFilter = "new" | "stepped" | "declined";
export const REQUEST_FILTERS: readonly RequestFilter[] = ["new", "stepped", "declined"];

/** One answer with the question it was given on its own revision of the form. Unanswered optional questions are left out. */
export type AnsweredField = { field: FormField; value: string };

export type RequestRow = {
  request: Request;
  /** Null when the form is gone from the project; the answers then have no questions to read with. */
  form: Form | null;
  answers: AnsweredField[];
};

const rowOf = (p: ReducedProject, request: Request): RequestRow => {
  const form = p.forms.find((x) => x.id === request.formId) ?? null;
  const answers = form ? fieldsOf(form, request.formRev).flatMap((field) => {
    const value = request.answers[field.id];
    return value === undefined || value === "" ? [] : [{ field, value }];
  }) : [];
  return { request, form, answers };
};

/** The requests in one state, newest first (the later event wins on a day). */
export function requestList(p: ReducedProject, filter: RequestFilter): RequestRow[] {
  return p.requests.filter((r) => r.state === filter).map((r) => rowOf(p, r)).reverse().sort((a, b) => b.request.day - a.request.day);
}

/** How many requests each filter chip counts. */
export function requestCounts(p: ReducedProject): Record<RequestFilter, number> {
  return { new: p.requests.filter((r) => r.state === "new").length, stepped: p.requests.filter((r) => r.state === "stepped").length, declined: p.requests.filter((r) => r.state === "declined").length };
}

/** The answers and the answer count of each form, and how many of its requests are still new. */
export function formSummaries(p: ReducedProject): { form: Form; answers: number; fresh: number }[] {
  return p.forms.map((form) => {
    const mine = p.requests.filter((r) => r.formId === form.id);
    return { form, answers: mine.length, fresh: mine.filter((r) => r.state === "new").length };
  });
}

const NOTE_MAX = 2000;
const TITLE_MAX = 500;

/**
 * What the Make it a step dialog starts with: the title is the first short answer of the request's own revision (the form's title when
 * there is none), the column is To do, and the details quote the other answers with their questions.
 */
export function stepDraft(request: Request, form: Form | null): { title: string; column: StepColumn; note: string } {
  const answered = (form ? fieldsOf(form, request.formRev) : []).flatMap((field) => {
    const value = request.answers[field.id];
    return value === undefined || value.trim() === "" ? [] : [{ field, value: value.trim() }];
  });
  const first = answered.find((a) => a.field.kind === "short");
  const title = (first?.value ?? form?.title ?? "").slice(0, TITLE_MAX);
  const note = answered.filter((a) => a !== first).map((a) => `${a.field.label}\n${a.value}`).join("\n\n").slice(0, NOTE_MAX);
  return { title, column: "todo", note };
}

/**
 * Whether the request's last outcome can be taken back, asked of the same rule the server checks: a declined request always can; a
 * stepped one only while its step is untouched ("stepMoved": the card says why not); a new one has nothing to take back.
 */
export function undoOf(p: ReducedProject, request: Request): "reopen" | "stepMoved" | null {
  if (request.state === "new") return null;
  if (request.state === "declined") return "reopen";
  return untouchedStepOf(p, request) === null ? "stepMoved" : "reopen";
}

/** The inbox's message keys, by the short name its parts use. */
export const REQUEST_KEYS = {
  subtitleNew: "projectRequests.inboxSubtitleNew",
  subtitleNone: "projectRequests.inboxSubtitleNone",
  via: "projectRequests.inboxVia",
  viaGone: "projectRequests.inboxViaGone",
  someone: "projectRequests.inboxSomeone",
  filterLabel: "projectRequests.inboxFilterLabel",
  stepTitle: "projectRequests.requestMakeStep",
  stepFrom: "projectRequests.inboxStepFrom",
  stepSees: "projectRequests.inboxStepSees",
  stepBusy: "projectRequests.inboxStepBusy",
  stepNoOwner: "projectRequests.inboxStepNoOwner",
  stepAddDate: "projectRequests.inboxStepAddDate",
  stepBadDate: "projectRequests.inboxStepBadDate",
  stepClose: "projectRequests.inboxStepClose",
  stepCancel: "projectRequests.inboxStepCancel",
  declineTitle: "projectRequests.inboxDeclineTitle",
  declineReason: "projectRequests.inboxDeclineReason",
  declineCancel: "projectRequests.inboxStepCancel",
  declinedToast: "projectRequests.inboxDeclinedToast",
  steppedToast: "projectRequests.inboxSteppedToast",
  reopenedToast: "projectRequests.inboxReopenedToast",
  undo: "projectRequests.toastUndo",
  undoMoved: "projectRequests.inboxUndoMoved",
  stepOpen: "projectRequests.inboxStepOpen",
  formsHint: "projectRequests.inboxFormsHint",
  formAnswers: "projectRequests.inboxFormAnswers",
  formDraftHint: "projectRequests.inboxFormDraftHint",
  formCopy: "projectRequests.formCopyLink",
  formCopied: "projectRequests.formLinkCopied",
  formEdit: "projectRequests.inboxFormEdit",
  formNew: "projectRequests.inboxFormNew",
} as const satisfies Record<string, MessageKey>;

/** What an empty filter says. */
export const REQUEST_EMPTY = {
  new: "projectRequests.inboxEmptyNew",
  stepped: "projectRequests.inboxEmptyStepped",
  declined: "projectRequests.inboxEmptyDeclined",
} as const satisfies Record<string, MessageKey>;

export type RequestsTextKey = keyof typeof REQUEST_KEYS;
