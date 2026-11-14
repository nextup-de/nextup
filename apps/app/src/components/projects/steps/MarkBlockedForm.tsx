"use client";

import { useId, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { ReducedProject, Step, StepWaitingOnInput } from "@/features/projects/types";
import { blockedValid } from "@/features/projects/step-panel";
import { useT } from "@/i18n/client";
import { useSend } from "../parts";
import { panelPeople } from "./panel/people";
import styles from "./panel/Panel.module.css";

export function MarkBlockedForm({ p, step, onDone, onCancel }: {
  p: ReducedProject; step: Step; onDone: () => void; onCancel: () => void;
}) {
  const ctx = useDemo();
  const { act } = ctx;
  const people = panelPeople(ctx);
  const send = useSend(p);
  const t = useT();
  const id = useId();
  const [why, setWhy] = useState(step.why);
  const [kind, setKind] = useState<StepWaitingOnInput["kind"]>(step.waitingOn?.kind ?? "nobody");
  const [userId, setUserId] = useState(step.waitingOn?.userId ?? "");
  const [name, setName] = useState(step.waitingOn?.name ?? "");
  const waitingOn: StepWaitingOnInput = kind === "person" ? { kind, userId } : kind === "outside" ? { kind, name: name.trim() } : { kind };
  const valid = blockedValid({ why, waitingOn, companyUserIds: people.map((x) => x.userId) });
  return <form className={styles.blocked} aria-label={t("projectSteps.blockedTitle")} onKeyDown={(e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); }
  }} onSubmit={(e) => {
    e.preventDefault();
    if (!valid) return;
    const reason = why.trim();
    if (send("project.step.moved", { stepId: step.id, to: "blocked", why: reason, waitingOn }, () => act.project.moveStep(p.id, step.id, "blocked", reason, undefined, waitingOn))) onDone();
  }}>
    <h3>{t("projectSteps.blockedTitle")}</h3>
    <label htmlFor={id}>{t("projectSteps.blockedReason")}</label>
    <textarea id={id} className="nh-input" value={why} onChange={(e) => setWhy(e.target.value)} required maxLength={400} autoFocus />
    <fieldset>
      <legend className={styles.label}>{t("projectSteps.waitingOn")}</legend>
      <div className={styles.row}>
        {(["person", "outside", "nobody"] as const).map((choice) => <button key={choice} type="button" className="nh-btn nh-btn-sm" aria-pressed={kind === choice} onClick={() => setKind(choice)}>{t(choice === "person" ? "projectSteps.waitingPerson" : choice === "outside" ? "projectSteps.waitingOutside" : "projectSteps.waitingNobody")}</button>)}
      </div>
      {kind === "person" && <label><span className={styles.label}>{t("projectSteps.choosePerson")}</span><select className="nh-input" value={userId} onChange={(e) => setUserId(e.target.value)} required>
        <option value="">{t("projectSteps.choosePerson")}</option>
        {people.map((person) => <option key={person.userId} value={person.userId}>{person.name}</option>)}
      </select></label>}
      {kind === "outside" && <label><span className={styles.label}>{t("projectSteps.outsideName")}</span><input className="nh-input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} /></label>}
    </fieldset>
    <div className={styles.actions}>
      <button type="button" className="nh-btn" onClick={onCancel}>{t("projectSteps.cancel")}</button>
      <button type="submit" className="nh-btn nh-btn-primary" disabled={!valid}>{t("projectSteps.markBlocked")}</button>
    </div>
  </form>;
}
