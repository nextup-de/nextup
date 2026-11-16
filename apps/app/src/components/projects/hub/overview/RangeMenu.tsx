"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { OVERVIEW_RANGES, type OverviewRange } from "@/features/projects/overview-view";
import { useT } from "@/i18n/client";
import styles from "./Overview.module.css";

type Key = "projectHub.overviewRange7Days" | "projectHub.overviewRange14Days" | "projectHub.overviewRange30Days" | "projectHub.overviewRangeSinceStart";
const LABEL: Record<OverviewRange, Key> = {
  "7d": "projectHub.overviewRange7Days", "14d": "projectHub.overviewRange14Days", "30d": "projectHub.overviewRange30Days", start: "projectHub.overviewRangeSinceStart",
};

/** The range button and its menu (D6). Opens and moves with the keyboard: Arrow keys, Home, End, Enter or Space picks, Escape closes. */
export function RangeMenu({ value, onChange }: { value: OverviewRange; onChange: (next: OverviewRange) => void }) {
  const t = useT();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => { if (open) items.current[active]?.focus(); }, [open, active]);

  const close = (refocus: boolean) => { setOpen(false); if (refocus) button.current?.focus(); };
  const openAt = (index: number) => { setActive(index); setOpen(true); };
  const pick = (range: OverviewRange) => { onChange(range); close(true); };
  const onButtonKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); openAt(e.key === "ArrowUp" ? OVERVIEW_RANGES.length - 1 : OVERVIEW_RANGES.indexOf(value)); }
  };
  const onMenuKey = (e: KeyboardEvent) => {
    const last = OVERVIEW_RANGES.length - 1;
    const move = (to: number) => { e.preventDefault(); setActive(to); items.current[to]?.focus(); };
    if (e.key === "ArrowDown") move(active === last ? 0 : active + 1);
    else if (e.key === "ArrowUp") move(active === 0 ? last : active - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(last);
    else if (e.key === "Escape") { e.preventDefault(); close(true); }
    else if (e.key === "Tab") close(false);
  };

  return (
    <div className={styles.rangeWrap} onBlur={(e) => { if (open && !e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <button ref={button} type="button" className={styles.rangeButton} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} aria-label={`${t("projectHub.overviewRangeLabel")}: ${t(LABEL[value])}`}
        onClick={() => (open ? close(false) : openAt(OVERVIEW_RANGES.indexOf(value)))} onKeyDown={onButtonKey}>
        {t(LABEL[value])}<span aria-hidden="true"> ▾</span>
      </button>
      {open && <div id={id} role="menu" className={styles.menu} aria-label={t("projectHub.overviewRangeLabel")} onKeyDown={onMenuKey}>
        {OVERVIEW_RANGES.map((range, i) => (
          <button key={range} ref={(el) => { items.current[i] = el; }} type="button" role="menuitemradio" aria-checked={range === value} tabIndex={i === active ? 0 : -1} className={styles.menuItem} onClick={() => pick(range)}>
            <span aria-hidden="true" className={styles.check}>{range === value ? "✓" : ""}</span>{t(LABEL[range])}
          </button>
        ))}
      </div>}
    </div>
  );
}
