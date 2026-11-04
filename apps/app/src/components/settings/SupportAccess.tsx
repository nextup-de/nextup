"use client";
// Settings -> Support access (SEC-S1, D7): the Now card, the grant / extend dialog, the code shown once,
// End now with a confirm step, the break-glass line and the log. Every change calls settings/support.ts.
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { Banner, ConfirmDialog, DataTable, EditDrawer, PersonFace, SecretOnce, SectionCard } from "@/components/ui/elements";
import { SUPPORT_GRANT_CHOICES, SUPPORT_GRANT_DEFAULT_HOURS, SUPPORT_REASON_MAX } from "@/features/admin/support-code";
import { useFormat, useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { endSupportAction, extendSupportAction, grantSupportAction } from "@/server/actions/settings/support";
import s from "./settings.module.css";
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
const FORM = "support-form";

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
      setEnding(false);
      if (!r.ok) return setError(r.error);
      setError(null);
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
  const person = (name: string | null) => (name ? <span className={styles.person}><PersonFace name={name} size="sm" />{name}</span> : null);

  return (
    <div className={s.page} data-testid="settings-support">
      <div data-testid="settings-support-now">
        <SectionCard
          name="now"
          title={t("settingsSupport.nowTitle")}
          action={dialog === null ? (
            <button className={s.save} type="button" data-testid="settings-support-open"
              disabled={Boolean(grant && !grant.canExtend)}
              onClick={() => { setError(null); setNotice(null); setDialog(grant ? "extend" : "grant"); }}>
              {t(grant ? "settingsSupport.extend" : "settingsSupport.grant")}
            </button>
          ) : null}
        >
          {notice ? <div role="status" data-testid="settings-support-notice"><Banner tone="info">{notice}</Banner></div> : null}
          {error && !dialog ? <div data-testid="settings-support-error"><Banner tone="error">{t(error)}</Banner></div> : null}
          {grant ? (
            <>
              <span className={styles.badge} data-open="">{t("settingsSupport.openBadge", { time: time(grant.until) })}</span>
              <p className={styles.line}>{t("settingsSupport.openLine")}</p>
              <dl className={`${s.well} ${styles.facts}`}>
                <div className={s.wellRow}>
                  <dt>{t("settingsSupport.grantedBy")}</dt>
                  <dd>{grant.grantedByName ? <>{person(grant.grantedByName)}, </> : null}{time(grant.grantedAt)}</dd>
                </div>
                <div className={s.wellRow}><dt>{t("settingsSupport.forLabel")}</dt><dd>{durationLabel(grant.hours)}</dd></div>
                {grant.reason ? <div className={s.wellRow}><dt>{t("settingsSupport.reasonLabel")}</dt><dd>{grant.reason}</dd></div> : null}
                <div className={s.wellRow}>
                  <dt>{t("settingsSupport.usedLabel")}</dt>
                  <dd>{grant.lastSigninAt ? t("settingsSupport.signedInAt", { time: time(grant.lastSigninAt) }) : t("settingsSupport.notUsed")}</dd>
                </div>
              </dl>
              <div className={styles.actions}>
                <button className={s.ghostDanger} type="button" data-testid="settings-support-end" onClick={() => setEnding(true)}>{t("settingsSupport.end")}</button>
              </div>
            </>
          ) : (
            <>
              <span className={styles.badge}>{t("settingsSupport.noneBadge")}</span>
              <p className={styles.line}>{t("settingsSupport.noneLine")}</p>
            </>
          )}
          <p className={s.cardHint} data-testid="settings-support-bg">
            {breakGlassUntil ? t("settingsSupport.bgOpen", { time: time(breakGlassUntil) }) : t("settingsSupport.bgClosed")}
          </p>
        </SectionCard>
      </div>

      {code ? (
        <div role="status" data-testid="settings-support-shown">
          <SectionCard name="shown" title={t("settingsSupport.shownTitle")}>
            <SecretOnce value={code} note={t("settingsSupport.shownHint")} copyLabel={t("settingsSupport.copy")} copiedLabel={t("settingsSupport.copied")} testId="settings-support-code" />
            <div className={styles.actions}>
              <button className={s.soft} type="button" data-testid="settings-support-shown-done" onClick={() => setCode(null)}>{t("settingsSupport.shownDone")}</button>
            </div>
          </SectionCard>
        </div>
      ) : null}

      <div data-testid="settings-support-log">
        <SectionCard name="log" title={t("settingsSupport.logTitle")}>
          {log.length === 0 ? (
            <p className={s.empty} data-testid="settings-support-empty">{t("settingsSupport.logEmpty")}</p>
          ) : (
            <DataTable
              rows={log}
              rowKey={(r) => r.id}
              empty={t("settingsSupport.logEmpty")}
              columns={[
                { key: "when", header: t("settingsSupport.colWhen"), width: "minmax(0, 1fr)", render: (r) => <span data-testid="settings-support-log-row">{time(r.at)}</span> },
                { key: "what", header: t("settingsSupport.colWhat"), width: "minmax(0, 1.4fr)", render: (r) => what(r) },
                { key: "who", header: t("settingsSupport.colWho"), render: (r) => (r.who === "admin" && r.name ? person(r.name) : who(r)) },
              ]}
            />
          )}
          {newerHref || olderHref ? (
            <div className={styles.pager}>
              {newerHref ? <Link className={s.soft} href={newerHref}>{t("settingsSupport.newer")}</Link> : null}
              {olderHref ? <Link className={s.soft} href={olderHref}>{t("settingsSupport.older")}</Link> : null}
            </div>
          ) : null}
        </SectionCard>
      </div>

      {dialog ? (
        <EditDrawer
          title={t(dialog === "grant" ? "settingsSupport.grantTitle" : "settingsSupport.extendTitle")}
          closeLabel={t("settingsSupport.cancel")}
          onClose={() => setDialog(null)}
          testId="settings-support-dialog"
          foot={
            <>
              <button className={s.soft} type="button" onClick={() => setDialog(null)}>{t("settingsSupport.cancel")}</button>
              <button className={s.save} type="submit" form={FORM} disabled={pending} data-testid="settings-support-submit">{t(dialog === "grant" ? "settingsSupport.submitGrant" : "settingsSupport.submitExtend")}</button>
            </>
          }
        >
          <form id={FORM} className={styles.form} onSubmit={submit}>
            <fieldset className={styles.fieldset}>
              <legend className={s.label}>{t(dialog === "grant" ? "settingsSupport.forField" : "settingsSupport.extendField")}</legend>
              {SUPPORT_GRANT_CHOICES.map((h) => (
                <label key={h} className={styles.check}><input type="radio" name="hours" value={h} defaultChecked={h === SUPPORT_GRANT_DEFAULT_HOURS} data-testid={`settings-support-hours-${h}`} /> {t(hoursKey(h))}</label>
              ))}
            </fieldset>
            {dialog === "grant" ? (
              <label className={s.field}>
                <span className={s.label}>{t("settingsSupport.reasonField")}</span>
                <input className={s.input} name="reason" required maxLength={SUPPORT_REASON_MAX} autoComplete="off" data-testid="settings-support-reason" />
                <span className={s.help}>{t("settingsSupport.reasonHelp")}</span>
              </label>
            ) : null}
            <p className={s.cardHint}>{t(dialog === "grant" ? "settingsSupport.grantText" : "settingsSupport.extendText")}</p>
            {error ? <p className={s.fieldError} role="alert" data-testid="settings-support-error">{t(error)}</p> : null}
          </form>
        </EditDrawer>
      ) : null}

      {ending ? (
        <ConfirmDialog
          title={t("settingsSupport.end")}
          text={t("settingsSupport.endAsk")}
          confirmLabel={t("settingsSupport.endYes")}
          cancelLabel={t("settingsSupport.cancel")}
          danger
          onConfirm={endNow}
          onCancel={() => setEnding(false)}
          testId="settings-support-end-dialog"
        />
      ) : null}
    </div>
  );
}
