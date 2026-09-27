"use client";
// The company login: your personal code, or Microsoft. Either one says who you are - there is
// no list to pick from. Props in, JSX out - the decisions live in src/server/actions/auth.ts and
// src/server/microsoft-login.ts.
import { useActionState, useState } from "react";
import { codeLogin, type LoginState } from "@/server/actions/auth";
import { Field } from "@/components/ui/Field";
import { Divider } from "@/components/ui/Divider";
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
  const [state, act, pending] = useActionState<LoginState, FormData>(codeLogin, {});
  // Our own message for an empty field, instead of the browser's "Please fill out this field"
  // bubble (the form is noValidate). Cleared as soon as they type.
  const [localError, setLocalError] = useState<string | null>(null);
  // Controlled, so a wrong code stays in the field to fix - React resets a form after its action.
  const [code, setCode] = useState("");
  const error = localError ?? state.error;

  return (
    <form
      className={styles.form}
      action={act}
      onSubmit={(e) => {
        if (!code.trim()) {
          e.preventDefault();
          setLocalError(`Enter your personal login code. Your team leader has it - it looks like ${slug}-xxxx-xxxx-xxxx.`);
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

      <Field id="code" label="Your login code" error={error}>
        <input
          className="nh-input"
          id="code"
          name="code"
          type="text"
          placeholder={`${slug}-xxxx-xxxx-xxxx`}
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

      <button className="nh-btn nh-btn-primary nh-btn-block" type="submit" disabled={pending}>
        {pending ? "One moment…" : "Log in"}
      </button>

      {microsoftHref ? (
        <>
          <Divider />
          <a className="nh-btn nh-btn-ghost nh-btn-block" href={microsoftHref}>
            <MicrosoftLogo />
            Continue with Microsoft
          </a>
          <p className={`nh-hint ${styles.under}`}>
            With your {short} work account.
          </p>
        </>
      ) : null}
    </form>
  );
}
