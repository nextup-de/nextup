"use client";
// The planning run on the case page (plan AGT, D15, D19, D25): under the case, a desk holder or manager asks the agent for a planning draft; the latest
// draft is shown labelled AI to the people who may read it, and the raiser sees only that one exists. What to show is the server's answer (loadPlanAction
// reads the viewer's rights each time); this component holds no rule. A closed gate, the flag off or the demo show nothing, never an error. Everything the
// brain wrote is shown as text, never as markup.
import { useEffect, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import type { PlanDraft } from "@/features/agent/types";
import { useT } from "@/i18n/client";
import { loadPlanAction, requestPlanAction, type PlanData } from "@/server/agent/plan";
import styles from "./CasePlanPanel.module.css";

function Draft({ draft }: { draft: PlanDraft }) {
  const t = useT();
  return (
    <div className={styles.draft} data-testid="plan-draft">
      <span className={styles.ai}>{t("projectAgent.aiLabel")}</span>
      <h3 className={styles.title}>{t("projectAgent.planTitle")}</h3>
      {draft.template && (
        <p className={styles.row}><b>{t("projectAgent.planTemplate")}</b> {draft.template}{draft.templateWhy ? ` · ${draft.templateWhy}` : ""}</p>
      )}
      {draft.steps.length > 0 && (
        <div className={styles.row}><b>{t("projectAgent.planSteps")}</b>
          <ol className={styles.list}>{draft.steps.map((s, i) => <li key={i}>{s.title}{s.role ? ` (${s.role})` : ""}</li>)}</ol>
        </div>
      )}
      {draft.teamRoles.length > 0 && <p className={styles.row}><b>{t("projectAgent.planTeam")}</b> {draft.teamRoles.join(", ")}</p>}
      {draft.metric && (
        <p className={styles.row}><b>{t("projectAgent.planMetric")}</b> {draft.metric.name}{draft.metric.unit ? ` (${draft.metric.unit})` : ""}
          {draft.metric.target !== null ? ` · ${t("projectAgent.planTarget")} ${draft.metric.target}` : ""}</p>
      )}
      <p className={styles.row}>{t("projectAgent.planEffort", { min: draft.effort.minDays, max: draft.effort.maxDays })}</p>
      {draft.risks.length > 0 && <div className={styles.row}><b>{t("projectAgent.planRisks")}</b><ul className={styles.list}>{draft.risks.map((r, i) => <li key={i}>{r}</li>)}</ul></div>}
      {draft.approvals.length > 0 && <div className={styles.row}><b>{t("projectAgent.planApprovals")}</b><ul className={styles.list}>{draft.approvals.map((r, i) => <li key={i}>{r}</li>)}</ul></div>}
    </div>
  );
}

export function CasePlanPanel({ caseId }: { caseId: string }) {
  const { tenant, serverMode, flag } = useDemo();
  const t = useT();
  const slug = tenant.slug;
  const on = serverMode && flag("agent");
  const [data, setData] = useState<PlanData | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // The server decides what this person sees: it is asked again after every run, never on a timer.
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!on) return;
    let gone = false;
    loadPlanAction(slug, caseId).then((d) => { if (!gone) setData(d); }, () => { if (!gone) setData(null); });
    return () => { gone = true; };
  }, [on, slug, caseId, round]);

  if (!on || !data) return null;
  const ask = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await requestPlanAction(slug, caseId, crypto.randomUUID());
      if (!res.ok) setMessage(t(res.key === "planNone" ? "projectAgent.planNone" : res.key === "planWait" ? "projectAgent.planWait" : res.key));
      setRound((n) => n + 1);
    } catch {
      setMessage(t("projectAgent.planNone"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={styles.panel} data-testid="case-plan-panel" aria-busy={busy}>
      {data.panel.button && (
        <div className={styles.ask}>
          <button type="button" className={styles.button} onClick={() => void ask()} disabled={busy}>{t("projectAgent.planButton")}</button>
          <span className={styles.small}>{t("projectAgent.planRunsLeft", { count: data.panel.button.runsLeft })}</span>
        </div>
      )}
      {busy && <p className={styles.small} role="status">{t("projectAgent.planWait")}</p>}
      {message && !busy && <p className={styles.small} role="status">{message}</p>}
      {data.panel.draft === "exists" && <p className={styles.small}>{t("projectAgent.planExists")}</p>}
      {data.panel.draft === "words" && (data.draft ? <Draft draft={data.draft} /> : data.removed ? <p className={styles.small}>{t("projectAgent.removedText")}</p> : null)}
    </section>
  );
}
