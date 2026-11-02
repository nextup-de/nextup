"use client";
// One row of /admin People: may this person open /admin with their own code and authenticator?
import { useActionState } from "react";
import { setStackAdminAction, type StackAdminState } from "@/server/actions/admin";
import { useT } from "@/i18n/client";
import styles from "@/app/admin/admin.module.css";

type Props = { slug: string; userId: string; name: string; isStackAdmin: boolean; hasTotp: boolean };

export function StackAdminSwitch({ slug, userId, name, isStackAdmin, hasTotp }: Props) {
  const t = useT();
  const [state, act, pending] = useActionState<StackAdminState, FormData>(setStackAdminAction, {});
  return (
    <form action={act} className={styles.accessPerson}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="userId" value={userId} />
      <label>
        <input type="checkbox" name="stackAdmin" defaultChecked={isStackAdmin} aria-label={`${t("adminAccess.stackAdmin")}: ${name}`} />{" "}
        <strong>{name}</strong> <span className={styles.rowMeta}>· {t("adminAccess.stackAdminOn")}{hasTotp ? "" : ` · ${t("adminAccess.stackAdminNoTotp")}`}</span>
      </label>
      <button className="nh-btn nh-btn-ghost nh-btn-sm" type="submit" disabled={pending}>{t("adminAccess.stackAdminSave")}</button>
      {state.error ? <span className={styles.error} role="alert">{state.error}</span> : null}
      {state.saved ? <span className={styles.rowMeta} role="status">{t("adminAccess.stackAdminSaved")}</span> : null}
    </form>
  );
}
