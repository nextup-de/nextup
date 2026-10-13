"use client";
// Dev panel (bottom-right): switch the persona, view the inbox as another desk holder, advance
// the demo clock, fill the raise page with a sample idea, demo data on/off, delete what this browser added, reset - and, on its own Design
// page, the design tweaks under review (animations on/off, old round corners, the dot grid - which
// localhost can save as the default for every device). It stays open
// while settings change; a click anywhere else or Escape closes it. Demo only - sessions replace it.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { openCasesOf } from "@/components/dashboard/derive";
import { DOTS_DEFAULT, DOTS_RANGE } from "@/features/design/dots";
import { devFill, hasDevFill, subscribeDevFill } from "@/lib/dev-fill";
import { saveDesignDefaultsAction } from "@/server/actions/design";
import styles from "./DevPanel.module.css";


export function DevPanel() {
  const ctx = useDemo();
  const { seed, S, role, persona, demo, dev, setDev, leadAs, motion, setMotion, roundCorners, setRoundCorners, dots, dotsCustom, setDots, resetDots } = ctx;
  const [page, setPage] = useState<"demo" | "design">("demo");
  const [saved, setSaved] = useState<string | null>(null); // the "Set as default" outcome
  const canSave = process.env.NODE_ENV === "development"; // the default is a source file: localhost writes it
  const isDefault = dots.dotsStrength === DOTS_DEFAULT.dotsStrength && dots.dotSpacing === DOTS_DEFAULT.dotSpacing;
  const saveDefault = async () => {
    const r = await saveDesignDefaultsAction(dots);
    if (r.ok) { resetDots(); setSaved("Saved as the default for every device - commit it to ship"); } else setSaved(r.error ?? "Could not save");
  };
  const box = useRef<HTMLDivElement>(null);
  const canFill = useSyncExternalStore(subscribeDevFill, hasDevFill, () => false); // the raise page's start view is open
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
      {dev && page === "design" && (
        <div className={styles.panel} role="dialog" aria-label="Design changes">
          <button type="button" className={styles.back} onClick={() => setPage("demo")}>
            <svg width="8" height="12" viewBox="0 0 8 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 1L1 6l5 5" /></svg>
            Demo controls
          </button>
          <div className={styles.label}>Design changes</div>

          <button type="button" className={styles.rowBtn} onClick={() => setMotion(!motion)} aria-pressed={motion}>
            <span className={styles.rowTitle}>Animations</span>
            <span className={styles.track} data-on={motion ? "true" : undefined}><span className={styles.knob} /></span>
          </button>

          <button type="button" className={styles.rowBtn} onClick={() => setRoundCorners(!roundCorners)} aria-pressed={roundCorners}>
            <span className={styles.rowTitle}>Round corners (old)</span>
            <span className={styles.track} data-on={roundCorners ? "true" : undefined}><span className={styles.knob} /></span>
          </button>

          <div className={styles.subLabel}>Dot grid</div>
          <label className={styles.slider}>
            <span className={styles.sliderHead}><span className={styles.rowTitle}>Strength</span><span className={styles.value}>{dots.dotsStrength.toFixed(2)}</span></span>
            <input type="range" {...DOTS_RANGE.dotsStrength} value={dots.dotsStrength} onChange={(e) => { setDots({ dotsStrength: Number(e.target.value) }); setSaved(null); }} />
          </label>
          <label className={styles.slider}>
            <span className={styles.sliderHead}><span className={styles.rowTitle}>Spacing</span><span className={styles.value}>{dots.dotSpacing}px</span></span>
            <input type="range" {...DOTS_RANGE.dotSpacing} value={dots.dotSpacing} onChange={(e) => { setDots({ dotSpacing: Number(e.target.value) }); setSaved(null); }} />
          </label>
          <div className={styles.dotActions}>
            <button type="button" className={styles.reset} onClick={() => { resetDots(); setSaved(null); }} disabled={!dotsCustom}>Back to default</button>
            {canSave && <button type="button" className={styles.saveDefault} onClick={saveDefault} disabled={isDefault}>Set as default</button>}
          </div>
          {saved && <div className={styles.saved} role="status">{saved}</div>}

          <div className={styles.foot}>
            <span className={styles.note}>Saved in this browser</span>
            <span className={styles.keys}>Esc</span>
          </div>
        </div>
      )}
      {dev && page === "demo" && (
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

          {canFill && (
            <button type="button" className={styles.rowBtn} onClick={() => { devFill(); setDev(false); }} title="Dev: fill a random idea">
              <span className={styles.rowTitle}>Fill a sample idea</span>
              <span className={styles.trash}>Raise</span>
            </button>
          )}

          <button type="button" className={styles.rowBtn} onClick={ctx.toggleDemo}>
            <span className={styles.rowTitle}>Demo data</span>
            <span className={styles.track} data-on={demo ? "true" : undefined}><span className={styles.knob} /></span>
          </button>

          <button type="button" className={styles.rowBtn} onClick={ctx.deleteAdded} disabled={!newCount}>
            <span className={styles.rowTitle}>Delete added cases{newCount ? " · " + newCount : ""}</span>
            <span className={styles.trash}>✕</span>
          </button>

          <button type="button" className={styles.rowBtn} onClick={() => setPage("design")}>
            <span className={styles.rowTitle}>Design changes</span>
            <svg className={styles.go} width="8" height="12" viewBox="0 0 8 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 1l5 5-5 5" /></svg>
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
