"use client";
// Back and Next of the setup process. Both only move between pages; every save goes through the
// step's own form. Next stays disabled until the step is done, and the line under it says why.
import Link from "next/link";
import { useT } from "@/i18n/client";
import s from "./Setup.module.css";

type Props = { backHref: string | null; nextHref: string; ready: boolean; hint: string };

export function SetupFooter({ backHref, nextHref, ready, hint }: Props) {
  const t = useT();
  return (
    <div className={s.footer}>
      {backHref ? <Link className={s.back} href={backHref} data-testid="setup-back">← {t("settingsSetup.back")}</Link> : <span />}
      <div className={s.forward}>
        {ready
          ? <Link className={s.next} href={nextHref} data-testid="setup-next">{t("settingsSetup.next")} →</Link>
          : <button type="button" className={s.next} disabled data-testid="setup-next">{t("settingsSetup.next")} →</button>}
        {hint ? <span className={s.nextHint} data-testid="setup-next-hint">{hint}</span> : null}
      </div>
    </div>
  );
}
