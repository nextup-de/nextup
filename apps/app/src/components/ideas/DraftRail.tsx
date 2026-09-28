// Left rail of the idea studio: "New idea", then the author's drafts with their score ring, then
// what they already published - like a chat history. Props in, JSX out.
import type { DraftSummary } from "@/features/ideas/drafts";
import styles from "./IdeaStudio.module.css";

export function ago(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return m + " min ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + " h ago";
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : d + " days ago";
}

export function DraftRail({ drafts, current, threshold, loaded, onNew, onOpen }: {
  drafts: readonly DraftSummary[];
  current: string | null;
  threshold: number;
  loaded: boolean;
  onNew: () => void;
  onOpen: (id: string) => void;
}) {
  const open = drafts.filter((d) => d.status === "draft");
  const done = drafts.filter((d) => d.status === "published");
  const row = (d: DraftSummary) => (
    <li key={d.id}>
      <button type="button" className={styles.railItem} aria-current={d.id === current ? "true" : undefined} onClick={() => onOpen(d.id)}>
        <span className={styles.railMini} data-ready={d.overall >= threshold ? "true" : undefined}>{d.status === "published" ? "✓" : d.overall}</span>
        <span className={styles.railText}>
          <span className={styles.railTitle}>{d.title || "Untitled idea"}</span>
          <span className={styles.railMeta}>{d.status === "published" ? "Published" : ago(d.updatedAt)}</span>
        </span>
      </button>
    </li>
  );
  return (
    <nav className={styles.rail} aria-label="Your ideas">
      <button type="button" className={styles.newIdea} onClick={onNew}>
        <span aria-hidden="true">＋</span> New idea
      </button>
      <span className={styles.railLabel}>Drafts</span>
      {open.length ? <ul className={styles.railList}>{open.map(row)}</ul>
        : <p className={styles.railEmpty}>{loaded ? "Ideas you start are kept here until you publish them." : "Loading…"}</p>}
      {done.length > 0 && <><span className={styles.railLabel}>Published</span><ul className={styles.railList}>{done.map(row)}</ul></>}
    </nav>
  );
}
