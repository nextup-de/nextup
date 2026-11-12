// A template step's role (lead, sponsor, team) as the message key the board shows on the card (SET-U2, F6/D16).
import type { MessageKey } from "@/i18n";
import type { Step } from "./types";

/** The message key of the step's role, or null for a step without one (added by hand, or a legacy step). */
export function stepRoleLabel(step: Step): MessageKey | null {
  switch (step.role) {
    case "lead": return "projects.stepRoleLead";
    case "sponsor": return "projects.stepRoleSponsor";
    case "team": return "projects.stepRoleTeam";
    default: return null;
  }
}
