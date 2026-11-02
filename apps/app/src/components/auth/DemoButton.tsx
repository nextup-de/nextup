"use client";
// Demo boxes only: one button that opens the demo as a made-up employee. The page renders this
// only when src/server/demo-login.ts says so, and demoSignIn re-checks it and picks the person.
import { useFormStatus } from "react-dom";
import { useT } from "@/i18n/client";
import { demoSignIn } from "@/server/actions/auth";
import type { DemoPerson } from "@/server/demo-login";
import styles from "./forms.module.css";

function Open({ person }: { person: DemoPerson }) {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button className="nh-btn nh-btn-ghost nh-btn-block" type="submit" disabled={pending}>
      {pending ? t("auth.oneMoment") : t("auth.demoOpen", { name: person.name })}
    </button>
  );
}

export function DemoButton({ slug, next, person }: { slug: string; next?: string; person: DemoPerson | null }) {
  const t = useT();
  if (!person) return null;
  return (
    <form className={styles.demo} action={demoSignIn} aria-label={t("auth.demoAria")}>
      <input type="hidden" name="slug" value={slug} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className={styles.demoHead}>
        <strong>{t("auth.demoHead")}</strong>
        <span className={styles.demoTag}>{t("auth.demoTag")}</span>
      </div>
      <p className="nh-hint">
        {t("auth.demoHint", { who: person.name + (person.line ? `, ${person.line}` : "") })}
      </p>
      <Open person={person} />
    </form>
  );
}
