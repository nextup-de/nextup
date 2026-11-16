"use client";
// One side view per area (DESIGN_RULES §4): the area's pages on the left, edge to edge under the bar, as the Projects
// area has them (components/projects/ProjectsFrame.tsx). It starts hidden, the calm start; one button at the top left
// brings it back. The choice is remembered in this browser under the key Projects already keeps, so the side view is
// open or hidden in every area alike. On a laptop or monitor it is the area's only navigation: the strip of tabs under
// the bar is not drawn (SectionTabs, `side`). A phone has no side view and keeps the strip.
// A page puts its own list under the pages with <AreaSideSlot>: the inbox's open items, the raiser's ideas.
import Link from "next/link";
import { createContext, useContext, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { sectionTabsFor, type SectionKey } from "@/config/nav";
import { useT } from "@/i18n/client";
import s from "./AreaFrame.module.css";

const KEY = "nh.projectsSidebar"; // one choice for every area
const listeners = new Set<() => void>();
const readSb = (): "open" | "hidden" => { try { return window.localStorage.getItem(KEY) === "open" ? "open" : "hidden"; } catch { return "hidden"; } };
const subscribeSb = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** Where a page's own list goes: the box under the pages. Null while the side view is hidden. */
const SlotContext = createContext<HTMLElement | null>(null);

export function AreaFrame({ section, active, children }: { section: SectionKey; active: string; children: React.ReactNode }) {
  const { href, role, serverMode } = useDemo();
  const t = useT();
  const sb = useSyncExternalStore(subscribeSb, readSb, () => "hidden" as const);
  const set = (v: "open" | "hidden") => { try { window.localStorage.setItem(KEY, v); } catch { /* storage off */ } listeners.forEach((fn) => fn()); };
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const pages = sectionTabsFor(section, { role, serverMode });

  return (
    <div className={s.root} data-sb={sb} data-section={section} data-testid="area-frame">
      <aside className={s.side} aria-label={pages[0] ? t(pages[0].labelKey) : section} inert={sb === "hidden"}>
        {/* Hidden, it draws nothing: no list or links left in the page for a reader or a test. */}
        {sb === "open" && (
          <div className={s.sb}>
            <div className={s.top}>
              <button type="button" className={s.iconBtn} onClick={() => set("hidden")} title={t("projects.sbHide")} aria-label={t("projects.sbHide")}>
                <PanelIcon />
              </button>
            </div>
            <nav className={s.pages} aria-label={t("shell.navMain")} data-testid={`${section}-pages`}>
              {pages.map((page) => (
                <Link key={page.key} href={href(page.href)} className={s.row} aria-current={page.key === active ? "page" : undefined}>
                  <span className={s.slot}><PageIcon k={page.key} /></span>
                  <span className={s.label}>{t(page.labelKey)}</span>
                </Link>
              ))}
            </nav>
            <div className={s.lower} ref={setSlot} />
          </div>
        )}
      </aside>
      <div className={s.main}>
        {sb === "hidden" && (
          <button type="button" className={s.show} onClick={() => set("open")} title={t("projects.sbShow")} aria-label={t("projects.sbShow")}>
            <PanelIcon />
          </button>
        )}
        <div className={s.inner}>
          <SlotContext.Provider value={sb === "open" ? slot : null}>{children}</SlotContext.Provider>
        </div>
      </div>
    </div>
  );
}

/** A page's own list in its area's side view, under the pages. Draws nothing while the side view is hidden or on a phone. */
export function AreaSideSlot({ children }: { children: React.ReactNode }) {
  const slot = useContext(SlotContext);
  return slot ? createPortal(children, slot) : null;
}

function Svg({ children }: { children: React.ReactNode }) {
  return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}

const PanelIcon = () => <Svg><rect x="2" y="3" width="12" height="10" rx="2" /><path d="M6 3V13" /></Svg>;

/** One mark per page, so every label starts in the same lane as in the Projects side view. */
function PageIcon({ k }: { k: string }) {
  switch (k) {
    case "inbox": return <Svg><path d="M2.5 9.5L4.3 3.5H11.7L13.5 9.5V12.5H2.5V9.5Z" /><path d="M2.5 9.5H5.8C5.8 10.6 6.8 11.3 8 11.3C9.2 11.3 10.2 10.6 10.2 9.5H13.5" /></Svg>;
    case "decisions": return <Svg><circle cx="8" cy="8" r="5.5" /><path d="M5.6 8.2L7.3 9.9L10.5 6.4" /></Svg>;
    case "kpis": return <Svg><path d="M2.5 12.5L6 8.5L8.6 10.6L13.5 4.5" /><path d="M10.5 4.5H13.5V7.5" /></Svg>;
    case "profile": return <Svg><circle cx="8" cy="5.8" r="2.6" /><path d="M3 13.2C3.5 10.9 5.5 9.8 8 9.8C10.5 9.8 12.5 10.9 13 13.2" /></Svg>;
    case "reports": return <Svg><path d="M4 13.5V2.8" /><path d="M4 3.5H12L10.2 6.2L12 9H4" /></Svg>;
    case "raise": return <Svg><path d="M8 3.2V12.8M3.2 8H12.8" /></Svg>;
    case "mine": return <Svg><path d="M5.5 4.5H13M5.5 8H13M5.5 11.5H13" /><path d="M2.8 4.5H3M2.8 8H3M2.8 11.5H3" /></Svg>;
    default: return <Svg><path d="M3 13.2H13.4" /><path d="M4.6 10.8V8.4M8 10.8V4.6M11.4 10.8V6.8" strokeWidth="1.6" /></Svg>;
  }
}
