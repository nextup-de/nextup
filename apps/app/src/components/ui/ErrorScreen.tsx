// The page someone sees instead of a blank one when something throws. Props in, JSX out: the error
// files under src/app decide what to report (src/components/report/error-reporter.ts).
import { Button } from "@/components/ui/Button";
import { SITE } from "@/config/site";
import styles from "./ErrorScreen.module.css";

export function ErrorScreen({ digest, onRetry, inShell = false }: { digest?: string; onRetry: () => void; inShell?: boolean }) {
  return (
    <main className={inShell ? `${styles.screen} ${styles.inShell}` : styles.screen}>
      <div className={styles.body}>
        <p className="nh-eyebrow">Error · something broke on our side</p>
        <h1 className={styles.title}>This page could not be shown</h1>
        <p className={styles.text}>
          It has been counted for the {SITE.name} team. Try again - if it keeps happening, tell us with the bug icon what you were doing.
        </p>
        {digest ? <p className={styles.ref}>Reference {digest}</p> : null}
        <div className={styles.actions}>
          <Button onClick={onRetry}>Try again</Button>
          <Button href="/" variant="ghost">Back to the start</Button>
        </div>
      </div>
    </main>
  );
}
