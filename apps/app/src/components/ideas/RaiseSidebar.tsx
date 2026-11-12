"use client";
// The raise page's sidebar: search, the open draft (publish, Idea / Analysis, what was added), and
// the ideas list with pinned ones on top, one line per idea: a dashed circle after the title marks a draft, and a title too long
// for the row glides left on hover so it can be read in full. Collapsible; a drawer on phones. Props in, JSX out.
import { useRef, useState } from "react";
import type { WhenGroup } from "@/features/ideas/raise";
import { useT } from "@/i18n/client";
import { Icon, Search, Solid } from "./raiseIcons";
import { Working, type Work } from "./RaisePublish";
import { PersonButton } from "./RaisePerson";
import type { Chip } from "./RaiseComposer";
import s from "./Raise.module.css";

export type IdeaRow = { id: string; title: string; when: string; group: WhenGroup; preview: string; published: boolean; pinned: boolean; current: boolean };

const GROUPS = [["today", "ideas.sideToday"], ["week", "ideas.sideThisWeek"], ["earlier", "ideas.sideEarlier"]] as const;
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
  const t = useT();
  const pinned = rows.filter((r) => r.pinned), recent = rows.filter((r) => !r.pinned);
  return (
    <div className={s.sb}>
      <div className={s.sbTop}>
        <div className={s.search}>
          <Search size={11.25} />
          <input className={s.searchInput} value={query} onChange={(e) => onQuery(e.target.value)} placeholder={t("ideas.sideSearch")} aria-label={t("ideas.sideSearchIdeas")} />
        </div>
        <button type="button" className={s.iconBtn} onClick={onHide} title={t("ideas.sideHide")} aria-label={t("ideas.sideHide")}><Icon name="sidebar" size={12} /></button>
      </div>

      {card && <Card key={card.title} c={card} />}

      <div className={s.ideasHead}>
        <span className={s.ideasTitle}>{t("ideas.sideIdeas")}</span>
        <button type="button" className={s.newIdea} onClick={onNew}><span className={s.plus}><Icon name="plus" size={7.5} stroke="var(--nh-on-brand)" width={3} /></span>{t("ideas.sideNew")}</button>
      </div>
      <div className={s.ideas}>
        {/* Pinned ones on top, then the rest under small time labels (Today, This week, Earlier) instead of a date per row. */}
        {pinned.length > 0 && <span className={s.group}>{t("ideas.sidePinned")}</span>}
        {pinned.map((r) => <Row key={r.id} r={r} onPick={onPick} onPin={onPin} />)}
        {GROUPS.map(([g, label]) => {
          const inGroup = recent.filter((r) => r.group === g);
          return inGroup.length > 0 && (
            <div key={g} className={s.timeGroup} role="group" aria-label={t(label)}>
              <span className={s.group}>{t(label)}</span>
              {inGroup.map((r) => <Row key={r.id} r={r} onPick={onPick} onPin={onPin} />)}
            </div>
          );
        })}
        {loaded && !rows.length && <span className={s.ideasEmpty}>{query ? t("ideas.publishNoMatches") : t("ideas.sideEmpty")}</span>}
      </div>
    </div>
  );
}

function Row({ r, onPick, onPin }: { r: IdeaRow; onPick: (id: string) => void; onPin: (id: string) => void }) {
  const t = useT();
  const title = useRef<HTMLSpanElement>(null);
  // How far a cut-off title has to glide to show its end, measured when the mouse arrives; 0 = it fits.
  // The text's full width against the visible box around it: the text's own box widens while it glides,
  // so measuring that one would read "fits" on every second hover.
  const [slide, setSlide] = useState(0);
  const measure = () => {
    const el = title.current, box = el?.parentElement;
    setSlide(el && box ? Math.max(0, Math.ceil(el.scrollWidth - box.clientWidth)) : 0);
  };
  const glide = slide ? ({ "--slide": `-${slide + 6}px`, "--glide": `${Math.round(400 + slide * 22)}ms` } as React.CSSProperties) : undefined;
  return (
    <div role="button" tabIndex={0} className={s.idea} aria-current={r.current} data-pinned={r.pinned}
      onMouseEnter={measure} onFocus={measure}
      onClick={() => onPick(r.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(r.id); } }}>
      <span className={s.ideaTitle} data-empty={!r.title} data-glide={slide > 0} style={glide}>
        <span ref={title} className={s.ideaTitleText}>{r.title || t("ideas.sideUntitled")}</span>
      </span>
      <button type="button" className={s.pin} data-hint={r.pinned ? t("ideas.sideUnpin") : t("ideas.sidePin")} aria-label={r.pinned ? t("ideas.sideUnpin") : t("ideas.sidePin")} aria-pressed={r.pinned}
        onClick={(e) => { e.stopPropagation(); onPin(r.id); }}>
        <svg width="9.75" height="9.75" viewBox="0 0 24 24" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true"><path d="M9 3h6l-1 6 4 4H6l4-4z" /><path d="M12 13v8" fill="none" /></svg>
      </button>
      {!r.published && (
        // A draft: a dashed circle at the row's end (the pin appears to its left, so it never moves), its meaning in a tooltip.
        <span className={s.ideaMark} data-hint={t("ideas.sideDraftHint")}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" role="img" aria-label={t("ideas.sideDraftHint")}><circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="1.6 1.5" /></svg>
        </span>
      )}
    </div>
  );
}

