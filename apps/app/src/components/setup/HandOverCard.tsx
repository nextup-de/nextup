"use client";
// The hand-over on /admin/setup (Q8.6): the customer's IT confirms that it takes the stack over, once the
// server phase is checked. Afterwards it says when and by whom. The state is decided by
// features/settings/hand-over.ts; this only shows it and presses the one button.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { HandOverState } from "@/features/settings/hand-over";
import { formatDate } from "@/i18n/format";
import { useLocale, useT } from "@/i18n/client";
import { confirmHandOverAction } from "@/server/actions/setup-handover";
import s from "./HandOverCard.module.css";

export function HandOverCard({ state }: { state: HandOverState }) {
  const t = useT();
  const locale = useLocale();
  const { refresh } = useRouter();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);

  const confirm = () =>
    start(async () => {
      const r = await confirmHandOverAction();
      setFailed(!r.ok);
      if (r.ok) refresh();
    });

  return (
    <section className={s.card} data-testid="setup-handover" data-state={state.kind} aria-labelledby="setup-handover-title">
      <h2 id="setup-handover-title" className={s.title}>{t("settingsSetupPhases.handOverTitle")}</h2>
      {state.kind === "done" ? (
        <p className={s.done} role="status" data-testid="setup-handover-done">
          {t(state.by === "entra" ? "settingsSetupPhases.lineHandedOverEntra" : "settingsSetupPhases.lineHandedOverStackAdmin", {
            date: formatDate(locale, state.at, "day"),
          })}
        </p>
      ) : (
        <>
          <p className={s.lead}>{t("settingsSetupPhases.handOverLead")}</p>
          {state.kind === "notYet" ? <p className={s.note}>{t("settingsSetupPhases.handOverNotYet")}</p> : null}
          {state.kind === "notYours" ? <p className={s.note}>{t("settingsSetupPhases.handOverNotYours")}</p> : null}
          {state.kind === "ready" ? (
            <div className={s.end}>
              <button className={s.primary} type="button" disabled={pending} onClick={confirm} data-testid="setup-handover-confirm">
                {t("settingsSetupPhases.handOverConfirm")}
              </button>
            </div>
          ) : null}
          {failed ? <p className={s.error} role="alert">{t("settingsSetupPhases.handOverFailed")}</p> : null}
        </>
      )}
    </section>
  );
}
