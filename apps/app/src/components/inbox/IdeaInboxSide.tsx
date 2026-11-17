"use client";
// An idea's page (/idea?id=, &page=files or chats) in the Inbox's side view (Kevin, 17 Nov 2026: one layout for an open
// idea, however it was opened): the walk through the inbox with this idea marked and its pages under it, as beside an
// item opened in the inbox. An idea that waits for nothing from this person is its own row after the walk. Nothing
// while the store loads, for an id the viewer may not open, or with projects off (the old ideas table has no side view).
import { useSearchParams } from "next/navigation";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { ideaHomeOf, visibleTo } from "@/components/dashboard/derive";
import { raisedWith } from "@/features/cases/rows";
import { commentsOn } from "@/features/cases/selectors";
import { inboxItems } from "@/features/inbox";
import { inboxWalk } from "@/features/inbox/walk";
import { ideaPath } from "@/features/ideas/page-path";
import { mineIdeas } from "@/features/ideas/status";
import { inboxInputOf } from "./inboxInput";
import { InboxWalk, type IdeaPageKey } from "./InboxWalk";

export function IdeaInboxSide() {
  const ctx = useDemo();
  const params = useSearchParams();
  const id = params.get("id");
  const at = params.get("page");
  const c = id && ctx.ready && ctx.flag("projects") ? ctx.S.cases.find((x) => x.id === id && visibleTo(ctx, x)) : undefined;
  if (!c) return null;
  // A raiser whose bar has no Inbox walks through their own ideas instead, under Ideas › Mine (SimpleShell MINE_AREA).
  const walk = ideaHomeOf(ctx) === "mine"
    ? mineIdeas(ctx.S, ctx.me.userId, { seats: ctx.seed.seats, roles: ctx.seed.roles ?? [], approvals: ctx.S.approvals }, ctx.seed.clock)
      .map((r) => ({ id: r.id, title: r.title, late: false, href: ideaPath(r.id), inPlace: false }))
    : inboxWalk(inboxItems(inboxInputOf(ctx)));
  const items = walk.some((r) => r.id === c.id) ? walk : [...walk, { id: c.id, title: c.title, late: false, href: ideaPath(c.id), inPlace: false }];
  const page: IdeaPageKey = at === "files" || at === "chats" ? at : "overview";
  const counts = { files: raisedWith(c).attachments || undefined, chats: commentsOn(ctx.log, c.id).length || undefined };
  return <InboxWalk items={items} openId={c.id} page={page} counts={counts} />;
}
