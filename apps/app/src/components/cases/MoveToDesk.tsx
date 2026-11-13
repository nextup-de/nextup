"use client";
// "Move to a desk" for a manager on an open or asked case (plan NOR, D21): pick a route, one case.override that names the route it
// was on and the one chosen. The answer date stays.
import { useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { caseActions } from "@/features/cases/case-actions";
import type { ReducedCase } from "@/features/cases/reducer";
import { useT } from "@/i18n/client";
import styles from "@/components/dashboard/shared/CaseDetailView.module.css";

export function MoveToDesk({ c }: { c: ReducedCase }) {
  const { S, me, role, act, seed, showToast } = useDemo();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  if (!caseActions(c, me, role, S).moveToDesk) return null;
  const routes = seed.routes.filter((r) => r.id !== c.route?.id);
  if (routes.length === 0) return null;

  return (
    <>
      {!open && <button type="button" className={styles.soft} data-testid="case-move-desk" onClick={() => setOpen(true)}>{t("loopCase.moveDesk")}</button>}
      {open && (
        <div className={styles.whyRow} role="group" aria-label={t("loopCase.moveDesk")}>
          <select className={styles.note} value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("loopCase.moveDeskLabel")} autoFocus>
            <option value="">{t("loopCase.moveDeskPick")}</option>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.type}</option>)}
          </select>
          <button type="button" className={styles.primary} disabled={!to} data-testid="case-move-desk-send"
            onClick={() => { act.override(c.id, c.route?.id ?? null, to); setOpen(false); setTo(""); showToast(t("loopCase.moveDesk")); }}>
            {t("loopCase.moveDeskSend")}
          </button>
          <button type="button" className={styles.soft} onClick={() => setOpen(false)}>{t("common.cancel")}</button>
        </div>
      )}
    </>
  );
}
