// lib/avatar.ts: a person's initials get one of five tints, the same one on every page; anonymous gets none.
import { describe, expect, it } from "vitest";
import { avatarTone } from "@/lib/avatar";

describe("avatarTone", () => {
  it("gives a person the same tone every time", () => {
    expect(avatarTone("Thomas Vogel")).toBe(avatarTone("Thomas Vogel"));
    expect(avatarTone(" Thomas Vogel ")).toBe(avatarTone("Thomas Vogel"));
  });

  it("spreads people over more than one tone", () => {
    const names = ["Thomas Vogel", "Jonas Schmidt", "Lukas Becker", "Stefan Dahl", "Markus Roth", "Hans Sander", "Jan Klein", "Anna Weber"];
    expect(new Set(names.map(avatarTone)).size).toBeGreaterThan(2);
  });

  it("leaves anonymous people and nobody on the grey fallback", () => {
    expect(avatarTone("Anonymous #4471")).toBeUndefined();
    expect(avatarTone("—")).toBeUndefined();
    expect(avatarTone("?")).toBeUndefined();
    expect(avatarTone("")).toBeUndefined();
  });
});
