// The stage card on Settings -> Company (Kevin on #378): which stage the company is in and what that
// means, with a way into Setup. Shown only while setup is open; once setup is done it goes away.
// Pure: the stage and the setup step in, the card or null out.
import { isStage, type Stage } from "@/features/admin/stages";
import type { MessageKey } from "@/i18n";
import type { SetupStep } from "./sections";

export type StageCard = { stage: Stage; label: MessageKey; line: MessageKey };

const LABEL: Record<Stage, MessageKey> = {
  demo: "settingsCompany.stageDemo", sandbox: "settingsCompany.stageSandbox",
  pilot: "settingsCompany.stagePilot", live: "settingsCompany.stageLive",
};
const LINE: Record<Stage, MessageKey> = {
  demo: "settingsCompany.stageDemoLine", sandbox: "settingsCompany.stageSandboxLine",
  pilot: "settingsCompany.stagePilotLine", live: "settingsCompany.stageLiveLine",
};

/** The card, or null when setup is done (or the stage is unknown). */
export function stageCard(stage: string, step: SetupStep): StageCard | null {
  if (step === "done" || !isStage(stage)) return null;
  return { stage, label: LABEL[stage], line: LINE[stage] };
}
