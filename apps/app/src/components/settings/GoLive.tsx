"use client";
// Settings -> Go-live (PIL-B1): the stage track, what the stage means, the checklist with a link to each
// section, Check again, the switch with its dialogs and the history. The page's last check is shown, but the
// server runs the checks again before a move; a refusal comes back with fresh checks and replaces the list.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Banner, ConfirmDialog, SectionCard } from "@/components/ui/elements";
import { checkName, goLiveView, type Line } from "@/features/pilot/go-live-view";
import { blockers, type GoLiveCheck } from "@/features/pilot/go-live";
import { useFormat, useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { checkGoLiveAction, moveStageAction } from "@/server/actions/settings/go-live";
import s from "./settings.module.css";
import styles from "./GoLive.module.css";

export type GoLiveHistoryRow = { id: string; at: string; from: string | null; to: string; byName: string | null };
type Props = {
  slug: string;
  company: string;
  stage: string;
  /** ISO: the last stage move, or the creation. */
  since: string;
  /** null when the checks could not run at all. */
  checks: GoLiveCheck[] | null;
  /** ISO. */
  checkedAt: string;
  notifications: boolean;
  /** Section key -> where it is and what it is called. */
  links: Record<string, { href: string; label: string }>;
  history: GoLiveHistoryRow[];
};

const MARK: Record<GoLiveCheck["state"], string> = { done: "✓", needs: "▲", unknown: "✕", unset: "–" };
const STAGE_LABEL: Record<string, MessageKey> = {
  demo: "settingsCompany.stageDemo", sandbox: "settingsGoLive.stageSandbox", pilot: "settingsGoLive.stagePilot", live: "settingsGoLive.stageLive",
};

export function GoLive(p: Props) {
  const t = useT();
  const f = useFormat();
  const router = useRouter();
  const [checks, setChecks] = useState(p.checks);
  const [at, setAt] = useState(p.checkedAt);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(p.checks ? null : t("settingsGoLive.errFailed"));
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const stageName = (x: string) => t(STAGE_LABEL[x] ?? "settingsGoLive.stageSandbox");
  const view = goLiveView({ stage: p.stage, admin: true, checks: checks ?? [], notifications: p.notifications, now: new Date() });
  const head = (action: React.ReactNode) => (
    <header className={`${s.head} ${styles.headRow}`} data-testid="page-header">
      <div className={styles.titleBox}>
        <h1 className={s.title}>{t("settingsGoLive.title")}</h1>
        {view.kind === "stage" ? <p className={s.lede}>{t("settingsGoLive.lead", { company: p.company, stage: stageName(p.stage), date: f.date(p.since, "day") })}</p> : null}
      </div>
      {action}
    </header>
  );
  if (view.kind === "demo") {
    return (
      <div className={s.page} data-testid="settings-golive-demo">
        {head(null)}
        <SectionCard><p className={s.help}>{t("settingsGoLive.demo")}</p></SectionCard>
      </div>
    );
  }

  const text = (l: Line) => {
    const v = { ...l.values };
    if (typeof v.date === "string") v.date = f.date(v.date, "day");
    return t(l.key, v);
  };
  const checkLine = (c: GoLiveCheck) => {
    const v: Record<string, string | number> = { ...c.values };
    if (typeof v.time === "string") v.time = f.date(v.time, "dateTime");
    if (typeof v.date === "string") v.date = f.date(v.date, "day");
    return t(c.line, v);
  };

  const recheck = () =>
    start(async () => {
      const r = await checkGoLiveAction(p.slug);
      if (!r.ok) return setError(t("settingsGoLive.errFailed"));
      setChecks(r.checks); setAt(r.at); setError(null);
    });
  const sw = view.switch;
  const move = () => {
    if (!sw) return;
    start(async () => {
      const r = await moveStageAction(p.slug, sw.to);
      setAsking(false);
      if (r.ok) {
        setError(null);
        setNotice(t(sw.to === "pilot" ? "settingsGoLive.toastPilot" : "settingsGoLive.toastSandbox", { company: p.company }));
        router.refresh(); // moving back signs everyone out: the refresh lands on the sign-in
        return;
      }
      if (r.checks) { setChecks(r.checks); setAt(new Date().toISOString()); }
      const first = r.checks ? blockers(r.checks)[0] : undefined;
      setError(r.reason === "closed" ? t("settingsSetupOpen.stageClosed") : r.reason === "blocked" && first ? t("settingsGoLive.errChanged", { check: t(checkName(first)) }) : t("settingsGoLive.errFailed"));
      if (r.reason === "changed") router.refresh();
    });
  };

  const action = sw ? (
    <div className={styles.switchBox}>
      <button type="button" className={s.save} disabled={sw.disabled || pending} data-testid="settings-golive-switch" data-to={sw.to}
        aria-describedby={sw.disabled ? "golive-blocked" : undefined}
        onClick={() => { setError(null); setNotice(null); setAsking(true); }}>
        {t(sw.label)}
      </button>
      {sw.disabled ? <p id="golive-blocked" className={styles.hint} data-testid="settings-golive-blocked">{t("settingsGoLive.blockedHint", { count: sw.open, n: sw.open })}</p> : null}
    </div>
  ) : null;

  const rows = (level: GoLiveCheck["level"], count: { done: number; total: number }, label: MessageKey) => {
    const list = (checks ?? []).filter((c) => c.level === level);
    if (list.length === 0) return null;
    return (
      <div className={styles.group}>
        <div className={styles.groupHead}>
          <span>{t(label)}</span>
          <span className={styles.groupCount}>{t("settingsGoLive.doneOf", { n: count.done, m: count.total })}</span>
        </div>
        <ul className={styles.rows}>
          {list.map((c) => {
            const link = c.section ? p.links[c.section] : undefined;
            return (
              <li key={c.key} className={styles.check} data-state={c.state} data-testid={`settings-golive-check-${c.key}`}>
                <span className={styles.mark} aria-hidden="true">{MARK[c.state]}</span>
                <span className={styles.name}>{t(checkName(c))}</span>
                <span className={styles.result}>{checkLine(c)}</span>
                {link ? <Link className={styles.link} href={link.href}>{t("settingsGoLive.sectionLink", { section: link.label })}</Link> : <span />}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <div className={s.page} data-testid="settings-golive">
      {head(action)}
      {notice ? <div role="status" data-testid="settings-golive-notice"><Banner tone="info">{notice}</Banner></div> : null}
      {error ? <div data-testid="settings-golive-error"><Banner tone="error">{error}</Banner></div> : null}

      <SectionCard name="stage">
        <ol className={styles.track} data-testid="settings-golive-track">
          {view.track.map((step) => (
            <li key={step.stage} className={styles.step} data-state={step.state} data-stage={step.stage} aria-current={step.state === "current" ? "step" : undefined}>
              <span className={styles.dot} aria-hidden="true" />
              <span className={styles.stepName}>{t(step.label)}</span>
              <span className={styles.stepNote}>
                {step.state === "current" ? t("settingsGoLive.since", { date: f.date(p.since, "day") }) : step.state === "next" ? t("settingsGoLive.next") : step.state === "later" ? t("settingsGoLive.afterPilot") : ""}
              </span>
            </li>
          ))}
        </ol>
        <div className={styles.meaning} role="table" data-testid="settings-golive-meaning">
          <span role="columnheader" />
          {view.track.map((step) => <span key={step.stage} role="columnheader">{t(step.label)}</span>)}
          {view.meaning.flatMap((row) => [
            <span key={row.label} role="rowheader">{t(row.label)}</span>,
            ...view.track.map((step) => <span key={`${row.label}-${step.stage}`} role="cell" data-current={step.state === "current" ? "" : undefined}>{t(row.values[step.stage])}</span>),
          ])}
        </div>
        {view.liveLine ? <p className={s.help}>{t(view.liveLine)}</p> : null}
      </SectionCard>

      <SectionCard
        name="checks"
        title={t(view.checklistTitle)}
        action={
          <div className={styles.metaRow}>
            <span className={s.cardHint} data-testid="settings-golive-checked">{t("settingsGoLive.checkedAt", { time: f.date(at, "time") })}</span>
            <button type="button" className={s.soft} disabled={pending} onClick={recheck} data-testid="settings-golive-recheck">
              {pending ? t("settingsGoLive.checkRunning") : t("settingsGoLive.checkAgain")}
            </button>
          </div>
        }
      >
        {rows("needed", view.needed, "settingsGoLive.needed")}
        {rows("recommended", view.recommended, "settingsGoLive.recommended")}
      </SectionCard>

      <SectionCard name="history" title={t("settingsGoLive.historyTitle")}>
        {p.history.length === 0 ? (
          <p className={s.empty}>{t("settingsGoLive.historyEmpty")}</p>
        ) : (
          <ul className={styles.history} data-testid="settings-golive-history">
            {p.history.map((h) => (
              <li key={h.id}>
                <span className={styles.when}>{f.date(h.at, "day")}</span>
                <span>{h.from ? t("settingsGoLive.historyMove", { from: stageName(h.from), to: stageName(h.to) }) : t("settingsGoLive.historyCreated", { stage: stageName(h.to) })}</span>
                <span className={styles.by}>{h.byName ?? t("settingsGoLive.historyNextUp")}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {asking && sw ? (
        <ConfirmDialog
          title={t(sw.dialog.title, { company: p.company })}
          text={sw.to === "pilot" ? t("settingsGoLive.toPilotIntro") : ""}
          lines={sw.dialog.lines.map(text)}
          confirmLabel={t(sw.dialog.confirm)}
          cancelLabel={t("settingsGoLive.cancel")}
          danger={sw.dialog.danger}
          onConfirm={move}
          onCancel={() => setAsking(false)}
          testId="settings-golive-dialog"
        />
      ) : null}
    </div>
  );
}
