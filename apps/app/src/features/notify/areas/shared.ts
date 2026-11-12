// What the notify areas (case, project, agent, approval, overload) share: the shapes of a reminder's audience and text, and the
// one helper two of them need. An area file imports values only from here and from modules outside notify, never from
// plan.ts, templates.ts, digest.ts or channels.ts: those compose the areas when they load, so a value import back would be a
// cycle (REG D7). The composers re-export what they used to define.
import type { CaseEvent } from "@/features/cases/events";
import type { ReducedCase, State } from "@/features/cases/reducer";
import type { ReducedProject } from "@/features/projects/types";
import { createT, type Locale, type T } from "@/i18n";
import { formatDate } from "@/i18n/format";

/** The event the planner reads (the planner's own PlanEvent is this type). */
export type PlanEvent = Pick<CaseEvent, "id" | "ts" | "type" | "actor" | "actorUserId" | "target" | "payload">;

// ── the text of a reminder ─────────────────────────────────────────────────────────────────────────────────

export type TemplateInput = {
  /** The greeting; missing = "Hello". */
  name?: string | null;
  /** The case or project title. */
  title?: string;
  /** The day it was due (deadline, start). */
  day?: number | null;
  /** That day's date, ISO, when the company has a calendar. */
  dueDate?: string | null;
  /** The measure check (30, 90); for a question, the working days left before the case goes back to the desk. */
  days?: number | null;
  /** The case or project page, or for the digest the inbox. */
  link: string;
  /** Escalation: who reads it - the seat above that gets the case, the desk that had it, or the raiser. Confirm: "above" is the seat the clock passed the result up to. Draft: the lead, or the seat above. */
  reader?: "above" | "desk" | "raiser" | "lead";
  /** Escalation only: the seat label of who has the case from now on. */
  holder?: string;
  /** Escalation only: the case moved to `holder`; false = nobody is above, it stays where it is. */
  moved?: boolean;
  /** A project step's text (the late and blocked reminders, MOV D23); read from the project by the fact's stepId. */
  step?: string;
  /** Why a step is blocked (the blocked reminder): the step's own reason. */
  why?: string;
};

export type Rendered = { subject: string; text: string; link: string };

/** Subject, intro and the line that opens the page, in the shape every reminder mail has: greeting, intro, the title, the link. */
export type Compose = (subject: string, intro: string, open: string, withTitle?: boolean) => Rendered;

/** What renderTemplate works out once for the template: the title, when it was due, the days and the link. */
export type ReminderVars = { title: string; when: string; days: number; url: string };

/** The render entry of one reminder template. */
export type ReminderTextFn = (input: TemplateInput, t: T, compose: Compose, vars: ReminderVars) => Rendered;

/** When something is due, as a mail says it: the date, or the day number where a company has no calendar (the demo). */
export function whenDue(locale: Locale, day: number, dueDate?: string | null): string {
  return dueDate ? formatDate(locale, dueDate, "day") : createT(locale)("mail.dayNumber", { day });
}

// ── who gets a reminder ────────────────────────────────────────────────────────────────────────────────────

/** What the reminder branch of the planner reads, handed to the audience of a kind. */
export type ReminderCtx = {
  state: State;
  /** Only who is a manager is read (the second person for a typed result). */
  people: readonly { id: string; manager?: boolean }[];
  caseLink: (id: string) => string;
  projectLink: (id: string) => string;
  usersOfSeat: (seatId: string | null | undefined) => string[];
  uniq: (xs: string[]) => string[];
  /** The case the fact is about, when it is one. */
  kase: ReducedCase | undefined;
  /** The project the fact is about, when it is one. */
  project: ReducedProject | undefined;
  dateOfDay?: (day: number) => string | null;
};

/**
 * Who a reminder goes to and what it says: the people, the title and the link, the day it names (missing = the fact's own
 * dueDay) and, per person, what else the text needs (who reads an escalation, the days of a question).
 */
export type ReminderAudience = {
  users: string[];
  title?: string;
  link: string;
  day?: number | null;
  varsFor?: (userId: string) => Partial<TemplateInput>;
};

/** One reminder kind's audience: null when the fact is about nothing this kind can name (no such case or project). */
export type ReminderAudienceFn = (ev: PlanEvent, ctx: ReminderCtx) => ReminderAudience | null;
