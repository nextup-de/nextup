import QRCode from "qrcode";
import { afterEach, describe, expect, it, vi } from "vitest";
import { areaUrl, checkArea, type AreaFormInput } from "@/features/floor/areas";
import { areaQrSvg } from "@/features/floor/qr";

const ctx = {
  units: [{ id: "u1" }, { id: "u2" }],
  roles: [{ id: "r1", orgUnitId: "u1" }, { id: "r2", orgUnitId: "u2" }],
  keysInUse: ["line-3"],
};
const good: AreaFormInput = { key: "line-4", name: "Line 4", unitId: "u1", roleId: "r1", anonymous: true, on: true };

afterEach(() => vi.restoreAllMocks());

describe("FLR areas", () => {
  it("checkArea accepts a valid area", () => {
    expect(checkArea({ ...good, key: " line-4 ", name: " Line 4 " }, ctx)).toEqual({ ok: true, value: good });
  });

  it.each([
    ["a bad key", { key: "Line 4" }, "settingsAreas.errKey"],
    ["a key that starts with a dash", { key: "-ab" }, "settingsAreas.errKey"],
    ["a key of one character", { key: "a" }, "settingsAreas.errKey"],
    ["a duplicate key", { key: "line-3" }, "settingsAreas.errKeyTaken"],
    ["a name over 60 characters", { name: "x".repeat(61) }, "settingsAreas.errName"],
    ["an empty name", { name: "  " }, "settingsAreas.errName"],
    ["an unknown unit", { unitId: "nope" }, "settingsAreas.errUnit"],
    ["a role outside the chosen unit", { roleId: "r2" }, "settingsAreas.errRole"],
  ] as const)("checkArea names the error for %s", (_label, patch, error) => {
    expect(checkArea({ ...good, ...patch }, ctx)).toEqual({ ok: false, error });
  });

  it("areaUrl is <baseUrl>/floor/<key>", () => {
    expect(areaUrl("https://x.example/acme", "line-4")).toBe("https://x.example/acme/floor/line-4");
    expect(areaUrl("https://x.example/acme/", "line-4")).toBe("https://x.example/acme/floor/line-4");
  });

  it("areaQrSvg returns an SVG per URL with error correction M", async () => {
    const spy = vi.spyOn(QRCode, "toString");
    const a = await areaQrSvg("https://x.example/acme/floor/line-3");
    const b = await areaQrSvg("https://x.example/acme/floor/line-4");
    expect(a).toContain("<svg");
    expect(a).not.toBe(b);
    expect(spy).toHaveBeenCalledWith("https://x.example/acme/floor/line-3", expect.objectContaining({ type: "svg", errorCorrectionLevel: "M", margin: 4 }));
  });
});
