// "Mails" on a person's own profile: one switch per group of mails. Props in; a change goes through the
// setNotifyPrefAction server action, one call per template of the group (D3: choices are rows).
"use client";

import { useEffect, useState, useTransition } from "react";
import { ADD_MAIL_PREFIX } from "@/features/notify/channels";
import { NOTIFY_GROUPS, type NotifyGroup } from "@/features/notify/digest";
import { profileNoticeRows } from "@/features/settings/notifications";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { setNotifyPrefAction } from "@/server/actions/notify";
import { myTeamsReachableAction } from "@/server/actions/settings/notifications";
import { Banner, SectionCard } from "@/components/ui/elements";
import styles from "./NotifySettings.module.css";

const LABEL: Record<NotifyGroup, MessageKey> = {
  raised: "profile.mailsRaised",
  loop: "profile.mailsLoop",
  reminders: "profile.mailsReminders",
  digest: "profile.mailsDigest",
};
const GROUPS = Object.keys(LABEL) as NotifyGroup[];

/** `teamsReachable`: Teams is on for the company and the person has a chat with the bot. When the page does not say, it is asked once. */
export function NotifySettings({ slug, prefs, teamsReachable }: { slug: string; prefs: { template: string; on: boolean }[]; teamsReachable?: boolean }) {
  const t = useT();
  const [rows, setRows] = useState(prefs);
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    if (teamsReachable !== undefined) return;
    let live = true;
    myTeamsReachableAction(slug).then((ok) => { if (live) setAsked(ok); }, () => undefined);
    return () => { live = false; };
  }, [slug, teamsReachable]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const addMail = (group: NotifyGroup, on: boolean) => {
    setError(null);
    start(async () => {
      const template = `${ADD_MAIL_PREFIX}${group}`;
      const res = await setNotifyPrefAction(slug, template, on);
      if (!res.ok) {
        setError(t("profile.mailsNotSaved"));
        return;
      }
      setRows((prev) => [...prev.filter((r) => r.template !== template), { template, on }]);
    });
  };

  const choose = (group: NotifyGroup, on: boolean) => {
    setError(null);
    start(async () => {
      for (const template of NOTIFY_GROUPS[group]) {
        const res = await setNotifyPrefAction(slug, template, on);
        if (!res.ok) {
          setError(t("profile.mailsNotSaved"));
          return;
        }
      }
      setRows((prev) => [...prev.filter((r) => !NOTIFY_GROUPS[group].includes(r.template)), ...NOTIFY_GROUPS[group].map((template) => ({ template, on }))]);
    });
  };

  return <section aria-label={t("profile.mailsTitle")}>
    <SectionCard title={t("profile.mailsTitle")} name="mails">
      <p className={styles.intro}>{t("profile.mailsIntro")}</p>
      {profileNoticeRows(GROUPS, rows, teamsReachable ?? asked).map(({ group, on, duty, addMail: mailToo, canAddMail }) => (
        <div key={group} data-testid={`profile-notice-${group}`}>
          {duty
            ? <div className={styles.row}>
              <span>{t(LABEL[group])}</span>
              <span className={styles.intro}>{t("profile.mailsAlways")}</span>
            </div>
            : <label className={styles.row}>
              <span>{t(LABEL[group])}</span>
              <input type="checkbox" role="switch" className={styles.switch} checked={on} disabled={pending} onChange={() => choose(group, !on)} />
            </label>}
          {canAddMail
            ? <label className={styles.row}>
              <span>{t("profile.mailsAlsoByMail")}</span>
              <input type="checkbox" role="switch" className={styles.switch} checked={mailToo} disabled={pending} onChange={() => addMail(group, !mailToo)} />
            </label>
            : null}
        </div>
      ))}
      {error ? <Banner tone="error">{error}</Banner> : null}
    </SectionCard>
  </section>;
}
