"use client";
// What "Publish idea" does on the raise page: the button shows the working glyph ("Wrangling…") while
// NextUp works out who should receive the idea, then this window offers 2-3 receivers with the reason
// and a match score, or anyone else from the directory. Props in.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { OrbState } from "thinking-orbs/engine";
import { EvalOrb } from "@/components/dashboard/team/EvalOrb";
import type { Dept, OrgPerson } from "@/features/demo/types";
import { initials } from "@/features/ideas/raise";
import type { Receiver } from "@/features/ideas/receivers";
import { Icon } from "./raiseIcons";
import s from "./Raise.module.css";

// What NextUp is doing right now, said in the button: our thinking orb, in the mode that fits the step,
// and the step itself ("Asking the router…").
export type Work = { label: string; orb: OrbState };
const MOTION = "(prefers-reduced-motion: reduce)";
const prefersReduced = () => window.matchMedia(MOTION).matches;
const onMotionPref = (f: () => void) => { const m = window.matchMedia(MOTION); m.addEventListener("change", f); return () => m.removeEventListener("change", f); };

export function Working({ work }: { work: Work }) {
  const reduced = useSyncExternalStore(onMotionPref, prefersReduced, () => false);
  return (
    <span className={s.working} role="status">
      <span className={s.workingOrb} aria-hidden="true"><EvalOrb state={work.orb} size={18} paused={reduced} /></span>
      <span key={work.label} className={s.workingLabel}>{work.label}</span>
    </span>
  );
}

const PAGE = 5;

export function ReceiverDialog({ options, people, depts, me, work, score, onCancel, onConfirm }: {
  options: Receiver[];
  people: readonly OrgPerson[];
  depts: readonly Dept[];
  me: string;
  work: Work | null; // publishing: what it is doing
  score: (name: string) => Receiver; // someone picked by hand, scored on the same facts
  onCancel: () => void;
  onConfirm: (r: Receiver) => void;
}) {
  const start = options.find((o) => o.yours) ?? options.find((o) => o.recommended) ?? options[0];
  const [chosen, setChosen] = useState<Receiver>(start);
  const [custom, setCustom] = useState<Receiver | null>(null); // someone else, once picked
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const busy = work !== null;
  const field = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => { if (searching) field.current?.focus(); }, [searching]);
  useEffect(() => {
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const deptName = (id: string) => depts.find((d) => d.id === id)?.name ?? "";
  const needle = q.trim().toLowerCase(), taken = new Set(options.map((o) => o.name));
  const found = people.filter((p) => p.name !== me && !taken.has(p.name))
    .filter((p) => !needle || (p.name + " " + p.role + " " + deptName(p.dept)).toLowerCase().includes(needle))
    .slice(0, PAGE);
  const pick = (name: string) => { const r = score(name); setCustom(r); setChosen(r); setSearching(false); setQ(""); };

  const row = (r: Receiver) => {
    const on = chosen.name === r.name;
    return (
      <div key={r.name} className={s.rcv} data-on={on}>
        <button type="button" role="radio" aria-checked={on} className={s.rcvTop} onClick={() => { setChosen(r); setSearching(false); }} disabled={busy}>
          <span className={s.rcvRadio} aria-hidden="true" />
          <span className={s.rcvAv} aria-hidden="true">{initials(r.name)}</span>
          <span className={s.rcvWho}>
            <span className={s.rcvNameRow}><span className={s.rcvName}>{r.name}</span>{r.recommended && <span className={s.rcvTag}>Best match</span>}</span>
            <span className={s.rcvRole}>{[r.role, r.yourLead ? "your lead" : ""].filter(Boolean).join(" · ")}</span>
          </span>
          <span className={s.rcvMatch} aria-label={r.score + "% match"}>
            <span className={s.rcvPct}>{r.score}%</span>
            <span className={s.rcvBar} style={{ "--pct": r.score + "%" } as React.CSSProperties}><span className={s.rcvFill} /></span>
          </span>
        </button>
        {on && (
          <div className={s.rcvWhy}>
            <span className={s.rcvWhyLabel}>Why {r.name}</span>
            <ul className={s.rcvReasons}>{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={s.dlgWrap}>
      <button type="button" className={s.dlgScrim} onClick={busy ? undefined : onCancel} aria-label="Close" tabIndex={-1} />
      <div ref={dialog} className={s.dlg} role="dialog" aria-modal="true" aria-labelledby="rcv-title" tabIndex={-1}>
        <div className={s.dlgHead}>
          <div className={s.dlgHeadText}>
            <span className={s.dlgKicker}>Before it goes out</span>
            <h2 id="rcv-title" className={s.dlgTitle}>Who should get this?</h2>
          </div>
          <button type="button" className={s.dlgClose} onClick={onCancel} disabled={busy} title="Close" aria-label="Close"><Icon name="x" size={11} width={2.6} /></button>
        </div>

        <div className={s.rcvs} role="radiogroup" aria-label="Who should get this">
          {options.map(row)}
          {custom && !taken.has(custom.name) && row(custom)}
          <div className={s.rcv} data-on={searching}>
            <button type="button" className={s.rcvTop} onClick={() => setSearching(!searching)} disabled={busy} aria-expanded={searching}>
              <span className={s.rcvRadio} aria-hidden="true" />
              <span className={s.rcvWho}>
                <span className={s.rcvName}>Choose someone else</span>
                <span className={s.rcvRole}>Search anyone in the company</span>
              </span>
              <Icon name="right" size={12} stroke="#8e8e93" width={2.4} className={s.rcvChevron} />
            </button>
            {searching && (
              <div className={s.rcvSearch}>
                <input ref={field} className={s.pickInput} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people, roles, departments" aria-label="Search people" />
                <div className={s.rcvList}>
                  {found.map((p) => (
                    <button key={p.name} type="button" className={`${s.mRow} ${s.pickRow}`} onClick={() => pick(p.name)}>
                      <span className={s.rcvAv} aria-hidden="true">{initials(p.name)}</span>
                      <span className={s.pickText}><span className={s.pickName}>{p.name}</span><span className={s.pickMeta}>{p.role} · {deptName(p.dept)}</span></span>
                    </button>
                  ))}
                  {!found.length && <span className={s.noMatch}>No matches</span>}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={s.dlgFoot}>
          <button type="button" className={s.dlgCancel} onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className={s.dlgGo} onClick={() => onConfirm(chosen)} disabled={busy}>
            {work ? <Working work={work} /> : <><Icon name="up" size={12} width={2.4} />Send to {chosen.name}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
