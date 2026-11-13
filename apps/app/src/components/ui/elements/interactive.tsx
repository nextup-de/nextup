"use client";
// The elements that hold state: row menu, drawer, confirm dialog, shown-once secret.
import { useEffect, useRef, useState } from "react";
import s from "./elements.module.css";

export type MenuAction = { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean };

/** The ··· menu of a table row. A destructive action goes last and gets a little room above it. */
export function RowMenu({ label, actions, testId }: { label: string; actions: readonly MenuAction[]; testId?: string }) {
  const box = useRef<HTMLDetailsElement>(null);
  return (
    <details ref={box} className={s.rowMenu} data-testid={testId}>
      <summary aria-label={label}>···</summary>
      <div className={s.menuList} role="menu">
        {actions.map((a) => (
          <button key={a.label} type="button" role="menuitem" className={s.menuItem} data-danger={a.danger ? "" : undefined} disabled={a.disabled}
            onClick={() => { if (box.current) box.current.open = false; a.onSelect(); }}>
            {a.label}
          </button>
        ))}
      </div>
    </details>
  );
}

/** Closes on Escape and moves the focus into the panel when it opens, once: a new `onClose` on a
 *  re-render (an inline arrow) must not pull the focus out of a field the person is typing in. A field
 *  with autoFocus inside keeps it. */
function usePanel(onClose: () => void) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return panel;
}

/** A panel from the right for adding or editing one thing. A phone gets the full width. */
export function EditDrawer({ title, closeLabel, onClose, foot, testId, children }: {
  title: string; closeLabel: string; onClose: () => void; foot?: React.ReactNode; testId?: string; children: React.ReactNode;
}) {
  const panel = usePanel(onClose);
  return (
    <div className={s.scrim} onClick={onClose}>
      <div ref={panel} tabIndex={-1} className={s.drawer} role="dialog" aria-modal="true" aria-label={title} data-testid={testId} onClick={(e) => e.stopPropagation()}>
        <div className={s.drawerHead}>
          <h2 className={s.drawerTitle}>{title}</h2>
          <button type="button" className={s.close} aria-label={closeLabel} onClick={onClose}>×</button>
        </div>
        <div className={s.drawerBody}>{children}</div>
        {foot ? <div className={s.drawerFoot}>{foot}</div> : null}
      </div>
    </div>
  );
}

/** Asks before something hard to undo. With `typed`, Confirm stays off until the word is typed exactly. */
export function ConfirmDialog({ title, text, lines, confirmLabel, cancelLabel, danger, typed, onConfirm, onCancel, testId }: {
  title: string; text: string; /** Bullets under the text. */ lines?: string[]; confirmLabel: string; cancelLabel: string; danger?: boolean;
  typed?: { word: string; label: string }; onConfirm: () => void; onCancel: () => void; testId?: string;
}) {
  const panel = usePanel(onCancel);
  const [word, setWord] = useState("");
  const blocked = typed !== undefined && word !== typed.word;
  return (
    <div className={s.scrim} onClick={onCancel}>
      <div ref={panel} tabIndex={-1} className={s.dialog} role="alertdialog" aria-modal="true" aria-label={title} data-testid={testId} onClick={(e) => e.stopPropagation()}>
        <h2 className={s.drawerTitle}>{title}</h2>
        <p className={s.dialogText}>{text}</p>
        {lines && lines.length > 0 ? <ul className={s.dialogLines}>{lines.map((l) => <li key={l}>{l}</li>)}</ul> : null}
        {typed ? (
          <label className={s.typed}>
            {typed.label}
            <input className={s.typedInput} value={word} autoComplete="off" onChange={(e) => setWord(e.target.value)} />
          </label>
        ) : null}
        <div className={s.dialogButtons}>
          <button type="button" className={s.soft} onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className={danger ? s.danger : s.primary} disabled={blocked} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/** A secret right after it was made. Nothing shows it again, so the note says to store it now. */
export function SecretOnce({ value, note, copyLabel, copiedLabel, testId }: { value: string; note: string; copyLabel: string; copiedLabel: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className={s.secret} data-testid={testId}>
      <div className={s.secretRow}>
        <code className={s.secretValue}>{value}</code>
        <button type="button" className={s.primary} onClick={copy}>{copied ? copiedLabel : copyLabel}</button>
      </div>
      <p className={s.secretNote}>{note}</p>
    </div>
  );
}
