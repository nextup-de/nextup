// Decision Q2.11: a Teams card that cannot be delivered becomes one mail for the same notice.
import { describe, expect, it } from "vitest";
import { failedWithMail, fallbackKey, MAILED_INSTEAD, mailInstead, type FailedCard } from "@/features/notify/fallback";

const card = (over: Partial<FailedCard> = {}): FailedCard => ({
  id: "row-1", channel: "teams", key: "rem:d1:u1", recipientUserId: "u1", template: "reminder.deadline", locale: "de",
  subject: "Antwort fällig", text: "Die Idee wartet.", link: "https://x.example/cases/c1", data: { eventId: "d1", subjectId: "c1", kind: "deadline" },
  ...over,
});

describe("NTF mail instead of a Teams card", () => {
  it("the mail is the same notice: template, language, text and link, to the person's address, pending", () => {
    expect(mailInstead(card(), " lena@x.example ")).toEqual({
      channel: "mail", key: "rem:d1:u1:mail", recipientUserId: "u1", address: "lena@x.example",
      template: "reminder.deadline", locale: "de", subject: "Antwort fällig", text: "Die Idee wartet.", link: "https://x.example/cases/c1",
      data: { eventId: "d1", subjectId: "c1", kind: "deadline", insteadOf: "row-1" }, status: "pending", lastError: null,
    });
  });

  it("a raise keeps the ids the mail channel needs to note it on the case", () => {
    const draft = mailInstead(card({ key: "notify:e1", template: "raised", data: { eventId: "e1", caseId: "c1" } }), "lena@x.example");
    expect(draft?.key).toBe(fallbackKey("notify:e1"));
    expect(draft?.data).toMatchObject({ eventId: "e1", caseId: "c1" });
  });

  it("nothing without an address, without a person, or for a row that is not a Teams card", () => {
    expect(mailInstead(card(), null)).toBeNull();
    expect(mailInstead(card(), "  ")).toBeNull();
    expect(mailInstead(card({ recipientUserId: null }), "lena@x.example")).toBeNull();
    expect(mailInstead(card({ channel: "mail" }), "lena@x.example")).toBeNull();
    expect(mailInstead(card({ channel: "webhook" }), "lena@x.example")).toBeNull();
  });

  it("the failed row says that a mail was written, also under a very long error", () => {
    expect(failedWithMail("Teams answered 403")).toBe(`Teams answered 403; ${MAILED_INSTEAD}`);
    const long = failedWithMail("x".repeat(900));
    expect(long.length).toBeLessThanOrEqual(500);
    expect(long.endsWith(MAILED_INSTEAD)).toBe(true);
  });
});
