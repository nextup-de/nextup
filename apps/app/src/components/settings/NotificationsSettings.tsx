"use client";
// /settings/notifications: the switch, the stage line, opt-out counts and the failed messages with Retry.
import { useActionState } from "react";
import { Banner, DataTable, SectionCard } from "@/components/ui/elements";
import type { FailedRow, OptOutCount } from "@/features/settings/notifications";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { retryOutboxAction, saveNotificationsSwitchAction } from "@/server/actions/settings/notifications";
import type { SettingsFormState } from "@/server/actions/settings/company";
import { Foot } from "./SettingsParts";
import s from "./settings.module.css";
import styles from "./NotificationsSettings.module.css";

export type NotificationsSettingsProps = {
  slug: string;
  on: boolean;
  stageLine: MessageKey;
  optOuts: OptOutCount[];
  failed: FailedRow[];
};

/** A sandbox sends nothing whatever the switch says (warn); a live switch reads as info; off is a quiet state. */
const stageTone = (line: MessageKey, on: boolean) => (line === "settingsNotifications.stageSandbox" ? "warn" : on ? "info" : "quiet");

function RetryButton({ slug, id }: { slug: string; id: string }) {
  const t = useT();
  const [state, act, pending] = useActionState<SettingsFormState, FormData>(retryOutboxAction, {});
  return (
    <form action={act} className={styles.retry}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="id" value={id} />
      <button className={s.soft} type="submit" disabled={pending} data-testid={`settings-notifications-retry-${id}`}>
        {t("settingsNotifications.retry")}
      </button>
      {state.error ? <span className={s.fieldError} role="alert">{t(state.error)}</span> : null}
    </form>
  );
}

export function NotificationsSettings({ slug, on, stageLine, optOuts, failed }: NotificationsSettingsProps) {
  const t = useT();
  const [state, act, pending] = useActionState<SettingsFormState, FormData>(saveNotificationsSwitchAction, {});
  const status = state.error ? t(state.error) : state.ok ? t("settingsNotifications.saved") : undefined;
  return (
    <>
      <SectionCard name="switch">
        <form action={act} className={styles.form} data-testid="settings-notifications-form">
          <input type="hidden" name="slug" value={slug} />
          <label className={s.switch}>
            <input type="checkbox" name="on" defaultChecked={on} data-testid="settings-notifications-switch" />
            {t("settingsNotifications.switchLabel")}
          </label>
          <div data-testid="settings-notifications-stage">
            <Banner tone={stageTone(stageLine, on)}>{t(stageLine)}</Banner>
          </div>
          <Foot status={status} tone={state.error ? "error" : undefined} statusTestId={state.error ? "settings-notifications-error" : state.ok ? "settings-notifications-saved" : undefined}>
            <button className={s.save} type="submit" disabled={pending} data-testid="settings-notifications-save">
              {t("settingsNotifications.save")}
            </button>
          </Foot>
        </form>
      </SectionCard>

      <div data-testid="settings-notifications-optouts">
        <SectionCard name="optouts" title={t("settingsNotifications.optOutsTitle")} hint={t("settingsNotifications.optOutsHint")}>
          {optOuts.length === 0 ? (
            <p className={s.empty}>{t("settingsNotifications.optOutsNone")}</p>
          ) : (
            <ul className={s.lines}>
              {optOuts.map((o) => (
                <li key={o.template} className={s.line} data-testid={`settings-notifications-optout-${o.template === "*" ? "all" : o.template}`}>
                  <span>{o.template === "*" ? t("settingsNotifications.allKinds") : o.template}:</span>
                  <strong>{o.count === null ? t("settingsNotifications.fewerThan5") : o.count}</strong>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div data-testid="settings-notifications-failed">
        <SectionCard name="failed" title={t("settingsNotifications.failedTitle")}>
          <DataTable
            rows={failed}
            rowKey={(r) => r.id}
            empty={t("settingsNotifications.failedNone")}
            testId="settings-notifications-table"
            columns={[
              { key: "kind", header: t("settingsNotifications.colKind"), render: (r) => <span data-testid={`settings-notifications-row-${r.id}`}>{r.template}</span> },
              { key: "channel", header: t("settingsNotifications.colChannel"), render: (r) => r.channel },
              { key: "time", header: t("settingsNotifications.colTime"), render: (r) => <time dateTime={r.at}>{r.at.slice(0, 16).replace("T", " ")}</time> },
              { key: "error", header: t("settingsNotifications.colError"), render: (r) => r.error, width: "minmax(0, 1.6fr)" },
              { key: "retry", header: "", render: (r) => <RetryButton slug={slug} id={r.id} />, width: "auto" },
            ]}
          />
        </SectionCard>
      </div>
    </>
  );
}
