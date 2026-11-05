"use client";
// Setup step 1: the company's name. Everything else on the profile is not asked for here; it passes
// through untouched, because saveCompanyAction replaces the whole profile.
import { useActionState, useEffect } from "react";
import { useT } from "@/i18n/client";
import type { CompanyForm } from "@/features/settings/company-forms";
import { saveCompanyAction, type SettingsFormState } from "@/server/actions/settings/company";
import settings from "@/components/settings/settings.module.css";
import { Field, StepCard, type StepFormProps } from "./parts";
import s from "./Setup.module.css";

export function CompanyStep({ slug, formId, onDirty, demo, values }: StepFormProps & { values: CompanyForm }) {
  const t = useT();
  const [state, act, pending] = useActionState<SettingsFormState, FormData>(saveCompanyAction, {});
  useEffect(() => { if (state.ok) onDirty(false); }, [state, onDirty]);
  const p = values.profile;
  const nameError = state.field === "name" && state.error ? t(state.error) : undefined;
  const otherError = state.error && state.field !== "name" ? t(state.error) : undefined;
  return (
    <StepCard title={t("settingsSetup.cardCompany")} text={t("settingsSetup.cardCompanyText")}>
      <form id={formId} action={act} className={s.form} onInput={() => onDirty(true)}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="mark" value={values.mark} />
        <input type="hidden" name="vision" value={p.vision} />
        <input type="hidden" name="mission" value={p.mission} />
        <input type="hidden" name="principles" value={p.principles.join("\n")} />
        <input type="hidden" name="businessModel" value={p.businessModel} />
        <input type="hidden" name="complianceRules" value={p.complianceRules} />
        <Field label={t("settingsCompany.name")}>
          <input className={settings.input} name="name" defaultValue={values.name} required maxLength={120}
            aria-invalid={Boolean(nameError) || undefined} data-testid="setup-company-name" />
        </Field>
        {nameError ? <p className={s.refusal} role="alert">{nameError}</p> : null}
        {otherError ? <p className={s.refusal} role="alert">{otherError}</p> : null}
        <p className={s.fieldHelp}>{t("settingsSetup.cardCompanyLater")}</p>
        <div className={s.formFoot}>
          <span className={s.fieldHelp} role="status">{state.ok ? t("settingsCompany.saved") : demo ? t("settingsCompany.demoData") : ""}</span>
          <button type="submit" className={s.submit} disabled={pending || demo} data-testid="setup-company-save">
            {pending ? t("settingsCompany.saving") : t("settingsCompany.save")}
          </button>
        </div>
      </form>
    </StepCard>
  );
}
