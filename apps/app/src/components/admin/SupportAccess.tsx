"use client";
import { useState, useTransition } from "react";
import { openSupportAccess, revokeSupportAccess } from "@/server/actions/support-access";
import { useFormat, useT } from "@/i18n/client";
import styles from "@/app/admin/admin.module.css";

export type SupportAccessView = {
  /** When the open grant ends (ISO), or null when none is open. */
  activeUntil: string | null;
  /** Last sign-in times (ISO), newest first. */
  signins: string[];
  /** A support session only reads; the buttons are hidden. */
  readOnly: boolean;
};

export function SupportAccess({ view }: { view: SupportAccessView }) {
  const t = useT();
  const f = useFormat();
  const [pending, start] = useTransition();
  const [issued, setIssued] = useState<{ code: string; until: string } | null>(null);
  const [denied, setDenied] = useState(false);
  const until = issued?.until ?? view.activeUntil;

  const open = () =>
    start(async () => {
      const r = await openSupportAccess();
      setDenied(!r.ok);
      if (r.ok) setIssued({ code: r.supportCode, until: r.validUntil });
    });
  const revoke = () =>
    start(async () => {
      const r = await revokeSupportAccess();
      setDenied(!r.ok);
      if (r.ok) setIssued(null);
    });

  return (
    <>
      <section className={styles.card} data-testid="console-support-intro">
        <h1>{t("adminSupport.title")}</h1>
        <p className="nh-hint">{t("adminSupport.intro")}</p>
        <p data-testid="console-support-state" role="status">
          {until ? t("adminSupport.active", { time: f.date(until, "dateTime") }) : t("adminSupport.inactive")}
        </p>
        {view.readOnly ? (
          <p className="nh-hint">{t("adminSupport.viewerReadOnly")}</p>
        ) : (
          <div className={styles.grid}>
            <div>
              <button className="nh-btn nh-btn-primary" type="button" disabled={pending} onClick={open} data-testid="console-support-open">
                {until ? t("adminSupport.openAgain") : t("adminSupport.open")}
              </button>{" "}
              {until ? (
                <button className="nh-btn" type="button" disabled={pending} onClick={revoke} data-testid="console-support-revoke">
                  {t("adminSupport.revoke")}
                </button>
              ) : null}
            </div>
            {denied ? <p className={styles.error} role="alert">{t("adminSupport.notAllowed")}</p> : null}
          </div>
        )}
      </section>
      {issued ? (
        <section className={styles.card} data-testid="console-support-code-card">
          <h2>{t("adminSupport.codeTitle")}</h2>
          <p><code data-testid="console-support-code">{issued.code}</code></p>
          <p className="nh-hint">{t("adminSupport.validUntil", { time: f.date(issued.until, "dateTime") })}</p>
          <p className="nh-hint">{t("adminSupport.codeOnce")}</p>
        </section>
      ) : null}
      <section className={styles.card} data-testid="console-support-signins">
        <h2>{t("adminSupport.signinsTitle")}</h2>
        {view.signins.length === 0 ? (
          <p className="nh-hint">{t("adminSupport.signinsNone")}</p>
        ) : (
          <ul>
            {view.signins.map((s) => (
              <li key={s}>{f.date(s, "dateTime")}</li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
