// "Mails" on a person's own profile: one switch per group of mails. Props in; a change goes through the
// setNotifyPrefAction server action, one call per template of the group (D3: choices are rows).
"use client";

import { useState, useTransition } from "react";
import { groupOn, NOTIFY_GROUPS, type NotifyGroup } from "@/features/notify/digest";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { setNotifyPrefAction } from "@/server/actions/notify";
import profile from "./ProfileView.module.css";

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

  return <section className={profile.card} aria-labelledby="profile-mails">
    <div className={profile.sectionHead}><h2 id="profile-mails">{t("profile.mailsTitle")}</h2></div>
    <p>{t("profile.mailsIntro")}</p>
    {GROUPS.map((group) => {
      const on = groupOn(group, rows);
      return <label key={group} className="nh-check">
        <input type="checkbox" role="switch" checked={on} disabled={pending} onChange={() => choose(group, !on)} /> {t(LABEL[group])}
      </label>;
    })}
    {error ? <p className="nh-error" role="alert">{error}</p> : null}
  </section>;
}
