"use client";
// /settings/company: name, mark and the profile. Props in, the action out; no fetching here.
import { useActionState } from "react";
import { Field } from "@/components/ui/Field";
import { useT } from "@/i18n/client";
import type { CompanyForm as Values } from "@/features/settings/company-forms";
import { saveCompanyAction, type SettingsFormState } from "@/server/actions/settings/company";

const grid = { display: "grid", gap: 16, maxWidth: 640 } as const;

export function CompanyForm({ slug, values }: { slug: string; values: Values }) {
  const t = useT();
  const [state, act, pending] = useActionState<SettingsFormState, FormData>(saveCompanyAction, {});
  const err = (f: string) => (state.field === f && state.error ? t(state.error) : undefined);
  const p = values.profile;
  return (
    <form action={act} style={grid} data-testid="settings-company-form">
      <input type="hidden" name="slug" value={slug} />
      <Field id="name" label={t("settingsCompany.name")} error={err("name")}>
        <input className="nh-input" id="name" name="name" defaultValue={values.name} required data-testid="settings-company-name" />
      </Field>
      <Field id="mark" label={t("settingsCompany.mark")} hint={t("settingsCompany.markHint")} error={err("mark")}>
        <input className="nh-input" id="mark" name="mark" defaultValue={values.mark} data-testid="settings-company-mark" />
      </Field>
      <Field id="vision" label={t("settingsCompany.vision")} error={err("vision")}>
        <textarea className="nh-input" id="vision" name="vision" rows={3} defaultValue={p.vision} data-testid="settings-company-vision" />
      </Field>
      <Field id="mission" label={t("settingsCompany.mission")} error={err("mission")}>
        <textarea className="nh-input" id="mission" name="mission" rows={3} defaultValue={p.mission} data-testid="settings-company-mission" />
      </Field>
      <Field id="principles" label={t("settingsCompany.principles")} hint={t("settingsCompany.principlesHint")} error={err("principles")}>
        <textarea className="nh-input" id="principles" name="principles" rows={4} defaultValue={p.principles.join("\n")} data-testid="settings-company-principles" />
      </Field>
      <Field id="businessModel" label={t("settingsCompany.businessModel")} error={err("businessModel")}>
        <textarea className="nh-input" id="businessModel" name="businessModel" rows={3} defaultValue={p.businessModel} data-testid="settings-company-business-model" />
      </Field>
      <Field id="complianceRules" label={t("settingsCompany.complianceRules")} hint={t("settingsCompany.complianceHint")} error={err("complianceRules")}>
        <textarea className="nh-input" id="complianceRules" name="complianceRules" rows={5} defaultValue={p.complianceRules} data-testid="settings-company-compliance" />
      </Field>
      {state.error && !state.field ? <p className="nh-error" role="alert" data-testid="settings-company-error">{t(state.error)}</p> : null}
      {state.ok ? <p className="nh-hint" role="status" data-testid="settings-company-saved">{t("settingsCompany.saved")}</p> : null}
      <div>
        <button className="nh-btn nh-btn-primary" type="submit" disabled={pending} data-testid="settings-company-save">
          {pending ? t("settingsCompany.saving") : t("settingsCompany.save")}
        </button>
      </div>
    </form>
  );
}
