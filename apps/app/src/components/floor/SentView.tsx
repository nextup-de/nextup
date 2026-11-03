"use client";
// The reference, once: two groups of four digits and a printable slip with the QR of the status page.
// With no reference to show it says so and offers the way back (plan FLR, D8).
import Link from "next/link";
import { useEffect } from "react";
import { useT } from "@/i18n/client";
import { groupReference } from "@/features/floor/raise";
import styles from "./Floor.module.css";

export function SentView({ reference, roleTitle, named, sandbox, qrSvg, raiseHref, clearHref }: {
  reference: string | null; roleTitle: string | null; named: boolean; sandbox: boolean; qrSvg: string | null; raiseHref: string; clearHref: string;
}) {
  const t = useT();
  // The cookie is deleted once the page is on screen, so a reload shows nothing (the server component cannot delete it).
  useEffect(() => {
    if (reference) void fetch(clearHref, { method: "POST" }).catch(() => undefined);
  }, [reference, clearHref]);
  if (!reference) {
    return (
      <div className={styles.page} data-testid="floor-sent-nothing">
        <p className={styles.body}>{t("floor.sentNothing")}</p>
        <Link href={raiseHref} className={styles.second} data-testid="floor-sent-again">{t("floor.sentAgain")}</Link>
      </div>
    );
  }
  return (
    <div className={styles.page} data-testid="floor-sent-page">
      <div className={styles.check} aria-hidden="true">{"✓"}</div>
      <h1 className={styles.heading}>{t("floor.sentHeading")}</h1>
      {named ? null : (
        <>
          <p className={styles.hint}>{t("floor.sentReference")}</p>
          <div className={styles.reference} data-testid="floor-sent-reference">{groupReference(reference)}</div>
          <p className={styles.body}>{t("floor.sentKeep")}</p>
        </>
      )}
      {roleTitle ? <p className={styles.body} data-testid="floor-sent-where">{t("floor.sentWhere", { role: roleTitle })}</p> : null}
      {named ? <p className={styles.body} data-testid="floor-sent-named">{t("floor.sentNamed")}</p> : null}
      {sandbox ? <p className={styles.panel} data-testid="floor-sent-sandbox">{t("floor.sentSandbox")}</p> : null}
      {named ? null : <button type="button" className={styles.second} data-testid="floor-sent-print" onClick={() => window.print()}>{t("floor.sentPrint")}</button>}
      <Link href={raiseHref} className={styles.main} data-testid="floor-sent-done" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>{t("floor.sentDone")}</Link>
      <Link href={raiseHref} className={styles.second} data-testid="floor-sent-again">{t("floor.sentAgain")}</Link>
      {named || !qrSvg ? null : (
        <div className={styles.slip} data-testid="floor-sent-slip">
          <h2>{t("floor.slipTitle")}</h2>
          <div className={styles.reference}>{groupReference(reference)}</div>
          <div className={styles.qr} role="img" aria-label={t("floor.qrLabel")} dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <p>{t("floor.slipScan")}</p>
          <p>{t("floor.slipAddress")}</p>
        </div>
      )}
    </div>
  );
}
