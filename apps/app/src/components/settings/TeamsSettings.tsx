"use client";
// /settings/teams: the switch, the app package download, the test card, the last card delivered and the newest
// failure. Props in, JSX out; the changes call actions from server/actions/settings/teams.ts.
import { useActionState } from "react";
import { Banner, SectionCard } from "@/components/ui/elements";
import { useT } from "@/i18n/client";
import { sendTestCardAction, setTeamsOnAction, type TeamsFormState } from "@/server/actions/settings/teams";
import { Foot } from "./SettingsParts";
import s from "./settings.module.css";
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
  const swStatus = sw.error ? t(sw.error) : sw.ok && sw.note ? t(sw.note) : undefined;
  return (
    <>
      <div data-testid="settings-teams-switch-card">
        <SectionCard name="switch">
          <form action={swAct} className={styles.form} data-testid="settings-teams-form">
            <input type="hidden" name="slug" value={slug} />
            <label className={s.switch}>
              <input type="checkbox" name="on" defaultChecked={on} data-testid="settings-teams-switch" />
              {t("settingsTeams.switchLabel")}
            </label>
            <div data-testid="settings-teams-state">
              <Banner tone={on ? "info" : "quiet"}>{t(on ? "settingsTeams.stateOn" : "settingsTeams.stateOff")}</Banner>
            </div>
            {!appConfigured ? <div data-testid="settings-teams-hint"><Banner tone="warn">{t("settingsTeams.notConfigured")}</Banner></div> : null}
            {appConfigured && !hasTenant ? <div data-testid="settings-teams-hint"><Banner tone="warn">{t("settingsTeams.noTenant")}</Banner></div> : null}
            <Foot status={swStatus} tone={sw.error ? "error" : undefined} statusTestId={sw.error ? "settings-teams-error" : swStatus ? "settings-teams-saved" : undefined}>
              <button className={s.save} type="submit" disabled={swPending} data-testid="settings-teams-save">
                {t("settingsTeams.save")}
              </button>
            </Foot>
          </form>
        </SectionCard>
      </div>

      <div data-testid="settings-teams-package">
        <SectionCard name="package" title={t("settingsTeams.packageTitle")} hint={t(appConfigured ? "settingsTeams.packageHint" : "settingsTeams.packageUnavailable")}>
          {appConfigured ? (
            <div className={styles.actions}>
              <a className={s.soft} href={`/${slug}/settings/teams/package`} download data-testid="settings-teams-download">
                {t("settingsTeams.packageDownload")}
              </a>
            </div>
          ) : null}
        </SectionCard>
      </div>

      <div data-testid="settings-teams-test">
        <SectionCard name="test" title={t("settingsTeams.testTitle")} hint={t(hasChat ? "settingsTeams.testHint" : "settingsTeams.testNoChat")}>
          <form action={testAct} className={styles.actions}>
            <input type="hidden" name="slug" value={slug} />
            <button className={s.soft} type="submit" disabled={testPending || !appConfigured} data-testid="settings-teams-test-send">
              {t("settingsTeams.testSend")}
            </button>
          </form>
          {test.error ? (
            <p className={s.fieldError} role="alert" data-testid="settings-teams-test-error">{t(test.error, { error: test.detail ?? "" })}</p>
          ) : null}
          {test.ok && test.note ? <p className={s.status} role="status" data-testid="settings-teams-test-result">{t(test.note)}</p> : null}
        </SectionCard>
      </div>

      <div data-testid="settings-teams-last">
        <SectionCard name="last" title={t("settingsTeams.lastTitle")}>
          <p className={styles.line} data-testid="settings-teams-last-sent">
            {lastSent ? t("settingsTeams.lastLine", { template: lastSent.template, time: time(lastSent.at) }) : t("settingsTeams.lastNone")}
          </p>
          <h3 className={s.subLabel}>{t("settingsTeams.failureTitle")}</h3>
          <p className={`${styles.line} ${s.mono}`} data-testid="settings-teams-last-failed">
            {lastFailed ? t("settingsTeams.failureLine", { time: time(lastFailed.at), error: lastFailed.error ?? "" }) : t("settingsTeams.failureNone")}
          </p>
        </SectionCard>
      </div>
    </>
  );
}
