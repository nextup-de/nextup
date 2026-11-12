import { describe, expect, it } from "vitest";
import { meFor } from "@/features/auth/identity";
import { reduce, type ReduceSeed } from "@/features/cases/reducer";
import { inboxCounts, inboxItems } from "@/features/inbox";
import { projectDraftItems } from "@/features/inbox/sources/project-draft";
import type { InboxInput, InboxItem } from "@/features/inbox/types";
import { ADD_MAIL_PREFIX, isDuty, NOTICE_RULE_DEFAULT, noticeChannelFor } from "@/features/notify/channels";
import { NOTIFY_GROUPS } from "@/features/notify/digest";
import { de } from "@/i18n/de";
import { en } from "@/i18n/en";

const SEED: ReduceSeed = { cases: [], ideas: [], problems: [], routes: [], promiseDays: 5 };
const input: InboxInput = {
  state: reduce(SEED, { events: [], day: 0 }),
  me: meFor(null, []),
  seats: [],
  today: 0,
  demo: false,
  flags: { projects: true, discussion: true },
};

const item = (over: Partial<InboxItem>): InboxItem => ({
  id: "i", ask: "decide", kind: "case", title: "t", href: "/x", dueDay: null, late: false, dueSoon: false, pinned: false, deskRoleId: null, ...over,
});

describe("INB scaffold", () => {
  it("has stubs that return no items for an empty state", () => {
    expect(inboxItems(input)).toEqual([]);
    expect(projectDraftItems(input)).toEqual([]);
  });

  it("counts total, decide, late and waiting, and they overlap", () => {
    expect(inboxCounts([])).toEqual({ total: 0, decide: 0, late: 0, waiting: 0 });
    const items = [item({ id: "a", ask: "decide", late: true }), item({ id: "b", ask: "part" }), item({ id: "c", ask: "confirm", late: true }), item({ id: "d", ask: "part" })];
    expect(inboxCounts(items)).toEqual({ total: 4, decide: 1, late: 2, waiting: 2 });
  });

  it("reads the company's rule per group and falls back to today's default", () => {
    expect(noticeChannelFor(null, "loop")).toBe("teams-else-mail");
    expect(noticeChannelFor({ noticeChannels: { loop: "both" } }, "loop")).toBe("both");
    expect(noticeChannelFor({ noticeChannels: { loop: "both" } }, "raised")).toBe("teams-else-mail");
    expect(noticeChannelFor({ noticeChannels: { loop: "sms" } }, "loop")).toBe("teams-else-mail");
    expect(noticeChannelFor({ noticeChannels: { reminders: "mail" } }, "reminders")).toBe("mail");
    for (const bad of [null, undefined, "mail", 3, ["mail"], {}]) expect(noticeChannelFor({ noticeChannels: bad }, "digest")).toBe("teams-else-mail");
    expect(Object.keys(NOTICE_RULE_DEFAULT).sort()).toEqual(Object.keys(NOTIFY_GROUPS).sort());
  });

  it("knows the duty notices and the add-mail prefix", () => {
    expect(isDuty("reminder.deadline")).toBe(true);
    expect(isDuty("raised")).toBe(true);
    expect(isDuty("digest")).toBe(false);
    expect(isDuty("reminder.checkin")).toBe(false);
    expect(ADD_MAIL_PREFIX).toBe("+mail:");
  });

  it("has the inbox namespace in both languages with the same keys", () => {
    expect(Object.keys(de.inbox).sort()).toEqual(Object.keys(en.inbox).sort());
    for (const k of ["title", "today", "askDecide", "askConfirm", "askPart", "late", "dueSoon", "empty", "notices", "noticesEmpty", "markRead"]) {
      expect(en.inbox).toHaveProperty(k);
    }
  });
});
