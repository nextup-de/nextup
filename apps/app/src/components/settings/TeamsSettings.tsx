"use client";
// /settings/teams: the switch, the app package download, the test card, the last card delivered and the newest
// failure. Props in, JSX out; the changes call actions from server/actions/settings/teams.ts.
import { useActionState } from "react";
import { useT } from "@/i18n/client";
import { sendTestCardAction, setTeamsOnAction, type TeamsFormState } from "@/server/actions/settings/teams";
import styles from "./TeamsSettings.module.css";

export type TeamsCardView = { template: string; at: string; error: string | null };

export type TeamsSettingsProps = {
  slug: string;
  on: boolean;
  appConfigured: boolean;
  hasTenant: boolean;
  hasChat: boolean;
  /** The newest sent card on channel teams. */
  lastSent: TeamsCardView | null;
  /** The newest failed card on channel teams. */
  lastFailed: TeamsCardView | null;
};

const time = (iso: string) => iso.slice(0, 16).replace("T", " ");

export function TeamsSettings({ slug, on, appConfigured, hasTenant, hasChat, lastSent, lastFailed }: TeamsSettingsProps) {
  const t = useT();
  const [sw, swAct, swPending] = useActionState<TeamsFormState, FormData>(setTeamsOnAction, {});
  const [test, testAct, testPending] = useActionState<TeamsFormState, FormData>(sendTestCardAction, {});
  return (
    <div className={styles.wrap}>
      <section className={styles.card} data-testid="settings-teams-switch-card">
        <form action={swAct} data-testid="settings-teams-form">
          <input type="hidden" name="slug" value={slug} />
          <label className={styles.row}>
            <input type="checkbox" name="on" defaultChecked={on} data-testid="settings-teams-switch" />
            {t("settingsTeams.switchLabel")}
          </label>
          <p className="nh-hint" data-testid="settings-teams-state">{t(on ? "settingsTeams.stateOn" : "settingsTeams.stateOff")}</p>
          {!appConfigured ? <p className="nh-hint" data-testid="settings-teams-hint">{t("settingsTeams.notConfigured")}</p> : null}
          {appConfigured && !hasTenant ? <p className="nh-hint" data-testid="settings-teams-hint">{t("settingsTeams.noTenant")}</p> : null}
          {sw.error ? <p className="nh-error" role="alert" data-testid="settings-teams-error">{t(sw.error)}</p> : null}
          {sw.ok && sw.note ? <p className="nh-hint" role="status" data-testid="settings-teams-saved">{t(sw.note)}</p> : null}
          <button className="nh-btn nh-btn-primary" type="submit" disabled={swPending} data-testid="settings-teams-save">
            {t("settingsTeams.save")}
          </button>
        </form>
      </section>

      <section className={styles.card} data-testid="settings-teams-package">
        <h2 className={styles.title}>{t("settingsTeams.packageTitle")}</h2>
        <p className="nh-hint">{t(appConfigured ? "settingsTeams.packageHint" : "settingsTeams.packageUnavailable")}</p>
        {appConfigured ? (
          <div className={styles.row}>
            <a className="nh-btn" href={`/${slug}/settings/teams/package`} download data-testid="settings-teams-download">
              {t("settingsTeams.packageDownload")}
            </a>
          </div>
        ) : null}
      </section>

      <section className={styles.card} data-testid="settings-teams-test">
        <h2 className={styles.title}>{t("settingsTeams.testTitle")}</h2>
        <p className="nh-hint">{t(hasChat ? "settingsTeams.testHint" : "settingsTeams.testNoChat")}</p>
        <form action={testAct} className={styles.row}>
          <input type="hidden" name="slug" value={slug} />
          <button className="nh-btn" type="submit" disabled={testPending || !appConfigured} data-testid="settings-teams-test-send">
            {t("settingsTeams.testSend")}
          </button>
        </form>
        {test.error ? (
          <p className="nh-error" role="alert" data-testid="settings-teams-test-error">{t(test.error, { error: test.detail ?? "" })}</p>
        ) : null}
        {test.ok && test.note ? <p className="nh-hint" role="status" data-testid="settings-teams-test-result">{t(test.note)}</p> : null}
      </section>

      <section className={styles.card} data-testid="settings-teams-last">
        <h2 className={styles.title}>{t("settingsTeams.lastTitle")}</h2>
        <p data-testid="settings-teams-last-sent">
          {lastSent ? t("settingsTeams.lastLine", { template: lastSent.template, time: time(lastSent.at) }) : t("settingsTeams.lastNone")}
        </p>
        <h2 className={styles.title}>{t("settingsTeams.failureTitle")}</h2>
        <p className={styles.mono} data-testid="settings-teams-last-failed">
          {lastFailed ? t("settingsTeams.failureLine", { time: time(lastFailed.at), error: lastFailed.error ?? "" }) : t("settingsTeams.failureNone")}
        </p>
      </section>
    </div>
  );
}
