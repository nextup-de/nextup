"use client";
// The setup wizard (ADM D14): one step at a time, showing the step's own editor. Props in; every
// save goes through the editor's own action, so there is no write path here. Back and Next are
// links: the page derives the step again on each load and never lets Next skip an unfinished one.
import Link from "next/link";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import type { CompanyForm as CompanyValues } from "@/features/settings/company-forms";
import type { Knowledge } from "@/features/knowledge";
import { orgSummary } from "@/features/settings/org-view";
import type { SetupFormStep } from "@/server/actions/settings/setup";
import type { MemberRow, SeatLabel } from "@/server/actions/members";
import { CompanyForm } from "./CompanyForm";
import { MembersView } from "./MembersView";
import { OrgEditor, type MemberOption } from "./OrgEditor";
import { RoutingEditor } from "./RoutingEditor";
import { SettingsHead } from "./SettingsParts";
import s from "./settings.module.css";
import w from "./SetupWizard.module.css";

export type SetupData = {
  company: CompanyValues;
  /** Where the company lives, e.g. "nextup.app/acme". */
  address: string;
  knowledge: Knowledge;
  options: MemberOption[];
  me: string;
  members: MemberRow[];
  freeSeats: SeatLabel[];
};
type Props = {
  slug: string;
  /** Every form step, in order. */
  steps: readonly SetupFormStep[];
  /** The step shown, or "done". */
  step: SetupFormStep | "done";
  /** True when the visitor asked for a later step than the data allows. */
  blocked?: boolean;
  data: SetupData;
  /** Sample data without a database: every step can be looked at, nothing saves. */
  demo?: boolean;
};

const LABEL: Record<SetupFormStep, MessageKey> = {
  company: "settingsSetup.stepCompany", units: "settingsSetup.stepUnits", roles: "settingsSetup.stepRoles",
  routes: "settingsSetup.stepRoutes", members: "settingsSetup.stepMembers",
};
const HINT: Record<SetupFormStep, MessageKey> = {
  company: "settingsSetup.hintCompany", units: "settingsSetup.hintUnits", roles: "settingsSetup.hintRoles",
  routes: "settingsSetup.hintRoutes", members: "settingsSetup.hintMembers",
};

export function SetupWizard({ slug, steps, step, blocked, data, demo }: Props) {
  const t = useT();
  const base = `/${slug}/settings/setup`;
  const company = data.company.name || t("settingsSetup.title");
  if (step === "done") {
    const sum = orgSummary(data.knowledge);
    const counts: [number, string][] = [
      [sum.units, t("settingsSetup.countUnits")],
      [sum.roles, t("settingsSetup.countRoles")],
      [data.knowledge.holders.length, t("settingsSetup.countSeats", { vacant: String(sum.vacantSeats) })],
      [data.knowledge.rules.length, t("settingsSetup.countRoutes")],
      [data.members.filter((m) => m.active).length, t("settingsSetup.countMembers")],
    ];
    return (
      <section className={w.done} data-testid="setup-step-done">
        <SettingsHead title={data.company.name ? t("settingsSetup.doneTitleOf", { company: data.company.name }) : t("settingsSetup.doneTitle")} />
        <p className={`${s.card} ${w.counts}`}>
          {counts.map(([n, label]) => <span key={label}><strong>{n}</strong> {label}</span>)}
        </p>
        <p className={w.now}>{t("settingsSetup.doneNow")}</p>
        <h2 className={s.subLabel}>{t("settingsSetup.worthChecking")}</h2>
        <nav className={`${s.card} ${w.checks}`}>
          <Link href={`/${slug}/settings/rules`} className={w.check}><strong>{t("settingsCompany.navRules")}</strong><span>{t("settingsSetup.checkRules")}</span><span aria-hidden="true">→</span></Link>
          <Link href={`/${slug}/settings/calendar`} className={w.check}><strong>{t("settingsCompany.navCalendar")}</strong><span>{t("settingsSetup.checkCalendar")}</span><span aria-hidden="true">→</span></Link>
        </nav>
        <div className={w.nav}>
          <span />
          <Link className={s.save} href={`/${slug}/leader`} data-testid="setup-to-inbox">{t("settingsSetup.toInbox")}</Link>
        </div>
      </section>
    );
  }
  const i = steps.indexOf(step);
  const prev = steps[i - 1];
  const next = steps[i + 1];
  return (
    <section className={s.page} data-testid={`setup-step-${step}`}>
      <SettingsHead title={t("settingsSetup.titleOf", { company })} lede={t("settingsSetup.lede")} />
      <ol className={w.steps} aria-label={t("settingsSetup.stepsAria")}>
        {steps.map((x, n) => (
          <li key={x} className={w.step} data-state={n < i ? "done" : n === i ? "now" : undefined} aria-current={n === i ? "step" : undefined}>
            {n < i ? <Link href={`${base}?step=${x}`}>✓ {t(LABEL[x])}</Link> : <span>{t(LABEL[x])}</span>}
          </li>
        ))}
      </ol>
      <p className={s.cardHint} data-testid="setup-progress">{t("settingsSetup.stepOf", { n: String(i + 1), total: String(steps.length), step: t(LABEL[step]) })}</p>
      <p className={w.hint}>{t(HINT[step])}</p>
      {blocked ? <p className={s.fieldError} role="alert" data-testid="setup-blocked">{t("settingsSetup.notYet")}</p> : null}
      {step === "company" ? <CompanyForm slug={slug} values={data.company} address={data.address} demo={demo} /> : null}
      {step === "units" || step === "roles" ? <OrgEditor slug={slug} knowledge={data.knowledge} members={data.options} showHead={false} demo={demo} /> : null}
      {step === "routes" ? <RoutingEditor slug={slug} knowledge={data.knowledge} showHead={false} demo={demo} /> : null}
      {step === "members" ? <MembersView slug={slug} me={data.me} members={data.members} freeSeats={data.freeSeats} showHead={false} demo={demo} /> : null}
      <div className={w.nav}>
        {prev ? <Link className={s.soft} href={`${base}?step=${prev}`} data-testid="setup-back">← {t("settingsSetup.back")}</Link> : <span />}
        <Link className={s.save} href={`${base}?step=${next ?? "done"}`} data-testid="setup-next">{t("settingsSetup.next")} →</Link>
      </div>
    </section>
  );
}
