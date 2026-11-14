// What the Requests tool shows (plan REQ, D4, D6). Pure: the reduced project in, plain rows out.
import type { Locale } from "@/i18n";
import { untouchedStepOf } from "./reduce";
import { fieldsOf, type Form, type FormField, type ReducedProject, type Request, type StepColumn } from "./types";

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

// The inbox's own words. TODO: move them into i18n/messages/projectRequests.ts once REQ-G1 is merged (that file is REQ-G1's until then); the keys stay.
const en = {
  subtitleNew: "{count} new",
  subtitleNone: "No new requests",
  via: "Via form “{form}” · {date}",
  viaGone: "Via a form that is gone · {date}",
  someone: "Someone",
  filterLabel: "Filter requests",
  stepTitle: "Make it a step",
  stepFrom: "From",
  stepSees: "{name} sees this on their requests page.",
  stepBusy: "Making the step…",
  stepNoOwner: "Nobody yet",
  stepAddDate: "+ Add a date",
  stepBadDate: "Choose a working day.",
  stepClose: "Close",
  stepCancel: "Cancel",
  declineTitle: "Decline this request?",
  declineReason: "Reason (shown to {name} on their requests page)",
  declineCancel: "Cancel",
  declinedToast: "Request declined · moved to Declined",
  steppedToast: "Step made · moved to Made into a step",
  reopenedToast: "Request is new again",
  undo: "Undo",
  undoMoved: "Undo is not offered: the step has changed since.",
  stepOpen: "Step on the board",
  formsHint: "Share a link. Answers land here as requests.",
  formAnswers: "{answers} answers · {fresh} new",
  formDraftHint: "Draft · not shared yet",
  formCopy: "Copy link",
  formCopied: "Link copied",
  formEdit: "Edit",
  formNew: "+ New form",
  empty: { new: "No new requests.", stepped: "Nothing made into a step yet.", declined: "Nothing declined." },
} as const;

const de: Record<keyof typeof en, string | Record<keyof typeof en.empty, string>> = {
  subtitleNew: "{count} neu",
  subtitleNone: "Keine neuen Anfragen",
  via: "Über das Formular «{form}» · {date}",
  viaGone: "Über ein Formular, das es nicht mehr gibt · {date}",
  someone: "Jemand",
  filterLabel: "Anfragen filtern",
  stepTitle: "Als Schritt übernehmen",
  stepFrom: "Von",
  stepSees: "{name} sieht das auf der eigenen Anfragenseite.",
  stepBusy: "Schritt wird angelegt…",
  stepNoOwner: "Noch niemand",
  stepAddDate: "+ Datum hinzufügen",
  stepBadDate: "Wählen Sie einen Arbeitstag.",
  stepClose: "Schliessen",
  stepCancel: "Abbrechen",
  declineTitle: "Diese Anfrage ablehnen?",
  declineReason: "Grund ({name} sieht ihn auf der eigenen Anfragenseite)",
  declineCancel: "Abbrechen",
  declinedToast: "Anfrage abgelehnt · bei Abgelehnt eingeordnet",
  steppedToast: "Schritt angelegt · bei Als Schritt übernommen eingeordnet",
  reopenedToast: "Die Anfrage ist wieder neu",
  undo: "Rückgängig",
  undoMoved: "Rückgängig ist nicht möglich: Der Schritt wurde seither geändert.",
  stepOpen: "Schritt auf dem Board",
  formsHint: "Teilen Sie einen Link. Antworten landen hier als Anfragen.",
  formAnswers: "{answers} Antworten · {fresh} neu",
  formDraftHint: "Entwurf · noch nicht geteilt",
  formCopy: "Link kopieren",
  formCopied: "Link kopiert",
  formEdit: "Bearbeiten",
  formNew: "+ Neues Formular",
  empty: { new: "Keine neuen Anfragen.", stepped: "Noch nichts als Schritt übernommen.", declined: "Nichts abgelehnt." },
};

export type RequestsTextKey = Exclude<keyof typeof en, "empty">;

/** The inbox's words in one language: `text("via", { form, date })`, `empty("new")`. */
export function requestsText(locale: Locale) {
  const table = locale === "de" ? de : en;
  const text = (key: RequestsTextKey, params: Record<string, string | number> = {}): string =>
    (table[key] as string).replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ""));
  const empty = (filter: keyof typeof en.empty): string => (table.empty as Record<string, string>)[filter];
  return { text, empty };
}
