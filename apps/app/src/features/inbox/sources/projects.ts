// Items from the projects (plan INB, D2): a typed result to confirm, a reward due, a move of mine as the lead or after
// it was escalated to my desk. From projectDeskFor, only with the projects flag.
import { projectDeskFor, type DeskItem } from "@/features/projects/views";
import type { InboxItem } from "../types";
import type { InboxSourceInput } from "./cases";
import { projectDraftItems } from "./project-draft";
import { projectMoveItems } from "./project-move";

const kindOf = (d: DeskItem): InboxItem["kind"] => (d.why === "confirm" || d.why === "confirmUp" ? "confirm" : d.why === "reward" ? "reward" : "move");

/** The project desk behind the items: the move and the reason each one is on this person's desk (the page words them). */
export function projectDesk(input: InboxSourceInput): DeskItem[] {
  if (!input.flags.projects) return [];
  const { state, me, demo } = input;
  const projects = demo ? state.projects : state.projects.filter((p) => !p.seed);
  // Not a member's view of the projects: every item here is on this person's own desk (lead, escalated, second person).
  return projectDeskFor(projects, input.today, { role: input.role ?? "leader", userId: me.userId, me }, { routes: state.routes, seats: [...input.seats] });
}

/**
 * The lead's move is said once. A lead who has not taken the draft yet is asked "Will you lead it?" (the lead item): its baseline or start is
 * theirs only after the yes. A running project whose weekly update is due has the update item: working the board is the same visit. "Mark it
 * done" stays next to the update, it is a move of its own.
 */
function saidElsewhere(input: InboxSourceInput): (d: DeskItem) => boolean {
  const asked = new Set(projectDraftItems(input).filter((i) => i.kind === "lead").map((i) => i.projectId));
  const updates = new Set(projectMoveItems(input).filter((i) => i.kind === "update").map((i) => i.projectId));
  return (d) => d.why === "lead" && (asked.has(d.project.id) || (d.move === "steps" && updates.has(d.project.id)));
}

export function projectItems(input: InboxSourceInput): InboxItem[] {
  const desk = projectDesk(input);
  if (desk.length === 0) return [];
  const dup = saidElsewhere(input);
  return desk.filter((d) => !dup(d)).map((d) => {
    const kind = kindOf(d);
    return {
      id: `${kind}:${d.project.id}`,
      ask: kind === "move" ? "part" : "confirm",
      kind,
      projectId: d.project.id,
      title: d.project.title,
      href: `/projects/${encodeURIComponent(d.project.id)}`,
      dueDay: d.dueDay ?? d.project.dueDay,
      late: false,
      dueSoon: false,
      pinned: false,
      deskRoleId: d.why === "escalated" ? d.project.escalated?.toRoleId ?? null : null,
    };
  });
}
