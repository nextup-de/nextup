"use client";
// The assistant's switches on /admin/knowledge. Client only for useActionState's saved/error line.
import { useActionState } from "react";
import { Field } from "@/components/ui/Field";
import { LEVEL_LABEL, type Level } from "@/features/assist/classify";
import { saveAssistSettingsAction, type AssistSettingsState } from "@/server/actions/assist-admin";
import styles from "@/app/admin/admin.module.css";

type Props = {
  slug: string;
  enabled: boolean;
  ceiling: Level;
  retentionDays: number;
  dpaSignedAt: string; // YYYY-MM-DD or ""
  rules: string;
  patterns: string[];
};

const CEILINGS: Level[] = ["public", "internal", "confidential"];

export function AssistSettingsForm(p: Props) {
  const [state, act, pending] = useActionState<AssistSettingsState, FormData>(saveAssistSettingsAction, {});
  return (
    <form action={act} className={styles.grid}>
      <input type="hidden" name="slug" value={p.slug} />
      <Field id="assistant" label="Assistant" hint="Off stops every answer at once. The demo stage answers regardless.">
        <select className="nh-input" id="assistant" name="assistant" defaultValue={p.enabled ? "on" : "off"}>
          <option value="off">Off</option>
          <option value="on">On</option>
        </select>
      </Field>
      <Field id="ceiling" label="Highest class it may read" hint="Strictly confidential is never available to the assistant.">
        <select className="nh-input" id="ceiling" name="ceiling" defaultValue={p.ceiling}>
          {CEILINGS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
        </select>
      </Field>
      <Field id="dpaSignedAt" label="Data-processing agreement signed" hint="Without a date, no model is called for real people.">
        <input className="nh-input" id="dpaSignedAt" name="dpaSignedAt" type="date" defaultValue={p.dpaSignedAt} />
      </Field>
      <Field id="retentionDays" label="Keep conversations for (days)">
        <input className="nh-input" id="retentionDays" name="retentionDays" type="number" min={1} max={365} defaultValue={p.retentionDays} />
      </Field>
      <Field id="rules" label="Compliance rules" hint="In your own words; the assistant is told to follow them over anything else.">
        <textarea className="nh-input" id="rules" name="rules" rows={4} defaultValue={p.rules} placeholder="No statements about customer projects. Export-controlled topics go to Legal." />
      </Field>
      <Field id="patterns" label="Extra patterns to mask" hint="One regular expression per line, e.g. prototype codes PT-\d{4}.">
        <textarea className="nh-input" id="patterns" name="patterns" rows={2} defaultValue={p.patterns.join("\n")} />
      </Field>
      {state.error ? <p className={styles.error} role="alert">{state.error}</p> : null}
      {state.ok ? <p className="nh-hint" role="status">Saved.</p> : null}
      <button className="nh-btn nh-btn-primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
    </form>
  );
}
