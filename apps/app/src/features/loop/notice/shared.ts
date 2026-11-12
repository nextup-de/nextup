// What every area's loop mail builders share (REG/D10): the context the dispatcher builds and the formatters two areas use.
// An area file imports its values from here and from modules outside features/loop/notice*, never from loop/notice.ts: that
// file composes the areas at load, so a value import back would be a cycle.
import type { CaseEvent, CaseEventType } from "@/features/cases/events";
import type { ReducedCase, State } from "@/features/cases/reducer";
import type { ReducedProject } from "@/features/projects/types";
import type { T } from "@/i18n";
import type { NoticePerson } from "../notice";

export type EventArg = Pick<CaseEvent, "type" | "actor" | "actorUserId" | "target" | "payload"> & { id?: string };

/** What a builder reads: the event and the state after it, the subject it is about, and the closures that address and link a notice. */
export type NoticeCtx = {
  ev: EventArg;
  state: State;
  pl: CaseEvent["payload"];
  kase: ReducedCase | undefined;
  project: ReducedProject | undefined;
  /** One notice to one person, in that person's language; never to whoever did it, never twice to one person. */
  send: (who: string | null | undefined, subject: (t: T) => string, lines: (t: T) => string[]) => void;
  caseLink: (c: ReducedCase) => string;
  projectLink: (p: ReducedProject) => string;
  /** The raiser's user id. */
  authorOf: (c: ReducedCase) => string | null;
  /** Everyone invited to the discussion so far. */
  invitedOf: (c: ReducedCase) => string[];
  /** The users on a seat's desk: the users of the seat's role. */
  deskOf: (seatId: string | null | undefined) => string[];
  baseUrl: string;
  people: readonly NoticePerson[];
  /** A person by user id. */
  find: (userId: string | null | undefined) => NoticePerson | undefined;
};

/** The notice for one event type: it reads the context and sends. */
export type NoticeBuilder = (c: NoticeCtx) => void;
export type NoticeBuilders = Partial<Record<CaseEventType, NoticeBuilder>>;

/** "today", "tomorrow" or "in n days". */
export const inDays = (t: T, n: number) => (n <= 0 ? t("mail.inToday") : n === 1 ? t("mail.inTomorrow") : t("mail.inDays", { n }));
