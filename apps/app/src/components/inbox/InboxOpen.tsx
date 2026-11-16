"use client";
// The inbox with one item open, on a screen wider than a phone (DESIGN_RULES §4, §8, §9): the item itself (IdeaDetail)
// is the page, and the walk through the inbox is in the Inbox's side view under its pages (InboxWalk): every item that
// opens an idea, the open one marked, its pages Idea, Files and Chats under it. With the side view hidden the item stands
// alone with its close button; the side view's own button is the one toggle. ↑/↓ walk the items, Escape closes. Props
// in, JSX out: the page decides what is listed and what is open.
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { IdeaDetail } from "@/components/dashboard/leader/IdeaDetail";
import type { IdeaProps } from "@/components/dashboard/leader/IdeaParts";
import type { WalkItem } from "@/features/inbox/walk";
import { InboxWalk, type IdeaPageKey } from "./InboxWalk";
import styles from "./InboxOpen.module.css";

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

export function InboxOpen({ items, openId, counts, detail, onPick, onClose, sheetOpen }: {
  items: WalkItem[]; openId: string; counts: Partial<Record<IdeaPageKey, number>>; detail: IdeaProps;
  onPick: (id: string) => void; onClose: () => void; sheetOpen: boolean;
}) {
  const { href } = useDemo();
  const router = useRouter();
  const go = (r: WalkItem) => (r.inPlace ? onPick(r.id) : router.push(href(r.href)));
  const navRef = useRef({ items, at: -1, go, onClose, sheetOpen });
  useLayoutEffect(() => { navRef.current = { items, at: items.findIndex((i) => i.id === openId), go, onClose, sheetOpen }; });

  // Keyboard: ↑/↓ walk the items, Escape closes. The item's popovers and an open sheet handle their own keys first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const nav = navRef.current;
      if (nav.sheetOpen || isTyping(e.target)) return;
      if (e.key === "Escape") { nav.onClose(); return; }
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && nav.items.length) {
        e.preventDefault();
        const n = Math.max(0, Math.min(nav.items.length - 1, nav.at + (e.key === "ArrowDown" ? 1 : -1)));
        if (n !== nav.at) nav.go(nav.items[n]);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  // A newly picked item starts at its top.
  useEffect(() => { window.scrollTo({ top: 0 }); }, [openId]);

  return (
    <div className={styles.page} data-testid="inbox-open">
      <InboxWalk items={items} openId={openId} page="overview" counts={counts} onPick={onPick} />
      <IdeaDetail key={detail.idea.id} {...detail} />
    </div>
  );
}
