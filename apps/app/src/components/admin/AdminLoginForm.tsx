"use client";
import { useActionState, useState } from "react";
import { adminSignIn, type AdminLoginState } from "@/server/actions/admin";
import { supportSignIn } from "@/server/actions/support-access";
import { useT } from "@/i18n/client";
import { Field } from "@/components/ui/Field";
import styles from "@/components/auth/forms.module.css";

/**
 * `demoCode` is the server's own ADMIN_ACCESS_CODE, handed down only when the box sets
 * ADMIN_DEMO_FILL=true - a one-click fill for a live demo. It reaches the browser in the page
 * source, so the flag belongs on a demo box and nowhere else. Null means no button at all.
 */
export function AdminLoginForm({ demoCode }: { demoCode?: string | null }) {
  const [state, act, pending] = useActionState<AdminLoginState, FormData>(adminSignIn, {});
  const [supportState, supportAct, supportPending] = useActionState<AdminLoginState, FormData>(
    (_prev, form) => supportSignIn(String(form.get("supportCode") ?? "")),
    {},
  );
  const t = useT();
  const [code, setCode] = useState("");

  return (
    <>
    <form action={act} className={styles.form} autoComplete="off">
      <Field id="code" label={t("adminAccess.loginCodeLabel")}>
        <div className={styles.inputWrap}>
          <input
            className={`nh-input ${demoCode ? styles.inputWithFill : ""}`}
            id="code"
            name="code"
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
            required
          />
          {demoCode ? (
            <button
              className={styles.fill}
              type="button"
              aria-label={t("adminAccess.loginFillAria")}
              onClick={() => setCode(demoCode)}
            >
              {t("adminAccess.loginFill")}
            </button>
          ) : null}
        </div>
      </Field>
      <Field id="totp" label={t("adminAccess.totpLabel")} hint={t("adminAccess.adminTotpHint")}>
        <input className="nh-input" id="totp" name="totp" type="text" inputMode="numeric" pattern="[0-9 ]*" maxLength={7} autoComplete="one-time-code" />
      </Field>
      {state.error ? <p className={styles.error} role="alert">{state.error}</p> : null}
      <button className="nh-btn nh-btn-primary nh-btn-block" type="submit" disabled={pending}>
        {pending ? t("adminAccess.loginChecking") : t("adminAccess.loginUnlock")}
      </button>
    </form>
      <form action={supportAct} className={styles.form} autoComplete="off" data-testid="console-support-signin">
        <Field id="supportCode" label={t("adminSupport.codeLabel")} hint={t("adminSupport.codeHint")}>
          <input className="nh-input" id="supportCode" name="supportCode" type="password" required />
        </Field>
        {supportState.error ? <p className={styles.error} role="alert">{supportState.error}</p> : null}
        <button className="nh-btn nh-btn-ghost nh-btn-block" type="submit" disabled={supportPending}>{t("adminSupport.signIn")}</button>
      </form>
    </>
  );
}
