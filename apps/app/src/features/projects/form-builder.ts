// The form being built (plan REQ, D4, D8). Pure: a reducer for the draft, its checks and the one event Save sends. The draft itself
// lives in sessionStorage until Save; `parseDraft` and `draftJson` are its two ends.
import type { Locale } from "@/i18n";
import { fitsEvent } from "./pages";
import type { Form, FormField, FormFieldKind } from "./types";

export const FORM_LIMITS = { title: 80, intro: 1000, fields: 20, label: 200, optionsMin: 2, optionsMax: 12, option: 80 } as const;
export const FIELD_KINDS: readonly FormFieldKind[] = ["short", "long", "choice", "date"];

export type BuilderState = {
  formId: string;
  title: string;
  intro: string;
  fields: FormField[];
  shared: boolean;
  /** The question framed in the preview. */
  selected: string | null;
  /** Whether the project already has this form (a Save went through): Share link needs it. */
  saved: boolean;
  /** The content as last saved, as a signature; the draft is dirty when it differs. */
  base: string;
};

export type BuilderAction =
  | { type: "title"; value: string }
  | { type: "intro"; value: string }
  | { type: "add"; id: string; kind: FormFieldKind }
  | { type: "label"; id: string; value: string }
  | { type: "required"; id: string; value: boolean }
  | { type: "move"; id: string; by: -1 | 1 }
  | { type: "duplicate"; id: string; newId: string }
  | { type: "remove"; id: string }
  | { type: "select"; id: string | null }
  | { type: "addOption"; id: string }
  | { type: "option"; id: string; index: number; value: string }
  | { type: "removeOption"; id: string; index: number }
  | { type: "shared"; value: boolean }
  | { type: "saved" };

const content = (s: Pick<BuilderState, "title" | "intro" | "fields" | "shared">): string => JSON.stringify([s.title, s.intro, s.fields, s.shared]);

/** A builder for an existing form (its current revision), or an empty one for `?form=new`. */
export function initialBuilder(form: Form | null, newFormId: string): BuilderState {
  const base = { title: form?.title ?? "", intro: form?.intro ?? "", fields: form ? form.fields.map(copyField) : [], shared: form?.shared ?? false };
  return { formId: form?.id ?? newFormId, ...base, selected: null, saved: form !== null, base: content(base) };
}

const copyField = (f: FormField): FormField => ({ ...f, ...(f.options ? { options: [...f.options] } : {}) });
const edit = (s: BuilderState, id: string, go: (f: FormField) => FormField): BuilderState =>
  s.fields.some((f) => f.id === id) ? { ...s, fields: s.fields.map((f) => (f.id === id ? go(f) : f)) } : s;

export function builderReducer(s: BuilderState, a: BuilderAction): BuilderState {
  switch (a.type) {
    case "title": return { ...s, title: a.value.slice(0, FORM_LIMITS.title) };
    case "intro": return { ...s, intro: a.value.slice(0, FORM_LIMITS.intro) };
    case "add": {
      if (s.fields.length >= FORM_LIMITS.fields || s.fields.some((f) => f.id === a.id)) return s;
      const field: FormField = { id: a.id, kind: a.kind, label: "", required: false, ...(a.kind === "choice" ? { options: ["", ""] } : {}) };
      return { ...s, fields: [...s.fields, field], selected: a.id };
    }
    case "label": return edit(s, a.id, (f) => ({ ...f, label: a.value.slice(0, FORM_LIMITS.label) }));
    case "required": return edit(s, a.id, (f) => ({ ...f, required: a.value }));
    case "move": {
      const at = s.fields.findIndex((f) => f.id === a.id);
      const to = at + a.by;
      if (at < 0 || to < 0 || to >= s.fields.length) return s;
      const fields = [...s.fields];
      [fields[at], fields[to]] = [fields[to], fields[at]];
      return { ...s, fields };
    }
    case "duplicate": {
      const at = s.fields.findIndex((f) => f.id === a.id);
      if (at < 0 || s.fields.length >= FORM_LIMITS.fields || s.fields.some((f) => f.id === a.newId)) return s;
      const fields = [...s.fields];
      fields.splice(at + 1, 0, { ...copyField(s.fields[at]), id: a.newId });
      return { ...s, fields, selected: a.newId };
    }
    case "remove": {
      const at = s.fields.findIndex((f) => f.id === a.id);
      if (at < 0) return s;
      const fields = s.fields.filter((f) => f.id !== a.id);
      return { ...s, fields, selected: s.selected === a.id ? (fields[Math.min(at, fields.length - 1)]?.id ?? null) : s.selected };
    }
    case "select": return { ...s, selected: a.id === null || s.fields.some((f) => f.id === a.id) ? a.id : s.selected };
    case "addOption": return edit(s, a.id, (f) => f.kind === "choice" && (f.options?.length ?? 0) < FORM_LIMITS.optionsMax ? { ...f, options: [...(f.options ?? []), ""] } : f);
    case "option": return edit(s, a.id, (f) => f.kind === "choice" && f.options?.[a.index] !== undefined ? { ...f, options: f.options.map((o, i) => (i === a.index ? a.value.slice(0, FORM_LIMITS.option) : o)) } : f);
    case "removeOption": return edit(s, a.id, (f) => f.kind === "choice" && f.options && f.options.length > FORM_LIMITS.optionsMin && f.options[a.index] !== undefined ? { ...f, options: f.options.filter((_, i) => i !== a.index) } : f);
    case "shared": return { ...s, shared: a.value };
    case "saved": return { ...s, saved: true, base: content(s) };
  }
}

