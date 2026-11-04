import { describe, expect, it } from "vitest";
import { readJiraForm, settingsFromForm } from "@/features/admin/jira-admin";
import { parseJiraSettings } from "@/features/integrations/jira/settings";
import { aiBlockView, directoryBlockView, jiraBlockView, m365BlockView } from "@/components/admin/connectors/views";

const SECRET = "s3cr3t-token-value";

describe("ITC connector views", () => {
  it("never include the value of a key or token field", () => {
    const row = {
      on: true, hasSecret: true, lastRunAt: new Date(), lastOkAt: null, lastError: null,
      settings: { flavor: "dc", siteUrl: "https://jira.acme.example", projectKey: "NUP", epicTypeId: "10", stepTypeId: "11", token: SECRET, secretSealed: SECRET },
    };
    const jira = jiraBlockView(row, true);
    const ai = aiBlockView({ choice: "azure-openai", region: "eu", model: "m", endpoint: "https://x.example", deployment: null, ...({ key: SECRET } as object) }, true, true);
    expect(JSON.stringify(jira)).not.toContain(SECRET);
    expect(JSON.stringify(ai)).not.toContain(SECRET);
    expect(jira.token).toBe("set");
    expect(ai.key).toBe("set");
    expect(jiraBlockView(null, true).token).toBe("not set");
    expect(aiBlockView({ choice: "off", region: "eu", model: "", endpoint: null, deployment: null }, false, true).key).toBe("not set");
  });

  it("shows Microsoft 365 as a count and a time, with no name or email", () => {
    const v = m365BlockView({ on: true, connected: 3, lastSearchAt: new Date("2026-11-01T10:00:00Z"), microsoft: true, vault: true });
    expect(v).toEqual({ on: true, connected: 3, lastSearchAt: "2026-11-01T10:00:00.000Z", microsoft: true, vault: true });
    expect(Object.keys(v).sort()).toEqual(["connected", "lastSearchAt", "microsoft", "on", "vault"]);
    expect(JSON.stringify(v)).not.toMatch(/@/);
  });

  it("holds the directory run as plain facts", () => {
    const v = directoryBlockView({ on: true, source: "graph", lastRunAt: new Date("2026-11-02T00:00:00Z"), lastError: null });
    expect(v).toMatchObject({ on: true, source: "graph", lastRunAt: "2026-11-02T00:00:00.000Z", lastError: null, credentials: false });
  });

  it("accepts Data Center with a base URL and a token and no email", () => {
    const form = readJiraForm({ flavor: "dc", siteUrl: "https://jira.acme.example", email: "", token: SECRET, projectKey: "NUP", epicTypeId: "10", stepTypeId: "11" });
    const parsed = settingsFromForm(form);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parseJiraSettings(parsed.settings).ok).toBe(true);
      expect(JSON.stringify(parsed.settings)).not.toContain(SECRET);
    }
  });
});
