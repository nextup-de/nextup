"use client";
// The cost estimate of a case (plan GAT, D18): the desk, the review seat, the draft's lead and managers write whole euros and how they got there; the
// desk and the review seat are told when it is above the fast lane that approvals are likely after a yes (D12). Everyone else sees nothing of it.
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { caseApprovalView } from "@/features/approvals/case-view";
import { validCost } from "@/features/approvals/rights";
import { COST_BASIS_MAX } from "@/features/approvals/types";
import { caseActions } from "@/features/cases/case-actions";
import type { ReducedCase } from "@/features/cases/reducer";
import { useT } from "@/i18n/client";
import dash from "@/components/dashboard/shared/CaseDetailView.module.css";
import styles from "./Panel.module.css";

export function CostField({ c }: { c: ReducedCase }) {
  const { S, me, role, act, showToast, locale } = useDemo();
  const t = useT();
  const can = caseActions(c, me, role, S);
  const view = caseApprovalView(c, S, me);
  const [eur, setEur] = useState(c.cost ? String(c.cost.eur) : "");
  const [basis, setBasis] = useState(c.cost?.basis ?? "");
  // Only who may write it, or who sits on the desk or the review seat and is told about it, sees the cost.
  if (!can.cost && !(view.cost !== null && view.flag)) return null;
  const money = (n: number) => `€${new Intl.NumberFormat(locale).format(n)}`;
  const amount = eur.trim() === "" ? Number.NaN : Number(eur);
  const ok = validCost(amount, basis.trim());
  const save = () => { if (!ok) return; act.cost(c.id, amount, basis.trim()); showToast(t("approvals.costSave")); };
  return (
    <section className={styles.block} aria-label={t("approvals.cost")} data-testid="case-cost">
      <span className={styles.blockTitle}>{t("approvals.cost")}</span>
      {view.cost !== null && <p className={styles.blockText} data-testid="case-cost-line">{money(view.cost.eur)}{view.cost.basis ? ` · ${view.cost.basis}` : ""}</p>}
      {view.flag && view.cost !== null && (
        <p className={styles.flag} data-testid="case-cost-flag">{t("approvals.flagApprovals", { eur: money(view.cost.eur - S.rules.fastLaneEur) })}</p>
      )}
      {can.cost && (
        <div className={styles.row} role="group" aria-label={t("approvals.cost")}>
          <input className={styles.field} type="number" inputMode="numeric" min={0} step={1} value={eur} onChange={(e) => setEur(e.target.value)}
            aria-label={t("approvals.costEur")} placeholder={t("approvals.costEur")} data-testid="case-cost-eur" />
          <input className={styles.field} value={basis} maxLength={COST_BASIS_MAX} onChange={(e) => setBasis(e.target.value)}
            aria-label={t("approvals.costBasis")} placeholder={t("approvals.costBasis")} data-testid="case-cost-basis" />
          <button type="button" className={dash.primary} disabled={!ok} onClick={save} data-testid="case-cost-save">{t("approvals.costSave")}</button>
        </div>
      )}
    </section>
  );
}
