// May a model be called for this company, for this purpose, right now? Pure, fail closed; every
// "no" says in plain words which switch is missing (docs/plans AIP D6).
//
//   no database  the local demo: the mock only, and only in a demo stage.
//   demo stage   our made-up content: on, with the settings.
//   real stages  the choice must not be off; anything but the mock needs the signed data-processing
//                agreement; assist needs the assistant switch, routing needs aiRouting.
import { policyFor } from "@/features/admin/stages";
import type { AiSettings } from "./settings";

export type AiPurpose = "assist" | "routing" | "coach" | "brain";
export type AiGate = { on: true; settings: AiSettings } | { on: false; why: string };

export function aiGate(a: {
  stage: string;
  hasDatabase: boolean;
  settings: AiSettings;
  dpaSignedAt: Date | null;
  purpose: AiPurpose;
  assistantOn: boolean;
  aiRouting: boolean;
}): AiGate {
  const demo = policyFor(a.stage).demoData;
  if (!a.hasDatabase) {
    return demo ? { on: true, settings: { ...a.settings, choice: "mock" } } : { on: false, why: "The assistant needs the database for its audit trail." };
  }
  if (demo) return { on: true, settings: a.settings };
  if (a.settings.choice === "off") return { on: false, why: "AI is switched off for this company." };
  if (a.purpose === "assist" && !a.assistantOn) return { on: false, why: "The assistant is switched off for this company." };
  if (a.purpose === "routing" && !a.aiRouting) return { on: false, why: "AI routing is switched off for this company." };
  if (a.settings.choice !== "mock" && !a.dpaSignedAt) return { on: false, why: "The assistant waits for the data-processing agreement." };
  return { on: true, settings: a.settings };
}
