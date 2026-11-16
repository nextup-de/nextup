// The notices under the inbox list (features/inbox/notices.ts): each one opens something, and none repeats a row above.
import { describe, expect, it } from "vitest";
import { noticesBesideItems, noticeView } from "@/features/inbox/notices";
import type { InboxItem } from "@/features/inbox";

const row = (over: Partial<Parameters<typeof noticeView>[0]> = {}) =>
  ({ id: "n1", template: "loop.case.discussion", subject: "Your view is asked: X", text: "Hi", link: null, data: { subjectId: "c_1" }, createdAt: new Date(0), readAt: null, ...over });

describe("noticeView", () => {
  it("keeps the link a notice carries", () => {
    expect(noticeView(row({ link: "https://acme.test/idea?id=c_1" })).link).toBe("https://acme.test/idea?id=c_1");
  });
  it("an older loop notice without a link opens its case or project", () => {
    expect(noticeView(row()).link).toBe("/idea?id=c_1");
    expect(noticeView(row({ template: "loop.project.started", data: { subjectId: "p_1" } })).link).toBe("/projects/p_1");
  });
  it("one about nothing it can name stays without a link", () => {
    expect(noticeView(row({ template: "budget.warn", data: {} })).link).toBeNull();
  });
});

describe("noticesBesideItems", () => {
  const item = { id: "view:c_1", caseId: "c_1" } as InboxItem;
  it("hides a notice about a row of the list, keeps the rest", () => {
    const list = [noticeView(row()), noticeView(row({ id: "n2", data: { subjectId: "c_2" } })), noticeView(row({ id: "n3", data: null }))];
    expect(noticesBesideItems(list, [item]).map((n) => n.id)).toEqual(["n2", "n3"]);
  });
});
