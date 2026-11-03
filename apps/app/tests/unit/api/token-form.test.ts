import { describe, expect, it } from "vitest";
import { checkToken, expiryOf, isOldApiToken } from "@/features/api/token-form";

const ok = { name: "SAP bridge", scopes: ["cases:read"] };

describe("API token form", () => {
  it("accepts a name of 1 to 60 characters with a known scope", () => {
    expect(checkToken(ok, [])).toEqual({ ok: true, value: { name: "SAP bridge", scopes: ["cases:read"] } });
    expect(checkToken({ name: "x", scopes: ["events:read", "org:read"] }, []).ok).toBe(true);
    expect(checkToken({ name: "a".repeat(60), scopes: ["org:read"] }, []).ok).toBe(true);
  });

  it("names the error for an empty or too long name", () => {
    expect(checkToken({ ...ok, name: "   " }, [])).toEqual({ ok: false, error: "settingsApiTokens.errName" });
    expect(checkToken({ ...ok, name: "a".repeat(61) }, [])).toEqual({ ok: false, error: "settingsApiTokens.errName" });
  });

  it("names the error for a name in use, no scope and an unknown scope", () => {
    expect(checkToken(ok, ["sap BRIDGE"])).toEqual({ ok: false, error: "settingsApiTokens.errNameInUse" });
    expect(checkToken({ ...ok, scopes: [] }, [])).toEqual({ ok: false, error: "settingsApiTokens.errNoScope" });
    expect(checkToken({ ...ok, scopes: ["cases:read", "admin:all"] }, [])).toEqual({ ok: false, error: "settingsApiTokens.errScopeUnknown" });
  });

  it("maps the expiry choices to dates or null", () => {
    const now = new Date("2026-11-03T10:00:00Z");
    expect(expiryOf("30d", now)?.toISOString()).toBe("2026-12-03T10:00:00.000Z");
    expect(expiryOf("90d", now)?.toISOString()).toBe("2027-02-01T10:00:00.000Z");
    expect(expiryOf("1y", now)?.toISOString()).toBe("2027-11-03T10:00:00.000Z");
    expect(expiryOf("never", now)).toBeNull();
    expect(now.toISOString()).toBe("2026-11-03T10:00:00.000Z");
  });

  it("calls a token old only when it has old scopes only", () => {
    expect(isOldApiToken(["events:read", "events:write", "knowledge:write"])).toBe(true);
    expect(isOldApiToken(["events:read", "cases:read"])).toBe(false);
    expect(isOldApiToken(["cases:read"])).toBe(false);
    expect(isOldApiToken([])).toBe(false);
  });
});
