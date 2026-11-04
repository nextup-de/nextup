// "Mails" on a person's own profile: one switch per group of mails. Props in; a change goes through the
// setNotifyPrefAction server action, one call per template of the group (D3: choices are rows).
"use client";

import { useState, useTransition } from "react";
import { groupOn, NOTIFY_GROUPS, type NotifyGroup } from "@/features/notify/digest";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { setNotifyPrefAction } from "@/server/actions/notify";
import { Banner, SectionCard } from "@/components/ui/elements";
import styles from "./NotifySettings.module.css";

const LABEL: Record<NotifyGroup, MessageKey> = {
  raised: "profile.mailsRaised",
  loop: "profile.mailsLoop",
  reminders: "profile.mailsReminders",
  digest: "profile.mailsDigest",
};
const GROUPS = Object.keys(LABEL) as NotifyGroup[];

export function NotifySettings({ slug, prefs }: { slug: string; prefs: { template: string; on: boolean }[] }) {
  const t = useT();
  const [rows, setRows] = useState(prefs);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

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
      {GROUPS.map((group) => {
        const on = groupOn(group, rows);
        return <label key={group} className={styles.row}>
          <span>{t(LABEL[group])}</span>
          <input type="checkbox" role="switch" className={styles.switch} checked={on} disabled={pending} onChange={() => choose(group, !on)} />
        </label>;
      })}
      {error ? <Banner tone="error">{error}</Banner> : null}
    </SectionCard>
  </section>;
}
