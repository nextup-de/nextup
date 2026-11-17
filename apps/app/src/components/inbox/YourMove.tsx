"use client";
// "Your move" (DESIGN_RULES §9, plan quiet-screens): the one place an item asks something of the viewer, the same block
// for every kind of item. One status line, the question to answer when there is one, at most one filled button (the
// recommended move), yes and no as quiet buttons, and every other move under More. A move that does nothing yet is
// never passed in, so it is not drawn. A move that needs words (a reason, a condition) opens its form under the buttons
// (`children`). Props in, JSX out: what each move does is the caller's.
import { useEffect, useId, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import styles from "./YourMove.module.css";

export type Move = { key: string; label: string; onSelect: () => void; danger?: boolean; disabled?: boolean; testId?: string };
export type Moves = { primary: Move | null; quiet: Move[]; more: Move[] };

/** The plain answers: they stay in view as quiet buttons when they are not the recommended move. */
const PAIR = new Set(["yes", "no", "approve", "decline"]);

/** The recommended move (`rec`, a move's key) filled; yes and no quiet beside it; the rest under More. No recommendation, no filled button. */
export function sortMoves(moves: readonly Move[], rec: string): Moves {
  const primary = moves.find((m) => m.key === rec) ?? null;
  const rest = moves.filter((m) => m !== primary);
  return { primary, quiet: rest.filter((m) => PAIR.has(m.key)), more: rest.filter((m) => !PAIR.has(m.key)) };
}

export function YourMove({ status, lines = [], quote, moves, name, children }: {
  status?: React.ReactNode; lines?: readonly string[]; quote?: string | null; moves: Moves; name?: string; children?: React.ReactNode;
}) {
  const t = useT();
  const any = moves.primary !== null || moves.quiet.length > 0 || moves.more.length > 0;
  if (!status && !quote && !any && !children) return null;
  // Only moves under More (taking an idea back while it waits on a desk): it is not the viewer's turn, so no heading says so.
  if (!status && !quote && !moves.primary && moves.quiet.length === 0 && !children) {
    return <section className={styles.card} aria-label={t("inbox.more")} data-testid="your-move" data-name={name} data-quiet="true"><MoreMenu moves={moves.more} /></section>;
  }
  return (
    <section className={styles.card} aria-label={t("inbox.yourMove")} data-testid="your-move" data-name={name}>
      <h2 className={styles.title}>{t("inbox.yourMove")}</h2>
      {status ? <p className={styles.status}>{status}</p> : null}
      {lines.map((l, i) => <p key={i} className={styles.line}>{l}</p>)}
      {quote ? <blockquote className={styles.quote}>“{quote}”</blockquote> : null}
      {moves.primary ? (
        <button type="button" className="nh-btn nh-btn-primary nh-btn-block" disabled={moves.primary.disabled} data-testid={moves.primary.testId} onClick={moves.primary.onSelect}>{moves.primary.label}</button>
      ) : null}
      {moves.quiet.length > 0 ? (
        <div className={styles.quietRow}>
          {moves.quiet.map((m) => (
            <button key={m.key} type="button" className={`nh-btn nh-btn-ghost nh-btn-sm ${styles.quiet}`} data-danger={m.danger ? "true" : undefined} disabled={m.disabled} data-testid={m.testId} onClick={m.onSelect}>{m.label}</button>
          ))}
        </div>
      ) : null}
      {moves.more.length > 0 ? <MoreMenu moves={moves.more} /> : null}
      {children}
    </section>
  );
}

/** The other moves, behind one quiet "More". Closes on a pick, a click outside and Escape. */
function MoreMenu({ moves }: { moves: readonly Move[] }) {
  const t = useT();
  const id = useId();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!(e.target instanceof Node && box.current?.contains(e.target))) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); setOpen(false); } };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey, true); };
  }, [open]);
  return (
    <div className={styles.more} ref={box}>
      <button type="button" className={styles.moreBtn} aria-expanded={open} aria-haspopup="menu" aria-controls={id} onClick={() => setOpen((v) => !v)}>{t("inbox.more")}</button>
      {open ? (
        <div className={styles.menu} role="menu" id={id}>
          {moves.map((m) => (
            <button key={m.key} type="button" role="menuitem" className={styles.item} data-danger={m.danger ? "true" : undefined} disabled={m.disabled} data-testid={m.testId} onClick={() => { setOpen(false); m.onSelect(); }}>{m.label}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
