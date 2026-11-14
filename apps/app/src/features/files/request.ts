// Request files (plan FIL-B3, D9): ask project members for files in this folder. It creates the steps, one per person or one
// shared, and links the folder to each. No external or anonymous upload link. Pure; the dialog sends what this plans.
import { toStepAdded, type StepAddedPayload } from "@/features/projects/create-step";
import type { ReducedProject } from "@/features/projects/types";

export type RequestMode = "each" | "shared";
export type Person = { userId: string; name: string };
export type RequestInput = { people: Person[]; what: string; dueDay: number | null; mode: RequestMode; folder: string };
export type RequestIssue = "people" | "what" | "notMember" | "folder";

/** The people a request may go to: the lead and the members, by user id (D9). Nobody else, and never by name. */
export function requestable(p: Pick<ReducedProject, "leadUserId" | "memberUserIds">, people: readonly Person[]): Person[] {
  const ids = new Set([p.leadUserId, ...p.memberUserIds].filter((id): id is string => !!id));
  return people.filter((person) => ids.has(person.userId));
}

export function requestIssue(p: Pick<ReducedProject, "leadUserId" | "memberUserIds">, input: RequestInput): RequestIssue | null {
  if (input.people.length === 0) return "people";
  if (requestable(p, input.people).length !== input.people.length) return "notMember";
  if (!input.what.trim()) return "what";
  if (!input.folder.trim()) return "folder";
  return null;
}

const clip = (text: string, max: number) => (text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text);

/**
 * One project.step.added per person ("Upload <what> to <folder>", due on the chosen day), or one shared step that names the
 * people in its details. `title` builds the sentence in the viewer's language.
 */
export function requestSteps(input: RequestInput, title: (what: string, folder: string) => string, shared: (names: string) => string, ids: (prefix: "s") => string): StepAddedPayload[] {
  const text = clip(title(clip(input.what.trim(), 200), input.folder.trim()), 500);
  const dueDay = input.dueDay;
  if (input.mode === "shared") {
    return [toStepAdded({ title: text, dueDay, note: clip(shared(input.people.map((person) => person.name).join(", ")), 2000) }, undefined, ids)];
  }
  return input.people.map((person) => toStepAdded({ title: text, owner: person.name, ownerUserId: person.userId, dueDay }, undefined, ids));
}

/** The link between the folder and a created step: project.linked, system sharepoint, the folder's URL (D7). */
export const folderLink = (url: string, stepId: string) => ({ system: "sharepoint" as const, url, stepId });

export const requestText = {
  en: {
    stepTitle: "Upload {what} to {folder}",
    sharedNote: "Asked: {names}",
    sharedStep: "One shared step",
    pickPeople: "Add people",
    pickLabel: "People on the project",
    remove: "Remove {name}",
    whatPlaceholder: "What do you need?",
    toast_one: "Requested files in {count} step",
    toast_other: "Requested files in {count} steps",
    issuePeople: "Choose at least one person on the project.",
    issueWhat: "Say what you need.",
    issueNotMember: "Only people on the project can be asked.",
    issueFolder: "Open a folder first.",
    badDay: "Choose a working day.",
  },
  de: {
    stepTitle: "{what} in {folder} hochladen",
    sharedNote: "Angefragt: {names}",
    sharedStep: "Ein gemeinsamer Schritt",
    pickPeople: "Personen hinzufügen",
    pickLabel: "Personen im Projekt",
    remove: "{name} entfernen",
    whatPlaceholder: "Was brauchen Sie?",
    toast_one: "Dateien in {count} Schritt angefragt",
    toast_other: "Dateien in {count} Schritten angefragt",
    issuePeople: "Wählen Sie mindestens eine Person aus dem Projekt.",
    issueWhat: "Sagen Sie, was Sie brauchen.",
    issueNotMember: "Nur Personen im Projekt können gefragt werden.",
    issueFolder: "Öffnen Sie zuerst einen Ordner.",
    badDay: "Wählen Sie einen Arbeitstag.",
  },
} as const;

export type RequestKey = keyof typeof requestText.en extends infer K ? (K extends `${infer B}_${"one" | "other"}` ? B : K) : never;

/** One string by locale and key; a key with `count` picks its _one or _other form. */
export function rt(locale: "en" | "de", key: RequestKey, params: Record<string, string | number> = {}): string {
  const table: Record<string, string> = requestText[locale];
  const form = typeof params.count === "number" ? (new Intl.PluralRules(locale).select(params.count) === "one" ? "_one" : "_other") : "";
  return Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), table[key + form] ?? table[key]);
}
