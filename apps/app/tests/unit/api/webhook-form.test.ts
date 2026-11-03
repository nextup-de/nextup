import { describe, expect, it } from "vitest";
import { checkWebhook, newWebhookSecret } from "@/features/api/webhook-form";

describe("API webhook form", () => {
  it("accepts an https address with known event types", () => {
    const r = checkWebhook({ url: "https://hooks.example.com/in", events: ["case.decided", "case.raised"], on: true });
    expect(r).toEqual({ ok: true, value: { url: "https://hooks.example.com/in", events: ["case.raised", "case.decided"], on: true } });
  });

  it("names the error for http, a malformed address, no event and an unknown type", () => {
    expect(checkWebhook({ url: "http://hooks.example.com", events: ["case.raised"] })).toEqual({ ok: false, error: "settingsWebhooks.errorHttps" });
    expect(checkWebhook({ url: "not a url", events: ["case.raised"] })).toEqual({ ok: false, error: "settingsWebhooks.errorUrl" });
    expect(checkWebhook({ url: "https://hooks.example.com", events: [] })).toEqual({ ok: false, error: "settingsWebhooks.errorNoEvent" });
    expect(checkWebhook({ url: "https://hooks.example.com", events: ["case.raised", "case.ranked"] })).toEqual({ ok: false, error: "settingsWebhooks.errorEventType" });
  });

  it("makes a whsec_ secret of 32 random bytes", () => {
    const s = newWebhookSecret();
    expect(s.startsWith("whsec_")).toBe(true);
    expect(Buffer.from(s.slice(6), "base64url")).toHaveLength(32);
    expect(newWebhookSecret()).not.toBe(s);
  });
});
