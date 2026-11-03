"use client";
// Six digits on the floor keypad open a two-minute floor sign-in (plan FLR, D9). The sixth digit does
// not sign in by itself; the black key does.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import { floorSignInAction } from "@/server/actions/floor";
import { FloorKeypad } from "./FloorKeypad";
import styles from "./Floor.module.css";

export function SignInForm({ slug, areaName, raiseHref, anonymousAllowed }: {
  slug: string; areaName: string; raiseHref: string; anonymousAllowed: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [pending, start] = useTransition();

  const submit = () => {
    setError(null);
    start(async () => {
      const res = await floorSignInAction(slug, code);
      if (res.ok) {
        router.push(raiseHref);
        router.refresh();
        return;
      }
      setCode("");
      if (res.reason === "limited") {
        setLocked(true);
        setError(res.message ?? t("floor.signInUnavailable"));
      } else setError(res.reason === "wrong" ? t("floor.codeWrong") : t("floor.signInUnavailable"));
    });
  };

  return (
    <div className={styles.page} data-testid="floor-signin-page">
      <Link href={raiseHref} className={styles.second} data-testid="floor-signin-back">{t("floor.back")}</Link>
      <h1 className={styles.heading}>{t("floor.signInHeading")}</h1>
      <p className={styles.place} data-testid="floor-signin-area">{areaName}</p>
      <p className={styles.hint}>{t("floor.codeLabel")}</p>
      <FloorKeypad
        value={code}
        onChange={setCode}
        length={6}
        actionLabel={pending ? t("floor.signInChecking") : t("floor.signInKey")}
        onAction={submit}
        disabled={pending || locked}
      />
      {error ? <p className={styles.error} role="alert" data-testid="floor-signin-error">{error}</p> : null}
      <p className={styles.hint}>{t("floor.codeHelp")}</p>
      {anonymousAllowed ? <Link href={raiseHref} className={styles.second} data-testid="floor-signin-anonymous">{t("floor.signInWithoutName")}</Link> : null}
    </div>
  );
}
