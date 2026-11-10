// May a model be called for this company, for this purpose, right now? Pure, fail closed; every
// "no" says in plain words which switch is missing (docs/plans AIP D6).
//
//   no database  the local demo: the mock only, and only in a demo stage.
//   demo stage   our made-up content: on, with the settings.
//   real stages  the choice must not be off; anything but the mock needs the signed data-processing
//                agreement; assist needs the assistant switch, routing needs aiRouting.
//   every stage  a real model is not called once the month's budget is used up (budget.ts, decision Q7.3);
//                the callers' fallbacks answer and the rest of the app goes on. The mock is spared only for the
//                assistant, which it answers itself; with the mock chosen the brain's purposes still call the
//                brain's own model (server/brain.ts llmFor), and that is counted and capped like any other.
import { policyFor } from "@/features/admin/stages";
import { capReached, type AiBudget } from "./budget";
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
  /** The month's cap and spend (lib/db/ai-usage.ts loadAiBudget); null only where there is no database to count in. */
  budget: Pick<AiBudget, "capEur" | "spentEur"> | null;
}): AiGate {
  const demo = policyFor(a.stage).demoData;
  // "off" already has its own answer; the mock costs nothing where it answers itself.
  const free = a.settings.choice === "off" || (a.settings.choice === "mock" && a.purpose === "assist");
  const usedUp = a.budget !== null && !free && capReached(a.budget);
  const USED_UP: AiGate = { on: false, why: "This month's AI budget for this company is used up." };
  if (!a.hasDatabase) {
    return demo ? { on: true, settings: { ...a.settings, choice: "mock" } } : { on: false, why: "The assistant needs the database for its audit trail." };
  }
  if (demo) return usedUp ? USED_UP : { on: true, settings: a.settings };
  if (a.settings.choice === "off") return { on: false, why: "AI is switched off for this company." };
  if (a.purpose === "assist" && !a.assistantOn) return { on: false, why: "The assistant is switched off for this company." };
  if (a.purpose === "routing" && !a.aiRouting) return { on: false, why: "AI routing is switched off for this company." };
  if (a.settings.choice !== "mock" && !a.dpaSignedAt) return { on: false, why: "The assistant waits for the data-processing agreement." };
  if (usedUp) return USED_UP;
  return { on: true, settings: a.settings };
}
