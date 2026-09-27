"use client";
// Page head every view shares: title, sub-line, and (problems / ideas) the
// sort + filter menus with an active-filter strip underneath. Port of the "page head" and
// "list tools" blocks in legacy/demo/index.html.
import { useDemo } from "@/components/dashboard/DemoProvider";
import { fmt } from "@/lib/utils/format";
import styles from "./ViewHead.module.css";

export function ViewHead({ view, tools, strip }: { view: string; tools?: React.ReactNode; strip?: React.ReactNode }) {
  const { seed, demo } = useDemo();
  const copy = seed.views[view] ?? seed.views.overview;
  return (
    <>
      <div className={styles.head}>
        <div className={styles.headText}>
          <h1 className={styles.title}>{copy.title}</h1>
          {copy.sub && <div className={styles.sub}>{copy.sub.replace("{signals}", demo ? fmt(seed.metrics.signals) : "0")}</div>}
        </div>
        <div className={styles.tools}>{tools}</div>
      </div>
      {strip}
    </>
  );
}

export type SortOption = { id: string; label: string };
export type FacetOption = { id: string; label: string; count: number };
export type Facet = { key: string; label: string; value: string; options: FacetOption[]; onSel: (id: string) => void };
export type Chip = { label: string; onRemove: () => void };

type ToolsProps = {
  sort: string; sortOptions: SortOption[]; onSort: (id: string) => void;
  facets: Facet[]; filterCount: number; onClearFilters: () => void;
  showingLabel: string;
};

export function ListTools({ sort, sortOptions, onSort, facets, filterCount, onClearFilters, showingLabel }: ToolsProps) {
  const { pop, togglePop, setPop } = useDemo();
  const sortLabel = (sortOptions.find((d) => d.id === sort) ?? sortOptions[0]).label;
  return (
    <>
      <div className={styles.rel}>
        <button type="button" className={styles.toolBtn} data-on={pop === "sort" ? "true" : undefined} onClick={() => togglePop("sort")}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4v16M7 20l-3.5-3.5M7 20l3.5-3.5M17 20V4M17 4l-3.5 3.5M17 4l3.5 3.5" /></svg>
          <span className={styles.toolHint}>Sort</span>{sortLabel}
        </button>
        {pop === "sort" && (
          <div className={`${styles.menu} ${styles.menuLeft}`}>
            {sortOptions.map((o) => (
              <button key={o.id} type="button" className={styles.opt} data-on={sort === o.id ? "true" : undefined} onClick={() => { onSort(o.id); setPop(null); }}>
                {o.label}<span className={styles.optCheck}>{sort === o.id ? "✓" : ""}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={styles.rel}>
        <button type="button" className={styles.toolBtn} data-on={pop === "filter" || filterCount > 0 ? "true" : undefined} onClick={() => togglePop("filter")}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18M6 12h12M10 19h4" /></svg>
          Filter{filterCount > 0 && <span className={styles.badge}>{filterCount}</span>}
        </button>
        {pop === "filter" && (
          <div className={`${styles.menu} ${styles.menuFilter}`}>
            {facets.map((g) => (
              <div key={g.key} className={styles.fgroup}>
                <div className={styles.flabel}>{g.label}</div>
                <div className={styles.fchips}>
                  {g.options.map((o) => (
                    <button key={o.id} type="button" className={styles.fchip} data-on={g.value === o.id ? "true" : undefined} data-empty={o.count === 0 && g.value !== o.id ? "true" : undefined} onClick={() => g.onSel(o.id)}>
                      {o.label}<span className={styles.fcount}>{o.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className={styles.popFoot}>
              <span>{showingLabel}</span>
              {filterCount > 0 && <button type="button" className={styles.link} onClick={onClearFilters}>Clear filters</button>}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export function FilterStrip({ showingLabel, chips, onClearAll }: { showingLabel: string; chips: Chip[]; onClearAll: () => void }) {
  return (
    <div className={styles.strip}>
      <span className={styles.stripLabel}>{showingLabel}</span>
      {chips.map((c) => (
        <button key={c.label} type="button" className={styles.stripChip} onClick={c.onRemove}>{c.label}<span className={styles.stripX}>×</span></button>
      ))}
      <button type="button" className={`${styles.link} ${styles.stripClear}`} onClick={onClearAll}>Clear all</button>
    </div>
  );
}
