"use client";
// /settings/notifications: the switch, the stage line, opt-out counts and the failed messages with Retry.
import { useActionState } from "react";
import type { FailedRow, OptOutCount } from "@/features/settings/notifications";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { retryOutboxAction, saveNotificationsSwitchAction } from "@/server/actions/settings/notifications";
import type { SettingsFormState } from "@/server/actions/settings/company";

export type NotificationsSettingsProps = {
  slug: string;
  on: boolean;
  stageLine: MessageKey;
  optOuts: OptOutCount[];
  failed: FailedRow[];
};

function RetryButton({ slug, id }: { slug: string; id: string }) {
  const t = useT();
  const [state, act, pending] = useActionState<SettingsFormState, FormData>(retryOutboxAction, {});
  return (
    <form action={act}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="id" value={id} />
      <button className="nh-btn" type="submit" disabled={pending} data-testid={`settings-notifications-retry-${id}`}>
        {t("settingsNotifications.retry")}
      </button>
      {state.error ? <span className="nh-error" role="alert"> {t(state.error)}</span> : null}
    </form>
  );
}

export function NotificationsSettings({ slug, on, stageLine, optOuts, failed }: NotificationsSettingsProps) {
  const t = useT();
  const [state, act, pending] = useActionState<SettingsFormState, FormData>(saveNotificationsSwitchAction, {});
  return (
    <>
      <form action={act} data-testid="settings-notifications-form">
        <input type="hidden" name="slug" value={slug} />
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" name="on" defaultChecked={on} data-testid="settings-notifications-switch" />
          {t("settingsNotifications.switchLabel")}
        </label>
        <p className="nh-hint" data-testid="settings-notifications-stage">{t(stageLine)}</p>
        {state.error ? <p className="nh-error" role="alert" data-testid="settings-notifications-error">{t(state.error)}</p> : null}
        {state.ok ? <p className="nh-hint" role="status" data-testid="settings-notifications-saved">{t("settingsNotifications.saved")}</p> : null}
        <button className="nh-btn nh-btn-primary" type="submit" disabled={pending} data-testid="settings-notifications-save">
          {t("settingsNotifications.save")}
        </button>
      </form>

      <section data-testid="settings-notifications-optouts">
        <h2>{t("settingsNotifications.optOutsTitle")}</h2>
        <p className="nh-hint">{t("settingsNotifications.optOutsHint")}</p>
        {optOuts.length === 0 ? (
          <p>{t("settingsNotifications.optOutsNone")}</p>
        ) : (
          <ul>
            {optOuts.map((o) => (
              <li key={o.template} data-testid={`settings-notifications-optout-${o.template === "*" ? "all" : o.template}`}>
                {o.template === "*" ? t("settingsNotifications.allKinds") : o.template}:{" "}
                {o.count === null ? t("settingsNotifications.fewerThan5") : o.count}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section data-testid="settings-notifications-failed">
        <h2>{t("settingsNotifications.failedTitle")}</h2>
        {failed.length === 0 ? (
          <p>{t("settingsNotifications.failedNone")}</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>{t("settingsNotifications.colKind")}</th>
                  <th>{t("settingsNotifications.colChannel")}</th>
                  <th>{t("settingsNotifications.colTime")}</th>
                  <th>{t("settingsNotifications.colError")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {failed.map((r) => (
                  <tr key={r.id} data-testid={`settings-notifications-row-${r.id}`}>
                    <td>{r.template}</td>
                    <td>{r.channel}</td>
                    <td><time dateTime={r.at}>{r.at.slice(0, 16).replace("T", " ")}</time></td>
                    <td>{r.error}</td>
                    <td><RetryButton slug={slug} id={r.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
