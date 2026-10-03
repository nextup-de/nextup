"use client";
// The product, one screen per role: tabs on top, the reason behind the screen, then the real screen.
// Screenshots are the real app at 1440px @2x (public/screenshots/*.png).
import Image from "next/image";
import { useId, useRef, useState } from "react";
import styles from "./RoleScreens.module.css";

export type RoleScreen = {
  who: string; title: string; body: string; why: string;
  path: string; // where the screen lives in the app, shown above it
  shot: string; w: number; h: number; alt: string; tight?: boolean;
};

export function RoleScreens({ screens }: { screens: RoleScreen[] }) {
  const id = useId();
  const [on, setOn] = useState(0);
  const tabs = useRef<HTMLDivElement>(null);
  const s = screens[on];

  // Arrow keys move between tabs, as a tablist should.
  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (on + step + screens.length) % screens.length;
    setOn(next);
    tabs.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
  }

  return (
    <div className={styles.viewer}>
      <div className={styles.tabs} role="tablist" aria-label="The product, by role" ref={tabs} onKeyDown={onKeyDown}>
        {screens.map((t, i) => (
          <button
            key={t.path} type="button" role="tab" className={styles.tab}
            id={`${id}-tab-${i}`} aria-controls={`${id}-panel`} aria-selected={i === on} tabIndex={i === on ? 0 : -1}
            onClick={() => setOn(i)}
          >
            <span className={styles.who}>{i + 1} · {t.who}</span>
            <span className={styles.title}>{t.title}</span>
          </button>
        ))}
      </div>

      <div className={styles.panel} role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${on}`} key={s.path}>
        <div className={styles.copy}>
          <p>{s.body}</p>
          <p className={styles.why}><span className="nh-eyebrow">Why</span>{s.why}</p>
        </div>
        <figure className={styles.frame} data-tight={s.tight ? "true" : undefined}>
          <figcaption><span>{s.path}</span><span>Demo company</span></figcaption>
          <Image src={s.shot} alt={s.alt} width={s.w} height={s.h} sizes="(max-width: 1240px) 100vw, 1200px" />
        </figure>
      </div>
    </div>
  );
}
