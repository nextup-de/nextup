"use client";
import { useState, type FormEvent } from "react";
import { answerFormAction } from "@/app/[company]/(app)/forms/[formId]/actions";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { EVENT_BUDGET } from "@/features/projects/pages";
import type { FormField } from "@/features/projects/types";
import { useLocale } from "@/i18n/client";
import type { AnswerForm, MyRequest } from "@/server/forms";
import { answerText, fill } from "./text";
import styles from "./Answer.module.css";

const LIMIT: Partial<Record<FormField["kind"], number>> = { short: 300, long: 4000 };
/** From this share of a limit on, the counter shows. */
const NEAR = 0.8;
/** The event around the answers: ids and keys, counted so the whole answer is known to fit before it is sent. */
const ENVELOPE = JSON.stringify({ formId: "x".repeat(64), formRev: 999, requestId: "req_" + "x".repeat(12), answers: {} }).length;

export function AnswerPage({ formId, initial, requests }: { formId: string; initial: AnswerForm; requests: MyRequest[] }) {
  const x = answerText(useLocale());
  const { f } = useDemo();
  const [data, setData] = useState(initial);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [fresh, setFresh] = useState<string[]>([]);
  const [gone, setGone] = useState<string[]>([]);
  const [changed, setChanged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const { form } = data;
  const total = ENVELOPE + JSON.stringify(answers).length;
  const tooLong = total > EVENT_BUDGET;
  const trimmed = (id: string) => (answers[id] ?? "").trim();
  const missing = form.fields.some((field) => field.required && trimmed(field.id) === "");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || tooLong || missing) return;
    setBusy(true);
    setError(null);
    const clean = Object.fromEntries(form.fields.filter((field) => trimmed(field.id) !== "").map((field) => [field.id, trimmed(field.id)]));
    try {
      const result = await answerFormAction({ formId, formRev: form.rev, answers: clean });
      if (result.ok) { setSent(true); setAnswers({}); setChanged(false); return; }
      setError(result.error);
      if (result.changed) {
        // The form changed: keep what still fits, mark what is new or gone (D8).
        const next = result.changed;
        const kept = new Set(next.form.fields.map((field) => field.id));
        const before = new Set(form.fields.map((field) => field.id));
        setGone(form.fields.filter((field) => !kept.has(field.id) && trimmed(field.id) !== "").map((field) => field.label));
        setFresh(next.form.fields.filter((field) => !before.has(field.id)).map((field) => field.id));
        setAnswers(Object.fromEntries(Object.entries(answers).filter(([id]) => kept.has(id))));
        setData(next);
        setChanged(true);
        setSent(false);
      }
    } catch { setError(x.notSent); } finally { setBusy(false); }
  };

  const set = (id: string, value: string) => { setAnswers({ ...answers, [id]: value }); setError(null); setSent(false); };

  return <div className={styles.page}>
    <form className={styles.card} onSubmit={(e) => void submit(e)} aria-label={form.title}>
      <p className={styles.asked}>{fill(x.askedOf, { project: data.projectTitle })}</p>
      <h1 className={styles.title}>{form.title}</h1>
      {form.intro && <p className={styles.intro}>{form.intro}</p>}
      {changed && <div className={styles.notice} role="status">
        <p><strong>{x.changedTitle}</strong></p>
        <p>{x.changedKept}</p>
        {gone.length > 0 && <ul>{gone.map((label) => <li key={label}>{fill(x.changedGone, { label })}</li>)}</ul>}
      </div>}
      {form.fields.map((field) => {
        const value = answers[field.id] ?? "";
        const max = LIMIT[field.kind];
        const near = max !== undefined && value.length >= max * NEAR;
        const id = `field-${field.id}`;
        return <div key={field.id} className={styles.field}>
          <label className={styles.label} htmlFor={id}>{field.label}{field.required && <span className={styles.mark} aria-hidden="true">{x.required}</span>}{fresh.includes(field.id) && <span className={styles.new}>{x.changedNew}</span>}</label>
          {field.kind === "short" && <input id={id} className="nh-input" value={value} maxLength={max} required={field.required} onChange={(e) => set(field.id, e.target.value)} />}
          {field.kind === "long" && <textarea id={id} className="nh-input" rows={5} value={value} maxLength={max} required={field.required} onChange={(e) => set(field.id, e.target.value)} />}
          {field.kind === "choice" && <select id={id} className="nh-input nh-select" value={value} required={field.required} onChange={(e) => set(field.id, e.target.value)}>
            <option value="">{x.choose}</option>
            {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
          </select>}
          {field.kind === "date" && <>
            <input id={id} className="nh-input" type="number" step={1} inputMode="numeric" placeholder={x.dayNumber} value={value} required={field.required} onChange={(e) => set(field.id, e.target.value)} />
            {/^-?\d+$/.test(value) && <span className={styles.counter}>{f(Number(value))}</span>}
          </>}
          {near && max !== undefined && <span className={styles.counter} data-hot={value.length >= max ? "true" : undefined}>{fill(x.chars, { used: value.length, max })}</span>}
        </div>;
      })}
      {total >= EVENT_BUDGET * NEAR && <p className={tooLong ? styles.error : styles.counter} role={tooLong ? "alert" : undefined}>{fill(x.budget, { used: total, max: EVENT_BUDGET })}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {sent && <p className={styles.ok} role="status">{x.sent}</p>}
      <div className={styles.actions}><button type="submit" className="nh-btn nh-btn-primary" disabled={busy || tooLong || missing}>{busy ? x.sending : x.send}</button></div>
    </form>
    <section className={styles.card} aria-label={x.yourRequests}>
      <h2 className={styles.h2}>{x.yourRequests}</h2>
      {requests.length === 0 ? <p className={styles.muted}>{x.noRequests}</p> : <ul className={styles.requests}>
        {requests.map((r) => <li key={r.id} className={styles.request}>
          <span className={styles.state} data-state={r.state}>{r.state === "new" ? x.stateNew : r.state === "stepped" ? x.stateStepped : x.stateDeclined}</span>
          {r.reason && <span>{fill(x.reason, { why: r.reason })}</span>}
          <span className={styles.muted}>{fill(x.sentOn, { date: f(r.day) })}</span>
        </li>)}
      </ul>}
    </section>
  </div>;
}
