"use client";
import type { ReducedProject } from "@/features/projects/types";
import type { JiraRow } from "@/features/projects/views";
import { StepDetail } from "../StepDetail";

export function StepPanel({ p, stepId, jira, onClose }: {
  p: ReducedProject; stepId: string; jira: JiraRow; onClose: () => void; draftComment?: string;
}) {
  const step = p.steps.find((s) => s.id === stepId);
  return step ? <StepDetail key={step.id} p={p} s={step} jira={jira} onClose={onClose} /> : null;
}
