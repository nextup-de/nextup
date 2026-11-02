// The setup wizard's data (ADM D14). Not a "use server" module: the page and the settings layout
// read the counts on every load, and the step is derived from them, never stored. The wizard has no
// write path of its own; each step's form calls the action named below.
import type { SetupCounts, SetupStep } from "@/features/settings/sections";
import { loadSetupCounts } from "@/lib/db/setup-counts";

/** What exists for the company, as setupStep() reads it. */
export function setupCounts(companyId: string): Promise<SetupCounts> {
  return loadSetupCounts(companyId);
}

export type SetupFormStep = Exclude<SetupStep, "done">;
export const SETUP_FORM_STEPS: readonly SetupFormStep[] = ["company", "units", "roles", "routes", "members"];

/** The action each step's form saves through: a module under src/server/actions and an export of it. */
export const SETUP_STEP_ACTIONS: Record<SetupFormStep, { module: "settings/company" | "settings/org" | "members"; action: string }> = {
  company: { module: "settings/company", action: "saveCompanyAction" },
  units: { module: "settings/org", action: "addUnitAction" },
  roles: { module: "settings/org", action: "addSeatAction" },
  routes: { module: "settings/org", action: "saveRouteAction" },
  members: { module: "members", action: "addMemberAction" },
};
