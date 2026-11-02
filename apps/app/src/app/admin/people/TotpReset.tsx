"use client";
// "Reset second factor…" next to a stack-admin row in /admin People, with a confirm step.
import { useActionState, useState } from "react";
import { adminResetTotpAction, type AdminTotpResetState } from "@/server/actions/settings/totp-reset";
import { useT } from "@/i18n/client";
import styles from "../admin.module.css";

type Props = { slug: string; userId: string; name: string };

export function TotpReset({ slug, userId, name }: Props) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const [state, act, pending] = useActionState<AdminTotpResetState, FormData>(adminResetTotpAction, {});
  return (
    <form action={(f) => { setAsking(false); act(f); }} className={styles.accessPerson}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="userId" value={userId} />
      {asking ? (
        <>
          <span className={styles.rowMeta}>{t("adminAccess.totpResetAsk", { name })}</span>
          <button className="nh-btn nh-btn-ghost nh-btn-sm" type="submit" disabled={pending}>{t("adminAccess.totpResetConfirm")}</button>
          <button className="nh-btn nh-btn-ghost nh-btn-sm" type="button" onClick={() => setAsking(false)}>{t("adminAccess.totpResetCancel")}</button>
        </>
      ) : (
        <button className="nh-btn nh-btn-ghost nh-btn-sm" type="button" onClick={() => setAsking(true)} disabled={pending}>{t("adminAccess.totpReset")}</button>
      )}
      {state.error ? <span className={styles.error} role="alert">{state.error}</span> : null}
      {state.saved ? <span className={styles.rowMeta} role="status">{t("adminAccess.totpResetDone")}</span> : null}
    </form>
  );
}
