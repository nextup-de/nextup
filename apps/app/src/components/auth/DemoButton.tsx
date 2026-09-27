"use client";
// Demo boxes only: one button that opens the demo as a made-up employee. The page renders this
// only when src/server/demo-login.ts says so, and demoSignIn re-checks it and picks the person.
import { useFormStatus } from "react-dom";
import { demoSignIn } from "@/server/actions/auth";
import type { DemoPerson } from "@/server/demo-login";
import styles from "./forms.module.css";

function Open({ person }: { person: DemoPerson }) {
  const { pending } = useFormStatus();
  return (
    <button className="nh-btn nh-btn-ghost nh-btn-block" type="submit" disabled={pending}>
      {pending ? "One moment…" : `Open the demo as ${person.name}`}
    </button>
  );
}

export function DemoButton({ slug, next, person }: { slug: string; next?: string; person: DemoPerson | null }) {
  if (!person) return null;
  return (
    <form className={styles.demo} action={demoSignIn} aria-label="Demo">
      <input type="hidden" name="slug" value={slug} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className={styles.demoHead}>
        <strong>No code? Look around first.</strong>
        <span className={styles.demoTag}>Demo only</span>
      </div>
      <p className="nh-hint">
        {person.name}{person.line ? `, ${person.line}` : ""} is a made-up employee on a demo box. Real companies never show this.
      </p>
      <Open person={person} />
    </form>
  );
}
