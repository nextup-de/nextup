"use client";
// Pseudonymise a person who left (GDP D19, spec 05). The red button works once the typed name equals
// the display name (case and spaces ignored); the checks that matter are repeated in the action.
import { useState, useTransition } from "react";
import { confirmMatches } from "@/features/privacy/pseudonymise";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { pseudonymisePerson, type PseudonymiseRefusal } from "@/server/actions/privacy-person";
import s from "./settings.module.css";

const REFUSAL: Record<PseudonymiseRefusal, MessageKey> = {
  "not-allowed": "privacyPerson.refusedNotAllowed",
  "not-found": "privacyPerson.refusedNotFound",
  active: "privacyPerson.refusedActive",
  self: "privacyPerson.refusedSelf",
  "holds-seat": "privacyPerson.refusedHoldsSeat",
  already: "privacyPerson.refusedAlready",
  "name-mismatch": "privacyPerson.refusedNameMismatch",
};

type Props = {
  slug: string;
  member: { id: string; name: string };
  onClose: () => void;
  onDone: (message: string) => void;
};

export function PseudonymiseDialog({ slug, member, onClose, onDone }: Props) {
  const t = useT();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    setError(null);
    start(async () => {
      const r = await pseudonymisePerson(slug, member.id, typed);
      if (!r.ok) { setError(t(REFUSAL[r.code])); return; }
      onDone(t("privacyPerson.pseudonymised", { name: member.name, label: r.label }));
    });
  };

  return (
    <div className={s.scrim} onClick={onClose}>
      <div className={s.dialog} role="alertdialog" aria-modal="true" aria-labelledby="member-pseudonymise-title" onClick={(e) => e.stopPropagation()} data-testid="member-pseudonymise-dialog">
        <h2 id="member-pseudonymise-title" className={s.cardTitle}>{t("privacyPerson.pseudonymiseTitle", { name: member.name })}</h2>
        <p className={s.dialogText}><strong>{t("privacyPerson.pseudonymiseWarning")}</strong></p>
        <ul className={s.dialogText}>
          <li>{t("privacyPerson.pseudonymisePoint1", { name: member.name, pseudonym: t("privacyPerson.pseudonym", { n: "####" }) })}</li>
          <li>{t("privacyPerson.pseudonymisePoint2")}</li>
          <li>{t("privacyPerson.pseudonymisePoint3")}</li>
          <li>{t("privacyPerson.pseudonymisePoint4")}</li>
        </ul>
        <label className={s.field}>
          <span className={s.label}>{t("privacyPerson.pseudonymiseConfirm")}</span>
          <input className={s.input} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" placeholder={member.name} data-testid="member-pseudonymise-name" />
        </label>
        {error ? <p className={s.fieldError} role="alert">{error}</p> : null}
        <div className={s.dialogButtons}>
          <button type="button" className={s.soft} onClick={onClose}>{t("privacyPerson.pseudonymiseCancel")}</button>
          <button type="button" className={s.dangerBtn} disabled={pending || !confirmMatches(typed, member.name)} onClick={submit} data-testid="member-pseudonymise-submit">
            {t("privacyPerson.pseudonymiseSubmit")}
          </button>
        </div>
      </div>
    </div>
  );
}
