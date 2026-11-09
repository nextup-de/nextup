// Musterwerk's company profile: complete, and something the Settings → Company form would accept as it is.
import { describe, expect, it } from "vitest";
import { parseCompanyForm } from "@/features/settings/company-forms";
import { MUSTERWERK_PROFILE as p } from "../../../prisma/generators/musterwerk/profile";

describe("MUSTERWERK_PROFILE", () => {
  it("fills every field", () => {
    for (const k of ["vision", "mission", "businessModel", "complianceRules"] as const) expect(p[k].trim(), k).not.toBe("");
    expect(p.principles.length).toBeGreaterThan(0);
  });

  it("passes the company form unchanged", () => {
    const parsed = parseCompanyForm({ name: "Musterwerk GmbH", mark: "M", ...p, principles: p.principles.join("\n") });
    expect(parsed).toEqual({ ok: true, value: { name: "Musterwerk GmbH", mark: "M", profile: p } });
  });

  it("names roles, never the generated people", () => {
    const all = [p.vision, p.mission, p.businessModel, p.complianceRules, ...p.principles].join("\n");
    expect(all).not.toMatch(/@musterwerk\./);
    expect(all).not.toMatch(/\b(Herr|Frau)\b/);
  });
});
