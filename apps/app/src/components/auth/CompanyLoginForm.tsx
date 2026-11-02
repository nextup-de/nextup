"use client";
// The company login: your personal code, or Microsoft. Either one says who you are - there is
// no list to pick from. Props in, JSX out - the decisions live in src/server/actions/auth.ts and
// src/server/microsoft-login.ts.
import { useActionState, useState } from "react";
import { useT } from "@/i18n/client";
import { codeLogin, type LoginState } from "@/server/actions/auth";
import { Field } from "@/components/ui/Field";
import { Divider } from "@/components/ui/Divider";
import { TotpEnrol } from "./TotpEnrol";
import { MicrosoftLogo } from "./MicrosoftLogo";
import styles from "./forms.module.css";

/**
 * `microsoftHref`: the start of the Microsoft sign-in, or null when this company is not on Entra
 * (then there is no button at all). `microsoftError`: why the last Microsoft attempt came back.
 */
type Props = { slug: string; short: string; next?: string; microsoftHref: string | null; microsoftError?: string };

export function CompanyLoginForm({ slug, short, next, microsoftHref, microsoftError }: Props) {
  // The action is passed directly, not wrapped in a closure: React needs the real server action
  // to give the form something to submit to before it hydrates.
  const t = useT();
  const [state, act, pending] = useActionState<LoginState, FormData>(codeLogin, {});
  // Our own message for an empty field, instead of the browser's "Please fill out this field"
  // bubble (the form is noValidate). Cleared as soon as they type.
  const [localError, setLocalError] = useState<string | null>(null);
  // Controlled, so a wrong code stays in the field to fix - React resets a form after its action.
  const [code, setCode] = useState("");
  const error = localError ?? state.error;
  // Second step for a manager: the code was right, now the authenticator (or enrolling one first).
  const step = state.step;

  return (
    <form
      className={styles.form}
      action={act}
      onSubmit={(e) => {
        if (!step && !code.trim()) {
          e.preventDefault();
          setLocalError(t("auth.loginCodeRequired", { slug }));
        }
      }}
      autoComplete="off"
      noValidate
    >
      <input type="hidden" name="slug" value={slug} />
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {microsoftError ? (
        <p className="nh-error" role="alert">
          <span>{microsoftError}</span>
        </p>
      ) : null}

      {step ? (
        <>
          {/* The code is sent again with the second factor; the server checks both every time. */}
          <input type="hidden" name="code" value={code} />
          {step === "enrol" && state.secret && state.otpauth ? (
            <>
              <input type="hidden" name="secret" value={state.secret} />
              <TotpEnrol secret={state.secret} otpauth={state.otpauth} />
            </>
          ) : (
            <>
              <h2>{t("adminAccess.totpStepTitle")}</h2>
              <p className="nh-hint">{t("adminAccess.totpStepSub")}</p>
            </>
          )}
          <Field id="totp" label={t("adminAccess.totpLabel")} error={state.error} hint={t("adminAccess.totpHint")}>
            <input
              className="nh-input"
              id="totp"
              name="totp"
              type="text"
              inputMode="numeric"
              pattern="[0-9 ]*"
              maxLength={7}
              autoComplete="one-time-code"
              aria-invalid={state.error ? true : undefined}
              autoFocus
            />
          </Field>
        </>
      ) : (
        <Field id="code" label={t("auth.loginCodeLabel")} error={error}>
          <input
            className="nh-input"
            id="code"
            name="code"
            type="text"
            placeholder={t("auth.loginCodePlaceholder", { slug })}
            autoComplete="one-time-code"
            autoCapitalize="none"
            spellCheck={false}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setLocalError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "code-error" : undefined}
            autoFocus
          />
        </Field>
      )}

      <button className="nh-btn nh-btn-primary nh-btn-block" type="submit" disabled={pending}>
        {pending ? t("auth.oneMoment") : step === "enrol" ? t("adminAccess.enrolConfirm") : t("auth.logIn")}
      </button>

      {microsoftHref ? (
        <>
          <Divider />
          <a className="nh-btn nh-btn-ghost nh-btn-block" href={microsoftHref}>
            <MicrosoftLogo />
            {t("auth.continueWithMicrosoft")}
          </a>
          <p className={`nh-hint ${styles.under}`}>
            {t("auth.workAccount", { short })}
          </p>
        </>
      ) : null}
    </form>
  );
}
