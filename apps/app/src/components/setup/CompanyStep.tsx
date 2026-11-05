"use client";
// Setup step 1: the company's name, and below it the context draft. Everything else on the profile is not asked
// for here; it passes through untouched, because saveCompanyAction replaces the whole profile. A field the
// draft proposes is sent by the review in ContextPanel instead: its accepted text, or the value it has now.
import { useActionState, useEffect } from "react";
import { useT } from "@/i18n/client";
import type { CompanyForm } from "@/features/settings/company-forms";
import { type SettingsFormState } from "@/server/actions/settings/company";
import { saveContextReviewAction } from "@/server/actions/settings/setup-context";
import type { ContextPanelData } from "@/server/setup-context";
import settings from "@/components/settings/settings.module.css";
import { ContextPanel, draftedFields } from "./ContextPanel";
import { Field, StepCard, type StepFormProps } from "./parts";
import s from "./Setup.module.css";

export function CompanyStep({ slug, formId, onDirty, demo, values, context }: StepFormProps & { values: CompanyForm; context: ContextPanelData }) {
  const t = useT();
  const [state, act, pending] = useActionState<SettingsFormState, FormData>(saveContextReviewAction, {});
  useEffect(() => { if (state.ok) onDirty(false); }, [state, onDirty]);
  const p = values.profile;
  const nameError = state.field === "name" && state.error ? t(state.error) : undefined;
  const otherError = state.error && state.field !== "name" ? t(state.error) : undefined;
  const drafted = draftedFields(context);
  const pass = (name: "vision" | "mission" | "principles" | "businessModel" | "complianceRules", value: string) =>
    drafted.includes(name) ? null : <input type="hidden" name={name} value={value} />;
  return (
    <>
      <StepCard title={t("settingsSetup.cardCompany")} text={t("settingsSetup.cardCompanyText")}>
        <form id={formId} action={act} className={s.form} onInput={() => onDirty(true)}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="mark" value={values.mark} />
          {pass("vision", p.vision)}
          {pass("mission", p.mission)}
          {pass("principles", p.principles.join("\n"))}
          {pass("businessModel", p.businessModel)}
          {pass("complianceRules", p.complianceRules)}
          <Field label={t("settingsCompany.name")}>
            <input className={settings.input} name="name" defaultValue={values.name} required maxLength={120}
              aria-invalid={Boolean(nameError) || undefined} data-testid="setup-company-name" />
          </Field>
          {nameError ? <p className={s.refusal} role="alert">{nameError}</p> : null}
          {otherError ? <p className={s.refusal} role="alert" data-testid="setup-company-error">{otherError}</p> : null}
          <p className={s.fieldHelp}>{t("settingsSetup.cardCompanyLater")}</p>
          <div className={s.formFoot}>
            <span className={s.fieldHelp} role="status">{state.ok ? t("settingsCompany.saved") : demo ? t("settingsCompany.demoData") : ""}</span>
            <button type="submit" className={s.submit} disabled={pending || demo} data-testid="setup-company-save">
              {pending ? t("settingsCompany.saving") : t("settingsCompany.save")}
            </button>
          </div>
        </form>
      </StepCard>
      <ContextPanel slug={slug} formId={formId} data={context} profile={p} pending={pending} demo={demo} onDirty={onDirty} />
    </>
  );
}
