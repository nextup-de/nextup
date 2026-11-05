"use client";
// The last step of the setup process: the go-live checks, the hand list the app cannot check, and "Open
// NextUp". Paper: "setup-step-open". The page's last check is shown, but the server runs the checks again before
// it opens; a refusal comes back with fresh checks and replaces the list.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Banner, ConfirmDialog } from "@/components/ui/elements";
import { SettingsHead } from "@/components/settings/SettingsParts";
import { blockers, type GoLiveCheck } from "@/features/pilot/go-live";
import { checkName } from "@/features/pilot/go-live-view";
import { useFormat, useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { checkGoLiveAction } from "@/server/actions/settings/go-live";
import { openCompanyAction, sendInvitationsAgainAction } from "@/server/actions/settings/open";
import type { HeldResult } from "@/server/setup-open";
import s from "./Setup.module.css";
import o from "./OpenStep.module.css";

type Props = {
  slug: string;
  company: string;
  /** The company's address part, so links work in every tenant mode. */
  prefix: string;
  /** ISO, when the company was opened; null while it is closed. */
  openedAt: string | null;
  /** null when the checks could not run at all. */
  checks: GoLiveCheck[] | null;
  /** ISO. */
  checkedAt: string;
  /** Invitations that wait for Open, or that did not go out. */
  held: number;
  /** Section key -> where it is and what it is called. */
  links: Record<string, { href: string; label: string }>;
  /** Sample data without a database: nothing opens. */
  demo?: boolean;
};

const MARK: Record<GoLiveCheck["state"], string> = { done: "✓", needs: "▲", unknown: "✕", unset: "–" };
const HAND: MessageKey[] = [
  "settingsSetupOpen.handAgreements", "settingsSetupOpen.handCouncil", "settingsSetupOpen.handRestore",
  "settingsSetupOpen.handFindings", "settingsSetupOpen.handAccess",
];

export function OpenStep({ slug, company, prefix, openedAt, checks: first, checkedAt, held, links, demo }: Props) {
  const t = useT();
  const f = useFormat();
  const router = useRouter();
  const [checks, setChecks] = useState(first);
  const [at, setAt] = useState(checkedAt);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(first || openedAt ? null : t("settingsSetupOpen.checksFailed"));
  const [invitations, setInvitations] = useState<HeldResult | null>(null);
  const [pending, start] = useTransition();

  if (openedAt) {
    const waiting = invitations ? invitations.waiting : held;
    const again = () => start(async () => {
      const r = await sendInvitationsAgainAction(slug);
      if (r.ok) { setInvitations(r.invitations); router.refresh(); } else setError(t("settingsSetupOpen.errFailed"));
    });
    return (
      <section className={s.page} data-testid="setup-step-open">
        <SettingsHead title={t("settingsSetupOpen.openedTitle", { company })} />
        <section className={s.card} data-testid="setup-open-opened">
          <p className={s.cardText}>{t("settingsSetupOpen.openedLine", { date: f.date(openedAt, "day") })}</p>
          {invitations && invitations.sent > 0 ? <p className={s.cardText} role="status" data-testid="setup-open-sent">{t("settingsSetupOpen.sentLine", { n: invitations.sent })}</p> : null}
          {invitations && invitations.failed > 0 ? <p className={s.refusal} role="alert" data-testid="setup-open-failed">{t("settingsSetupOpen.failedLine", { n: invitations.failed })}</p> : null}
          {waiting > 0 ? (
            <div className={o.waiting}>
              <span className={s.cardText} data-testid="setup-open-waiting">{t("settingsSetupOpen.stillWaiting", { n: waiting })}</span>
              <button type="button" className={s.secondary} disabled={pending} onClick={again} data-testid="setup-open-send">{t("settingsSetupOpen.sendAgain")}</button>
            </div>
          ) : null}
          <p className={s.cardText}>{t("settingsSetupOpen.openedNext")}</p>
        </section>
        {error ? <Banner tone="error">{error}</Banner> : null}
        <div className={s.doneFoot}>
          <Link className={s.back} href={`${prefix}/settings/go-live`} data-testid="setup-open-golive">{t("settingsSetupOpen.toGoLive")}</Link>
          <Link className={s.next} href={`${prefix}/leader`} data-testid="setup-to-inbox">{t("settingsSetup.toInbox")}</Link>
        </div>
      </section>
    );
  }

  const open = checks ? blockers(checks).length : 0;
  const ready = checks !== null && open === 0 && !demo;
  const line = (c: GoLiveCheck) => {
    const v: Record<string, string | number> = { ...c.values };
    if (typeof v.time === "string") v.time = f.date(v.time, "dateTime");
    if (typeof v.date === "string") v.date = f.date(v.date, "day");
    return t(c.line, v);
  };
  const recheck = () => start(async () => {
    const r = await checkGoLiveAction(slug);
    if (!r.ok) return setError(t("settingsSetupOpen.checksFailed"));
    setChecks(r.checks); setAt(r.at); setError(null);
  });
  const openNow = () => start(async () => {
    const r = await openCompanyAction(slug);
    setAsking(false);
    if (r.ok) {
      setError(null);
      setInvitations(r.invitations);
      router.refresh();
      return;
    }
    if (r.checks) { setChecks(r.checks); setAt(new Date().toISOString()); }
    if (r.reason === "opened" || r.reason === "changed") return router.refresh(); // someone else was quicker
    const blocking = r.checks ? blockers(r.checks)[0] : undefined;
    setError(
      r.reason === "blocked" && blocking ? t("settingsSetupOpen.errBlocked", { check: t(checkName(blocking)) })
        : r.reason === "setup" ? t("settingsSetupOpen.errSetup")
        : t("settingsSetupOpen.errFailed"),
    );
  });
  const group = (level: GoLiveCheck["level"], label: MessageKey) => {
    const list = (checks ?? []).filter((c) => c.level === level);
    if (list.length === 0) return null;
    return (
      <div className={o.group}>
        <h3 className={s.subLabel}>{t(label)}</h3>
        <ul className={o.rows}>
          {list.map((c) => {
            const link = c.section ? links[c.section] : undefined;
            return (
              <li key={c.key} className={o.row} data-state={c.state} data-testid={`setup-open-check-${c.key}`}>
                <span className={o.mark} aria-hidden="true">{MARK[c.state]}</span>
                <span className={o.text}>
                  <strong>{t(checkName(c))}</strong>
                  <span>{line(c)}</span>
                </span>
                {link && c.state !== "done" ? <Link className={s.textBtn} href={link.href}>{link.label}</Link> : <span />}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <section className={s.page} data-testid="setup-step-open">
      <SettingsHead title={t("settingsSetupOpen.title", { company })} lede={t("settingsSetupOpen.lede")} />
      {error ? <div data-testid="setup-open-error"><Banner tone="error">{error}</Banner></div> : null}
      <section className={s.card}>
        <div className={o.checksHead}>
          <h2 className={s.cardTitle}>{t("settingsSetupOpen.checksTitle")}</h2>
          <span className={o.checked}>
            <span className={s.fieldHelp}>{t("settingsGoLive.checkedAt", { time: f.date(at, "time") })}</span>
            <button type="button" className={s.secondary} disabled={pending || demo} onClick={recheck} data-testid="setup-open-recheck">
              {pending ? t("settingsGoLive.checkRunning") : t("settingsGoLive.checkAgain")}
            </button>
          </span>
        </div>
        {group("needed", "settingsGoLive.needed")}
        {group("recommended", "settingsGoLive.recommended")}
      </section>
      {held > 0 ? <p className={s.hint} data-testid="setup-open-held">{t("settingsSetupOpen.waitingLine", { n: held })}</p> : null}
      <div className={s.footer}>
        <Link className={s.back} href={`${prefix}/setup/done`} data-testid="setup-back">← {t("settingsSetup.back")}</Link>
        <div className={s.forward}>
          <button type="button" className={s.next} disabled={!ready || pending} onClick={() => { setError(null); setAsking(true); }} data-testid="setup-open-button">
            {t("settingsSetupOpen.openButton")}
          </button>
          <span className={s.nextHint} data-testid="setup-open-hint">
            {demo ? t("settingsSetupOpen.demoHint") : ready ? t("settingsSetupOpen.readyHint") : t("settingsSetupOpen.blockedHint", { n: open })}
          </span>
        </div>
      </div>
      {asking ? (
        <ConfirmDialog
          title={t("settingsSetupOpen.dialogTitle", { company })}
          text={t("settingsSetupOpen.dialogIntro")}
          lines={HAND.map((k) => t(k))}
          confirmLabel={t("settingsSetupOpen.dialogConfirm")}
          cancelLabel={t("settingsGoLive.cancel")}
          onConfirm={openNow}
          onCancel={() => setAsking(false)}
          testId="setup-open-dialog"
        />
      ) : null}
    </section>
  );
}
