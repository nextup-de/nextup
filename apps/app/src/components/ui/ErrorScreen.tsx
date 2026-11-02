// The page someone sees instead of a blank one when something throws. Props in, JSX out: the error
// files under src/app decide what to report (src/components/report/error-reporter.ts).
import { Button } from "@/components/ui/Button";
import { SITE } from "@/config/site";
import { useT } from "@/i18n/client";
import styles from "./ErrorScreen.module.css";

export function ErrorScreen({ digest, onRetry, inShell = false }: { digest?: string; onRetry: () => void; inShell?: boolean }) {
  const t = useT();
  return (
    <main className={inShell ? `${styles.screen} ${styles.inShell}` : styles.screen}>
      <div className={styles.body}>
        <p className="nh-eyebrow">{t("errors.eyebrow")}</p>
        <h1 className={styles.title}>{t("errors.title")}</h1>
        <p className={styles.text}>{t("errors.text", { site: SITE.name })}</p>
        {digest ? <p className={styles.ref}>{t("errors.reference", { digest })}</p> : null}
        <div className={styles.actions}>
          <Button onClick={onRetry}>{t("errors.retry")}</Button>
          <Button href="/" variant="ghost">{t("errors.home")}</Button>
        </div>
      </div>
    </main>
  );
}
