"use client";
// The form builder, full width inside the Requests tool when ?form=<id> (or ?form=new) is set (plan REQ, D8).
import { useEffect, useReducer, useRef, useState } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { newId } from "@/features/cases/events";
import { builderReducer, canSave, FAKE_TEXT, canShare, draftJson, draftKey, FIELD_KINDS, FORM_LIMITS, initialBuilder, isDirty, KIND_TEXT, parseDraft, PROBLEM_TEXT, problemsOf, toFormSaved } from "@/features/projects/form-builder";
import type { FormField, FormFieldKind, ReducedProject } from "@/features/projects/types";
import { useSend } from "../../parts";
import { formLink } from "../inbox/FormsPanel";
import { useText } from "./useText";
import styles from "./Builder.module.css";


const read = (key: string): string | null => { try { return window.sessionStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string | null): void => {
  try { if (value === null) window.sessionStorage.removeItem(key); else window.sessionStorage.setItem(key, value); } catch { /* storage is off: the draft just stays in memory */ }
};

/** `formId` is an existing form's id, or "new". */
export function FormBuilder({ p, formId }: { p: ReducedProject; formId: string }) {
  const [mintedId] = useState(() => newId("f"));
  const form = formId === "new" ? null : p.forms.find((x) => x.id === formId) ?? null;
  const id = form?.id ?? mintedId;
  return <BuilderView key={id} p={p} id={id} form={form} />;
}

function BuilderView({ p, id, form }: { p: ReducedProject; id: string; form: ReducedProject["forms"][number] | null }) {
  const { act, href, showToast } = useDemo();
  const text = useText();
  const send = useSend(p);
  const key = draftKey(p.id, id);
  // The draft the person left behind wins over the saved form until Save.
  const [state, dispatch] = useReducer(builderReducer, null, () => (typeof window === "undefined" ? null : parseDraft(read(key), id)) ?? initialBuilder(form, id));
  const [previewing, setPreviewing] = useState(false);
  const dirty = isDirty(state);
  const problems = problemsOf(state);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; write(key, isDirty(state) ? draftJson(state) : null); }, [state, key]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const leave = () => {
    if (dirty && !window.confirm(text("leaveAsk"))) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("form");
    window.location.assign(url.pathname + url.search);
  };
  const save = (shared: boolean): boolean => {
    if (!canSave(state)) return false;
    const payload = toFormSaved(state, shared);
    const { formId: _formId, ...input } = payload;
    void _formId;
    if (!send("project.form.saved", payload, () => { act.project.form.save(p.id, input, id); })) return false;
    dispatch({ type: "shared", value: shared });
    dispatch({ type: "saved" });
    return true;
  };
  const share = async () => {
    if (!canShare(state) || !save(true)) return;
    try {
      await navigator.clipboard.writeText(window.location.origin + formLink(href(""), p.id, id));
      showToast(text("shareCopied"));
    } catch { /* the browser refused the clipboard */ }
  };
  const add = (kind: FormFieldKind) => dispatch({ type: "add", id: newId("q"), kind });
  const selected = previewing ? null : state.selected;

  return (
    <section className={styles.builder} aria-label={state.title || text("titlePlaceholder")}>
      <div className={styles.bar}>
        <button type="button" className={styles.back} onClick={leave}>{text("back")}</button>
        <span className={styles.status} data-dirty={dirty} role="status">{dirty ? text("unsaved") : state.saved ? text("saved") : ""}</span>
        <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" aria-pressed={previewing} onClick={() => setPreviewing(!previewing)}>{previewing ? text("editing") : text("preview")}</button>
        <button type="button" className="nh-btn nh-btn-ghost nh-btn-sm" disabled={!canShare(state)} title={canShare(state) ? undefined : text("shareNeedsSave")} onClick={() => void share()}>{text("share")}</button>
        <button type="button" className="nh-btn nh-btn-primary nh-btn-sm" disabled={!dirty || problems.length > 0} onClick={() => save(state.shared)}>{text("save")}</button>
      </div>
      {dirty && problems.length > 0 && <p className={styles.problem}>{text(PROBLEM_TEXT[problems[0]])}</p>}
      <div className={styles.body}>
        {!previewing && (
          <div className={styles.kinds}>
            <h2>{text("kinds")}</h2>
            {FIELD_KINDS.map((kind) => <button key={kind} type="button" className={styles.kind} disabled={state.fields.length >= FORM_LIMITS.fields} onClick={() => add(kind)}>{text(KIND_TEXT[kind])}</button>)}
            <span className={styles.count}>{text("kindsNote")}</span>
            <span className={styles.count}>{text("limits", { count: state.fields.length, max: FORM_LIMITS.fields })}</span>
          </div>
        )}
        <div className={styles.form}>
          {previewing ? <h2 className={styles.title}>{state.title}</h2>
            : <input className={`nh-input ${styles.title}`} maxLength={FORM_LIMITS.title} value={state.title} placeholder={text("titlePlaceholder")} aria-label={text("titlePlaceholder")} onChange={(e) => dispatch({ type: "title", value: e.target.value })} />}
          {previewing ? (state.intro && <p>{state.intro}</p>)
            : <textarea className="nh-input nh-textarea" maxLength={FORM_LIMITS.intro} value={state.intro} placeholder={text("introPlaceholder")} aria-label={text("introPlaceholder")} onChange={(e) => dispatch({ type: "intro", value: e.target.value })} />}
          {state.fields.length === 0 && <p className={styles.empty}>{text("emptyForm")}</p>}
          {state.fields.map((f, at) => (
            <Question key={f.id} f={f} at={at} last={state.fields.length - 1} readOnly={previewing} selected={selected === f.id} full={state.fields.length >= FORM_LIMITS.fields}
              text={text} select={() => dispatch({ type: "select", id: f.id })} dispatch={dispatch} />
          ))}
        </div>
      </div>
    </section>
  );
}

