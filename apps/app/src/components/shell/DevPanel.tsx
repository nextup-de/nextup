"use client";
// Dev panel (bottom-right): switch the persona, view the inbox as another desk holder, advance
// the demo clock, demo data on/off, delete what this browser added, reset. It stays open while
// settings change; a click anywhere else or Escape closes it. Demo only - sessions replace it.
import { useEffect, useRef } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { openCasesOf } from "@/components/dashboard/derive";
import styles from "./DevPanel.module.css";

export function DevPanel() {
  const ctx = useDemo();
  const { seed, S, role, persona, demo, dev, setDev, leadAs } = ctx;
  const box = useRef<HTMLDivElement>(null);
  const isLead = role === "leader";
  const day = S.day;
  const newCount = S.cases.filter((c) => !c.seed).length;
  const status = (isLead && leadAs ? persona.who.name : persona.role.label) + " · demo " + (demo ? "on" : "off") + (day ? " · +" + day + " d" : "");

  // A click outside the panel closes it.
  useEffect(() => {
    if (!dev) return;
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setDev(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [dev, setDev]);

  // A company with real people gets no demo controls; the actions refuse them anyway.
  if (ctx.tenant.demoTools === false) return null;

  return (
    <div className={styles.dev} ref={box}>
      {dev && (
        <div className={styles.panel} role="dialog" aria-label="Demo controls">
          <div className={styles.label}>Viewing as</div>
          <div className={styles.roles}>
            {seed.personas.map((r) => (
              <button key={r.id} type="button" className={styles.role} data-on={role === r.id ? "true" : undefined} onClick={() => ctx.setRole(r.id)}>{r.label}</button>
            ))}
          </div>

          {isLead && (
            <>
              <div className={styles.subLabel}>Inbox of</div>
              <div className={styles.personas}>
                {seed.leaders.map((n) => {
                  const on = persona.who.name === n, count = openCasesOf(ctx, n).length;
                  return (
                    <button key={n} type="button" className={styles.persona} data-on={on ? "true" : undefined} onClick={() => ctx.setLeadAs(n)}>
                      {n}{count ? <span className={styles.personaCount}>{count}</span> : null}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <button type="button" className={styles.day} onClick={() => ctx.act.advanceDay(1)}>
            <span className={styles.rowTitle}>{day === 0 ? "Today" : "Today + " + day + " d"}</span>
            <span className={styles.plusDay}>+1 day</span>
          </button>

          <button type="button" className={styles.rowBtn} onClick={ctx.toggleDemo}>
            <span className={styles.rowTitle}>Demo data</span>
            <span className={styles.track} data-on={demo ? "true" : undefined}><span className={styles.knob} /></span>
          </button>

          <button type="button" className={styles.rowBtn} onClick={ctx.deleteAdded} disabled={!newCount}>
            <span className={styles.rowTitle}>Delete added cases{newCount ? " · " + newCount : ""}</span>
            <span className={styles.trash}>✕</span>
          </button>

          <div className={styles.foot}>
            <button type="button" className={styles.reset} onClick={ctx.resetDemo}>Reset demo</button>
            <span className={styles.keys}>Esc</span>
          </div>
        </div>
      )}
      <button type="button" className={styles.toggle} data-on={dev ? "true" : undefined} onClick={() => { setDev(!dev); ctx.setPop(null); }} title={status}>
        <span className={styles.toggleDot} />Dev
      </button>
    </div>
  );
}
