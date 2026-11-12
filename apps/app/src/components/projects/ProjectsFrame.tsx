"use client";
// The Projects area with its sidebar (Paper page "Projects page"): the sidebar on the left, edge to edge
// under the bar, the page on the right. On a laptop or monitor the sidebar carries the area's tabs and a
// project's pages, so the two strips of tabs step aside; hide the sidebar (or open it on a phone) and the
// strips are back. The shell (SimpleShell) wraps every page of the area in this.
import { useSyncExternalStore } from "react";
import type { ProjectsTabKey } from "@/config/nav";
import { SectionTabs } from "@/components/shell/SectionTabs";
import { useT } from "@/i18n/client";
import { ProjectsSidebar } from "./ProjectsSidebar";
import s from "./ProjectsFrame.module.css";

const KEY = "nh.projectsSidebar";
// Open or hidden, remembered in this browser (the server always draws it open).
const listeners = new Set<() => void>();
const readSb = (): "open" | "hidden" => { try { return window.localStorage.getItem(KEY) === "hidden" ? "hidden" : "open"; } catch { return "open"; } };
const subscribeSb = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function ProjectsFrame({ area, projectId, caseId, children }: { area: ProjectsTabKey | null; projectId: string | null; caseId: string | null; children: React.ReactNode }) {
  const t = useT();
  const sb = useSyncExternalStore(subscribeSb, readSb, () => "open" as const);
  const set = (v: "open" | "hidden") => { try { window.localStorage.setItem(KEY, v); } catch { /* storage off */ } listeners.forEach((fn) => fn()); };

  return (
    <div className={s.root} data-wide="true" data-psb={sb}>
      <aside className={s.side} aria-label={t("projects.sbLabel")} inert={sb === "hidden"}>
        <ProjectsSidebar area={area} projectId={projectId} caseId={caseId} onHide={() => set("hidden")} />
      </aside>
      <div className={s.main}>
        {sb === "hidden" && (
          <button type="button" className={s.show} onClick={() => set("open")} title={t("projects.sbShow")} aria-label={t("projects.sbShow")}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="2" /><path d="M6 3V13" /></svg>
          </button>
        )}
        {area && <div className={s.tabs}><SectionTabs section="projects" active={area} /></div>}
        {children}
      </div>
    </div>
  );
}
