"use client";
// The Weekly email card on the pilot report page (PIL D12): which active managers get the Monday mail, and a
// mail to yourself. Props in, JSX out. Recipients are chosen by user id; the names are only labels.
import { useActionState } from "react";
import { SectionCard } from "@/components/ui/elements";
import { useT } from "@/i18n/client";
import type { SettingsFormState } from "@/server/actions/settings/company";
import { savePilotReportRecipientsAction, sendMeThisWeekAction } from "@/server/actions/settings/pilot-report";
import { Foot } from "./SettingsParts";
import s from "./settings.module.css";
import styles from "./PilotReport.module.css";

export type PilotReportMailProps = {
  slug: string;
  /** The signed-in admin's address, named in the "Sent to" line. */
  email: string;
  /** Every active manager of the company. */
  managers: { id: string; name: string }[];
  /** The user ids that get the mail now. */
  chosen: string[];
};

export function PilotReportMail({ slug, email, managers, chosen }: PilotReportMailProps) {
  const t = useT();
  const [saveState, save, saving] = useActionState<SettingsFormState, FormData>(savePilotReportRecipientsAction, {});
  const [sendState, send, sending] = useActionState<SettingsFormState, FormData>(sendMeThisWeekAction, {});
  const saveStatus = saveState.error ? t(saveState.error) : saveState.ok ? t("settingsPilotReport.saved") : undefined;
  const sendStatus = sendState.error ? t(sendState.error) : sendState.ok ? t("settingsPilotReport.emailSent", { email }) : undefined;
  return (
    <SectionCard title={t("settingsPilotReport.emailTitle")} name="email">
      <form action={save} className={styles.mailForm} data-testid="pilot-mail-form">
        <input type="hidden" name="slug" value={slug} />
        <p className={styles.mute}>{t("settingsPilotReport.emailEvery")}</p>
        {managers.length === 0 ? <p className={styles.mute}>{t("settingsPilotReport.emailNone")}</p> : null}
        <ul className={styles.mailList}>
          {managers.map((m) => (
            <li key={m.id}>
              <label className={s.switch}>
                <input type="checkbox" name="userId" value={m.id} defaultChecked={chosen.includes(m.id)} data-testid={`pilot-mail-recipient-${m.id}`} />
                {m.name}
              </label>
            </li>
          ))}
        </ul>
        <Foot status={saveStatus} tone={saveState.error ? "error" : undefined} statusTestId="pilot-mail-saved">
          <button className={s.save} type="submit" disabled={saving} data-testid="pilot-mail-save">{t("settingsPilotReport.save")}</button>
        </Foot>
      </form>
      <form action={send} className={styles.mailForm} data-testid="pilot-mail-send-form">
        <input type="hidden" name="slug" value={slug} />
        <Foot status={sendStatus} tone={sendState.error ? "error" : undefined} statusTestId="pilot-mail-sent">
          <button className={s.soft} type="submit" disabled={sending} data-testid="pilot-mail-send">{t("settingsPilotReport.emailSendMe")}</button>
        </Foot>
      </form>
    </SectionCard>
  );
}