/** The draft differs from what was last saved: leaving asks first. */
export const isDirty = (s: BuilderState): boolean => content(s) !== s.base;

/** The one event Save sends. Fields are trimmed and unused options dropped; `shared` can be forced for Share link. */
export function toFormSaved(s: BuilderState, shared: boolean = s.shared): { formId: string; title: string; intro: string; fields: FormField[]; shared: boolean } {
  return {
    formId: s.formId, title: s.title.trim(), intro: s.intro.trim(), shared,
    fields: s.fields.map((f) => ({ id: f.id, kind: f.kind, label: f.label.trim(), required: f.required, ...(f.kind === "choice" ? { options: (f.options ?? []).map((o) => o.trim()).filter(Boolean) } : {}) })),
  };
}

export type BuilderProblem = "title" | "noQuestion" | "label" | "options" | "tooBig";

/** What stops Save, in the order the page points at it. Empty: Save may go. */
export function problemsOf(s: BuilderState): BuilderProblem[] {
  const out: BuilderProblem[] = [];
  const payload = toFormSaved(s);
  if (!payload.title) out.push("title");
  if (payload.fields.length === 0) out.push("noQuestion");
  if (payload.fields.some((f) => !f.label)) out.push("label");
  if (payload.fields.some((f) => f.kind === "choice" && (f.options?.length ?? 0) < FORM_LIMITS.optionsMin)) out.push("options");
  if (!fitsEvent(payload)) out.push("tooBig");
  return out;
}

export const canSave = (s: BuilderState): boolean => problemsOf(s).length === 0;
/** Share link needs a form the project has: a draft that was never saved has no link to give. */
export const canShare = (s: BuilderState): boolean => s.saved;

/** sessionStorage: one draft per form (and project). */
export const draftKey = (projectId: string, formId: string): string => `nextup:form-draft:${projectId}:${formId}`;
export const draftJson = (s: BuilderState): string => JSON.stringify(s);

/** The stored draft, or null when it is missing or not a draft of `formId` any more. */
export function parseDraft(json: string | null, formId: string): BuilderState | null {
  if (json === null) return null;
  try {
    const v: unknown = JSON.parse(json);
    if (v === null || typeof v !== "object") return null;
    const s = v as Partial<BuilderState>;
    const fieldsOk = Array.isArray(s.fields) && s.fields.every((f) => f !== null && typeof f === "object" && typeof f.id === "string" && FIELD_KINDS.includes(f.kind) && typeof f.label === "string" && typeof f.required === "boolean");
    if (s.formId !== formId || typeof s.title !== "string" || typeof s.intro !== "string" || typeof s.shared !== "boolean" || typeof s.saved !== "boolean" || typeof s.base !== "string" || !fieldsOk) return null;
    return s as BuilderState;
  } catch { return null; }
}

