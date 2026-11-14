"use client";

import { useId, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { ReducedProject, Step } from "@/features/projects/types";
import { useT } from "@/i18n/client";
import { useSend } from "../parts";

/** Reason-only stand-in; STP-C1 adds the waiting-on picker without changing these props. */
export function MarkBlockedForm({ p, step, onDone, onCancel }: {
  p: ReducedProject; step: Step; onDone: () => void; onCancel: () => void;
}) {
  const { act } = useDemo();
  const send = useSend(p);
  const t = useT();
  const id = useId();
  const [why, setWhy] = useState(step.why);
  return <form aria-label={t("projectSteps.blockedTitle")} onKeyDown={(e) => {
    if (e.key === "Escape") { e.preventDefault(); onCancel(); }
  }} onSubmit={(e) => {
    e.preventDefault();
    const reason = why.trim();
    if (send("project.step.moved", { stepId: step.id, to: "blocked", why: reason }, () => act.project.moveStep(p.id, step.id, "blocked", reason))) onDone();
  }}>
    <label htmlFor={id}>{t("projectSteps.blockedReason")}</label>
    <textarea id={id} className="nh-input" value={why} onChange={(e) => setWhy(e.target.value)} required maxLength={400} />
    <button type="button" className="nh-btn" onClick={onCancel}>{t("projectSteps.cancel")}</button>
    <button type="submit" className="nh-btn nh-btn-primary" disabled={!why.trim()}>{t("projectSteps.markBlocked")}</button>
  </form>;
}
