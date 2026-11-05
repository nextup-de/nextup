"use client";
// Back and Next of the setup process. Both only move between pages; every save goes through the
// step's own form. Next stays disabled until the step is done, and the line under it says why. With
// unsaved input in the form, Next asks first and never saves a half-filled form by itself.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/i18n/client";
import settings from "@/components/settings/settings.module.css";
import s from "./Setup.module.css";

type Props = {
  backHref: string | null;
  nextHref: string;
  ready: boolean;
  hint: string;
  /** Set while the step's form holds unsaved input: what it holds, and the form's id. */
  unsaved: { thing: string; formId: string } | null;
};

export function SetupFooter({ backHref, nextHref, ready, hint, unsaved }: Props) {
  const t = useT();
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  return (
    <div className={s.footer}>
      {backHref ? <Link className={s.back} href={backHref} data-testid="setup-back">← {t("settingsSetup.back")}</Link> : <span />}
      <div className={s.forward}>
        {ready
          ? <Link className={s.next} href={nextHref} data-testid="setup-next" onClick={(e) => { if (unsaved) { e.preventDefault(); setAsking(true); } }}>{t("settingsSetup.next")} →</Link>
          : <button type="button" className={s.next} disabled data-testid="setup-next">{t("settingsSetup.next")} →</button>}
        {hint ? <span className={s.nextHint} data-testid="setup-next-hint">{hint}</span> : null}
      </div>
      {asking && unsaved ? (
        <div className={settings.scrim} onClick={() => setAsking(false)}>
          <div className={settings.dialog} role="alertdialog" aria-modal="true" aria-labelledby="setup-unsaved" onClick={(e) => e.stopPropagation()} data-testid="setup-unsaved">
            <h2 id="setup-unsaved" className={settings.cardTitle}>{t("settingsSetup.unsavedAsk", { thing: unsaved.thing })}</h2>
            <div className={settings.dialogButtons}>
              <button type="button" className={settings.soft} onClick={() => router.push(nextHref)} data-testid="setup-unsaved-discard">{t("settingsSetup.discard")}</button>
              <button type="submit" form={unsaved.formId} className={settings.save} onClick={() => setAsking(false)} data-testid="setup-unsaved-add">{t("settingsSetup.add")}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
