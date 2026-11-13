// Items from comments (kind `comment`; plan REM, I1): one item per case the person follows - it is on their desk, they are invited to its
// discussion, or they raised it - with the number of comments by others that came after the last thing the person did on it. "Did" is read from
// the log: any event of theirs on the case, so their own comment, answer, pass or raise marks what came before as seen; no read state is stored.
// Never a comment of the person's own, nor the system's raise note. A case that already has another row for the person (a case to decide, a view,
// a question, an approval) shows no second row: the badge counts a case once. The log is not in the inbox input, so the caller that has it passes
// `events`; without them, and in the demo, there is no row.
import type { CaseEvent } from "@/features/cases/events";
import { invitedTo } from "@/features/cases/discussion";
import { onDeskOf } from "@/features/cases/selectors";
import type { InboxItem } from "../types";
import type { AgentInboxInput } from "./agent";

export type CommentsInboxInput = AgentInboxInput & { events?: readonly CaseEvent[] | null };

export function commentItems(input: CommentsInboxInput): InboxItem[] {
  const { events, state, me } = input;
  if (!events || input.demo || me.userId === null) return [];
  // Per case: where in the log the person last acted, and where the others' comments are.
  const mineAt = new Map<string, number>();
  const others = new Map<string, number[]>();
  events.forEach((e, at) => {
    if (e.target === null || e.target === undefined || e.actorUserId === null || e.actorUserId === undefined) return;
    if (e.actorUserId === me.userId) mineAt.set(e.target, at);
    else if (e.type === "case.commented") others.set(e.target, [...(others.get(e.target) ?? []), at]);
  });
  const out: InboxItem[] = [];
  for (const c of state.cases.slice().sort((a, b) => a.raisedDay - b.raisedDay)) {
    if (c.status === "withdrawn" || c.status === "merged") continue;
    const unread = (others.get(c.id) ?? []).filter((at) => at > (mineAt.get(c.id) ?? -1)).length;
    if (unread === 0) continue;
    if (!onDeskOf(c, me) && !invitedTo(c, me) && c.fromUserId !== me.userId) continue;
    out.push({ id: `comment:${c.id}`, ask: "part", kind: "comment", caseId: c.id, title: c.title, href: `/cases/${encodeURIComponent(c.id)}`, dueDay: null, late: false, dueSoon: false, pinned: false, deskRoleId: null, count: unread });
  }
  return out;
}
