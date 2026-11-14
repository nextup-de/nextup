// The Milestones tool's rules (plan PLN D7): a milestone's state, progress and estimate, the create form's checks and
// the unsent comment 'Ask <person> in a comment' prepares. Pure.
import type { MilestoneInput } from "@/components/dashboard/demo/project-acts";
import type { Milestone, ReducedProject, Step, StepColumn } from "./types";

export type MilestoneState = "planned" | "running" | "atRisk" | "shipped";
export type Estimate = { kind: "none" } | { kind: "some"; endDay: number; lateDays: number };
export type MilestoneCard = {
  milestone: Milestone;
  state: MilestoneState;
  steps: Step[];
  progress: Record<StepColumn, number> & { total: number };
  /** Days until it ships (negative: past its day). */
  daysLeft: number;
  estimate: Estimate;
  /** A blocked step that waits on a person: whom 'Ask <person> in a comment' goes to. */
  ask: { step: Step; userId: string; name: string } | null;
};

const open = (s: Step) => !s.dropped && s.column !== "done";

/** Days on which at least one of the steps was blocked, up to and including `day`; overlapping periods count once. */
export function blockedDays(p: Pick<ReducedProject, "history">, steps: readonly Step[], day: number): number {
  const days = new Set<number>();
  for (const step of steps) {
    let since: number | null = null;
    const moves = p.history.filter((e) => e.type === "project.step.moved" && e.payload.stepId === step.id);
    for (const e of moves) {
      if (e.payload.to === "blocked") { since ??= e.day; continue; }
      if (since !== null) { for (let d = since; d < e.day; d++) days.add(d); since = null; }
    }
    if (since !== null) for (let d = since; d <= day; d++) days.add(d);
  }
  return days.size;
}

/** D7: the latest due day of the open steps plus the days any of them was blocked. No due days: no estimate. */
export function estimate(m: Pick<Milestone, "dueDay">, steps: readonly Step[], day: number, p: Pick<ReducedProject, "history">): Estimate {
  const dues = steps.filter(open).flatMap((s) => (s.dueDay === null ? [] : [s.dueDay]));
  if (dues.length === 0) return { kind: "none" };
  const endDay = Math.max(...dues) + blockedDays(p, steps, day);
  return { kind: "some", endDay, lateDays: Math.max(0, endDay - m.dueDay) };
}

export function milestoneCards(p: Pick<ReducedProject, "milestones" | "steps" | "history">, day: number): MilestoneCard[] {
  return [...p.milestones].sort((a, b) => a.dueDay - b.dueDay || a.title.localeCompare(b.title)).map((milestone) => {
    const steps = p.steps.filter((s) => !s.dropped && s.milestoneId === milestone.id);
    const progress = { todo: 0, doing: 0, blocked: 0, done: 0, total: steps.length };
    for (const s of steps) progress[s.column]++;
    const est = estimate(milestone, steps, day, p);
    const late = est.kind === "some" && milestone.dueDay < est.endDay;
    const started = steps.some((s) => s.column === "doing" || s.column === "done" || s.startedDay !== null);
    const state: MilestoneState = milestone.shipped ? "shipped" : progress.blocked > 0 || late ? "atRisk" : started ? "running" : "planned";
    const waiting = steps.find((s) => s.column === "blocked" && s.waitingOn?.kind === "person" && s.waitingOn.userId);
    const ask = waiting?.waitingOn?.userId ? { step: waiting, userId: waiting.waitingOn.userId, name: waiting.waitingOn.name ?? "" } : null;
    return { milestone, state, steps, progress, daysLeft: milestone.dueDay - day, estimate: est, ask };
  });
}

export type MilestoneIssue = "title" | "note" | "due" | "dates";
/** The create form's checks, the same limits the server holds (title 1-80, note up to 1000, start not after due). */
export function validMilestone(input: Partial<MilestoneInput> & { title: string }): MilestoneIssue | null {
  const title = input.title.trim();
  if (title.length < 1 || title.length > 80) return "title";
  if ((input.note ?? "").trim().length > 1000) return "note";
  if (typeof input.dueDay !== "number" || !Number.isInteger(input.dueDay)) return "due";
  if (input.startDay !== undefined && input.startDay !== null && (!Number.isInteger(input.startDay) || input.startDay > input.dueDay)) return "dates";
  return null;
}

/** The unsent comment for that step: it mentions the person; nothing is sent until the user sends it. */
export function askDraft(step: Pick<Step, "id">, person: { name: string }, intro = ""): { stepId: string; text: string } {
  return { stepId: step.id, text: `@${person.name} ${intro}`.trimEnd() + (intro ? "" : " ") };
}

