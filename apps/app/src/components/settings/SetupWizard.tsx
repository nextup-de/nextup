"use client";
// The setup wizard (ADM D14): one step at a time, showing the step's own editor. Props in; every
// save goes through the editor's own action, so there is no write path here. Back and Next are
// links: the page derives the step again on each load and never lets Next skip an unfinished one.
import Link from "next/link";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import type { CompanyForm as CompanyValues } from "@/features/settings/company-forms";
import type { Knowledge } from "@/features/knowledge";
import type { SetupFormStep } from "@/server/actions/settings/setup";
import type { MemberRow, SeatLabel } from "@/server/actions/members";
import { CompanyForm } from "./CompanyForm";
import { MembersView } from "./MembersView";
import { OrgEditor, type MemberOption } from "./OrgEditor";
import { RoutingEditor } from "./RoutingEditor";

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
};

const LABEL: Record<SetupFormStep, MessageKey> = {
  company: "settingsSetup.stepCompany", units: "settingsSetup.stepUnits", roles: "settingsSetup.stepRoles",
  routes: "settingsSetup.stepRoutes", members: "settingsSetup.stepMembers",
};
const HINT: Record<SetupFormStep, MessageKey> = {
  company: "settingsSetup.hintCompany", units: "settingsSetup.hintUnits", roles: "settingsSetup.hintRoles",
  routes: "settingsSetup.hintRoutes", members: "settingsSetup.hintMembers",
};

export function SetupWizard({ slug, steps, step, blocked, data }: Props) {
  const t = useT();
  const base = `/${slug}/settings/setup`;
  if (step === "done") {
    return (
      <section data-testid="setup-step-done" style={{ display: "grid", gap: 12 }}>
        <h1>{t("settingsSetup.doneTitle")}</h1>
        <p>{t("settingsSetup.doneText")}</p>
        <p><Link className="nh-btn nh-btn-primary" href={`/${slug}/leader`} data-testid="setup-to-inbox">{t("settingsSetup.toInbox")}</Link></p>
      </section>
    );
  }
  const i = steps.indexOf(step);
  const prev = steps[i - 1];
  const next = steps[i + 1];
  return (
    <section data-testid={`setup-step-${step}`} style={{ display: "grid", gap: 16 }}>
      <h1>{t("settingsSetup.title")}</h1>
      <p className="nh-hint" data-testid="setup-progress">
        {t("settingsSetup.progress", { n: String(i + 1), total: String(steps.length) })} · {t(LABEL[step])}
      </p>
      <p className="nh-hint">{t(HINT[step])}</p>
      {blocked ? <p className="nh-error" role="alert" data-testid="setup-blocked">{t("settingsSetup.notYet")}</p> : null}
      {step === "company" ? <CompanyForm slug={slug} values={data.company} address={data.address} /> : null}
      {step === "units" || step === "roles" ? <OrgEditor slug={slug} knowledge={data.knowledge} members={data.options} /> : null}
      {step === "routes" ? <RoutingEditor slug={slug} knowledge={data.knowledge} showHead={false} /> : null}
      {step === "members" ? <MembersView slug={slug} me={data.me} members={data.members} freeSeats={data.freeSeats} /> : null}
      <div style={{ display: "flex", gap: 12 }}>
        {prev ? <Link className="nh-btn nh-btn-ghost" href={`${base}?step=${prev}`} data-testid="setup-back">{t("settingsSetup.back")}</Link> : null}
        <Link className="nh-btn nh-btn-primary" href={`${base}?step=${next ?? "done"}`} data-testid="setup-next">{t("settingsSetup.next")}</Link>
      </div>
    </section>
  );
}
