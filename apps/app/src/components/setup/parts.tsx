"use client";
// The pieces every setup step card shares (Paper: "Pilot 02 · Routing and setup"): the card, the list
// of what was added so far, a labelled field, and how a save runs and reports a refusal.
import { useState, useTransition } from "react";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import type { OrgResult } from "@/server/actions/settings/org";
import s from "./Setup.module.css";

/** What a step's form needs from the step around it. */
export type StepFormProps = {
  slug: string;
  /** The form's id, so the unsaved-input dialog can submit it. */
  formId: string;
  /** Something is typed in the form that is not saved yet. */
  onDirty: (dirty: boolean) => void;
  demo?: boolean;
};

export function StepCard({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <h2 className={s.cardTitle}>{title}</h2>
        <p className={s.cardText}>{text}</p>
      </div>
      {children}
    </section>
  );
}

export function Added({ children }: { children: React.ReactNode }) {
  const t = useT();
  return (
    <>
      <h3 className={s.subLabel}>{t("settingsSetup.addedSoFar")}</h3>
      <ul className={s.added}>{children}</ul>
    </>
  );
}

/** One row of "Added so far". `depth` indents it; `onEdit` opens it in the form below. */
export function AddedRow({ name, sub, side, depth = 0, onEdit, testId }: {
  name: React.ReactNode; sub?: string; side?: React.ReactNode; depth?: number; onEdit?: () => void; testId?: string;
}) {
  const t = useT();
  return (
    <li className={s.addedRow} style={depth ? { paddingLeft: depth * 16 } : undefined} data-testid={testId}>
      <span className={s.addedName}>
        <strong data-top={depth === 0 ? "" : undefined}>{name}</strong>
        {sub ? <span className={s.addedSub}>{sub}</span> : null}
      </span>
      <span className={s.addedSide}>
        {side}
        {onEdit ? <button type="button" className={s.textBtn} onClick={onEdit}>{t("settingsOrg.edit")}</button> : null}
      </span>
    </li>
  );
}

/** A label above its control. `side` puts the label to the left instead, as Paper's Units form has it. */
export function Field({ label, side, help, children }: { label: string; side?: boolean; help?: string; children: React.ReactNode }) {
  return (
    <label className={side ? s.fieldSide : s.field}>
      <span className={s.fieldLabel}>{label}</span>
      <span className={s.fieldBody}>
        {children}
        {help ? <span className={s.fieldHelp}>{help}</span> : null}
      </span>
    </label>
  );
}

/** Runs one or more org actions, shows what was refused, and calls `after` when all went through. */
export function useRun() {
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, start] = useTransition();
  const run = (call: () => Promise<OrgResult>, after?: () => void) =>
    start(async () => {
      const r = await call();
      setError(r.ok ? null : r.error);
      if (r.ok) after?.();
    });
  return { error, pending, run, clear: () => setError(null) };
}

export function Refusal({ error }: { error: MessageKey | null }) {
  const t = useT();
  return error ? <p className={s.refusal} role="alert" data-testid="setup-error">{t(error)}</p> : null;
}
