import { describe, expect, it } from "vitest";
import { de } from "@/i18n/de";
import { en } from "@/i18n/en";

// The inbox page's own words: both languages say the same things, with the same placeholders.
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("INB page messages", () => {
  it("has every key the page uses, in both languages", () => {
    for (const k of ["sectionConfirm", "todayDecide", "todayLate", "todayPart", "kindCase", "kindIdea", "kindView", "kindQuestion", "kindConfirm", "kindReward", "kindMove", "markAllRead", "unread", "dueOn", "openLink", "markFailed"]) {
      expect(en.inbox, k).toHaveProperty(k);
      expect(de.inbox, k).toHaveProperty(k);
    }
  });

  it("uses the same placeholders in German and English", () => {
    for (const k of Object.keys(en.inbox) as (keyof typeof en.inbox)[]) {
      expect(placeholders(de.inbox[k]), k).toEqual(placeholders(en.inbox[k]));
    }
    expect(placeholders(en.inbox.todayDecide)).toEqual(["n"]);
    expect(placeholders(en.inbox.dueOn)).toEqual(["day"]);
  });
});
