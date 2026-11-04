// SFX-C1: the Directory block's view holds plain facts, offers the credentials form for SuccessFactors only,
// and never carries the private key or a personnel number.
import { describe, expect, it } from "vitest";
import { directoryBlockView } from "@/components/admin/connectors/views";

const PEM = "-----BEGIN PRIVATE KEY-----\nTOPSECRETKEYBYTES\n-----END PRIVATE KEY-----";
const run = {
  on: true, lastRunAt: new Date("2026-11-03T10:00:00Z"), lastOkAt: new Date("2026-11-03T10:00:00Z"), lastError: null,
  counts: { added: 4, updated: 1, deactivated: 0, handed: 2 },
};
const row = {
  settings: { apiHost: "https://api4.example.test", companyId: "Musterwerk", clientId: "client-abc", apiUserId: "NEXTUP_API", privateKey: PEM, employeeId: "P-0042" },
  hasSecret: true, vault: true,
};

describe("SFX console view", () => {
  it("shows source, on, last run, counts and last error", () => {
    const v = directoryBlockView({ ...run, source: "successfactors", lastError: "SuccessFactors request failed: 401" }, row);
    expect(v).toMatchObject({
      on: true, source: "successfactors", lastRunAt: "2026-11-03T10:00:00.000Z", lastError: "SuccessFactors request failed: 401",
      counts: { added: 4, updated: 1, deactivated: 0, handed: 2 },
    });
  });

  it("offers the credentials form only for SuccessFactors", () => {
    expect(directoryBlockView({ ...run, source: "graph" }, row).credentials).toBe(false);
    expect(directoryBlockView({ ...run, source: "successfactors" }, row).credentials).toBe(true);
  });

  it("carries the settings and only 'set' for the key, never the key or a personnel number", () => {
    const v = directoryBlockView({ ...run, source: "successfactors" }, row);
    expect(v.successFactors).toEqual({ apiHost: "https://api4.example.test", companyId: "Musterwerk", clientId: "client-abc", apiUserId: "NEXTUP_API" });
    expect(v.key).toBe("set");
    const json = JSON.stringify(v);
    expect(json).not.toContain("TOPSECRETKEYBYTES");
    expect(json).not.toContain("PRIVATE KEY");
    expect(json).not.toContain("P-0042");
  });

  it("reads 'not set' and empty settings when there is no row", () => {
    const v = directoryBlockView({ ...run, on: false, source: "graph" }, null);
    expect(v.key).toBe("not set");
    expect(v.successFactors).toEqual({ apiHost: "", companyId: "", clientId: "", apiUserId: "" });
    expect(v.vault).toBe(false);
  });
});
