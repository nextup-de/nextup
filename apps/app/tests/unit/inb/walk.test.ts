// The walk through the inbox in its side view (Kevin, 17 Nov 2026; features/inbox/walk.ts): every item that opens an
// idea, in the inbox's order, one row per idea; a decide item opens in place, the rest open the idea's page.
import { describe, expect, it } from "vitest";
import type { InboxItem } from "@/features/inbox";
import { inboxWalk } from "@/features/inbox/walk";

const item = (over: Partial<InboxItem> & Pick<InboxItem, "id" | "ask" | "kind" | "href">): InboxItem => ({
  title: over.id, dueDay: null, late: false, dueSoon: false, pinned: false, deskRoleId: null, ...over,
});

describe("INB walk", () => {
  it("lists Decide, then Confirm, then Do my part, each in the list's order, once per idea", () => {
    const items = [
      item({ id: "comment:c1", ask: "part", kind: "comment", caseId: "c1", href: "/idea?id=c1" }),
      item({ id: "approval:s1", ask: "confirm", kind: "approval", caseId: "c2", href: "/idea?id=c2" }),
      item({ id: "case:c3", ask: "decide", kind: "case", caseId: "c3", href: "/inbox?id=c3", late: true }),
      item({ id: "case:c1", ask: "decide", kind: "case", caseId: "c1", href: "/inbox?id=c1" }),
      item({ id: "idea:i4", ask: "decide", kind: "idea", href: "/inbox?id=i4" }),
    ];
    expect(inboxWalk(items)).toEqual([
      { id: "c3", title: "case:c3", late: true, href: "/inbox?id=c3", inPlace: true },
      { id: "c1", title: "case:c1", late: false, href: "/inbox?id=c1", inPlace: true },
      { id: "i4", title: "idea:i4", late: false, href: "/inbox?id=i4", inPlace: true },
      { id: "c2", title: "approval:s1", late: false, href: "/idea?id=c2", inPlace: false },
    ]);
  });

  it("leaves out what is no idea: a project's own item; a second look opens the idea's page", () => {
    const items = [
      item({ id: "stalled:pj1", ask: "decide", kind: "stalled", projectId: "pj1", href: "/projects/pj1" }),
      item({ id: "confirm:pj2", ask: "confirm", kind: "confirm", projectId: "pj2", href: "/projects/pj2?page=results" }),
      item({ id: "appeal:c5", ask: "decide", kind: "appeal", caseId: "c5", href: "/idea?id=c5" }),
    ];
    expect(inboxWalk(items)).toEqual([{ id: "c5", title: "appeal:c5", late: false, href: "/idea?id=c5", inPlace: false }]);
  });
});
