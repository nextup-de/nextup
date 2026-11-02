"use client";
// Login step 1: work email or company name. The lookup lives in findCompany
// (src/server/actions/auth.ts); this only shows its answer.
import { useActionState } from "react";
import { useT } from "@/i18n/client";
import { findCompany, type FindState } from "@/server/actions/auth";
import { Field } from "@/components/ui/Field";
import { Divider } from "@/components/ui/Divider";
import styles from "./forms.module.css";

export function FindCompanyForm() {
  const t = useT();
  const [state, act, pending] = useActionState<FindState, FormData>(findCompany, {});
  return (
    <form className={styles.form} action={act} autoComplete="off" noValidate>
      {state.error ? (
        <p className="nh-error" role="alert">
          <span>{state.error}</span>
        </p>
      ) : null}

      <Field id="email" label={t("auth.workEmail")}>
        <input
          className="nh-input"
          id="email"
          name="email"
          type="email"
          placeholder={t("auth.emailPlaceholder")}
          autoComplete="email"
          defaultValue={state.email}
        />
      </Field>

      <Divider />

      <Field id="company" label={t("auth.companyName")} hint={t("auth.companyHint")}>
        <div className={styles.slug}>
          <input
            className="nh-input"
            id="company"
            name="company"
            type="text"
            placeholder={t("auth.companyPlaceholder")}
            autoComplete="organization"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={state.company}
          />
          <span className={`${styles.slugSuffix} nh-mono`}>{t("auth.slugSuffix")}</span>
        </div>
      </Field>

      <button className="nh-btn nh-btn-primary nh-btn-block" type="submit" disabled={pending}>
        {pending ? t("auth.oneMoment") : t("auth.continue")}
      </button>
    </form>
  );
}
