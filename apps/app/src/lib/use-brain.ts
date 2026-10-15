"use client";
// The brain's steps and metric for a project while it is planned (server/actions/brain.ts,
// features/projects/brain.ts), asked once per page and case. Only with a session behind the page
// (server mode): the local demo has no brain. Null until an answer arrives - and for good when the
// brain is off, slow or wrong, so the page keeps its own offline suggestion from the brief.
import { useEffect, useState } from "react";
import type { PlanProposal } from "@/features/projects/brain";
import { brainPlanAction } from "@/server/actions/brain";

export function useBrainPlan(slug: string, caseId: string | null, on: boolean): PlanProposal | null {
  const key = on && caseId ? slug + ":" + caseId : "";
  const [answer, setAnswer] = useState<{ key: string; plan: PlanProposal | null } | null>(null);
  useEffect(() => {
    if (!key || !caseId) return;
    let gone = false;
    brainPlanAction({ slug, caseId }).then((plan) => { if (!gone) setAnswer({ key, plan }); }, () => undefined);
    return () => { gone = true; };
  }, [key, slug, caseId]);
  return answer && answer.key === key ? answer.plan : null;
}
