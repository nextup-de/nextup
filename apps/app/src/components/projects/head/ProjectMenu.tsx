"use client";
// The head's Manage button, right of the title: the moves that change the project's state (move the done-by date, pause,
// mark it done, stop) behind one button instead of a row of loose links. While the sidebar is open it sits there instead,
// as a ⋯ next to the project's title (Paper "Project head · options", A), with the details too. A pick opens its sheet at
// the top of the page: the address carries it (?manage=done), so the sidebar's menu and the page's sheet need no shared state.
import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { resultView } from "@/features/projects/result-view";
import type { ReducedProject } from "@/features/projects/types";
import { useLocale, useT } from "@/i18n/client";
import { DoneByForm, useCanMoveDoneBy } from "../move/DoneByLine";
import { PauseForm } from "../move/PausePanel";
import { useMoveView } from "../move/useMoveView";
import { idViewerOf } from "../parts";
import { DoneSheet } from "../result/DoneSheet";
import { StopChoice } from "../result/StopChoice";
import { useDismiss } from "./useDismiss";
import styles from "./Head.module.css";

export type HeadSheet = "doneBy" | "pause" | "done" | "stop" | "details";
const SHEETS: readonly HeadSheet[] = ["doneBy", "pause", "done", "stop", "details"];

/** The sheet the address asks for, and the way to open or close one. */
export function useManage(): { sheet: HeadSheet | null; open: (s: HeadSheet) => void; close: () => void } {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("manage");
  const sheet = SHEETS.find((s) => s === raw) ?? null;
  const go = (s: HeadSheet | null) => {
    const q = new URLSearchParams(params.toString());
    if (s) q.set("manage", s); else q.delete("manage");
    const qs = q.toString();
    router.replace(pathname + (qs ? "?" + qs : ""), { scroll: false });
  };
  return { sheet, open: go, close: () => go(null) };
}

/** What the viewer may do from the menu; an empty list draws no button. */
function useMenuItems(p: ReducedProject): HeadSheet[] {
  const ctx = useDemo();
  const locale = useLocale();
  const v = useMoveView(p);
  const canMove = useCanMoveDoneBy(p);
  const view = resultView(p, ctx.S, idViewerOf(ctx), ctx.S.day, locale);
  const items: HeadSheet[] = [];
  if (canMove) items.push("doneBy");
  if (!v.paused && v.canPause) items.push("pause");
  if (view.done?.can) items.push("done");
  if (view.stop?.can) items.push("stop");
  return items;
}

/** `sidebar`: the ⋯ next to the project's title in the sidebar, whose list also opens the details (the head has its (i)). */
export function ProjectMenu({ p, onPick, sidebar = false }: { p: ReducedProject; onPick: (s: HeadSheet) => void; sidebar?: boolean }) {
  const t = useT();
  const box = useRef<HTMLDetailsElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  useDismiss(box);
  const moves = useMenuItems(p);
  // The details join the moves that can be undone, before the two that end the project.
  const items: HeadSheet[] = sidebar ? [...moves.filter((s) => s !== "done" && s !== "stop"), "details", ...moves.filter((s) => s === "done" || s === "stop")] : moves;
  if (!items.length) return null;
  const label: Record<HeadSheet, string> = {
    doneBy: t("projectMove.doneByMove"),
    pause: t("projectMove.pauseOpen"),
    done: t("projects.markDoneEllipsis"),
    stop: t("projects.stopProject"),
    details: t("projects.about"),
  };
  // The sidebar scrolls and is narrow: its list opens beside the button, fixed to the window, not clipped by the sidebar.
  const place = () => {
    const r = box.current?.querySelector("summary")?.getBoundingClientRect();
    if (sidebar && r) setAt({ x: Math.min(r.right + 6, window.innerWidth - 248), y: Math.min(r.top, window.innerHeight - 280) });
  };
  const pick = (s: HeadSheet) => { if (box.current) box.current.open = false; onPick(s); };
  // Moves that can be undone first, then the two that end the project, after a line.
  const ends = (s: HeadSheet) => s === "done" || s === "stop";
  return (
    <details ref={box} className={styles.menu} data-variant={sidebar ? "sidebar" : undefined} onToggle={place}
      style={at ? { "--mx": at.x + "px", "--my": at.y + "px" } as React.CSSProperties : undefined}>
      <summary className={styles.menuBtn} aria-label={t("projects.manageLabel")}>
        <span className={styles.menuText}>{t("projects.manage")}</span>
        <svg className={styles.chevron} width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 4.5 6 7.5l3-3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <svg className={styles.dots} width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true"><circle cx="4" cy="9" r="1.4" /><circle cx="9" cy="9" r="1.4" /><circle cx="14" cy="9" r="1.4" /></svg>
      </summary>
      <div className={styles.menuPop}>
        {items.map((s, k) => (
          <div key={s} className={styles.menuGroup} data-split={k > 0 && ends(s) && !ends(items[k - 1]) ? "true" : undefined}>
            <button type="button" className={styles.menuItem} data-tone={s === "stop" ? "danger" : undefined} onClick={() => pick(s)}>{label[s]}</button>
          </div>
        ))}
      </div>
    </details>
  );
}

/** The sheet a pick opened, at the top of the page. The details are drawn by the page (they live with its (i)). */
export function ProjectSheet({ p, sheet, onClose }: { p: ReducedProject; sheet: Exclude<HeadSheet, "details">; onClose: () => void }) {
  const ctx = useDemo();
  const locale = useLocale();
  const view = resultView(p, ctx.S, idViewerOf(ctx), ctx.S.day, locale);
  if (sheet === "doneBy") return <DoneByForm p={p} onClose={onClose} />;
  if (sheet === "pause") return <PauseForm p={p} onClose={onClose} />;
  if (sheet === "done") return view.done ? <DoneSheet p={p} done={view.done} onClose={onClose} /> : null;
  return view.stop ? <StopChoice p={p} stop={view.stop} onClose={onClose} /> : null;
}
