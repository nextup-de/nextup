"use client";
// What publishing looks like: NextUp's evaluation plays out one check at a time over the chat -
// org chart, goals, budget, history, who it touches, forwarding - and ends on the receipt. The
// case is already raised when this starts (the server said yes first); this only shows the route.
// Moved out of the old raise box (RaiseView). Props in.
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Evaluation } from "@/features/evaluate";
import { EvalOrb } from "@/components/dashboard/team/EvalOrb";
import styles from "./IdeaStudio.module.css";

const STEP_MS = 900;

export function PublishSequence({ ev, promiseDays, caseHref, dashHref, onDone }: {
  ev: Evaluation;
  promiseDays: number;
  caseHref: string;
  dashHref: string;
  onDone: () => void; // close the overlay, back to the (now read-only) chat
}) {
  const [done, setDone] = useState(0);
  // Read once on mount: this only exists after a click, so there is always a window.
  const [reduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    if (done > ev.steps.length) return;
    const t = setTimeout(() => setDone((n) => n + 1), reduced ? 120 : STEP_MS);
    return () => clearTimeout(t);
  }, [done, ev.steps.length, reduced]);

  const thinking = done < ev.steps.length;
  const at = Math.min(done, ev.steps.length - 1);
  return (
    <div className={styles.publish} role="dialog" aria-label="Publishing your idea">
      <div className={styles.publishCard}>
        <span className={styles.orb} aria-hidden="true"><EvalOrb state="connecting" size={88} paused={!thinking || reduced} /></span>
        <h2 className={styles.publishHead}>{thinking ? "Publishing" : "Published"}</h2>
        <p className={styles.publishNow} aria-live="polite">
          {thinking ? <>{ev.steps[at].title}<span className={styles.publishN}>{at + 1} / {ev.steps.length}</span></> : <span>On <strong>{ev.lead}</strong>’s desk{ev.passesTo ? <>, passed to <strong>{ev.passesTo}</strong> if it is theirs</> : null}</span>}
        </p>
        {thinking && at > 0 && <p key={at} className={styles.publishDetail}>{ev.steps[at - 1].detail}</p>}
        {thinking ? (
          <ol className={styles.publishTrack} aria-label="Checks">
            {ev.steps.map((s, i) => <li key={s.id} data-state={i < at ? "done" : i === at ? "now" : "todo"} title={s.title} />)}
          </ol>
        ) : (
          <div className={styles.publishReceipt} role="status">
            <p>Answer owed in {promiseDays} d. It stays on your dashboard until then.</p>
            <div className={styles.publishRow}>
              <Link href={caseHref} className={styles.primaryInline}>Open the case</Link>
              <Link href={dashHref} className={styles.mini}>Dashboard</Link>
              <button type="button" className={styles.mini} onClick={onDone}>Back to the idea</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