function Card({ c }: { c: DraftCard }) {
  const t = useT();
  const [sure, setSure] = useState(false); // "Remove from list" / "Discard draft" pressed once: the confirming button shows
  const state = c.published ? "published" : c.working ? "working" : c.canPublish ? "ready" : "off";

  return (
    <div className={s.card}>
      <div className={s.cardAnchor}>{c.menu}</div>
      <button type="button" className={s.publish} data-state={state} disabled={state !== "ready"} onClick={c.onPublish} title={c.pubHint}>
        {c.working ? <Working work={c.working} /> : <>
          <Icon name={c.published ? "check" : "up"} size={11.25} width={c.published ? 2.8 : 2.4} />
          {c.published ? t("ideas.sidePublished") : t("ideas.sidePublish")}
        </>}
      </button>

      <div className={s.halves}>
        {c.hasIdea && (
          <button type="button" className={s.half} data-on={c.ideaOn} onClick={c.onIdea}>
            <Icon name="idea" size={12} width={2} />{t("ideas.sideIdea")}{c.ideaEdited && <span className={s.dot} />}
          </button>
        )}
        <button type="button" className={s.half} data-on={c.aiOn} onClick={c.onAI}>
          <span className={s.sparkle} data-on={c.analysed}><Solid name="sparkle" size={10.5} /></span>{t("ideas.sideAnalysis")}
        </button>
      </div>

      <List label={t("ideas.sideActions")} icon="bolt" items={c.acts} />
      <List label={t("ideas.cardAttachments")} icon="file" items={c.files} />

      <div className={s.foot}>
        <button type="button" className={s.save} data-saved={c.saved} onClick={c.onSave}><Icon name="download" size={9} width={2.4} />{c.saveLabel}</button>
        {sure ? (
          // The second button: only this one takes the idea off the page.
          <span className={s.sure} role="group" aria-label={c.discardLabel + "?"}>
            <button type="button" className={s.discard} onClick={() => setSure(false)}>{t("ideas.sideKeep")}</button>
            <button type="button" className={s.discardYes} onClick={() => { setSure(false); c.onDiscard(); }}>{c.published ? t("ideas.sideYesRemove") : t("ideas.sideYesDiscard")}</button>
          </span>
        ) : (
          <button type="button" className={s.discard} onClick={() => setSure(true)}>{c.discardLabel}</button>
        )}
      </div>
    </div>
  );
}

function List({ label, icon, items }: { label: string; icon: "bolt" | "file"; items: Chip[] }) {
  const t = useT();
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const shown = all ? items : items.slice(-1);
  return (
    <div className={s.list}>
      <div className={s.listHead}>
        {icon === "bolt" ? <Solid name="bolt" size={10.5} fill="var(--nh-mute)" /> : <Icon name="file" size={10.5} stroke="var(--nh-mute)" width={2} />}
        <span className={s.listLabel}>{label}</span>
        <span className={s.listCount}>{items.length}</span>
        {items.length > 1 && (
          <button type="button" className={s.listMore} aria-expanded={all} onClick={() => setAll(!all)} title={all ? t("ideas.sideShowLess") : t("ideas.sideShowAll", { count: items.length })} aria-label={all ? t("ideas.sideShowLess") : t("ideas.sideShowAll", { count: items.length })}>
            <Icon name="down" size={9} width={2.8} />
          </button>
        )}
      </div>
      {shown.map((c) => (
        <div key={c.key} className={s.listRow}>
          {c.person && <PersonButton name={c.person} className={s.lead}>{c.lead}</PersonButton>}
          <button type="button" className={s.listOpen} onClick={c.open} title={t("ideas.composerViewEdit")}>
            {!c.person && <span className={s.lead} data-kind={c.kind} style={c.img ? { backgroundImage: `url(${c.img})` } : undefined}>{c.icon ? <Icon name={c.icon} size={11.25} /> : !c.img && c.lead}</span>}
            <span className={s.listTitle}>{c.title}</span><span className={s.listSub}>{c.sub}</span>
          </button>
          <button type="button" className={s.listX} onClick={c.remove} title={t("ideas.cardRemove")} aria-label={t("ideas.cardRemoveWhat", { what: c.title })}><Icon name="x" size={7.5} width={3} /></button>
        </div>
      ))}
    </div>
  );
}