/** The Milestones tool's strings (en, de in Sie). TODO(PLN): move into the i18n catalog once PLN-A1's catalog changes are merged. */
export const milestonesText = {
  en: {
    label: "Milestones",
    search: "Search milestones",
    notShipped: "Not shipped",
    shipped: "Shipped",
    create: "Create milestone",
    statePlanned: "Planned",
    stateRunning: "Running",
    stateAtRisk: "At risk",
    stateShipped: "Shipped",
    startsShips: "Starts {start} · ships",
    shipsLead: "Ships",
    daysLeft_one: "{count} day left",
    daysLeft_other: "{count} days left",
    daysLate_one: "{count} day late",
    daysLate_other: "{count} days late",
    owner: "Led by {name}",
    progress: "{done} of {total} steps done",
    estimateLate: "Estimate: about {count} working days late",
    estimateOnTime: "Estimate: on time",
    estimateNone: "No estimate: no due days",
    estimateInfoLabel: "How this is estimated",
    estimateInfo: "If every blocked day delays the end; dependencies and people's time are not counted.",
    ask: "Ask {name} in a comment →",
    askIntro: "what do you need to unblock this?",
    noSteps: "No steps yet",
    addSteps: "Add steps →",
    pickerLabel: "Steps without a milestone",
    pickerEmpty: "Every step already has a milestone.",
    pickerAdd: "Add",
    pickerClose: "Done",
    menu: "Actions for {title}",
    markShipped: "Mark shipped",
    reopen: "Reopen",
    dialogTitle: "Create milestone",
    name: "Name",
    starts: "Starts",
    ships: "Ships",
    description: "Description (optional)",
    cancel: "Cancel",
    issueTitle: "Write a name of 1 to 80 characters.",
    issueNote: "The description is limited to 1000 characters.",
    issueDue: "Choose the day it ships.",
    issueDates: "It cannot start after it ships.",
    badDay: "Choose a working day.",
    empty: "No milestones yet. Create the first date you are working towards.",
    emptyFilter: "No milestones match.",
  },
  de: {
    label: "Meilensteine",
    search: "Meilensteine durchsuchen",
    notShipped: "Nicht ausgeliefert",
    shipped: "Ausgeliefert",
    create: "Meilenstein erstellen",
    statePlanned: "Geplant",
    stateRunning: "Läuft",
    stateAtRisk: "Gefährdet",
    stateShipped: "Ausgeliefert",
    startsShips: "Start {start} · Auslieferung",
    shipsLead: "Auslieferung",
    daysLeft_one: "noch {count} Tag",
    daysLeft_other: "noch {count} Tage",
    daysLate_one: "{count} Tag zu spät",
    daysLate_other: "{count} Tage zu spät",
    owner: "Geleitet von {name}",
    progress: "{done} von {total} Schritten erledigt",
    estimateLate: "Schätzung: etwa {count} Arbeitstage zu spät",
    estimateOnTime: "Schätzung: pünktlich",
    estimateNone: "Keine Schätzung: keine Fälligkeitstage",
    estimateInfoLabel: "So wird geschätzt",
    estimateInfo: "Unter der Annahme, dass jeder blockierte Tag das Ende verschiebt; Abhängigkeiten und die Zeit der Beteiligten zählen nicht.",
    ask: "{name} in einem Kommentar fragen →",
    askIntro: "was brauchst du, damit es weitergeht?",
    noSteps: "Noch keine Schritte",
    addSteps: "Schritte hinzufügen →",
    pickerLabel: "Schritte ohne Meilenstein",
    pickerEmpty: "Jeder Schritt hat schon einen Meilenstein.",
    pickerAdd: "Hinzufügen",
    pickerClose: "Fertig",
    menu: "Aktionen für {title}",
    markShipped: "Als ausgeliefert markieren",
    reopen: "Wieder öffnen",
    dialogTitle: "Meilenstein erstellen",
    name: "Name",
    starts: "Start",
    ships: "Auslieferung",
    description: "Beschreibung (optional)",
    cancel: "Abbrechen",
    issueTitle: "Schreiben Sie einen Namen mit 1 bis 80 Zeichen.",
    issueNote: "Die Beschreibung ist auf 1000 Zeichen begrenzt.",
    issueDue: "Wählen Sie den Auslieferungstag.",
    issueDates: "Der Start darf nicht nach der Auslieferung liegen.",
    badDay: "Wählen Sie einen Arbeitstag.",
    empty: "Noch keine Meilensteine. Erstellen Sie das erste Datum, auf das Sie hinarbeiten.",
    emptyFilter: "Keine Meilensteine passen.",
  },
} as const;

type Base<K extends string> = K extends `${infer B}_${"one" | "other"}` ? B : K;
export type MilestonesKey = Base<keyof typeof milestonesText.en>;

/** One string by key and locale; a key with `count` picks its _one or _other form. */
export function mt(locale: "en" | "de", key: MilestonesKey, params: Record<string, string | number> = {}): string {
  const table: Record<string, string> = milestonesText[locale];
  const form = typeof params.count === "number" ? (new Intl.PluralRules(locale).select(params.count) === "one" ? "_one" : "_other") : "";
  const raw = table[key + form] ?? table[key];
  return Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), raw);
}
