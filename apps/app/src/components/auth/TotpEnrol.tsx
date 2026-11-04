"use client";
// The key a manager adds to an authenticator app: as text, with the otpauth link (no QR image).
// Laid out like the code step that follows it: a title, a hint, then the field.
import { SecretOnce } from "@/components/ui/elements";
import { useT } from "@/i18n/client";
import styles from "./forms.module.css";

export function TotpEnrol({ secret, otpauth }: { secret: string; otpauth: string }) {
  const t = useT();
  return (
    <>
      <h2>{t("adminAccess.enrolTitle")}</h2>
      <p className="nh-hint">{t("adminAccess.enrolSub")}</p>
      <div className={styles.enrolKey}>
        <span className="nh-label">{t("adminAccess.enrolKey")}</span>
        <SecretOnce
          value={secret.match(/.{1,4}/g)?.join(" ") ?? secret}
          note={t("adminAccess.enrolOnce")}
          copyLabel={t("adminAccess.enrolCopy")}
          copiedLabel={t("adminAccess.enrolCopied")}
        />
      </div>
      <p className={`nh-hint ${styles.enrolLink}`}>
        {t("adminAccess.enrolLink")}: <a href={otpauth}>{otpauth}</a>
      </p>
    </>
  );
}
