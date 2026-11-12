"use client";
// Correct the name and the email of a member who does not come from the directory (RES-M1, D23). The action
// repeats every check; this dialog only shows its error and says that earlier events keep the old name.
import { useActionState, useEffect } from "react";
import { useT } from "@/i18n/client";
import { saveMemberDetailsAction, type EditState } from "@/server/actions/members";
import s from "./settings.module.css";

type Props = {
  slug: string;
  member: { id: string; name: string; email: string };
  onClose: () => void;
  onDone: () => void;
};

export function MemberEditDialog({ slug, member, onClose, onDone }: Props) {
  const t = useT();
  const [state, action, pending] = useActionState<EditState, FormData>(saveMemberDetailsAction, {});
  useEffect(() => { if (state.saved) onDone(); }, [state.saved, onDone]);

  return (
    <div className={s.scrim} onClick={onClose}>
      <form action={action} className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="member-edit-title" onClick={(e) => e.stopPropagation()} data-testid="member-edit-dialog">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="userId" value={member.id} />
        <h2 id="member-edit-title" className={s.cardTitle}>{t("settings.memberEditTitle", { name: member.name })}</h2>
        <label className={s.field}><span className={s.label}>{t("settings.name")}</span>
          <input className={s.input} name="name" defaultValue={member.name} required autoComplete="off" autoFocus data-testid="member-edit-name" /></label>
        <label className={s.field}><span className={s.label}>{t("settings.memberEditEmail")}</span>
          <input className={s.input} name="email" type="email" defaultValue={member.email} autoComplete="off" data-testid="member-edit-email" /></label>
        <p className={s.cardHint}>{t("settings.memberEditNote")}</p>
        {state.error ? <p className={s.fieldError} role="alert">{state.error}</p> : null}
        <div className={s.dialogButtons}>
          <button type="button" className={s.soft} onClick={onClose}>{t("settings.cancel")}</button>
          <button type="submit" className={s.save} disabled={pending} data-testid="member-edit-save">{t("settings.memberEditSave")}</button>
        </div>
      </form>
    </div>
  );
}
