"use client";
// Open | Archive above a list of cases (docs/plans/2026-10-15_idea-to-project.md section 2): the open
// lists show what is still moving; the archive what was decided, filtered by where it went. Props in,
// JSX out - the list counts and filters with features/cases/discussion (archiveOf, inView).
import { ARCHIVE_LABEL, type ArchiveFilter, type ArchiveOutcome, type ListView } from "@/features/cases/discussion";
import styles from "./ArchiveTabs.module.css";

const FILTERS: ArchiveFilter[] = ["all", "project", "declined"];

export function ArchiveTabs({ view, filter, outcomes, onView, onFilter }: {
  view: ListView; filter: ArchiveFilter;
  /** One entry per case in the list before this split: null = still live. */
  outcomes: readonly (ArchiveOutcome | null)[];
  onView: (v: ListView) => void; onFilter: (f: ArchiveFilter) => void;
}) {
  const live = outcomes.filter((o) => o === null).length;
  const count = (f: ArchiveFilter) => outcomes.filter((o) => o !== null && (f === "all" || o === f)).length;
  return (
    <div className={styles.bar}>
      <div className={styles.tabs} role="tablist" aria-label="Open or archived">
        <button type="button" role="tab" aria-selected={view === "open"} className={styles.tab} data-on={view === "open" ? "true" : undefined} onClick={() => onView("open")}>
          Open<span className={styles.count}>{live}</span>
        </button>
        <button type="button" role="tab" aria-selected={view === "archive"} className={styles.tab} data-on={view === "archive" ? "true" : undefined} onClick={() => onView("archive")}>
          Archive<span className={styles.count}>{count("all")}</span>
        </button>
      </div>
      {view === "archive" && (
        <div className={styles.filters} role="group" aria-label="Archive filter">
          {FILTERS.map((f) => (
            <button key={f} type="button" className={styles.filter} data-on={filter === f ? "true" : undefined} aria-pressed={filter === f} onClick={() => onFilter(f)}>
              {f === "all" ? "All" : ARCHIVE_LABEL[f]}<span className={styles.count}>{count(f)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
