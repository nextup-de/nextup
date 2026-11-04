import { describe, expect, it } from "vitest";
import { stageCard } from "@/features/settings/stage-card";

describe("stage card on Company", () => {
  it("shows while setup is open, with the stage's own line", () => {
    expect(stageCard("sandbox", "units")).toEqual({ stage: "sandbox", label: "settingsCompany.stageSandbox", line: "settingsGoLive.sandboxLine" });
    expect(stageCard("live", "company")?.line).toBe("settingsCompany.stageLiveLine");
  });

  it("goes away once setup is done, and for an unknown stage", () => {
    expect(stageCard("sandbox", "done")).toBeNull();
    expect(stageCard("moon", "units")).toBeNull();
  });
});
