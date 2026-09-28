"use client";
// Who else an idea touches: the org chart and the departments, searched by name, role or department,
// long lists paged rather than scrolled. Moved out of the old raise box (RaiseView) unchanged in
// behaviour. Props in, JSX out.
import { useEffect, useRef, useState } from "react";
import type { Dept, OrgPerson } from "@/features/demo/types";
import styles from "./AffectedPicker.module.css";

const PICK_PAGE = 5; // rows per page; longer lists page instead of scrolling
type Pick = { id: string; label: string; meta: string; dept?: string }; // dept: a department row, expandable to its people

export function AffectedPicker({ people, depts, me, value, onChange, disabled, block }: {
  people: readonly OrgPerson[];
  depts: readonly Dept[];
  me: string; // the author: never offered
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  block?: boolean; // full-width trigger (the action panel) instead of a pill
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pages, setPages] = useState<Record<string, number>>({});
  const [openDept, setOpenDept] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const q = query.trim().toLowerCase();
  const hit = (p: Pick) => !q || p.label.toLowerCase().includes(q) || p.meta.toLowerCase().includes(q);
  const groups: { label: string; items: Pick[] }[] = [
    { label: "People", items: people.filter((p) => p.name !== me).map((p) => ({ id: p.name, label: p.name, meta: p.role + " · " + p.dept })).filter(hit) },
    { label: "Departments", items: depts.map((d) => ({ id: d.name, label: d.name, meta: d.people + " people", dept: d.id })).filter(hit) },
  ].filter((g) => g.items.length > 0);
  const inDept = (id: string): Pick[] => people.filter((p) => p.dept === id && p.name !== me).map((p) => ({ id: p.name, label: p.name, meta: p.role }));
  // The page is clamped so a narrower search never lands on an empty page.
  const pageOf = <T,>(key: string, items: T[]) => {
    const n = Math.max(1, Math.ceil(items.length / PICK_PAGE));
    const page = Math.min(pages[key] ?? 0, n - 1);
    return { page, n, rows: items.slice(page * PICK_PAGE, (page + 1) * PICK_PAGE) };
  };
  const turn = (key: string, to: number) => setPages((p) => ({ ...p, [key]: to }));

  const row = (it: Pick) => {
    const on = value.includes(it.id);
    return (
      <button key={it.id} type="button" className={styles.pickRow} onClick={() => toggle(it.id)} aria-pressed={on}>
        <span className={styles.pickMark} data-on={on ? "true" : undefined} aria-hidden="true">{on ? "✓" : ""}</span>
        <span className={styles.pickText}><span className={styles.pickLabel}>{it.label}</span><span className={styles.pickMeta}>{it.meta}</span></span>
      </button>
    );
  };
  const pager = (key: string, page: number, n: number) => n > 1 && (
    <div className={styles.pickPager}>
      <button type="button" className={styles.pickPage} onClick={() => turn(key, page - 1)} disabled={page === 0} aria-label="Previous page">‹</button>
      <span className={styles.pickPageN}>{page + 1} / {n}</span>
      <button type="button" className={styles.pickPage} onClick={() => turn(key, page + 1)} disabled={page >= n - 1} aria-label="Next page">›</button>
    </div>
  );

  return (
    <div className={styles.root} ref={ref} data-block={block ? "true" : undefined}>
      <button type="button" className={styles.trigger} data-on={value.length > 0 || open ? "true" : undefined} onClick={() => setOpen((v) => !v)} disabled={disabled} aria-expanded={open} aria-haspopup="dialog">
        <span className={styles.dot} data-on={value.length > 0 ? "true" : undefined} aria-hidden="true" />
        {value.length ? "Affected · " + value.length : "Affected"}
      </button>
      {open && (
        <div className={styles.picker} role="dialog" aria-label="Who else is affected">
          <div className={styles.pickSearch}>
            <input value={query} onChange={(e) => { setQuery(e.target.value); setPages({}); }} placeholder="Search people, departments" aria-label="Search people and departments" autoFocus />
          </div>
          <div className={styles.pickList}>
            {groups.map((g) => {
              const { page, n, rows } = pageOf(g.label, g.items);
              return (
                <div key={g.label}>
                  <span className={styles.pickGroup}>{g.label}</span>
                  {rows.map((it) => {
                    if (!it.dept) return row(it);
                    const isOpen = openDept === it.dept, members = inDept(it.dept), picked = members.filter((m) => value.includes(m.id)).length;
                    const sub = pageOf("dept:" + it.dept, members);
                    return (
                      <div key={it.id}>
                        <div className={styles.pickDeptRow}>
                          {row(it)}
                          {members.length > 0 && (
                            <button type="button" className={styles.pickSub} onClick={() => setOpenDept(isOpen ? null : it.dept ?? null)} aria-expanded={isOpen} aria-label={(isOpen ? "Hide" : "Pick") + " people in " + it.label}>
                              <span>{(picked ? picked + "/" : "") + members.length}</span>
                              <span className={styles.pickSubChev} aria-hidden="true">›</span>
                            </button>
                          )}
                        </div>
                        {isOpen && <div className={styles.pickNest}>{sub.rows.map(row)}{pager("dept:" + it.dept, sub.page, sub.n)}</div>}
                      </div>
                    );
                  })}
                  {pager(g.label, page, n)}
                </div>
              );
            })}
            {groups.length === 0 && <div className={styles.pickEmpty}>No matches</div>}
          </div>
          <div className={styles.pickFoot}>
            <span className={styles.pickCount}>{value.length} selected</span>
            <span className={styles.pickBtns}>
              <button type="button" className={styles.pickClear} onClick={() => onChange([])}>Clear</button>
              <button type="button" className={styles.pickDone} onClick={() => setOpen(false)}>Done</button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
