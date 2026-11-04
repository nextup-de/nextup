"use client";
// "Reset second factor…" next to a stack-admin row in /admin People, with a confirm step.
import { useActionState, useState, useTransition } from "react";
import { adminResetTotpAction, type AdminTotpResetState } from "@/server/actions/settings/totp-reset";
import { ConfirmDialog } from "@/components/ui/elements";
import { useT } from "@/i18n/client";
import c from "./console.module.css";

type Props = { slug: string; userId: string; name: string };

export function TotpReset({ slug, userId, name }: Props) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const [state, act, pending] = useActionState<AdminTotpResetState, FormData>(adminResetTotpAction, {});
  const [, start] = useTransition();
  const reset = () => {
    setAsking(false);
    const form = new FormData();
    form.set("slug", slug);
    form.set("userId", userId);
    start(() => act(form));
  };
  return (
    <div className={c.inline}>
      <button className={c.btn} type="button" onClick={() => setAsking(true)} disabled={pending}>{t("adminAccess.totpReset")}</button>
      {asking ? (
        <ConfirmDialog
          title={t("adminConsole.totpResetTitle")}
          text={t("adminAccess.totpResetAsk", { name })}
          confirmLabel={t("adminAccess.totpResetConfirm")}
          cancelLabel={t("adminAccess.totpResetCancel")}
          danger
          onConfirm={reset}
          onCancel={() => setAsking(false)}
          testId="console-totp-reset-dialog"
        />
      ) : null}
      {state.error ? <span className={c.note} data-tone="error" role="alert">{state.error}</span> : null}
      {state.saved ? <span className={c.note} role="status">{t("adminAccess.totpResetDone")}</span> : null}
    </div>
  );
}
