"use client";
// The raise page's sidebar: search, the open draft (title, publish, Idea / AI, what was added), and
// the ideas list with pinned ones on top. Collapsible; a drawer on phones. Props in, JSX out.
import { useEffect, useRef, useState } from "react";
import { Icon, Search, Solid } from "./raiseIcons";
import { Working, type Work } from "./RaisePublish";
import type { Chip } from "./RaiseComposer";
import s from "./Raise.module.css";

export type IdeaRow = { id: string; title: string; when: string; preview: string; published: boolean; pinned: boolean; current: boolean };
export type DraftCard = {
  title: string; published: boolean; canPublish: boolean; pubHint: string;
  onPublish: () => void; working: Work | null; onRename: (title: string) => void;
  hasIdea: boolean; ideaOn: boolean; ideaEdited: boolean; onIdea: () => void;
  aiOn: boolean; analysed: boolean; onAI: () => void;
  acts: Chip[]; files: Chip[];
  saveLabel: string; saved: boolean; onSave: () => void;
  discardLabel: string; onDiscard: () => void;
  menu: React.ReactNode | null; // the actions menu, opened from a list row
};

export function RaiseSidebar({ query, onQuery, onHide, card, rows, loaded, onPick, onPin, onNew }: {
  query: string; onQuery: (q: string) => void; onHide: () => void;
  card: DraftCard | null;
  rows: IdeaRow[]; loaded: boolean;
  onPick: (id: string) => void; onPin: (id: string) => void; onNew: () => void;
}) {
  const pinned = rows.filter((r) => r.pinned), recent = rows.filter((r) => !r.pinned);
  return (
    <div className={s.sb}>
      <div className={s.sbTop}>
        <div className={s.search}>
          <Search size={11.25} />
          <input className={s.searchInput} value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search" aria-label="Search ideas" />
        </div>
        <button type="button" className={s.iconBtn} onClick={onHide} title="Hide sidebar" aria-label="Hide sidebar"><Icon name="sidebar" size={12} /></button>
      </div>

      {card && <Card key={card.title} c={card} />}

      <div className={s.ideasHead}>
        <span className={s.ideasTitle}>Ideas</span>
        <button type="button" className={s.newIdea} onClick={onNew}><span className={s.plus}><Icon name="plus" size={7.5} stroke="#fff" width={3} /></span>New idea</button>
      </div>
      <div className={s.ideas}>
        {pinned.length > 0 && <span className={s.group}>Pinned</span>}
        {pinned.map((r) => <Row key={r.id} r={r} onPick={onPick} onPin={onPin} />)}
        <span className={s.group}>{pinned.length ? "Recent" : "Chats & drafts"}</span>
        {recent.map((r) => <Row key={r.id} r={r} onPick={onPick} onPin={onPin} />)}
        {loaded && !rows.length && <span className={s.ideasEmpty}>{query ? "No matches" : "Nothing yet. Your ideas and drafts land here."}</span>}
      </div>
    </div>
  );
}

function Row({ r, onPick, onPin }: { r: IdeaRow; onPick: (id: string) => void; onPin: (id: string) => void }) {
  return (
    <div role="button" tabIndex={0} className={s.idea} aria-current={r.current} data-pinned={r.pinned}
      onClick={() => onPick(r.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(r.id); } }}>
      <span className={s.ideaText}>
        <span className={s.ideaLine}>
          <span className={s.ideaTitle} data-empty={!r.title}>{r.title || "Untitled idea"}</span>
          <span className={s.ideaWhen}>{r.when}</span>
          <button type="button" className={s.pin} title={r.pinned ? "Unpin" : "Pin to top"} aria-label={r.pinned ? "Unpin" : "Pin to top"} aria-pressed={r.pinned}
            onClick={(e) => { e.stopPropagation(); onPin(r.id); }}>
            <svg width="9.75" height="9.75" viewBox="0 0 24 24" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true"><path d="M9 3h6l-1 6 4 4H6l4-4z" /><path d="M12 13v8" fill="none" /></svg>
          </button>
        </span>
        <span className={s.ideaLine}>
          <span className={s.ideaPreview}>{r.preview}</span>
          <span className={s.pill} data-published={r.published}>{r.published ? "Published" : "Draft"}</span>
        </span>
      </span>
    </div>
  );
}

