"use client";
// One step of the setup process, showing the step's own editor. Props in; every save goes through the
// editor's own action, so there is no write path here (ADM D14).
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import type { CompanyForm as CompanyValues } from "@/features/settings/company-forms";
import type { Knowledge } from "@/features/knowledge";
import type { SetupFormStep } from "@/server/actions/settings/setup";
import type { MemberRow, SeatLabel } from "@/server/actions/members";
import { CompanyForm } from "@/components/settings/CompanyForm";
import { MembersView } from "@/components/settings/MembersView";
import { OrgEditor, type MemberOption } from "@/components/settings/OrgEditor";
import { RoutingEditor } from "@/components/settings/RoutingEditor";
import { SettingsHead } from "@/components/settings/SettingsParts";
import { SetupFooter } from "./SetupFooter";
import { SetupProgress } from "./SetupProgress";
import s from "./Setup.module.css";

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
  /** The company's setup address, without a step. */
  base: string;
  slug: string;
  /** Every form step, in order. */
  steps: readonly SetupFormStep[];
  step: SetupFormStep;
  data: SetupData;
  /** This step is done, so Next may go on. */
  ready: boolean;
  /** The visitor came back to a started setup. */
  resume?: boolean;
  /** Sample data without a database: every step can be looked at, nothing saves. */
  demo?: boolean;
};

const HINT: Record<SetupFormStep, MessageKey> = {
  company: "settingsSetup.hintCompany", units: "settingsSetup.hintUnits", roles: "settingsSetup.hintRoles",
  routes: "settingsSetup.hintRoutes", members: "settingsSetup.hintMembers",
};
const NEEDS: Record<SetupFormStep, MessageKey> = {
  company: "settingsSetup.needsCompany", units: "settingsSetup.needsUnits", roles: "settingsSetup.needsRoles",
  routes: "settingsSetup.needsRoutes", members: "settingsSetup.needsMembers",
};

export function SetupStepView({ base, slug, steps, step, data, ready, resume, demo }: Props) {
  const t = useT();
  const i = steps.indexOf(step);
  const prev = steps[i - 1];
  const next = steps[i + 1];
  const company = data.company.name || t("settingsSetup.title");
  const added: Record<SetupFormStep, string> = {
    company: "",
    units: t("settingsSetup.hasUnits", { n: String(data.knowledge.units.length) }),
    roles: t("settingsSetup.hasRoles", { n: String(data.knowledge.roles.length) }),
    routes: t("settingsSetup.hasRoutes", { n: String(data.knowledge.rules.length) }),
    members: t("settingsSetup.hasMembers", { n: String(data.members.filter((m) => m.active).length) }),
  };
  return (
    <section className={s.page} data-testid={`setup-step-${step}`}>
      <SettingsHead title={t("settingsSetup.titleOf", { company })} lede={t("settingsSetup.lede")} />
      <SetupProgress base={base} steps={steps} step={step} resume={resume} />
      <p className={s.hint}>{t(HINT[step])}</p>
      {step === "company" ? <CompanyForm slug={slug} values={data.company} address={data.address} demo={demo} /> : null}
      {step === "units" || step === "roles" ? <OrgEditor slug={slug} knowledge={data.knowledge} members={data.options} showHead={false} demo={demo} /> : null}
      {step === "routes" ? <RoutingEditor slug={slug} knowledge={data.knowledge} showHead={false} demo={demo} /> : null}
      {step === "members" ? <MembersView slug={slug} me={data.me} members={data.members} freeSeats={data.freeSeats} showHead={false} demo={demo} /> : null}
      <SetupFooter
        backHref={prev ? `${base}/${prev}` : null}
        nextHref={`${base}/${next ?? "done"}`}
        ready={ready}
        hint={ready ? added[step] : t(NEEDS[step])}
      />
    </section>
  );
}
