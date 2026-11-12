// May a model be called for this company, for this purpose, right now? Pure, fail closed; every
// "no" says in plain words which switch is missing (docs/plans AIP D6).
//
//   no database  the local demo: the mock only, and only in a demo stage.
//   demo stage   our made-up content: on, with the settings.
//   real stages  the choice must not be off; anything but the mock and the model on this stack (`local`) needs
//                the signed data-processing agreement; assist needs the assistant switch, routing needs aiRouting.
//   local        the model on this stack (Q8.4) needs the stack's brain service (stackBrain) wherever there is a
//                database: every call goes there and nothing leaves the stack, so no agreement is asked.
//   every stage  a real model is not called once the month's budget is used up (budget.ts, decision Q7.3), or
//                once its models without a price used their monthly token cap (decision Q7.5); the raise path
//                (budget.ts RAISE_PATH_PURPOSES) goes on to GRACE_PCT of a cap first (decision Q7.4);
//                the callers' fallbacks answer and the rest of the app goes on. The project agent (purpose `agent`, plan AGT, D21)
//                has no switch of its own here (its flag is checked by its callers) and is not on the raise path: it follows
//                the brain's rules and stops at 100 %. The mock is spared only for the
//                assistant, which it answers itself; with the mock chosen the brain's purposes still call the
//                brain's own model (server/brain.ts llmFor), and that is counted and capped like any other.
import { policyFor } from "@/features/admin/stages";
import { GRACE_PCT, onRaisePath, usedUpBy, type GateBudget } from "./budget";
import type { AiSettings } from "./settings";

export type AiPurpose = "assist" | "routing" | "coach" | "brain" | "agent";
export type AiGate = { on: true; settings: AiSettings } | { on: false; why: string };

export function aiGate(a: {
  stage: string;
  hasDatabase: boolean;
  settings: AiSettings;
  dpaSignedAt: Date | null;
  purpose: AiPurpose;
  assistantOn: boolean;
  aiRouting: boolean;
  /** The month's caps and sums (lib/db/ai-usage.ts loadAiBudget); null only where there is no database to count in. */
  budget: GateBudget | null;
  /** This stack runs the brain service (server/brain.ts brainConfigured). Only `local` asks; left out, there is none. */
  stackBrain?: boolean;
}): AiGate {
  const demo = policyFor(a.stage).demoData;
  // Free: the assistant on the mock (the demo stage answers "off" with the mock too), and "off" outside the demo
  // stage, which has its own answer below. In the demo stage the brain's purposes still call the brain's own model
  // under "off" and "mock" alike, so they are counted and capped.
  const noModel = a.settings.choice === "off" || a.settings.choice === "mock";
  const free = (noModel && a.purpose === "assist") || (a.settings.choice === "off" && !demo);
  const grace = onRaisePath(a.purpose);
  const by = a.budget !== null && !free ? usedUpBy(a.budget, grace) : null;
  const usedUp = by !== null;
  const graceWords = grace ? `, the extra ${GRACE_PCT - 100} % for raising ideas included` : "";
  const USED_UP: AiGate = {
    on: false,
    why: by === "tokens"
      ? `This month's AI budget for this company is used up: its models without a price reached their token limit${graceWords}.`
      : `This month's AI budget for this company is used up${graceWords}.`,
  };
  if (!a.hasDatabase) {
    return demo ? { on: true, settings: { ...a.settings, choice: "mock" } } : { on: false, why: "The assistant needs the database for its audit trail." };
  }
  if (a.settings.choice === "local" && !a.stackBrain) {
    return { on: false, why: "The model on this stack is chosen, but this stack runs no brain service." };
  }
  if (demo) return usedUp ? USED_UP : { on: true, settings: a.settings };
  if (a.settings.choice === "off") return { on: false, why: "AI is switched off for this company." };
  if (a.purpose === "assist" && !a.assistantOn) return { on: false, why: "The assistant is switched off for this company." };
  if (a.purpose === "routing" && !a.aiRouting) return { on: false, why: "AI routing is switched off for this company." };
  if (a.settings.choice !== "mock" && a.settings.choice !== "local" && !a.dpaSignedAt) return { on: false, why: "The assistant waits for the data-processing agreement." };
  if (usedUp) return USED_UP;
  return { on: true, settings: a.settings };
}