function Card({ c }: { c: DraftCard }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) input.current?.focus(); }, [editing]);
  const commit = () => { const v = draft.trim(); if (v && v !== c.title) c.onRename(v); setEditing(false); };
  const state = c.published ? "published" : c.working ? "working" : c.canPublish ? "ready" : "off";

  return (
    <div className={s.card}>
      <div className={s.cardAnchor}>{c.menu}</div>
      <div className={s.titleWrap}>
        {editing ? (
          <input ref={input} className={`${s.titleInput} ${s.serif}`} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Give it a short title" aria-label="Title"
            onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditing(false); }} />
        ) : (
          <button type="button" className={`${s.titleBtn} ${s.serif}`} data-empty={!c.title} disabled={c.published} title={c.published ? undefined : "Rename"}
            onClick={() => { setDraft(c.title); setEditing(true); }}>
            {c.title || "Title appears once you describe your idea"}
          </button>
        )}
      </div>

      <button type="button" className={s.publish} data-state={state} disabled={state !== "ready"} onClick={c.onPublish} title={c.pubHint}>
        {c.working ? <Working work={c.working} /> : <>
          <Icon name={c.published ? "check" : "up"} size={11.25} width={c.published ? 2.8 : 2.4} />
          {c.published ? "Published" : "Publish idea"}
        </>}
      </button>

      <div className={s.halves}>
        {c.hasIdea && (
          <button type="button" className={s.half} data-on={c.ideaOn} onClick={c.onIdea}>
            <Icon name="idea" size={12} width={2} />Idea{c.ideaEdited && <span className={s.dot} />}
          </button>
        )}
        <button type="button" className={s.half} data-on={c.aiOn} onClick={c.onAI}>
          <span className={s.sparkle} data-on={c.analysed}><Solid name="sparkle" size={10.5} /></span>AI
        </button>
      </div>

      <List label="Actions made" icon="bolt" items={c.acts} />
      <List label="Attachments" icon="file" items={c.files} />

      <div className={s.foot}>
        <button type="button" className={s.save} data-saved={c.saved} onClick={c.onSave}><Icon name="download" size={9} width={2.4} />{c.saveLabel}</button>
        <button type="button" className={s.discard} onClick={c.onDiscard}>{c.discardLabel}</button>
      </div>
    </div>
  );
}

function List({ label, icon, items }: { label: string; icon: "bolt" | "file"; items: Chip[] }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const shown = all ? items : items.slice(-1);
  return (
    <div className={s.list}>
      <div className={s.listHead}>
        {icon === "bolt" ? <Solid name="bolt" size={10.5} fill="#6e6e73" /> : <Icon name="file" size={10.5} stroke="#6e6e73" width={2} />}
        <span className={s.listLabel}>{label}</span>
        <span className={s.listCount}>{items.length}</span>
        {items.length > 1 && (
          <button type="button" className={s.listMore} aria-expanded={all} onClick={() => setAll(!all)} title={all ? "Show less" : "Show all " + items.length} aria-label={all ? "Show less" : "Show all " + items.length}>
            <Icon name="down" size={9} width={2.8} />
          </button>
        )}
      </div>
      {shown.map((c) => (
        <div key={c.key} className={s.listRow}>
          <button type="button" className={s.listOpen} onClick={c.open} title="View or edit">
            <span className={s.lead} data-kind={c.kind} style={c.img ? { backgroundImage: `url(${c.img})` } : undefined}>{c.icon ? <Icon name={c.icon} size={11.25} /> : !c.img && c.lead}</span>
            <span className={s.listTitle}>{c.title}</span><span className={s.listSub}>{c.sub}</span>
          </button>
          <button type="button" className={s.listX} onClick={c.remove} title="Remove" aria-label={"Remove " + c.title}><Icon name="x" size={7.5} width={3} /></button>
        </div>
      ))}
    </div>
  );
}
