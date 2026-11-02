"use client";
// The key a manager adds to an authenticator app: as text, with the otpauth link (no QR image).
import { useT } from "@/i18n/client";

export function TotpEnrol({ secret, otpauth }: { secret: string; otpauth: string }) {
  const t = useT();
  return (
    <div>
      <h2>{t("adminAccess.enrolTitle")}</h2>
      <p className="nh-hint">{t("adminAccess.enrolSub")}</p>
      <p>
        <strong>{t("adminAccess.enrolKey")}</strong> <code>{secret.match(/.{1,4}/g)?.join(" ")}</code>
      </p>
      <p className="nh-hint">
        {t("adminAccess.enrolLink")}: <a href={otpauth}>{otpauth}</a>
      </p>
    </div>
  );
}
