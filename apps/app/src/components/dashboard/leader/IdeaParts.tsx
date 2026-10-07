"use client";
// The pieces an opened idea is built from, shared by the desktop layout (IdeaDetail) and the phone
// layout (IdeaDetailPhone): citations, file chips, the person card, the reasoning blocks, what the
// AI found, the decisions and the feed. Props in, JSX out.
import { useState } from "react";
import Link from "next/link";
import { useDemo } from "@/components/dashboard/DemoProvider";
import { type BadgeTone, type IdeaBrief, type Numbered, type NumberedBlock, type Person, tagTone } from "@/features/ideas/brief";
import styles from "./IdeaDetail.module.css";
import { avatarTone } from "@/lib/avatar";

export type IdeaHeader = { id: string; kind: "idea" | "case"; title: string; badge: string; tone: BadgeTone; raised: string };
export type FeedEntry = { name: string; role: string; text: string; when: string; mine: boolean; person: Person | null }; // person: their card, when they are on the org chart

export type IdeaProps = {
  idea: IdeaHeader;
  brief: IdeaBrief;
  status: StatusNote | null; // what is already in motion: a question asked, the clock paused
  feed: FeedEntry[];
  onDecide: (key: string) => void; // a key of brief.actions
  onComment?: (text: string) => void; // comments are live (cases); absent = the box says "coming soon"
  onClose: () => void;
};
export type StatusNote = { label: string; lines: string[]; sub: string };

export const initialsOf = (name: string) => name.startsWith("Anonymous") ? "?" : name.split(/[\s.]+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

export function Sparkle({ size = 11 }: { size?: number }) {
  return <svg className={styles.sparkle} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" fill="currentColor" /></svg>;
}
export function Chevron({ back = false }: { back?: boolean }) {
  return <svg width="8" height="12" viewBox="0 0 8 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={back ? "M6 1L1 6l5 5" : "M2 1l5 5-5 5"} /></svg>;
}

// Superscript citation numbers pointing at a sources list.
export function Cites({ ns, to }: { ns: number[]; to: string }) {
  if (!ns.length) return null;
  return <>{ns.map((n) => <a key={n} href={"#" + to} className={styles.cite}>{n}</a>)}</>;
}

export function FileChip({ ext, name, title, meta, n }: { ext: string; name: string; title?: string; meta: string; n?: number }) {
  return (
    <span className={styles.file} title={title}>
      <span className={styles.fileTag} data-tone={tagTone(ext)}>{ext}</span>
      <span className={styles.fileText}>
        <span className={styles.fileName}>{n != null && <span className={styles.fileN}>{n}</span>}{name}</span>
        <span className={styles.fileMeta}>{meta}</span>
      </span>
    </span>
  );
}

// The small profile: who, where, how to reach them. The profile page does not exist yet, so the
// button says so instead of going nowhere.
export function PersonCard({ p, why }: { p: Person; why?: string | null }) {
  const { href, tenant } = useDemo();
  if (p.anonymous) return (
    <>
      <div className={styles.popHead}>
        <span className={styles.popAvatar}>?</span>
        <span className={styles.popWho}><span className={styles.popName}>{p.name}</span><span className={styles.popRole}>{p.dept}</span></span>
      </div>
      <span className={styles.small}>Raised anonymously. The name stays hidden, from you too.</span>
    </>
  );
  return (
    <>
      <div className={styles.popHead}>
        <span className={styles.popAvatar} data-avatar={avatarTone(p.name)}>{initialsOf(p.name)}</span>
        <span className={styles.popWho}><span className={styles.popName}>{p.name}</span><span className={styles.popRole}>{p.role}</span></span>
      </div>
      <dl className={styles.popGrid}>
        <dt>Department</dt><dd>{p.dept || "—"}</dd>
        <dt>Location</dt><dd>{p.location}</dd>
        <dt>Email</dt><dd><a className={styles.mail} href={"mailto:" + p.email}>{p.email}</a></dd>
      </dl>
      {why && <div className={styles.aiWhy}><Sparkle /><span>{why}</span></div>}
      {!tenant.hiddenPeople?.includes(p.name) && <Link className={styles.profileBtn} href={href("/people/" + encodeURIComponent(p.name))}>
        View profile<Chevron />
      </Link>}
    </>
  );
}

export function Blocks({ blocks, srcId }: { blocks: NumberedBlock[]; srcId: string }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case "text":
            return <div key={i} className={styles.section}><span className={styles.label}>{b.h}</span><p className={styles.para}>{b.p}<Cites ns={b.cites} to={srcId} /></p></div>;
          case "facts":
            return <dl key={i} className={styles.panel}>{b.items.map((f) => <PanelRow key={f.k} k={f.k}>{f.v}<Cites ns={f.cites} to={srcId} /></PanelRow>)}</dl>;
          case "steps":
            return <dl key={i} className={styles.panel}>{b.items.map((s) => <PanelRow key={s.label} k={s.dur}>{s.label}<span className={styles.owner}> · {s.owner}</span><Cites ns={s.cites} to={srcId} /></PanelRow>)}</dl>;
          case "compare":
            return (
              <div key={i} className={`${styles.panel} ${styles.bars}`}>
                <span className={styles.panelSub}>{b.title}<Cites ns={b.cites} to={srcId} /></span>
                {b.rows.map((r) => <Bar key={r.label} label={r.label} pct={r.pct} display={r.display} wide />)}
              </div>
            );
          case "quote":
            return (
              <div key={i} className={styles.section}>
                <span className={styles.label}>{b.h}</span>
                <p className={`${styles.para} ${styles.quote}`}>“{b.q}”<Cites ns={b.cites} to={srcId} /></p>
                <div className={styles.quoteBy}><span className={styles.chip}><span className={styles.chipAvatar} data-avatar={avatarTone(b.who)}>{initialsOf(b.who)}</span>{b.who}</span><span className={styles.small}>{b.role}</span></div>
              </div>
            );
          case "split":
            return (
              <div key={i} className={`${styles.section} ${styles.split}`}>
                <div><span className={styles.label}>Pulling it up</span>{b.ups.map((u) => <p key={u.t} className={styles.para}>{u.t}<Cites ns={u.cites} to={srcId} /></p>)}</div>
                <div><span className={styles.label}>Holding it back</span>{b.downs.map((u) => <p key={u.t} className={styles.para}>{u.t}<Cites ns={u.cites} to={srcId} /></p>)}</div>
              </div>
            );
        }
      })}
    </>
  );
}

