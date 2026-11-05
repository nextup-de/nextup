"use client";
// The progress line of the setup process (Paper: "Pilot 02 · Routing and setup"). A step before the
// current one links back to its page; a later one is not clickable.
import Link from "next/link";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import type { SetupFormStep } from "@/server/actions/settings/setup";
import s from "./Setup.module.css";

export const STEP_LABEL: Record<SetupFormStep, MessageKey> = {
  company: "settingsSetup.stepCompany", units: "settingsSetup.stepUnits", roles: "settingsSetup.stepRoles",
  routes: "settingsSetup.stepRoutes", members: "settingsSetup.stepMembers",
};

type Props = { base: string; steps: readonly SetupFormStep[]; step: SetupFormStep; resume?: boolean };

export function SetupProgress({ base, steps, step, resume }: Props) {
  const t = useT();
  const i = steps.indexOf(step);
  return (
    <div className={s.progress}>
      <Link className={s.allPhases} href={base} data-testid="setup-all-phases">← {t("settingsSetupPhases.allPhases")}</Link>
      <ol className={s.steps} aria-label={t("settingsSetup.stepsAria")}>
        {steps.map((x, n) => (
          <li key={x} className={s.step} data-state={n < i ? "done" : n === i ? "now" : undefined} aria-current={n === i ? "step" : undefined}>
            {n < i ? <Link href={`${base}/${x}`}>✓ {t(STEP_LABEL[x])}</Link> : <span>{t(STEP_LABEL[x])}</span>}
          </li>
        ))}
      </ol>
      <p className={s.stepOf} data-testid="setup-progress">{t("settingsSetup.stepOf", { n: String(i + 1), total: String(steps.length), step: t(STEP_LABEL[step]) })}</p>
      {resume ? <p className={s.resume} data-testid="setup-resume">{t("settingsSetup.resume", { n: String(i + 1) })}</p> : null}
    </div>
  );
}
