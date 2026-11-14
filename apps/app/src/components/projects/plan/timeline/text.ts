/* eslint-disable nextup/no-inline-strings -- the interim catalog for the Timeline, see the TODO below */
// TODO(PLN-G1): move these strings into the message catalog (projectPlan.ts) once PLN-G1 has merged; until then the Timeline keeps them here in English and German.
import type { Locale } from "@/i18n";

const EN = {
  title: "Timeline", today: "Today", groupBy: "Group", groupMilestone: "Milestone", groupPerson: "Person", groupStatus: "Status", groupNone: "None",
  weeks: "Weeks", months: "Months", quarters: "Quarters", scale: "Scale", step: "Step", doneOf: "{done} of {total} done", addStep: "Add step",
  noMilestone: "No milestone", noOwner: "No owner", todo: "To do", doing: "Doing", blocked: "Blocked", done: "Done",
  dates: "Dates…", datesFor: "Dates for {step}", start: "Start", due: "Due", daysFromToday: "days from today", save: "Save", cancel: "Cancel",
  invalid: "The due day must not be before the start.", openStep: "Open step: {step}", dragStart: "Change the start of {step}", dragEnd: "Change the due day of {step}",
  moved: "{step}: {from} – {to}", undo: "Undo", syncNote: "Synced with Jira: the due day syncs, the start day stays in NextUp.", empty: "No steps to draw yet.",
  grid: "Timeline grid", notSaved: "Not saved",
};
export type TimelineText = typeof EN;
const DE: TimelineText = {
  title: "Zeitachse", today: "Heute", groupBy: "Gruppe", groupMilestone: "Meilenstein", groupPerson: "Person", groupStatus: "Status", groupNone: "Keine",
  weeks: "Wochen", months: "Monate", quarters: "Quartale", scale: "Massstab", step: "Schritt", doneOf: "{done} von {total} erledigt", addStep: "Schritt hinzufügen",
  noMilestone: "Ohne Meilenstein", noOwner: "Ohne Zuständige", todo: "Offen", doing: "In Arbeit", blocked: "Blockiert", done: "Erledigt",
  dates: "Daten…", datesFor: "Daten für {step}", start: "Start", due: "Fällig", daysFromToday: "Tage ab heute", save: "Speichern", cancel: "Abbrechen",
  invalid: "Fällig darf nicht vor dem Start liegen.", openStep: "Schritt öffnen: {step}", dragStart: "Start von {step} ändern", dragEnd: "Fälligkeit von {step} ändern",
  moved: "{step}: {from} – {to}", undo: "Rückgängig", syncNote: "Mit Jira synchronisiert: der Fälligkeitstag wird abgeglichen, der Starttag bleibt in NextUp.", empty: "Noch keine Schritte zum Zeichnen.",
  grid: "Zeitachsen-Raster", notSaved: "Nicht gespeichert",
};

export const timelineText = (locale: Locale): TimelineText => (locale === "de" ? DE : EN);
export const fill = (template: string, params: Record<string, string | number>): string => template.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? ""));
