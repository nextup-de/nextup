"use client";
// What "Publish idea" does on the raise page: the button shows the working glyph ("Wrangling…") while
// NextUp works out who should receive the idea, then this window offers 2-3 receivers with the reason
// and a match score, or anyone else from the directory. Props in.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { OrbState } from "thinking-orbs/engine";
import { EvalOrb } from "@/components/dashboard/team/EvalOrb";
import type { Dept, OrgPerson } from "@/features/demo/types";
import { initials } from "@/features/ideas/raise";
import { otherReceiver, type Receiver } from "@/features/ideas/receivers";
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

export function ReceiverDialog({ title, options, people, depts, me, work, onCancel, onConfirm }: {
  title: string;
  options: Receiver[];
  people: readonly OrgPerson[];
  depts: readonly Dept[];
  me: string;
  work: Work | null; // publishing: what it is doing
  onCancel: () => void;
  onConfirm: (r: Receiver) => void;
}) {
  const start = options.find((o) => o.kind === "yours") ?? options.find((o) => o.recommended) ?? options[0];
  const [chosen, setChosen] = useState<Receiver>(start);
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
  const custom = chosen.kind === "other" ? chosen : null;

  const card = (r: Receiver) => (
    <button key={r.name} type="button" role="radio" aria-checked={chosen.name === r.name} className={s.rcv} onClick={() => setChosen(r)} disabled={busy}>
      <span className={s.rcvTop}>
        <span className={`${s.lead} ${s.leadPick}`} data-kind="person">{initials(r.name)}</span>
        <span className={s.rcvWho}><span className={s.rcvName}>{r.name}</span><span className={s.rcvRole}>{r.role}</span></span>
        {r.recommended && <span className={s.rcvTag}>Recommended</span>}
        {r.score !== null && <span className={s.rcvScore}>{r.score}% match</span>}
        <span className={s.rcvDot} aria-hidden="true" />
      </span>
      <span className={s.rcvWhy}>{r.why}</span>
    </button>
  );

  return (
    <div className={s.dlgWrap}>
      <button type="button" className={s.dlgScrim} onClick={busy ? undefined : onCancel} aria-label="Close" tabIndex={-1} />
      <div ref={dialog} className={s.dlg} role="dialog" aria-modal="true" aria-labelledby="rcv-title" tabIndex={-1}>
        <div className={s.dlgHead}>
          <h2 id="rcv-title" className={`${s.dlgTitle} ${s.serif}`}>Who should receive it?</h2>
          <button type="button" className={s.popX} onClick={onCancel} disabled={busy} title="Close" aria-label="Close"><Icon name="x" size={9} width={3} /></button>
        </div>
        <p className={s.dlgSub}>NextUp suggests these desks for “{title}”. Pick one, or choose someone yourself.</p>

        <div className={s.rcvs} role="radiogroup" aria-label="Receivers">
          {options.map(card)}
          {custom && card(custom)}
        </div>

        {!searching ? (
          <button type="button" className={s.rcvOther} onClick={() => setSearching(true)} disabled={busy}>
            <Icon name="colleague" size={12.75} stroke="#1c1c1e" />Someone else
          </button>
        ) : (
          <div className={s.rcvSearch}>
            <input ref={field} className={s.pickInput} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" aria-label="Search people" />
            <div className={s.rcvList}>
              {found.map((p) => (
                <button key={p.name} type="button" className={`${s.mRow} ${s.pickRow}`} onClick={() => { setChosen(otherReceiver(p, deptName(p.dept))); setSearching(false); setQ(""); }}>
                  <span className={`${s.lead} ${s.leadPick}`} data-kind="person">{initials(p.name)}</span>
                  <span className={s.pickText}><span className={s.pickName}>{p.name}</span><span className={s.pickMeta}>{p.role} · {deptName(p.dept)}</span></span>
                </button>
              ))}
              {!found.length && <span className={s.noMatch}>No matches</span>}
            </div>
          </div>
        )}

        <div className={s.dlgFoot}>
          <button type="button" className={s.sgNo} onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className={s.dlgGo} onClick={() => onConfirm(chosen)} disabled={busy}>
            {work ? <Working work={work} /> : <><Icon name="up" size={11.25} width={2.4} />Publish to {chosen.name}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
