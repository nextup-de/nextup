"use client";
// The away card on the profile (plan OVL, D19): the person's own current or next absence with End, the dialog to set one, and - after a return - the cases the
// clock handed on while they were away that nobody has touched since, each with Take back. Hidden in the demo: the clock does not fire there (D8).
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { SectionCard } from "@/components/ui/elements";
import { takeBackable } from "@/features/overload/away";
import { currentOrNextSpan, mayTakeBack } from "@/features/overload/rights";
import { useT } from "@/i18n/client";
import { endAway, takeBack } from "@/server/actions/overload";
import styles from "./AwayCard.module.css";
import { AwayDialog } from "./AwayDialog";

export function AwayCard() {
  const t = useT();
  const router = useRouter();
  const { serverMode, actorUserId, S, log, f, tenant } = useDemo();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!serverMode || actorUserId === null) return null;
  const span = currentOrNextSpan(S, actorUserId, S.day);
  // The reduced state keeps what changes a case; the log knows about a comment too, so both decide (D19).
  const back = takeBackable(S, actorUserId, S.day).filter((c) => mayTakeBack({ userId: actorUserId }, c.id, S, S.day, log.events).ok);
  const act = (run: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      const res = await run();
      if (res.ok) { setError(null); router.refresh(); } else setError(res.error);
    });
  return (
    <SectionCard title={t("overload.away.title")} name="away">
      <div className={styles.stack} data-testid="away-card">
        <p className={styles.lede}>{t("overload.away.lede")}</p>
        {span ? (
          <div className={styles.now}>
            <span data-testid="away-now">{t("overload.away.now", { date: f(span.to) })}</span>
            <button type="button" className={styles.button} disabled={pending} onClick={() => act(() => endAway({ slug: tenant.slug, awayId: span.awayId }))} data-testid="away-end">{t("overload.away.end")}</button>
          </div>
        ) : null}
        {open ? <AwayDialog forUserId={actorUserId} onDone={() => { setOpen(false); router.refresh(); }} /> : (
          <div><button type="button" className={styles.button} onClick={() => setOpen(true)} data-testid="away-open">{t("overload.away.save")}</button></div>
        )}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <h3 className={styles.sub}>{t("overload.away.takeBackTitle")}</h3>
        {back.length === 0 ? <p className={styles.none} data-testid="away-takeback-none">{t("overload.away.takeBackNone")}</p> : (
          <>
            <p className={styles.lede}>{t("overload.away.takeBackLede")}</p>
            <ul className={styles.list} data-testid="away-takeback">
              {back.map((c) => (
                <li key={c.id} className={styles.item}>
                  <span>{c.title}</span>
                  <button type="button" className={styles.button} disabled={pending} data-testid={`away-takeback-${c.id}`}
                    onClick={() => start(async () => {
                      const res = await takeBack({ slug: tenant.slug, caseIds: [c.id] });
                      if (res.done.includes(c.id)) { setError(null); router.refresh(); } else setError(res.error ?? t(res.refused[0]?.key ?? "overload.err.nothing"));
                    })}>{t("overload.away.takeBack")}</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </SectionCard>
  );
}