export function PanelRow({ k, children }: { k: string; children: React.ReactNode }) {
  return <><dt className={styles.panelSub}>{k}</dt><dd className={styles.panelFg}>{children}</dd></>;
}
export function Bar({ label, pct, display, wide = false }: { label: string; pct: number; display: string; wide?: boolean }) {
  return (
    <div className={styles.barRow} data-wide={wide ? "true" : undefined}>
      <span className={styles.panelFg}>{label}</span>
      <span className={styles.track}><span className={styles.fill} style={{ width: pct + "%" }} /></span>
      <span className={`${styles.panelFg} ${styles.barVal}`}>{display}</span>
    </div>
  );
}
// The numbered sources. `fold` (phones) tucks them into one row - a peek at the file types and the
// count - that opens into a compact list; a citation link opens it too (the target sits inside).
export function Sources({ id, list, count, fold }: { id: string; list: Numbered[]; count?: boolean; fold?: boolean }) {
  if (fold) return (
    <details className={`${styles.section} ${styles.srcFold}`}>
      <summary className={styles.srcSummary}>
        <span className={styles.label}>Sources</span>
        <span className={styles.srcPeek} aria-hidden="true">{list.slice(0, 5).map((s) => <span key={s.n} className={styles.srcDot} data-tone={tagTone(s.ext)}>{s.ext.slice(0, 1)}</span>)}</span>
        <span className={styles.count}>{list.length}</span>
        <span className={styles.srcChevron}><Chevron /></span>
      </summary>
      <ol className={styles.srcList} id={id}>
        {list.map((s) => (
          <li key={s.n} className={styles.srcRow}>
            <span className={styles.fileN}>{s.n}</span>
            <span className={styles.srcTag} data-tone={tagTone(s.ext)}>{s.ext}</span>
            <span className={styles.fileText}><span className={styles.fileName}>{s.name}</span><span className={styles.fileMeta}>{s.where}</span></span>
          </li>
        ))}
      </ol>
    </details>
  );
  return (
    <div className={styles.section} id={id}>
      <div className={styles.labelRow}><span className={styles.label}>Sources</span>{count && <span className={styles.count}>{list.length} sources</span>}</div>
      <div className={styles.files}>{list.map((s) => <FileChip key={s.n} n={s.n} ext={s.ext} name={s.name} meta={s.where} />)}</div>
    </div>
  );
}

