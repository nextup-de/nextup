import { describe, expect, it } from "vitest";
import {
  FLOOR_ANON_COOKIE, FLOOR_DEVICE_COOKIE, PAIR_ALPHABET, deviceKey, newDeviceToken, newFloorCode, newPairCode,
  readSignedValue, signCookieValue,
} from "@/features/floor/codes";

describe("FLR codes", () => {
  it("a pairing code is six characters from the allowed alphabet", () => {
    expect(PAIR_ALPHABET).toBe("ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
    for (let i = 0; i < 1000; i++) expect(newPairCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it("a floor code is six digits", () => {
    for (let i = 0; i < 1000; i++) expect(newFloorCode()).toMatch(/^\d{6}$/);
  });

  it("a device token is 32 random bytes, base64url, and never repeats", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const t = newDeviceToken();
      expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(t, "base64url")).toHaveLength(32);
      seen.add(t);
    }
    expect(seen.size).toBe(1000);
  });

  it("the device key is d:<id> for a paired device and a:<anon id> otherwise", () => {
    expect(deviceKey({ deviceId: "dev1", anonId: "anon1" })).toBe("d:dev1");
    expect(deviceKey({ deviceId: null, anonId: "anon1" })).toBe("a:anon1");
    expect(deviceKey({ anonId: "anon1" })).toBe("a:anon1");
  });

  it("names the two cookies", () => {
    expect(FLOOR_DEVICE_COOKIE).toBe("nextup_floor_device");
    expect(FLOOR_ANON_COOKIE).toBe("nextup_floor_anon");
  });

  it("a signed cookie value reads back only with its own secret and unaltered", () => {
    const signed = signCookieValue("tok", "s1");
    expect(readSignedValue(signed, "s1")).toBe("tok");
    expect(readSignedValue(signed, "s2")).toBeNull();
    expect(readSignedValue("x" + signed, "s1")).toBeNull();
    expect(readSignedValue(undefined, "s1")).toBeNull();
  });
});