type QuestionProps = {
  f: FormField; at: number; last: number; readOnly: boolean; selected: boolean; full: boolean;
  text: ReturnType<typeof useText>; select: () => void; dispatch: (a: Parameters<typeof builderReducer>[1]) => void;
};

function Question({ f, at, last, readOnly, selected, full, text, select, dispatch }: QuestionProps) {
  const label = f.label || text("labelPlaceholder");
  return (
    <div className={styles.question} data-selected={selected} data-readonly={readOnly} onClick={readOnly ? undefined : select}>
      {selected ? (
        <input className="nh-input" autoFocus maxLength={FORM_LIMITS.label} value={f.label} placeholder={text("labelPlaceholder")} aria-label={text("labelPlaceholder")} onChange={(e) => dispatch({ type: "label", id: f.id, value: e.target.value })} />
      ) : (
        <span className={styles.questionLabel}>{label}{f.required && <span className={styles.star} aria-hidden="true"> *</span>}</span>
      )}
      {f.kind === "choice" && (selected ? (
        <ul className={styles.options} aria-label={text("options")}>
          {(f.options ?? []).map((o, i) => (
            <li key={i} className={styles.option}>
              <input className="nh-input" maxLength={FORM_LIMITS.option} value={o} placeholder={text("optionPlaceholder", { number: i + 1 })} aria-label={text("optionPlaceholder", { number: i + 1 })} onChange={(e) => dispatch({ type: "option", id: f.id, index: i, value: e.target.value })} />
              <button type="button" className={styles.tool} disabled={(f.options?.length ?? 0) <= FORM_LIMITS.optionsMin} onClick={() => dispatch({ type: "removeOption", id: f.id, index: i })}>{text("removeOption")}</button>
            </li>
          ))}
          <li><button type="button" className={styles.tool} disabled={(f.options?.length ?? 0) >= FORM_LIMITS.optionsMax} onClick={() => dispatch({ type: "addOption", id: f.id })}>{text("addOption")}</button></li>
        </ul>
      ) : <span className={styles.fake}>{(f.options ?? []).filter(Boolean).join(" · ") || text(FAKE_TEXT.choice)}</span>)}
      {f.kind !== "choice" && <span className={styles.fake}>{text(FAKE_TEXT[f.kind])}</span>}
      {selected && (
        <div className={styles.tools}>
          <label className={styles.check}><input type="checkbox" checked={f.required} onChange={(e) => dispatch({ type: "required", id: f.id, value: e.target.checked })} />{text("required")}</label>
          <button type="button" className={styles.tool} disabled={at === 0} onClick={() => dispatch({ type: "move", id: f.id, by: -1 })}>{text("moveUp")}</button>
          <button type="button" className={styles.tool} disabled={at === last} onClick={() => dispatch({ type: "move", id: f.id, by: 1 })}>{text("moveDown")}</button>
          <button type="button" className={styles.tool} disabled={full} onClick={() => dispatch({ type: "duplicate", id: f.id, newId: newId("q") })}>{text("duplicate")}</button>
          <button type="button" className={styles.tool} data-danger="true" onClick={() => dispatch({ type: "remove", id: f.id })}>{text("remove")}</button>
        </div>
      )}
    </div>
  );
}