export function AiBrief({ brief, srcId, foldSources }: { brief: IdeaBrief; srcId: string; foldSources?: boolean }) {
  const rec = brief.actions.find((d) => d.key === brief.rec);
  const questions = brief.lead ? brief.questions.slice(0, 2) : brief.questions;
  return (
    <div className={styles.found}>
      <div className={styles.foundHead}><span className={styles.foundIcon}><Sparkle size={16} /></span><span className={styles.foundTitle}>What the AI found</span></div>
      <div className={styles.foundBody}>
        <p className={styles.leadPara}>{brief.summary}<Cites ns={brief.cites.summary} to={srcId} /></p>
        {brief.lead && <p className={styles.para}>{brief.lead}<Cites ns={brief.cites.lead} to={srcId} /></p>}
      </div>
      {brief.bars && (
        <div className={`${styles.panel} ${styles.bars}`}>
          <span className={styles.panelSub}>{brief.bars.title}</span>
          {brief.bars.rows.map((r) => <Bar key={r.label} label={r.label} pct={r.pct} display={r.display} />)}
          <span className={`${styles.panelSub} ${styles.barNote}`}>{brief.bars.note}<Cites ns={brief.cites.bars} to={srcId} /></span>
        </div>
      )}
      {brief.after && <p className={styles.para}>{brief.after}<Cites ns={brief.cites.after} to={srcId} /></p>}
      <dl className={styles.panel}>
        {rec && <PanelRow k="Advice"><span className={styles.strong}>{rec.label}</span></PanelRow>}
        <PanelRow k="Why">{brief.recText}<Cites ns={brief.cites.rec} to={srcId} /></PanelRow>
        {brief.next && <PanelRow k="Next step">{brief.next}</PanelRow>}
        {brief.by && <PanelRow k="Answer by">{brief.by}</PanelRow>}
      </dl>
      {brief.timeline && (
        <div className={styles.section}>
          <span className={styles.label}>{brief.timeline.title}</span>
          <div className={styles.timeline}>
            {brief.timeline.steps.map((t, i) => (
              <div key={i} className={styles.step}><span className={styles.stepBar} data-now={t.now ? "true" : undefined} /><span className={styles.stepWhen}>{t.when}</span><span className={styles.stepWhat}>{t.what}</span></div>
            ))}
          </div>
        </div>
      )}
      {questions.length > 0 && (
        <div className={styles.section}>
          <span className={styles.label}>Worth asking {brief.author.name}</span>
          {questions.map((q, i) => <div key={i} className={styles.question}><span className={styles.qn}>{i + 1}</span><p className={styles.para}>{q}</p></div>)}
        </div>
      )}
      <div className={styles.section}><span className={styles.label}>Pattern</span><p className={styles.para}>{brief.pattern}<Cites ns={brief.cites.pattern} to={srcId} /></p></div>
      <div className={styles.section}>
        <span className={styles.label}>Categorised as</span>
        <div className={styles.chips}>{brief.categories.map((c) => <span key={c} className={styles.tag}>{c}</span>)}</div>
      </div>
      {brief.similar.length > 0 && (
        <div className={styles.section}>
          <span className={styles.label}>Similar ideas</span>
          {brief.similar.map((m) => (
            <div key={m.title} className={styles.similar}>
              <div className={styles.similarHead}><span className={styles.similarTitle}>{m.title}</span><span className={styles.status}>{m.status}</span>{m.match != null && <span className={styles.match}>{m.match}% match</span>}</div>
              <span className={styles.small}>{m.where}</span>
              {m.note && <p className={styles.para}>{m.note}<Cites ns={brief.cites.similar} to={srcId} /></p>}
            </div>
          ))}
        </div>
      )}
      {brief.routing.length > 0 && (
        <div className={styles.section}>
          <span className={styles.label}>Suggested reviewers</span>
          {brief.routing.map((r) => (
            <div key={r.name} className={styles.reviewer}>
              <div className={styles.quoteBy}><span className={styles.chip}><span className={styles.chipAvatar} data-avatar={avatarTone(r.name)}>{initialsOf(r.name)}</span>{r.name}</span><span className={styles.small}>{r.role}</span></div>
              <p className={styles.para}>{r.why}</p>
            </div>
          ))}
        </div>
      )}
      <Sources id={srcId} list={brief.sources} count fold={foldSources} />
      <span className={styles.small}>AI suggestions only. You make the decision.</span>
    </div>
  );
}

