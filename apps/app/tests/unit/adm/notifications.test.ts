import { describe, expect, it } from "vitest";
import { failedView, optOutCounts, stageLine } from "@/features/settings/notifications";

const opt = (n: number, template: string) => Array.from({ length: n }, (_, i) => ({ userId: `u${i}`, template, on: false }));

describe("ADM notifications view", () => {
  it("shows fewer than 5 below five people and the number from five", () => {
    const c = optOutCounts([...opt(4, "a"), ...opt(5, "b"), ...opt(1, "*"), { userId: "x", template: "c", on: true }]);
    expect(c).toEqual([
      { template: "*", count: null },
      { template: "a", count: null },
      { template: "b", count: 5 },
    ]);
  });

  it("counts a person once per kind", () => {
    expect(optOutCounts([...opt(5, "a"), ...opt(5, "a")])).toEqual([{ template: "a", count: 5 }]);
  });

  it("lists failed rows of 14 days without body or address", () => {
    const now = new Date("2026-11-02T12:00:00Z");
    const row = (id: string, days: number) => ({
      id, template: "t", channel: "mail", createdAt: new Date(now.getTime() - days * 86_400_000), lastError: "boom",
      text: "secret body", subject: "subj", address: "a@b.example", recipientUserId: "u1",
    });
    const v = failedView([row("old", 15), row("a", 2), row("b", 1)], now);
    expect(v.map((r) => r.id)).toEqual(["b", "a"]);
    expect(Object.keys(v[0]).sort()).toEqual(["at", "channel", "error", "id", "template"]);
    expect(JSON.stringify(v)).not.toMatch(/secret body|a@b\.example|subj|u1/);
  });

  it("says a sandbox sends nothing", () => {
    expect(stageLine("sandbox", true)).toBe("settingsNotifications.stageSandbox");
    expect(stageLine("pilot", true)).toBe("settingsNotifications.stageOn");
    expect(stageLine("pilot", false)).toBe("settingsNotifications.stageOff");
  });
});