// The builder's own words. TODO: move them into i18n/messages/projectRequests.ts once REQ-G1 is merged; the keys stay.
const en = {
  back: "‹ Requests",
  unsaved: "Unsaved changes",
  saved: "Saved",
  save: "Save form",
  preview: "Preview",
  editing: "Edit",
  share: "Share link",
  shareNeedsSave: "Save the form first to get its link.",
  shareCopied: "Link copied",
  leaveAsk: "You have unsaved changes. Leave without saving?",
  kinds: "Question types",
  kindShort: "Short answer",
  kindLong: "Long answer",
  kindChoice: "Choose one",
  kindDate: "Date",
  titlePlaceholder: "Form title",
  introPlaceholder: "Tell people why you ask",
  labelPlaceholder: "Question",
  required: "Required",
  duplicate: "Duplicate",
  remove: "Delete",
  moveUp: "Move up",
  moveDown: "Move down",
  options: "Options",
  optionPlaceholder: "Option {number}",
  addOption: "Add option",
  removeOption: "Remove option",
  emptyForm: "Add a question from the left.",
  problemTitle: "Give the form a title.",
  problemNoQuestion: "Add at least one question.",
  problemLabel: "Every question needs its words.",
  problemOptions: "A choice needs at least two options.",
  problemTooBig: "The form is too big to save. Shorten some questions or options.",
  answerShort: "Short answer",
  answerLong: "Long answer",
  answerDate: "Date",
  answerChoose: "Choose one",
  limits: "{count} of {max} questions",
} as const;
export type BuilderTextKey = keyof typeof en;

const de: Record<BuilderTextKey, string> = {
  back: "‹ Anfragen",
  unsaved: "Ungespeicherte Änderungen",
  saved: "Gespeichert",
  save: "Formular speichern",
  preview: "Vorschau",
  editing: "Bearbeiten",
  share: "Link teilen",
  shareNeedsSave: "Speichern Sie das Formular zuerst, um seinen Link zu erhalten.",
  shareCopied: "Link kopiert",
  leaveAsk: "Sie haben ungespeicherte Änderungen. Ohne Speichern verlassen?",
  kinds: "Fragetypen",
  kindShort: "Kurze Antwort",
  kindLong: "Lange Antwort",
  kindChoice: "Eine auswählen",
  kindDate: "Datum",
  titlePlaceholder: "Titel des Formulars",
  introPlaceholder: "Erklären Sie, wofür Sie fragen",
  labelPlaceholder: "Frage",
  required: "Pflichtfeld",
  duplicate: "Duplizieren",
  remove: "Löschen",
  moveUp: "Nach oben",
  moveDown: "Nach unten",
  options: "Auswahl",
  optionPlaceholder: "Möglichkeit {number}",
  addOption: "Möglichkeit hinzufügen",
  removeOption: "Möglichkeit entfernen",
  emptyForm: "Fügen Sie links eine Frage hinzu.",
  problemTitle: "Geben Sie dem Formular einen Titel.",
  problemNoQuestion: "Fügen Sie mindestens eine Frage hinzu.",
  problemLabel: "Jede Frage braucht ihren Text.",
  problemOptions: "Eine Auswahl braucht mindestens zwei Möglichkeiten.",
  problemTooBig: "Das Formular ist zu gross zum Speichern. Kürzen Sie Fragen oder Möglichkeiten.",
  answerShort: "Kurze Antwort",
  answerLong: "Lange Antwort",
  answerDate: "Datum",
  answerChoose: "Eine auswählen",
  limits: "{count} von {max} Fragen",
};

/** The builder's words in one language: `text("save")`, `text("limits", { count, max })`. */
export function builderText(locale: Locale) {
  const table: Record<BuilderTextKey, string> = locale === "de" ? de : en;
  return (key: BuilderTextKey, params: Record<string, string | number> = {}): string => table[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ""));
}

/** Which word names each question kind, what its empty answer box says in the preview, and each Save problem. */
export const KIND_TEXT: Record<FormFieldKind, BuilderTextKey> = { short: "kindShort", long: "kindLong", choice: "kindChoice", date: "kindDate" };
export const FAKE_TEXT: Record<FormFieldKind, BuilderTextKey> = { short: "answerShort", long: "answerLong", choice: "answerChoose", date: "answerDate" };
export const PROBLEM_TEXT: Record<BuilderProblem, BuilderTextKey> = { title: "problemTitle", noQuestion: "problemNoQuestion", label: "problemLabel", options: "problemOptions", tooBig: "problemTooBig" };
