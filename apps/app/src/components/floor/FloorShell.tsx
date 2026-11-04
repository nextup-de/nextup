"use client";
// The frame of every phone page: a 56 px bar with the company and a DE|EN switch, and, for a person
// signed in with a floor code, a grey bar with a sign-out. No link leads into the app (plan FLR, D14).
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "@/i18n/actions";
import { useLocale, useT } from "@/i18n/client";
import { LOCALES } from "@/i18n";
import { floorSignOutAction } from "@/server/actions/floor";
import { PersonFace } from "@/components/ui/elements";
import styles from "./FloorShell.module.css";

export function FloorShell({ slug, companyName, mark, signedInName, children }: {
  slug: string; companyName: string; mark: string; signedInName?: string | null; children: React.ReactNode;
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const choose = (next: string) => {
    if (next === locale) return;
    start(async () => {
      await setLocale(next);
      router.refresh();
    });
  };
  const signOut = () => start(async () => {
    await floorSignOutAction(slug);
    router.refresh();
  });
  return (
    <div className={styles.shell} data-testid="floor-shell">
      <header className={styles.bar}>
        <span className={styles.mark} aria-hidden="true">{mark}</span>
        <span className={styles.name} data-testid="floor-shell-company">{companyName}</span>
        <div className={styles.lang} role="radiogroup" aria-label={t("floor.barLanguage")}>
          {LOCALES.map((l) => (
            <button key={l} type="button" role="radio" lang={l} aria-checked={l === locale} disabled={pending}
              className={styles.langBtn} data-testid={`floor-shell-lang-${l}`} onClick={() => choose(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>
      {signedInName ? (
        <div className={styles.who} data-testid="floor-shell-signedin">
          <span><PersonFace name={signedInName} size="sm" /> {t("floor.barSignedIn", { name: signedInName })}</span>
          <button type="button" className={styles.signOut} disabled={pending} data-testid="floor-shell-signout" onClick={signOut}>
            {t("floor.barSignOut")}
          </button>
        </div>
      ) : null}
      <main className={styles.main}>{children}</main>
    </div>
  );
}
