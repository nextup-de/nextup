// AIB-K1: the console sets the brain's model next to the assistant's.
import { describe, expect, it } from "vitest";
import { aiSettings, type AiSettings } from "@/features/ai/settings";
import { aiBlockView, cleanBrainModel } from "@/components/admin/connectors/views";
import { adminConnectors } from "@/i18n/messages/adminConnectors";

describe("AIB console", () => {
  it("trims the brain model, caps it at 120 characters, and turns empty into null", () => {
    expect(cleanBrainModel("  anthropic.claude-haiku-5-5 ")).toBe("anthropic.claude-haiku-5-5");
    expect(cleanBrainModel("   ")).toBeNull();
    expect(cleanBrainModel("")).toBeNull();
    expect(cleanBrainModel(undefined)).toBeNull();
    expect(cleanBrainModel(42)).toBeNull();
    expect(cleanBrainModel("m".repeat(300))).toHaveLength(120);
  });

  it.each(["bedrock", "azure-openai", "openai-compatible"] as const)("round-trips the brain model for %s", (choice) => {
    const saved: AiSettings = { choice, region: "eu-central-1", model: "m", endpoint: null, deployment: null, brainModel: cleanBrainModel(" brain-x ") };
    const read = aiSettings({ on: true, settings: saved }, {}, "pilot");
    expect(aiBlockView(read, false, true).brainModel).toBe("brain-x");
    const none = aiSettings({ on: true, settings: { ...saved, brainModel: cleanBrainModel("") } }, {}, "pilot");
    expect(aiBlockView(none, false, true).brainModel).toBe("");
  });

  it("has the label in German and English", () => {
    const m = adminConnectors as unknown as Record<string, Record<string, string>>;
    expect(JSON.stringify(m)).toContain("Model for routing and coach");
    expect(JSON.stringify(m)).toContain("Modell für Zuordnung und Coach");
  });
});
