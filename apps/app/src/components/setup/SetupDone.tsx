"use client";
// The finish page of the setup process (Paper: "setup-step-done"): what now exists, what is worth
// checking with its current value, and the way into the app.
import Link from "next/link";
import { useLocale, useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { orgSummary } from "@/features/settings/org-view";
import { workdayRange, type SetupDoneFacts } from "@/features/settings/setup-done";
import { SettingsHead } from "@/components/settings/SettingsParts";
import type { SetupData } from "./SetupStepView";
import s from "./Setup.module.css";

/** `prefix` is the company's address part, so links work in every tenant mode. */
export function SetupDone({ prefix, data, facts, opened }: { prefix: string; data: SetupData; facts: SetupDoneFacts; opened: boolean }) {
  const t = useT();
  const locale = useLocale();
  const sum = orgSummary(data.knowledge);
  const counts: [number, string][] = [
    [sum.units, t("settingsSetup.countUnits")],
    [sum.roles, t("settingsSetup.countRoles")],
    [data.knowledge.holders.length, t("settingsSetup.countSeats", { vacant: String(sum.vacantSeats) })],
    [data.knowledge.rules.length, t("settingsSetup.countRoutes")],
    [data.members.filter((m) => m.active).length, t("settingsSetup.countMembers")],
  ];
  const standard = (isDefault: boolean) => (isDefault ? <span className={s.isDefault}> {t("settingsSetup.isDefault")}</span> : null);
  const connectors = <><strong>{t("settingsSetup.checkConnectors")}</strong><span>{t("settingsSetup.checkConnectorsLine")}</span></>;
  return (
    <section className={s.page} data-testid="setup-step-done">
      <SettingsHead title={data.company.name ? t("settingsSetup.doneTitleOf", { company: data.company.name }) : t("settingsSetup.doneTitle")} />
      <p className={s.counts}>
        {counts.map(([n, label]) => <span key={label}><strong>{n}</strong> {label}</span>)}
      </p>
      <p className={s.hint}>{opened ? t("settingsSetup.doneNow") : t("settingsSetupOpen.doneClosedLine")}</p>
      <h2 className={s.subLabel}>{t("settingsSetup.worthChecking")}</h2>
      <nav className={s.checks}>
        <Link href={`${prefix}/settings/rules`} className={s.check}>
          <strong>{t("settingsCompany.navRules")}</strong>
          <span>{t("settingsSetup.checkRulesLine", { n: String(facts.promiseDays) })}{standard(facts.rulesDefault)}</span>
          <span aria-hidden="true">→</span>
        </Link>
        <Link href={`${prefix}/settings/calendar`} className={s.check}>
          <strong>{t("settingsCompany.navCalendar")}</strong>
          <span>{t(`settingsCompany.region${facts.region}` as MessageKey)}, {workdayRange(facts.workdays, locale)}{standard(facts.calendarDefault)}</span>
          <span aria-hidden="true">→</span>
        </Link>
        {facts.consoleHref
          ? <Link href={`${facts.consoleHref}/connectors`} className={s.check}>{connectors}<span aria-hidden="true">→</span></Link>
          : <div className={s.check}>{connectors}<span /></div>}
      </nav>
      <div className={s.doneFoot}>
        <Link className={s.back} href={`${prefix}/raise`} data-testid="setup-test-case">{t("settingsSetup.raiseTestCase")}</Link>
        {opened
          ? <Link className={s.next} href={`${prefix}/leader`} data-testid="setup-to-inbox">{t("settingsSetup.toInbox")}</Link>
          : <Link className={s.next} href={`${prefix}/setup/open`} data-testid="setup-to-open">{t("settingsSetupOpen.doneOpen")}</Link>}
      </div>
    </section>
  );
}
