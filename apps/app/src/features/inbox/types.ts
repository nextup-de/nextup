// The shapes of the one inbox (plan INB, decision D15). Other phases import these names; do not rename them.
import type { SeatRow, Me } from "@/features/auth/identity";
import type { State } from "@/features/cases/reducer";

/** What the person is asked to do: decide it, confirm it, or do their part of it. */
export type InboxAsk = "decide" | "confirm" | "part";

export type InboxKind = "case" | "idea" | "view" | "question" | "confirm" | "reward" | "move" | "lead" | "invitation" | "approval" | "stalled" | "vacant" | "update" | "appeal"
  // A result that closes properly (plan RES, D20) and an agent's suggestion (plan AGT).
  | "help" // an open 'ask the sponsor' on a step (RES, D19): for the asked person or the holders of the asked role
  | "baseline" // a baseline that waits for a second person's confirmation before the start (RES, D16)
  | "suggestion"; // an agent's suggestion (AGT fills it; RES writes none)

export type InboxItem = {
  id: string;
  ask: InboxAsk;
  kind: InboxKind;
  caseId?: string;
  projectId?: string;
  title: string;
  href: string;
  /** The working day it is due, or null when it has no date. */
  dueDay: number | null;
  late: boolean;
  dueSoon: boolean;
  pinned: boolean;
  /** The desk (role) the item sits on when the person holds it as a role holder, else null. */
  deskRoleId: string | null;
  /** Why a case is back on the list (plan NOR): reopened, passed on, sent back, taken up a level, or its date moved. Absent on every other item. */
  cause?: "reopened" | "passed" | "back" | "up" | "moved";
};

export type InboxInput = {
  state: State;
  me: Me;
  seats: readonly SeatRow[];
  today: number;
  demo: boolean;
  flags: { projects: boolean; discussion: boolean };
};
