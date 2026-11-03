import { describe, expect, it } from "vitest";
import { lastSaved } from "@/features/settings/last-saved";

const at = new Date("2026-10-28T09:00:00Z");

describe("last saved line", () => {
  it("names the person who saved", () => {
    expect(lastSaved({ at, actorKind: "admin", actorUserId: "u1" }, new Map([["u1", "Hanna Sander"]]))).toEqual({
      at: "2026-10-28T09:00:00.000Z", name: "Hanna Sander", kindKey: "settingsAudit.actor_admin",
    });
  });

  it("falls back to how they came in, and is null without a row", () => {
    expect(lastSaved({ at, actorKind: "break-glass", actorUserId: null }, new Map())?.kindKey).toBe("settingsAudit.actor_breakGlass");
    expect(lastSaved({ at, actorKind: "admin", actorUserId: "gone" }, new Map())?.name).toBeNull();
    expect(lastSaved(null, new Map())).toBeNull();
  });
});
