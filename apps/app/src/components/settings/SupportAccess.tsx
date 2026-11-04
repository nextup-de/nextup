"use client";
// Settings -> Support access (SEC-S1, D7): the Now card, the grant / extend dialog, the code shown once,
// End now with a confirm step, the break-glass line and the log. Every change calls settings/support.ts.
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { SUPPORT_GRANT_CHOICES, SUPPORT_GRANT_DEFAULT_HOURS, SUPPORT_REASON_MAX } from "@/features/admin/support-code";
import { useFormat, useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { endSupportAction, extendSupportAction, grantSupportAction } from "@/server/actions/settings/support";
import styles from "./SupportAccess.module.css";

export type SupportGrantView = {
  /** ISO. */
  until: string;
  canExtend: boolean;
  grantedByName: string | null;
  grantedAt: string;
  hours: number;
  reason: string | null;
  lastSigninAt: string | null;
};
export type SupportLogView = {
  id: string;
  at: string;
  action: string;
  who: "admin" | "console" | "break-glass" | "support" | "system";
  /** The company member's name when `who` is admin. */
  name: string | null;
  hours: number | null;
  until: string | null;
};
type Props = {
  slug: string;
  grant: SupportGrantView | null;
  /** ISO, only while the server's window is open. */
  breakGlassUntil: string | null;
  log: SupportLogView[];
  newerHref: string | null;
  olderHref: string | null;
};

const hoursKey = (h: number) => `settingsSupport.hours${h}` as MessageKey;
const WHO: Record<SupportLogView["who"], MessageKey> = {
  admin: "settingsSupport.whoFormer",
  console: "settingsSupport.whoConsole",
  "break-glass": "settingsSupport.whoBreakGlass",
  support: "settingsSupport.whoSupport",
  system: "settingsSupport.whoSystem",
};

export function SupportAccess({ slug, grant, breakGlassUntil, log, newerHref, olderHref }: Props) {
  const t = useT();
  const f = useFormat();
  const [dialog, setDialog] = useState<"grant" | "extend" | null>(null);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const time = (iso: string) => f.date(iso, "dateTime");

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const hours = Number(form.get("hours"));
    const reason = String(form.get("reason") ?? "");
    const kind = dialog;
    start(async () => {
      if (kind === "grant") {
        const r = await grantSupportAction(slug, { hours, reason });
        if (!r.ok) return setError(r.error);
        setCode(r.code);
        setNotice(t("settingsSupport.toastGranted", { time: time(r.until) }));
      } else {
        const r = await extendSupportAction(slug, { hours });
        if (!r.ok) return setError(r.error);
        setNotice(t("settingsSupport.toastExtended", { time: time(r.until) }));
      }
      setError(null);
      setDialog(null);
    });
  };
  const endNow = () =>
    start(async () => {
      const r = await endSupportAction(slug);
      if (!r.ok) return setError(r.error);
      setError(null);
      setEnding(false);
      setNotice(t("settingsSupport.toastEnded"));
    });

  const what = (r: SupportLogView): string => {
    if (r.action === "audit.access.support_granted")
      return r.hours ? t("settingsSupport.logGranted", { duration: t(hoursKey(r.hours)) }) : t("settingsSupport.logGrantedPlain");
    if (r.action === "audit.access.support_extended") return r.until ? t("settingsSupport.logExtended", { time: time(r.until) }) : t("settingsSupport.logExtended", { time: "" });
    if (r.action === "audit.access.support_revoked") return t("settingsSupport.logEnded");
    return t("settingsSupport.logSignin");
  };
  const who = (r: SupportLogView) => (r.who === "admin" ? r.name ?? t(WHO.admin) : t(WHO[r.who]));
  const durationLabel = (h: number) => ((SUPPORT_GRANT_CHOICES as readonly number[]).includes(h) ? t(hoursKey(h)) : `${h} h`);

  return (
    <section className={styles.wrap} data-testid="settings-support">
      <div className={styles.head}>
        <h2 className={styles.title}>{t("settingsSupport.nowTitle")}</h2>
        {dialog === null ? (
          <button className="nh-btn nh-btn-primary nh-btn-sm" type="button" data-testid="settings-support-open"
            disabled={Boolean(grant && !grant.canExtend)}
            onClick={() => { setError(null); setNotice(null); setDialog(grant ? "extend" : "grant"); }}>
            {t(grant ? "settingsSupport.extend" : "settingsSupport.grant")}
          </button>
        ) : null}
      </div>
      {notice ? <p className="nh-hint" role="status" data-testid="settings-support-notice">{notice}</p> : null}
      {error && !dialog ? <p className="nh-error" role="alert" data-testid="settings-support-error">{t(error)}</p> : null}

      {code ? (
        <div className={styles.shown} role="status" data-testid="settings-support-shown">
          <strong>{t("settingsSupport.shownTitle")}</strong>
          <code className={styles.mono} data-testid="settings-support-code">{code}</code>
          <span className="nh-hint">{t("settingsSupport.shownHint")}</span>
          <span className={styles.buttons}>
            <button className="nh-btn nh-btn-sm" type="button" data-testid="settings-support-shown-done" onClick={() => setCode(null)}>{t("settingsSupport.shownDone")}</button>
          </span>
        </div>
      ) : null}

      <div className={styles.card} data-testid="settings-support-now">
        {grant ? (
          <>
            <span className={`${styles.badge} ${styles.open}`}>{t("settingsSupport.openBadge", { time: time(grant.until) })}</span>
            <p>{t("settingsSupport.openLine")}</p>
            <dl className={styles.facts}>
              <dt>{t("settingsSupport.grantedBy")}</dt>
              <dd>{[grant.grantedByName, time(grant.grantedAt)].filter(Boolean).join(", ")}</dd>
              <dt>{t("settingsSupport.forLabel")}</dt>
              <dd>{durationLabel(grant.hours)}</dd>
              {grant.reason ? (<><dt>{t("settingsSupport.reasonLabel")}</dt><dd>{grant.reason}</dd></>) : null}
              <dt>{t("settingsSupport.usedLabel")}</dt>
              <dd>{grant.lastSigninAt ? t("settingsSupport.signedInAt", { time: time(grant.lastSigninAt) }) : t("settingsSupport.notUsed")}</dd>
            </dl>
            {ending ? (
              <div className={styles.buttons} role="alert">
                <span>{t("settingsSupport.endAsk")}</span>
                <button className="nh-btn nh-btn-sm" type="button" disabled={pending} data-testid="settings-support-end-yes" onClick={endNow}>{t("settingsSupport.endYes")}</button>
                <button className="nh-btn nh-btn-ghost nh-btn-sm" type="button" onClick={() => setEnding(false)}>{t("settingsSupport.cancel")}</button>
              </div>
            ) : (
              <button className={`nh-btn nh-btn-sm ${styles.end}`} type="button" data-testid="settings-support-end" onClick={() => setEnding(true)}>{t("settingsSupport.end")}</button>
            )}
          </>
        ) : (
          <>
            <span className={styles.badge}>{t("settingsSupport.noneBadge")}</span>
            <p>{t("settingsSupport.noneLine")}</p>
          </>
        )}
        <p className="nh-hint" data-testid="settings-support-bg">
          {breakGlassUntil ? t("settingsSupport.bgOpen", { time: time(breakGlassUntil) }) : t("settingsSupport.bgClosed")}
        </p>
      </div>

      {dialog ? (
        <form className={styles.dialog} role="dialog" aria-label={t(dialog === "grant" ? "settingsSupport.grantTitle" : "settingsSupport.extendTitle")} onSubmit={submit} data-testid="settings-support-dialog">
          <h3 className={styles.title}>{t(dialog === "grant" ? "settingsSupport.grantTitle" : "settingsSupport.extendTitle")}</h3>
          <fieldset className={styles.seg}>
            <legend className="nh-label">{t(dialog === "grant" ? "settingsSupport.forField" : "settingsSupport.extendField")}</legend>
            {SUPPORT_GRANT_CHOICES.map((h) => (
              <label key={h}><input type="radio" name="hours" value={h} defaultChecked={h === SUPPORT_GRANT_DEFAULT_HOURS} data-testid={`settings-support-hours-${h}`} /> {t(hoursKey(h))}</label>
            ))}
          </fieldset>
          {dialog === "grant" ? (
            <label className="nh-field">
              <span className="nh-label">{t("settingsSupport.reasonField")}</span>
              <input className="nh-input" name="reason" required maxLength={SUPPORT_REASON_MAX} data-testid="settings-support-reason" />
              <span className="nh-hint">{t("settingsSupport.reasonHelp")}</span>
            </label>
          ) : null}
          <p className="nh-hint">{t(dialog === "grant" ? "settingsSupport.grantText" : "settingsSupport.extendText")}</p>
          {error ? <p className="nh-error" role="alert" data-testid="settings-support-error">{t(error)}</p> : null}
          <span className={styles.buttons}>
            <button className="nh-btn nh-btn-primary" type="submit" disabled={pending} data-testid="settings-support-submit">{t(dialog === "grant" ? "settingsSupport.submitGrant" : "settingsSupport.submitExtend")}</button>
            <button className="nh-btn nh-btn-ghost" type="button" onClick={() => setDialog(null)}>{t("settingsSupport.cancel")}</button>
          </span>
        </form>
      ) : null}

      <div className={styles.card} data-testid="settings-support-log">
        <h2 className={styles.title}>{t("settingsSupport.logTitle")}</h2>
        {log.length === 0 ? (
          <p className="nh-hint" data-testid="settings-support-empty">{t("settingsSupport.logEmpty")}</p>
        ) : (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead><tr><th>{t("settingsSupport.colWhen")}</th><th>{t("settingsSupport.colWhat")}</th><th>{t("settingsSupport.colWho")}</th></tr></thead>
              <tbody>
                {log.map((r) => (
                  <tr key={r.id} data-testid="settings-support-log-row"><td>{time(r.at)}</td><td>{what(r)}</td><td>{who(r)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {newerHref || olderHref ? (
          <div className={styles.pager}>
            {newerHref ? <Link className="nh-btn nh-btn-ghost nh-btn-sm" href={newerHref}>{t("settingsSupport.newer")}</Link> : null}
            {olderHref ? <Link className="nh-btn nh-btn-ghost nh-btn-sm" href={olderHref}>{t("settingsSupport.older")}</Link> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
