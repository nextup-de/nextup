// The yes that opens a project draft (plan SET, D10): who sets it up, a new draft or an open project joined, and one
// line to the raiser. Title, template, team, goal, baseline and first steps belong to the draft. Pure: what the
// yes sheet, the demo shortcut and the Teams card all send, so the three write the same event.
import { newId, type EventPayload } from "@/features/cases/events";
import type { ReducedProject } from "./types";

/** The raiser line is one short line (the rules refuse more). */
export const RAISER_NOTE_MAX = 300;

/** A person by user id, with the label that rides along on the event. */
export type AcceptPerson = { userId: string | null; name: string };

export type AcceptInput = {
  /** The case's title: the draft starts under it. */
  caseTitle: string;
  /** Who says yes. */
  decider: AcceptPerson;
  /** Who sets it up; the decider when missing. */
  lead?: AcceptPerson;
  /** The id of an open project to join instead of opening a new draft. */
  join?: string;
  raiserNote?: string;
  /** The id a new draft gets; minted when missing. */
  newProjectId?: string;
};

/** The case.decided payload of a yes that opens a draft, or adds the idea to an open project (D10). */
export function acceptPayload(i: AcceptInput): EventPayload {
  const lead = i.lead ?? i.decider;
  const note = i.raiserNote?.trim().slice(0, RAISER_NOTE_MAX) ?? "";
  return {
    answer: "yes",
    draft: true,
    projectId: i.join ?? i.newProjectId ?? newId("p"),
    lead: lead.name,
    ...(lead.userId ? { leadUserId: lead.userId } : {}),
    title: i.caseTitle,
    ...(note ? { raiserNote: note } : {}),
  };
}

/** The open projects a yes may join: the decider leads them or is on the team (D10). */
export function joinableProjects(projects: readonly ReducedProject[], userId: string | null, demo = true): ReducedProject[] {
  if (userId === null) return [];
  return projects.filter((p) =>
    (demo || !p.seed) && p.status !== "stopped" && p.status !== "recognised" && (p.leadUserId === userId || p.memberUserIds.includes(userId)));
}
