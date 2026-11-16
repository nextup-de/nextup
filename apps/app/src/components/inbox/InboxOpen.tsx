"use client";
// The inbox with one item open, on a screen wider than a phone (DESIGN_RULES §4, §9): the item itself (IdeaDetail) is the
// page, and the items to decide are one quiet row each in the inbox's side view, under its pages (AreaSideSlot): a mark,
// the title on one line, a dot when late, the open one marked. With the side view hidden the item stands alone with its
// close button; the side view's own button is the one toggle. ↑/↓ walk the items, Escape closes. Props in, JSX out: the
// page decides what is listed and what is open.
import { useEffect, useLayoutEffect, useRef } from "react";
import { IdeaDetail } from "@/components/dashboard/leader/IdeaDetail";
import type { IdeaProps } from "@/components/dashboard/leader/IdeaParts";
import { AreaSideSlot } from "@/components/shell/AreaFrame";
import { useT } from "@/i18n/client";
import styles from "./InboxOpen.module.css";

/** One item to decide in the side view: what it is called and whether it is late. */
export type RailItem = { id: string; title: string; late: boolean };

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

export function InboxOpen({ items, openId, detail, onPick, onClose, sheetOpen }: { items: RailItem[]; openId: string; detail: IdeaProps; onPick: (id: string) => void; onClose: () => void; sheetOpen: boolean }) {
  const t = useT();
  const navRef = useRef({ ids: [] as string[], at: -1, onPick, onClose, sheetOpen });
  useLayoutEffect(() => { navRef.current = { ids: items.map((i) => i.id), at: items.findIndex((i) => i.id === openId), onPick, onClose, sheetOpen }; });

  // Keyboard: ↑/↓ walk the items, Escape closes. The item's popovers and an open sheet handle their own keys first.
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
  useEffect(() => { window.scrollTo({ top: 0 }); }, [openId]);

  return (
    <div className={styles.page} data-testid="inbox-open">
      <AreaSideSlot>
        <ul className={styles.list} aria-label={t("inbox.askDecide")}>
          {items.map((r) => (
            <li key={r.id}>
              <button type="button" className={styles.row} onClick={() => onPick(r.id)} data-testid="inbox-side-row" aria-current={r.id === openId ? "true" : undefined}>
                <span className={styles.mark} aria-hidden="true" />
                <span className={styles.label}>{r.title}</span>
                {r.late ? <span className={styles.late}><span className={styles.srOnly}>{t("inbox.late")}</span></span> : null}
              </button>
            </li>
          ))}
        </ul>
      </AreaSideSlot>
      <IdeaDetail key={detail.idea.id} {...detail} />
    </div>
  );
}
