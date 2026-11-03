"use client";
// Export one person's data (GDP D19, spec 05). The choice of who gets the file comes from
// memberPrivacyActions; the export itself is server/actions/privacy-export.ts.
import { useState, useTransition } from "react";
import type { MemberPrivacyActions } from "@/features/privacy/member-menu";
import { useT } from "@/i18n/client";
import { requestExport } from "@/server/actions/privacy-export";
import s from "./settings.module.css";

type Props = {
  slug: string;
  member: { id: string; name: string; active: boolean };
  exportTo: MemberPrivacyActions["exportTo"];
  onClose: () => void;
  onDone: (message: string) => void;
};

export function PersonExportDialog({ slug, member, exportTo, onClose, onDone }: Props) {
  const t = useT();
  const canPerson = member.active && exportTo.includes("person");
  const [to, setTo] = useState<"person" | "admin">(canPerson ? "person" : "admin");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    setError(null);
    start(async () => {
      const r = await requestExport(slug, {
        kind: "person",
        subjectUserId: member.id,
        deliverTo: to,
        ...(member.active ? {} : { adminOnlyReason: t("privacyPerson.exportInactiveReason") }),
      });
      if (!r.ok) { setError(r.error); return; }
      onDone(t(to === "person" ? "privacyPerson.exportStartedPerson" : "privacyPerson.exportStartedMe", { name: member.name }));
    });
  };

  return (
    <div className={s.scrim} onClick={onClose}>
      <div className={s.dialog} role="dialog" aria-modal="true" aria-labelledby="member-export-title" onClick={(e) => e.stopPropagation()} data-testid="member-export-dialog">
        <h2 id="member-export-title" className={s.cardTitle}>{t("privacyPerson.exportTitle", { name: member.name })}</h2>
        <p className={s.dialogText}>{t("privacyPerson.exportIn")}</p>
        <p className={s.dialogText}>{t("privacyPerson.exportNotIn")}</p>
        {member.active ? (
          <fieldset className={s.field}>
            <legend className={s.label}>{t("privacyPerson.exportSendTo")}</legend>
            <label>
              <input type="radio" name="deliverTo" checked={to === "person"} disabled={!canPerson} onChange={() => setTo("person")} data-testid="member-export-to-person" />{" "}
              {t("privacyPerson.exportToPerson", { name: member.name })}
              {!canPerson ? <span className={s.mute}> · {t("privacyPerson.exportNoEmail")}</span> : null}
            </label>
            <label>
              <input type="radio" name="deliverTo" checked={to === "admin"} onChange={() => setTo("admin")} data-testid="member-export-to-me" />{" "}
              {t("privacyPerson.exportToMe")}
            </label>
            {to === "admin" ? <span className={s.cardHint}>{t("privacyPerson.exportToMeHint")}</span> : null}
          </fieldset>
        ) : (
          <p className={s.dialogText} data-testid="member-export-inactive">
            {t("privacyPerson.exportInactive", { name: member.name })}
          </p>
        )}
        <p className={s.dialogText}>{t("privacyPerson.exportFormat")} · {t("privacyPerson.exportFormatValue")}</p>
        <p className={s.cardHint}>{t("privacyPerson.exportExpiry")}</p>
        {error ? <p className={s.fieldError} role="alert">{error}</p> : null}
        <div className={s.dialogButtons}>
          <button type="button" className={s.soft} onClick={onClose}>{t("privacyPerson.exportCancel")}</button>
          <button type="button" className={s.save} disabled={pending} onClick={submit} data-testid="member-export-submit">{t("privacyPerson.exportSubmit")}</button>
        </div>
      </div>
    </div>
  );
}
