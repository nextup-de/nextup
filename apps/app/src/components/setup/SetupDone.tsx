"use client";
// The finish page of the setup process: what now exists, and the way into the app.
import Link from "next/link";
import { useT } from "@/i18n/client";
import { orgSummary } from "@/features/settings/org-view";
import { SettingsHead } from "@/components/settings/SettingsParts";
import settings from "@/components/settings/settings.module.css";
import type { SetupData } from "./SetupStepView";
import s from "./Setup.module.css";

/** `prefix` is the company's address part, so links work in every tenant mode. */
export function SetupDone({ prefix, data }: { prefix: string; data: SetupData }) {
  const t = useT();
  const sum = orgSummary(data.knowledge);
  const counts: [number, string][] = [
    [sum.units, t("settingsSetup.countUnits")],
    [sum.roles, t("settingsSetup.countRoles")],
    [data.knowledge.holders.length, t("settingsSetup.countSeats", { vacant: String(sum.vacantSeats) })],
    [data.knowledge.rules.length, t("settingsSetup.countRoutes")],
    [data.members.filter((m) => m.active).length, t("settingsSetup.countMembers")],
  ];
  return (
    <section className={s.page} data-testid="setup-step-done">
      <SettingsHead title={data.company.name ? t("settingsSetup.doneTitleOf", { company: data.company.name }) : t("settingsSetup.doneTitle")} />
      <p className={`${settings.card} ${s.counts}`}>
        {counts.map(([n, label]) => <span key={label}><strong>{n}</strong> {label}</span>)}
      </p>
      <p className={s.hint}>{t("settingsSetup.doneNow")}</p>
      <h2 className={settings.subLabel}>{t("settingsSetup.worthChecking")}</h2>
      <nav className={`${settings.card} ${s.checks}`}>
        <Link href={`${prefix}/settings/rules`} className={s.check}><strong>{t("settingsCompany.navRules")}</strong><span>{t("settingsSetup.checkRules")}</span><span aria-hidden="true">→</span></Link>
        <Link href={`${prefix}/settings/calendar`} className={s.check}><strong>{t("settingsCompany.navCalendar")}</strong><span>{t("settingsSetup.checkCalendar")}</span><span aria-hidden="true">→</span></Link>
      </nav>
      <div className={s.footer}>
        <span />
        <Link className={s.next} href={`${prefix}/leader`} data-testid="setup-to-inbox">{t("settingsSetup.toInbox")}</Link>
      </div>
    </section>
  );
}
