import { describe, expect, it } from "vitest";
import { NOTICE_RULE_DEFAULT } from "@/features/notify/channels";
import { noticeChannelsFromForm, profileNoticeRows, storedNoticeChannels } from "@/features/settings/notifications";
import { de } from "@/i18n/de";
import { en } from "@/i18n/en";

const form = (o: Record<string, string>): FormData => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
};
const GROUPS = ["raised", "loop", "reminders", "digest"] as const;

describe("INB channel settings", () => {
  it("noticeChannelsFromForm keeps only the four groups with a valid rule", () => {
    const rules = noticeChannelsFromForm(form({
      "rule:loop": "both", "rule:raised": "mail", "rule:reminders": "sms", "rule:digest": "", "rule:other": "mail", slug: "x", loop: "both",
    }));
    expect(rules).toEqual({ raised: "mail", loop: "both", reminders: NOTICE_RULE_DEFAULT.reminders, digest: NOTICE_RULE_DEFAULT.digest });
    expect(Object.keys(rules).sort()).toEqual([...GROUPS].sort());
    expect(noticeChannelsFromForm(form({}))).toEqual(NOTICE_RULE_DEFAULT);
  });

  it("stores only what differs from the default", () => {
    expect(storedNoticeChannels(noticeChannelsFromForm(form({ "rule:loop": "both", "rule:digest": "teams-else-mail" })))).toEqual({ loop: "both" });
    expect(storedNoticeChannels(NOTICE_RULE_DEFAULT)).toEqual({});
  });

  it("marks duty groups as always on and shows add mail only where Teams can be chosen", () => {
    const rows = profileNoticeRows(GROUPS, [{ template: "loop.case.decided", on: false }, { template: "+mail:loop", on: true }], true);
    const by = Object.fromEntries(rows.map((r) => [r.group, r]));
    expect(by.raised).toMatchObject({ duty: true, on: true });
    expect(by.reminders).toMatchObject({ duty: true, on: true });
    expect(by.loop).toMatchObject({ duty: false, on: false, addMail: true, canAddMail: true });
    expect(by.digest).toMatchObject({ duty: false, addMail: false });
    expect(profileNoticeRows(GROUPS, [], false).every((r) => !r.canAddMail)).toBe(true);
    expect(profileNoticeRows(GROUPS, [{ template: "+mail:loop", on: false }], true).find((r) => r.group === "loop")?.addMail).toBe(false);
  });

  it("has the new texts in German and English", () => {
    for (const key of ["noticesTitle", "noticeRuleBoth", "noticeGroupLoop", "noticesSave"] as const) {
      expect(en.settingsNotifications[key]).toBeTruthy();
      expect(de.settingsNotifications[key]).toBeTruthy();
    }
    for (const key of ["mailsAlways", "mailsAlsoByMail"] as const) {
      expect(en.profile[key]).toBeTruthy();
      expect(de.profile[key]).toBeTruthy();
    }
  });
});
