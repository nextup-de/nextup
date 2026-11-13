"use client";
// The bulk bar (plan OVL, D21, D28): the cases the person selected on one desk, passed on to one desk with one why, or asked of their authors in one question.
// A holder's events are written one by one through the path a single pass or ask takes today (appendEventAction on a company, the demo's acts in the demo), so every
// case keeps its own rights and NOR's rules; the seat above (`forDesk`) calls passForDesk once. Then the bar says how many went and lists each case that was
// refused with its error. A no is never offered here: each needs its reason (NOR).
import { useState, useTransition } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { handCandidates } from "@/components/shell/InputSheet";
import { newId } from "@/features/cases/events";
import type { ReducedCase } from "@/features/cases/reducer";
import { bulkEvents, type BulkAction } from "@/features/overload/bulk";
import { useT } from "@/i18n/client";
import { appendEventAction } from "@/server/actions/events";
import { passForDesk } from "@/server/actions/overload";
import styles from "./BulkBar.module.css";

type Props = {
  /** The cases the bar works on: the selected ones, or with `choose` the ones to choose from. */
  cases: readonly ReducedCase[];
  /** The role of the desk the seat above passes cases of (D28): only passing, through passForDesk. */
  forDesk?: string;
  /** The bar lists the cases itself with a checkbox each (the Dashboard card); else the page selects them (the inbox). */
  choose?: boolean;
  /** Called when something went, so the page can leave its selection. */
  onDone?: () => void;
};

type Result = { done: string[]; refused: { caseId: string; error: string }[] };

export function BulkBar({ cases, forDesk, choose = false, onDone }: Props) {
  const t = useT();
  const { act, seed, me, deptName, serverMode, tenant } = useDemo();
  const [mode, setMode] = useState<BulkAction>("pass");
  const [seatId, setSeatId] = useState("");
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const ids = choose ? cases.filter((c) => picked.has(c.id)).map((c) => c.id) : cases.map((c) => c.id);
  const options = handCandidates(cases[0]?.route ?? null, seed.routes, seed.seats, me, t, deptName);
  const titleOf = (id: string) => cases.find((c) => c.id === id)?.title ?? id;
  const passing = mode === "pass";

  const send = () => {
    const built = bulkEvents(mode, ids, { why: text, question: text, toSeatId: seatId, toLabel: seed.seats.find((s) => s.id === seatId)?.label });
    if ("error" in built) { setError(t(built.error)); return; }
    if (built.length === 0) return;
    setError(null);
    start(async () => {
      const out: Result = { done: [], refused: [] };
      if (forDesk !== undefined) {
        // The seat above passes the desk's cases: one call, each case checked on the server by the rules of a pass (D28).
        const r = await passForDesk({ slug: tenant.slug, roleId: forDesk, caseIds: ids, toSeatId: seatId, why: text.trim() });
        out.done = r.done;
        out.refused = r.refused.map((x) => ({ caseId: x.caseId, error: x.error ?? t(x.key) }));
        if (r.error && r.refused.length === 0) setError(r.error);
      } else if (serverMode) {
        for (const e of built) {
          const r = await appendEventAction({ slug: tenant.slug, id: newId("e"), type: e.type, target: e.target, payload: e.payload });
          if (r.ok) out.done.push(e.target); else out.refused.push({ caseId: e.target, error: r.error });
        }
      } else {
        // The demo: its own acts, the same events as a single pass or ask.
        for (const e of built) {
          if (e.type === "case.handed") act.pass(e.target, e.payload); else act.ask(e.target, text.trim());
          out.done.push(e.target);
        }
      }
      setResult(out);
      if (out.done.length > 0) { setText(""); setSeatId(""); setPicked(new Set()); onDone?.(); }
    });
  };

  return (
    <div className={styles.bar} data-testid="bulk-bar">
      <div className={styles.top}>
        <span className={styles.count} data-testid="bulk-count">{ids.length}</span>
        {forDesk === undefined && (
          <span className={styles.modes} role="group">
            <button type="button" className={styles.button} aria-pressed={passing} onClick={() => setMode("pass")} data-testid="bulk-mode-pass">{t("overload.inbox.pass")}</button>
            <button type="button" className={styles.button} aria-pressed={!passing} onClick={() => setMode("ask")} data-testid="bulk-mode-ask">{t("overload.inbox.ask")}</button>
          </span>
        )}
      </div>
      {choose && (
        <ul className={styles.choose}>
          {cases.map((c) => (
            <li key={c.id}>
              <label className={styles.choice}>
                <input type="checkbox" checked={picked.has(c.id)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} />
                {c.title}
              </label>
            </li>
          ))}
        </ul>
      )}
      {passing && (
        <label className={styles.field}>
          {t("overload.inbox.pass")}
          <select className={styles.input} value={seatId} onChange={(e) => setSeatId(e.target.value)} data-testid="bulk-seat">
            <option value="">{t("shell.handPick")}</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.label}{o.sub ? " · " + o.sub : ""}</option>)}
          </select>
        </label>
      )}
      <label className={styles.field}>
        {passing ? t("overload.inbox.why") : t("overload.inbox.question")}
        <textarea className={styles.input} rows={2} value={text} onChange={(e) => setText(e.target.value)} data-testid="bulk-text" />
      </label>
      <span className={styles.top}>
        <button type="button" className={`${styles.button} ${styles.primary}`} disabled={pending || ids.length === 0} onClick={send} data-testid="bulk-send">
          {passing ? t("overload.inbox.pass") : t("overload.inbox.ask")}
        </button>
      </span>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {result && (
        <div className={styles.result} role="status" data-testid="bulk-result">
          {result.done.length > 0 && <span data-testid="bulk-done">{t("overload.inbox.done")}: {result.done.length}</span>}
          {result.refused.length > 0 && (
            <>
              <span>{t("overload.inbox.refused")}</span>
              <ul className={styles.refused} data-testid="bulk-refused">
                {result.refused.map((r) => <li key={r.caseId}>{titleOf(r.caseId)}: {r.error}</li>)}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
