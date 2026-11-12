// Plan SET, SET-U2: a template step shows its role on the board.
import { describe, expect, it } from "vitest";
import { stepRoleLabel } from "@/features/projects/step-role";
import { translate } from "@/i18n";
import type { Step } from "@/features/projects/types";

const step = (role?: Step["role"]): Step => ({
  id: "s1", text: "Do it", owner: null, dueDay: null, column: "todo", why: "", note: "", addedDay: 0, by: "", movedDay: 0,
  startedDay: null, doneDay: null, external: null, ...(role ? { role } : {}),
});

describe("SET step role", () => {
  it("gives the message key of each role", () => {
    expect(stepRoleLabel(step("lead"))).toBe("projects.stepRoleLead");
    expect(stepRoleLabel(step("sponsor"))).toBe("projects.stepRoleSponsor");
    expect(stepRoleLabel(step("team"))).toBe("projects.stepRoleTeam");
  });

  it("gives null for a step without a role", () => {
    expect(stepRoleLabel(step())).toBeNull();
  });

  it("has the labels in German and English", () => {
    expect(translate("en", "projects.stepRoleLead")).toBe("Lead");
    expect(translate("de", "projects.stepRoleLead")).toBe("Leitung");
    expect(translate("en", "projects.stepRoleSponsor")).toBe("Sponsor");
    expect(translate("de", "projects.stepRoleTeam")).toBe("Team");
  });
});
