import { describe, expect, it } from "vitest";
import { aiStatus, directoryStatus, jiraStatus, m365Status } from "@/features/connectors/status";

describe("ITC connector status", () => {
  it("Jira and the directory: off wins over an old error", () => {
    expect(jiraStatus({ on: false, lastError: "401" })).toBe("off");
    expect(jiraStatus({ on: true, lastError: "401" })).toBe("error");
    expect(jiraStatus({ on: true, lastError: null })).toBe("on");
    expect(directoryStatus({ on: true, lastError: "timeout" })).toBe("error");
    expect(directoryStatus({ on: false, lastError: null })).toBe("off");
  });

  it("Microsoft 365 needs sign-in and the vault first", () => {
    expect(m365Status({ on: true, microsoft: false, vault: true })).toBe("needs");
    expect(m365Status({ on: false, microsoft: true, vault: false })).toBe("needs");
    expect(m365Status({ on: true, microsoft: true, vault: true })).toBe("on");
    expect(m365Status({ on: false, microsoft: true, vault: true })).toBe("off");
  });

  it("the AI provider needs a key only for hosted providers", () => {
    expect(aiStatus({ choice: "off", key: "not set", vault: true })).toBe("off");
    expect(aiStatus({ choice: "mock", key: "not set", vault: true })).toBe("off");
    expect(aiStatus({ choice: "bedrock", key: "not set", vault: true })).toBe("on");
    expect(aiStatus({ choice: "azure-openai", key: "not set", vault: true })).toBe("needs");
    expect(aiStatus({ choice: "openai-compatible", key: "set", vault: false })).toBe("needs");
    expect(aiStatus({ choice: "azure-openai", key: "set", vault: true })).toBe("on");
  });
});
