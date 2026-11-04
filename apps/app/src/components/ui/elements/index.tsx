// The elements every page without its own Paper frame is built from (Paper: "New for the pilot pages").
// Props in, JSX out: every word comes in as a prop, from the caller's catalog. Server and client pages can
// use these; DataTable's `render` is a function, so only a client component can pass it.
import Link from "next/link";
import { avatarTone } from "@/lib/avatar";
import { deptTone } from "@/lib/dept-tone";
import s from "./elements.module.css";

export { ConfirmDialog, EditDrawer, RowMenu, SecretOnce } from "./interactive";

/** A page's title: the same size and test id as SettingsHead, for pages outside Settings. */
export function PageHeader({ title, lede, action }: { title: string; lede?: string; action?: React.ReactNode }) {
  return (
    <header className={s.head} data-testid="page-header">
      <div className={s.headText}>
        <h1 className={s.title}>{title}</h1>
        {lede ? <p className={s.lede}>{lede}</p> : null}
      </div>
      {action ? <div className={s.headAction}>{action}</div> : null}
    </header>
  );
}

/** A white card. `name` tells two cards on one page apart in a test. */
export function SectionCard({ title, hint, action, name, children }: {
  title?: string; hint?: string; action?: React.ReactNode; name?: string; children?: React.ReactNode;
}) {
  return (
    <section className={s.card} data-testid="section-card" data-name={name}>
      {title || action ? (
        <div className={s.cardHead}>
          <div className={s.cardTitleBox}>
            {title ? <h2 className={s.cardTitle}>{title}</h2> : null}
            {hint ? <p className={s.cardHint}>{hint}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export type TabItem = { key: string; label: string; href: string; count?: number };

/** Views of one list. The current tab has aria-current. */
export function Tabs({ items, current, label }: { items: readonly TabItem[]; current: string; label: string }) {
  return (
    <nav className={s.tabs} aria-label={label}>
      {items.map((tab) => (
        <Link key={tab.key} href={tab.href} className={s.tab} aria-current={tab.key === current ? "page" : undefined}>
          {tab.label}
          {tab.count === undefined ? null : <span className={s.tabCount}>{tab.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** Every progress bar: done, in progress, blocked and still open, in that order. `label` says it in words; colour alone never does. */
export function ProgressBar({ done, doing = 0, blocked = 0, open = 0, label }: { done: number; doing?: number; blocked?: number; open?: number; label: string }) {
  const total = done + doing + blocked + open;
  const parts = [["done", done], ["doing", doing], ["blocked", blocked], ["open", open]] as const;
  return (
    <div className={s.progress} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
      {parts.filter(([, n]) => n > 0).map(([part, n]) => <span key={part} className={s.progressPart} data-part={part} style={{ flexGrow: n }} />)}
    </div>
  );
}

export type Column<Row> = {
  key: string;
  header: string;
  render: (row: Row) => React.ReactNode;
  /** A CSS grid track, `minmax(0, 1fr)` when left out. */
  width?: string;
  sort?: "ascending" | "descending";
};

export type Paging = { line: string; prevLabel: string; nextLabel: string; onPrev?: () => void; onNext?: () => void };

/** Rows on desktop, one small card per row on a phone with the column's name beside each value. */
export function DataTable<Row>({ columns, rows, rowKey, empty, paging, testId }: {
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  empty: string;
  paging?: Paging;
  testId?: string;
}) {
  const cols = { "--cols": columns.map((c) => c.width ?? "minmax(0, 1fr)").join(" ") } as React.CSSProperties;
  return (
    <div className={s.table} style={cols} data-testid={testId} role="table">
      <div className={s.tableHead} role="row">
        {columns.map((c) => <div key={c.key} role="columnheader" aria-sort={c.sort ?? "none"}>{c.header}</div>)}
      </div>
      {rows.length === 0 ? <p className={s.tableEmpty}>{empty}</p> : null}
      {rows.map((row) => (
        <div key={rowKey(row)} className={s.tableRow} role="row">
          {columns.map((c) => (
            <div key={c.key} className={s.cell} role="cell">
              {c.header ? <span className={s.cellLabel}>{c.header}</span> : null}
              <div>{c.render(row)}</div>
            </div>
          ))}
        </div>
      ))}
      {paging ? (
        <div className={s.paging}>
          <span>{paging.line}</span>
          <span className={s.pagingButtons}>
            <button type="button" className={s.pageButton} aria-label={paging.prevLabel} disabled={!paging.onPrev} onClick={paging.onPrev}>‹</button>
            <button type="button" className={s.pageButton} aria-label={paging.nextLabel} disabled={!paging.onNext} onClick={paging.onNext}>›</button>
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** One sentence across a card or page, at most one action. `quiet` is a normal state, such as the AI being off. */
export function Banner({ tone, action, children }: { tone: "info" | "warn" | "error" | "quiet"; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={s.banner} data-tone={tone} role={tone === "error" ? "alert" : undefined}>
      <span>{children}</span>
      {action ? <span className={s.bannerAction}>{action}</span> : null}
    </div>
  );
}

/** Takes the place of a number for a group under 5 people; it never shows the count behind it. */
export function TooFewToShow({ title, why }: { title: string; why: string }) {
  return (
    <div className={s.tooFew} data-testid="too-few-to-show">
      <span className={s.tooFewTitle}>{title}</span>
      <span className={s.tooFewWhy}>{why}</span>
    </div>
  );
}

const initials = (name: string) => name.split(/[\s.]+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

/** A person's initials in their own tint, the same on every page. Anonymous people and nobody stay grey. */
export function PersonFace({ name, size }: { name: string; size?: "sm" }) {
  const tone = avatarTone(name);
  return <span className={s.face} data-size={size} data-avatar={tone} data-person-face="" aria-hidden="true">{tone ? initials(name) : "?"}</span>;
}

/** A department in its own tint, the same on every page. `name` can carry more ("Production, Line 3"). */
export function DeptChip({ name }: { name: string }) {
  return <span className={s.deptChip} data-dept-tone={deptTone(name)}>{name}</span>;
}
