"use client";
// /admin/knowledge: the idea studio for this company - the publish threshold and how many drafts
// and published ideas exist. Counts only: drafts are private to their author (docs/IDEAS.md).
// Client only for useActionState's saved/error line.
import { useActionState } from "react";
import { Field } from "@/components/ui/Field";
import { saveIdeaSettingsAction, type IdeaSettingsState } from "@/server/actions/ideas-admin";
import styles from "@/app/admin/admin.module.css";

export function IdeaStudioAdmin({ slug, threshold, drafts, published }: { slug: string; threshold: number; drafts: number; published: number }) {
  const [state, act, pending] = useActionState<IdeaSettingsState, FormData>(saveIdeaSettingsAction, {});
  const tiles: [string, string][] = [[String(threshold), "score to publish"], [String(drafts), "open drafts"], [String(published), "published"]];
  return (
    <section className={styles.card}>
      <h2>Idea studio</h2>
      <p className="nh-hint">
        Employees develop an idea with the coach on the raise page; it scores on four benchmarks and can be published once it
        reaches this line. Drafts stay private to their author - only the counts show here.
      </p>
      <div className={styles.tiles}>
        {tiles.map(([v, l]) => (
          <div key={l} className={styles.tile}>
            <div className={styles.tileValue}>{v}</div>
            <div className={styles.tileLabel}>{l}</div>
          </div>
        ))}
      </div>
      <form action={act} className={styles.grid}>
        <input type="hidden" name="slug" value={slug} />
        <Field id="publishThreshold" label="Score to publish (0-100)" hint="70 by default. Higher asks for better-developed ideas before they reach a decision-maker.">
          <input className="nh-input" id="publishThreshold" name="publishThreshold" type="number" min={0} max={100} defaultValue={threshold} />
        </Field>
        {state.error ? <p className={styles.error} role="alert">{state.error}</p> : null}
        {state.ok ? <p className="nh-hint" role="status">Saved.</p> : null}
        <button className="nh-btn nh-btn-primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      </form>
    </section>
  );
}
