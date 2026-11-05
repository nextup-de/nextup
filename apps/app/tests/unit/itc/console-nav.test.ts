import { describe, expect, it } from "vitest";
import { CONSOLE_SECTIONS } from "@/features/admin/nav";
import { de } from "@/i18n/de";
import { en } from "@/i18n/en";

function lookup(catalog: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((o, k) => (typeof o === "object" && o !== null ? (o as Record<string, unknown>)[k] : undefined), catalog);
}

describe("ITC console sections", () => {
  it("has the sections of D3, and Setup, in order", () => {
    expect(CONSOLE_SECTIONS.map((s) => s.key)).toEqual(["overview", "setup", "access", "connectors", "assistant", "data", "routing", "support"]);
    expect(CONSOLE_SECTIONS.map((s) => s.path)).toEqual([
      "/admin", "/admin/setup", "/admin/people", "/admin/connectors", "/admin/assistant", "/admin/company-data", "/admin/decisions", "/admin/support",
    ]);
  });

  it("has unique keys and paths under /admin", () => {
    expect(new Set(CONSOLE_SECTIONS.map((s) => s.key)).size).toBe(CONSOLE_SECTIONS.length);
    for (const s of CONSOLE_SECTIONS) expect(s.path.startsWith("/admin")).toBe(true);
  });

  it("has every label key in the German and the English catalog", () => {
    for (const s of CONSOLE_SECTIONS) {
      expect(typeof lookup(de, s.labelKey), `de ${s.labelKey}`).toBe("string");
      expect(typeof lookup(en, s.labelKey), `en ${s.labelKey}`).toBe("string");
    }
  });
});
