"use client";
// One step of the setup process: title, progress, the step's card (Paper: "Pilot 02 · Routing and
// setup") and Back / Next. Props in; every save goes through the card's form and its action, the same
// action the matching Settings page uses, so there is no write path here (ADM D14).
import { useState } from "react";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import type { CompanyForm as CompanyValues } from "@/features/settings/company-forms";
import type { Knowledge } from "@/features/knowledge";
import type { SetupFormStep } from "@/server/actions/settings/setup";
import type { MemberRow, SeatLabel } from "@/server/actions/members";
import type { MemberOption } from "@/components/settings/OrgEditor";
import type { ContextPanelData } from "@/server/setup-context";
import { SettingsHead } from "@/components/settings/SettingsParts";
import { CompanyStep } from "./CompanyStep";
import { MembersStep } from "./MembersStep";
import { RolesStep } from "./RolesStep";
import { RoutesStep } from "./RoutesStep";
import { SetupFooter } from "./SetupFooter";
import { SetupProgress } from "./SetupProgress";
import { UnitsStep } from "./UnitsStep";
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
  /** The company context draft, on the Company step. */
  context: ContextPanelData;
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

const NEEDS: Record<SetupFormStep, MessageKey> = {
  company: "settingsSetup.needsCompany", units: "settingsSetup.needsUnits", roles: "settingsSetup.needsRoles",
  routes: "settingsSetup.needsRoutes", members: "settingsSetup.needsMembers",
};
const THING: Record<SetupFormStep, MessageKey> = {
  company: "settingsSetup.thingCompany", units: "settingsSetup.thingUnit", roles: "settingsSetup.thingRole",
  routes: "settingsSetup.thingRoute", members: "settingsSetup.thingMember",
};

export function SetupStepView({ base, slug, steps, step, data, ready, resume, demo }: Props) {
  const t = useT();
  const [dirty, setDirty] = useState(false);
  const i = steps.indexOf(step);
  const prev = steps[i - 1];
  const next = steps[i + 1];
  const company = data.company.name || t("settingsSetup.title");
  const k = data.knowledge;
  const added: Record<SetupFormStep, string> = {
    company: "",
    units: t("settingsSetup.hasUnits", { n: String(k.units.length) }),
    roles: t("settingsSetup.hasRoles", { n: String(k.roles.length) }),
    routes: t("settingsSetup.hasRoutes", { n: String(k.rules.length) }),
    members: t("settingsSetup.hasMembers", { n: String(data.members.filter((m) => m.active).length) }),
  };
  const form = { slug, formId: "setup-form", onDirty: setDirty, demo };
  return (
    <section className={s.page} data-testid={`setup-step-${step}`}>
      <SettingsHead title={t("settingsSetup.titleOf", { company })} lede={t("settingsSetup.lede")} />
      <SetupProgress base={base} steps={steps} step={step} resume={resume} />
      {step === "company" ? <CompanyStep {...form} values={data.company} context={data.context} /> : null}
      {step === "units" ? <UnitsStep {...form} knowledge={k} /> : null}
      {step === "roles" ? <RolesStep {...form} knowledge={k} members={data.options} /> : null}
      {step === "routes" ? <RoutesStep {...form} knowledge={k} /> : null}
      {step === "members" ? <MembersStep {...form} me={data.me} members={data.members} knowledge={k} options={data.options} /> : null}
      <SetupFooter
        backHref={prev ? `${base}/${prev}` : null}
        nextHref={`${base}/${next ?? "done"}`}
        ready={ready}
        hint={ready ? added[step] : t(NEEDS[step])}
        unsaved={dirty ? { thing: t(THING[step]), formId: form.formId } : null}
      />
    </section>
  );
}
