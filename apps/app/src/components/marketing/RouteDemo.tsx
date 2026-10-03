"use client";
// The hero's raise box. It runs the product's own matcher (features/routing `propose`) against the demo
// company's routing map, so what a visitor types is routed exactly as the app would route it: under the box
// stand the owner, the day the answer is owed and the deputy. Until the visitor touches the box it types the
// examples by itself, one after another. Nothing leaves the browser.
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { propose } from "@/features/routing";
import styles from "./RouteDemo.module.css";

export type DemoRoute = { id: string; type: string; keys: string[]; owner: string; role: string; deputy: string };
type Props = { routes: DemoRoute[]; promiseDays: number; examples: string[] };

const START_MS = 900;  // before the first example
const TYPE_MS = 34;    // per character typed
const ERASE_MS = 12;   // per character taken back
const HOLD_MS = 4200;  // how long a finished example and its answer stay
const REDUCED = "(prefers-reduced-motion: reduce)";

// "Thu 8 Oct": today plus the promise, in the visitor's own timezone - so it is only known in the browser.
const dueFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });
function dueDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return dueFmt.format(d).replace(",", "");
}
const never = () => () => {};
function onReduced(cb: () => void) {
  const m = window.matchMedia(REDUCED);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

export function RouteDemo({ routes, promiseDays, examples }: Props) {
  const id = useId();
  const [typed, setTyped] = useState<string | null>(null); // null until the visitor touches the box
  const [demo, setDemo] = useState("");                    // what the box has typed by itself so far
  const [raised, setRaised] = useState(false);
  const due = useSyncExternalStore(never, () => dueDate(promiseDays), () => null);
  const reduced = useSyncExternalStore(onReduced, () => window.matchMedia(REDUCED).matches, () => false);
  const touched = typed !== null;

  // Type an example, let its answer stand, take it back, type the next - until the visitor takes over.
  useEffect(() => {
    if (touched || reduced || !examples.length) return;
    let which = 0, n = 0, erasing = false;
    let timer = setTimeout(function tick() {
      const full = examples[which];
      n += erasing ? -2 : 1;
      setDemo(full.slice(0, Math.max(0, n)));
      if (!erasing && n >= full.length) { erasing = true; timer = setTimeout(tick, HOLD_MS); return; }
      if (erasing && n <= 0) { erasing = false; n = 0; which = (which + 1) % examples.length; }
      timer = setTimeout(tick, erasing ? ERASE_MS : TYPE_MS);
    }, START_MS);
    return () => clearTimeout(timer);
  }, [examples, touched, reduced]);

  const text = typed ?? (reduced ? examples[0] ?? "" : demo);
  const proposal = propose(text, routes);
  const route = proposal?.route ?? null;
  const miss = touched && proposal !== null && !route; // only said to someone who typed it, not while the box types

  const note = raised && route
    ? `Raised. On ${route.owner}'s desk, and the clock is running.`
    : route
      ? `Demo routing map: ${route.type}`
      : miss
        ? "No row on this map matches yet. A person triages it, and the map gets a new row."
        : "The demo company's routing map answers as you type.";

  return (
    <div className={styles.demo}>
      <form className={styles.box} onSubmit={(e) => { e.preventDefault(); setTyped(text); if (route) setRaised(true); }}>
        <label className="nh-sr" htmlFor={id}>Try it: type a problem or an idea that is stuck</label>
        <textarea
          id={id} className={styles.input} rows={1} maxLength={160} value={text}
          placeholder="Type something that is stuck at work…"
          onChange={(e) => { setRaised(false); setTyped(e.target.value); }}
          onFocus={() => { if (!touched) setTyped(text); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
        />
        <button type="submit" className={styles.send} disabled={!route} aria-label="Raise it">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 15V3M4 8l5-5 5 5" /></svg>
        </button>
      </form>

      <div className={styles.answer} data-on={route ? "true" : "false"}>
        <dl className={styles.facts}>
          <div><dt>Owner{route ? ` · ${route.role}` : ""}</dt><dd>{route?.owner ?? "—"}</dd></div>
          <div><dt>Answer owed by</dt><dd>{route ? due ?? `Day ${promiseDays}` : "—"}</dd></div>
          <div><dt>Deputy</dt><dd>{route?.deputy ?? "—"}</dd></div>
        </dl>
        <p className={styles.note} data-raised={raised && route ? "true" : undefined}>{note}</p>
      </div>
      <p className="nh-sr" role="status">
        {touched && route ? `Proposed owner: ${route.owner}, ${route.role}. Answer owed by ${due ?? `day ${promiseDays}`}. Deputy: ${route.deputy}.${raised ? " Raised." : ""}` : miss ? note : ""}
      </p>
    </div>
  );
}
