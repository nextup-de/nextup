"use client";
// The inbox with one item open, on a screen wider than a phone: the layout of the old leader inbox (components/dashboard/
// leader/InboxView, before #746) that Kevin and Sam liked. Left, the rail: a tuck button, then one avatar per item to
// decide, the open one on blue; untucked it shows each item's title, who raised it and its due badge. Beside it the item
// itself (IdeaDetail): the item and its folds, and "Your move" on the right. The bar names the inbox and the item's
// title is the page's one heading, so the rail has no title of its own. ↑/↓ walk the items, Escape
// closes. Props in, JSX out: the page decides what is listed and what is open.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { IdeaDetail } from "@/components/dashboard/leader/IdeaDetail";
import { initialsOf, type IdeaProps } from "@/components/dashboard/leader/IdeaParts";
import { avatarTone } from "@/lib/avatar";
import { useT } from "@/i18n/client";
import styles from "./InboxOpen.module.css";

/** One item on the rail: what it is called, who raised it, and its due state. */
export type RailItem = { id: string; title: string; who: string; late: boolean; dueSoon: boolean };

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

export function InboxOpen({ items, openId, detail, onPick, onClose, sheetOpen }: { items: RailItem[]; openId: string; detail: IdeaProps; onPick: (id: string) => void; onClose: () => void; sheetOpen: boolean }) {
  const t = useT();
  const [tucked, setTucked] = useState(true);
  const paneRef = useRef<HTMLDivElement>(null);
  const navRef = useRef({ ids: [] as string[], at: -1, onPick, onClose, sheetOpen });
  useLayoutEffect(() => { navRef.current = { ids: items.map((i) => i.id), at: items.findIndex((i) => i.id === openId), onPick, onClose, sheetOpen }; });

  // Keyboard: ↑/↓ walk the rail, Escape closes. The idea's popovers and an open sheet handle their own keys first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const nav = navRef.current;
      if (nav.sheetOpen || isTyping(e.target)) return;
      if (e.key === "Escape") { nav.onClose(); return; }
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && nav.ids.length) {
        e.preventDefault();
        const n = Math.max(0, Math.min(nav.ids.length - 1, nav.at + (e.key === "ArrowDown" ? 1 : -1)));
        if (n !== nav.at) nav.onPick(nav.ids[n]);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  // A newly picked item starts at its top.
  useEffect(() => { paneRef.current?.scrollTo({ top: 0 }); }, [openId]);

  return (
    <div className={styles.page} data-tucked={tucked ? "true" : undefined} data-testid="inbox-open">
      <nav className={styles.rail} aria-label={t("inbox.title")}>
        <div className={styles.railHead}>
          <button type="button" className={styles.tuck} onClick={() => setTucked((v) => !v)} title={t(tucked ? "leader.showInbox" : "leader.tuckInbox")} aria-label={t(tucked ? "leader.showInbox" : "leader.tuckInbox")} aria-expanded={!tucked} data-testid="inbox-tuck">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></svg>
          </button>
        </div>
        <ul className={styles.list}>
          {items.map((r) => {
            const on = r.id === openId;
            return (
              <li key={r.id}>
                <button type="button" className={styles.row} onClick={() => onPick(r.id)} data-testid="inbox-rail-row" data-active={on ? "true" : undefined} aria-current={on ? "true" : undefined} title={tucked ? r.title : undefined}>
                  <span className={styles.avatar} data-avatar={avatarTone(r.who)} aria-hidden="true">{initialsOf(r.who || "?")}</span>
                  <span className={styles.rowBody}>
                    <span className={styles.rowMain}>
                      <span className={styles.rowTitle}>{r.title}</span>
                      {r.who ? <span className={styles.rowWho}>{r.who}</span> : null}
                    </span>
                    {r.late ? <span className={styles.badge} data-tone="late">{t("inbox.late")}</span> : r.dueSoon ? <span className={styles.badge} data-tone="soon">{t("inbox.dueSoon")}</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className={styles.pane} ref={paneRef}>
        <IdeaDetail key={detail.idea.id} {...detail} />
      </div>
    </div>
  );
}