// What is already in motion (a question asked, a clock paused), then the decisions - the AI's pick
// on top of its row.
export function StatusBox({ status }: { status: StatusNote | null }) {
  if (!status) return null;
  return (
    <div className={styles.asked}>
      <span className={styles.askedLabel}>{status.label}</span>
      {status.lines.map((t, i) => <span key={i} className={styles.askedText}>{t}</span>)}
      {status.sub && <span className={styles.small}>{status.sub}</span>}
    </div>
  );
}

export function DecisionList({ brief, onDecide }: { brief: IdeaBrief; onDecide: (k: string) => void }) {
  if (!brief.actions.length) return null;
  return (
    <div className={styles.actions}>
      {brief.actions.map((d) => {
        const suggested = d.key === brief.rec;
        return (
          <button key={d.key} type="button" className={styles.action} data-primary={suggested ? "true" : undefined} data-tone={d.danger ? "danger" : undefined}
            disabled={!d.live} onClick={() => onDecide(d.key)} title={d.live ? undefined : "Coming soon: this decision needs a new event type"}>
            <span>{d.label}</span>
            {suggested && <span className={styles.suggest}><Sparkle size={10} />AI suggests</span>}
            {!d.live && !suggested && <span className={styles.soon}>Soon</span>}
          </button>
        );
      })}
    </div>
  );
}

// Supporters, comments, and the comment box (live when `onComment` is given). A commenter on the org
// chart opens their card: as a popover here (`open` = which one), or wherever `onPerson` sends it
// (the phone's sheet).
export function FeedBody({ brief, feed, open = null, onPerson, onComment }: { brief: IdeaBrief; feed: FeedEntry[]; open?: number | null; onPerson?: (i: number) => void; onComment?: (text: string) => void }) {
  const [draft, setDraft] = useState("");
  const post = () => { const t = draft.trim(); if (!t || !onComment) return; onComment(t); setDraft(""); };
  return (
    <>
      <div className={styles.feedStats}>
        <div className={styles.feedStat}><span className={styles.feedNum}>{brief.feed.supporters}</span><span className={styles.panelSub}>supporters</span></div>
        <div className={styles.feedStat}><span className={styles.feedNum}>{feed.length}</span><span className={styles.panelSub}>comments</span></div>
      </div>
      <span className={styles.sentiment}>{brief.feed.sentiment}</span>
      {feed.length === 0 && <span className={styles.small}>No comments yet.</span>}
      {feed.map((c, i) => (
        <div key={i} className={styles.comment}>
          {c.person && onPerson ? (
            <span className={styles.commentWho} data-aff="1">
              <button type="button" className={styles.commentPerson} onClick={() => onPerson(i)} aria-expanded={open === i} title={"View " + c.name}>
                <span className={styles.commentAvatar} data-avatar={avatarTone(c.name)}>{initialsOf(c.name)}</span>
              </button>
              {open === i && <div className={styles.pop}><PersonCard p={c.person} /></div>}
            </span>
          ) : (
            <span className={styles.commentAvatar} data-mine={c.mine ? "true" : undefined} data-avatar={c.mine ? undefined : avatarTone(c.name)}>{c.mine ? "ME" : initialsOf(c.name)}</span>
          )}
          <div className={styles.commentBody}>
            <div className={styles.commentHead}>
              {c.person && onPerson
                ? <button type="button" className={`${styles.commentName} ${styles.nameBtn}`} onClick={() => onPerson(i)} data-aff="1">{c.name}</button>
                : <span className={styles.commentName}>{c.name}</span>}
              <span className={styles.small}>{c.when}</span>
            </div>
            <span className={styles.small}>{c.role}</span>
            <span className={styles.commentText}>{c.text}</span>
          </div>
        </div>
      ))}
      <div className={styles.compose}>
        {onComment ? (
          <>
            <input className={styles.input} placeholder="Add a comment" aria-label="Add a comment" value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); post(); } }} />
            <button type="button" className={styles.post} data-live={draft.trim() ? "true" : undefined} onClick={post} disabled={!draft.trim()}>Post</button>
          </>
        ) : (
          <>
            <input className={styles.input} placeholder="Add a comment" disabled title="Coming soon: comments on ideas need a new event type" aria-label="Add a comment" />
            <button type="button" className={styles.post} disabled>Post</button>
          </>
        )}
      </div>
    </>
  );
}
