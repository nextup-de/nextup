"use client";
// The pieces every setup step card shares (Paper: "Pilot 02 · Routing and setup"): the card, the list
// of what was added so far, a labelled field, and how a save runs and reports a refusal.
import { useState, useTransition } from "react";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/client";
import type { OrgResult } from "@/server/actions/settings/org";
import settings from "@/components/settings/settings.module.css";
import { EditDrawer } from "@/components/ui/elements";
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

/** `action` sits top right of the card, such as the button that opens the add drawer. */
export function StepCard({ title, text, action, children }: { title: string; text: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <div className={s.cardHeadText}>
          <h2 className={s.cardTitle}>{title}</h2>
          <p className={s.cardText}>{text}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** The button top right of a step's card that opens its add drawer. */
export function AddButton({ label, onClick, testId }: { label: string; onClick: () => void; testId: string }) {
  return <button type="button" className={s.secondary} onClick={onClick} data-testid={testId}>+ {label}</button>;
}

/** A step's add or edit form, in a panel from the right: Cancel and the form's submit sit in its foot. */
export function StepDrawer({ title, formId, submitLabel, disabled, onClose, testId, submitTestId, children }: {
  title: string; formId: string; submitLabel: string; disabled: boolean; onClose: () => void; testId: string; submitTestId: string; children: React.ReactNode;
}) {
  const t = useT();
  return (
    <EditDrawer title={title} closeLabel={t("settingsOrg.close")} onClose={onClose} testId={testId}
      foot={(
        <>
          <button type="button" className={s.secondary} onClick={onClose}>{t("settingsOrg.cancel")}</button>
          <button type="submit" form={formId} className={settings.save} disabled={disabled} data-testid={submitTestId}>{submitLabel}</button>
        </>
      )}>
      {children}
    </EditDrawer>
  );
}

/** A card of its own below the step's card, such as the vacant seats. */
export function StepSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={s.card}>
      <h2 className={s.cardTitle}>{title}</h2>
      {children}
    </section>
  );
}

/** "Added so far": a long list scrolls inside its own box, so Back / Next stay near. */
export function Added({ children }: { children: React.ReactNode }) {
  const t = useT();
  return (
    <>
      <h3 className={s.subLabel}>{t("settingsSetup.addedSoFar")}</h3>
      <ul className={`${s.added} ${s.scrollBox}`} data-testid="setup-added">{children}</ul>
    </>
  );
}

/** One row of "Added so far". `depth` indents it; `onEdit` opens it in the drawer. */
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

/** A label above its control. */
export function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className={s.field}>
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
