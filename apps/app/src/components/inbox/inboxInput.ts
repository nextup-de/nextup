// What the inbox is read from, in one place: the inbox page and the walk beside an idea's page list the same items.
import type { useDemo } from "@/components/dashboard/DemoProvider";
import type { CommentsInboxInput } from "@/features/inbox";
import { agentForInbox } from "@/features/inbox/sources/agent";

type Ctx = ReturnType<typeof useDemo>;

export function inboxInputOf(ctx: Ctx): CommentsInboxInput & { role: Ctx["role"] } {
  const { S, me, seed, role, demo, flag, serverMode } = ctx;
  return {
    state: S, me, seats: seed.seats ?? [], today: S.day, demo, role, flags: { projects: flag("projects"), discussion: flag("discussion") },
    agent: agentForInbox(ctx.log, S, { flagOn: flag("agent"), serverMode, demo }),
    events: ctx.log.events, // the unread comments are read from the log (plan REM, I1)
  };
}
