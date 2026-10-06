"use client";
// One idea, opened from the inbox (Claude Design handoff "Inbox App", detail half): who raised it,
// what it is, who it affects, five scores that each open their reasoning, what the AI found, the
// decision, and the feed. Props in, JSX out - the brief comes from features/ideas/brief.ts and
// every decision goes back up through onDecide, which opens the existing input sheets.
// Local state is view state only: which popover or score is open.
import { useEffect, useId, useState } from "react";
import type { AffectedDept, AffectedPerson, IdeaBrief } from "@/features/ideas/brief";
import { AiBrief, Blocks, Chevron, DecisionList, FeedBody, FileChip, initialsOf, PanelRow, PersonCard, Sources, Sparkle, StatusBox, type FeedEntry, type IdeaProps } from "./IdeaParts";
import styles from "./IdeaDetail.module.css";
import { avatarTone } from "@/lib/avatar";

export type { FeedEntry, IdeaHeader } from "./IdeaParts";

export function IdeaDetail({ idea, brief, status, feed, onDecide, onComment, onClose }: IdeaProps) {
  const uid = useId();
  const aiSrc = uid + "-ai", scoreSrc = uid + "-score";
  const [aff, setAff] = useState<string | null>(null); // "author" | "d:<dept id>" | "p:<name>" | "f:<feed index>"
  const [member, setMember] = useState<string | null>(null);
  const [openScore, setOpenScore] = useState<number | null>(null);

  // A click outside a chip or its popover closes it; Escape closes it before the inbox hears it.
  useEffect(() => {
    if (!aff) return;
    const onDown = (e: MouseEvent) => { if (!(e.target instanceof Element && e.target.closest("[data-aff]"))) { setAff(null); setMember(null); } };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); setAff(null); setMember(null); } };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey, true); };
  }, [aff]);

  const toggle = (key: string) => { setAff((a) => (a === key ? null : key)); setMember(null); };
  const score = openScore == null ? null : brief.scores[openScore];
  const hasAffects = brief.depts.length > 0 || brief.people.length > 0;

  return (
    <div className={styles.detail}>
      <div className={styles.main}>
        {/* ── the idea ── */}
        <article className={styles.card}>
          <div className={styles.head}>
            <div className={styles.authorWrap} data-aff="1">
              <button type="button" className={styles.author} data-on={aff === "author" ? "true" : undefined} onClick={() => toggle("author")} title={"View " + brief.author.name} aria-expanded={aff === "author"}>
                <span className={styles.authorAvatar} data-avatar={avatarTone(brief.author.name)}>{initialsOf(brief.author.name)}</span>
                <span className={styles.authorText}>
                  <span className={styles.authorName}>{brief.author.name}</span>
                  <span className={styles.authorLine}>{brief.author.role} · raised {idea.raised}</span>
                </span>
              </button>
              {aff === "author" && <div className={styles.pop}><PersonCard p={brief.author} /></div>}
            </div>
            <span className={styles.badge} data-tone={idea.tone}>{idea.badge}</span>
            <button type="button" className={styles.close} onClick={onClose} title="Back to inbox" aria-label="Back to inbox">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <h1 className={styles.title}>{idea.title}</h1>
          <p className={styles.lede}>{brief.description}</p>

          {hasAffects && (
            <div className={`${styles.section} ${styles.affects} ${styles.fade}`} data-delay="1">
              <span className={styles.label}>Affects</span>
              <div className={styles.chips}>
                {brief.depts.map((d) => <DeptChip key={d.id} d={d} on={aff === "d:" + d.id} member={aff === "d:" + d.id ? member : null} author={brief.author.name} onToggle={() => toggle("d:" + d.id)} onMember={setMember} />)}
                {brief.people.map((p) => <PersonChip key={p.name} p={p} on={aff === "p:" + p.name} author={brief.author.name} onToggle={() => toggle("p:" + p.name)} />)}
              </div>
            </div>
          )}
          {brief.context && (
            <div className={`${styles.section} ${styles.fade}`} data-delay="2">
              <span className={styles.label}>Context</span>
              <p className={styles.para}>{brief.context}</p>
            </div>
          )}
          {brief.prompts.length > 0 && (
            <dl className={`${styles.panel} ${styles.fade}`} data-delay="3">
              {brief.prompts.map((p) => <PanelRow key={p.label} k={p.label}>{p.text}</PanelRow>)}
            </dl>
          )}
          {brief.files.length > 0 && (
            <div className={`${styles.section} ${styles.fade}`} data-delay="4">
              <span className={styles.label}>Attachments</span>
              <div className={styles.files}>{brief.files.map((f) => <FileChip key={f.name} ext={f.ext} name={f.short} title={f.name} meta={f.size} />)}</div>
            </div>
          )}
        </article>

        {/* ── five scores; an open one becomes a tab joined to the reasoning below ── */}
        <div className={styles.scoreWrap}>
          <div className={styles.scores}>
            {brief.scores.map((s, i) => {
              const on = openScore === i;
              return (
                <div key={s.label} className={styles.score} data-open={on ? "true" : undefined} data-edge={on ? (i === 0 ? "left" : i === 4 ? "right" : "mid") : undefined}>
                  <span className={styles.scoreLabel}>{s.label}</span>
                  <div className={styles.gauge}>
                    <svg viewBox="0 0 72 72" className={styles.arc} aria-hidden="true">
                      <circle cx="36" cy="36" r="30" className={styles.arcTrack} strokeDasharray="141.4 188.5" />
                      <circle cx="36" cy="36" r="30" className={styles.arcFill} strokeDasharray={((s.value / 100) * 141.4).toFixed(1) + " 188.5"} />
                    </svg>
                    <div className={styles.gaugeText}><span className={styles.gaugeNum}>{s.value}</span><span className={styles.gaugeSub}>/ 100</span></div>
                    <button type="button" className={styles.scoreBtn} onClick={() => setOpenScore(on ? null : i)} title={on ? "Hide reasoning" : "Show reasoning"} aria-label={(on ? "Hide" : "Show") + " the reasoning for " + s.label} aria-expanded={on}>
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                  </div>
                  {on && <><span className={styles.tab} />{i > 0 && <span className={styles.filletL} />}{i < 4 && <span className={styles.filletR} />}</>}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── the reasoning of the open score, or what the AI found ── */}
        <section className={styles.card} data-joined={openScore === 0 ? "left" : openScore === 4 ? "right" : openScore != null ? "mid" : undefined} aria-label={score ? score.label + " reasoning" : "What the AI found"}>
          {score ? (
            <div key={openScore} className={styles.reason}>
              <div className={styles.sectionTop}><span className={styles.label}>{score.label}</span><p className={styles.leadPara}>{score.note}</p></div>
              <Blocks blocks={score.blocks} srcId={scoreSrc} />
              <Sources id={scoreSrc} list={score.sources} />
            </div>
          ) : (
            <AiBrief brief={brief} srcId={aiSrc} />
          )}
        </section>
      </div>

      <aside className={styles.side}>
        <DecisionCard brief={brief} status={status} onDecide={onDecide} />
        <Feed brief={brief} feed={feed} open={aff?.startsWith("f:") ? Number(aff.slice(2)) : null} onPerson={(i) => toggle("f:" + i)} onComment={onComment} />
      </aside>
    </div>
  );
}

function DeptChip({ d, on, member, author, onToggle, onMember }: { d: AffectedDept; on: boolean; member: string | null; author: string; onToggle: () => void; onMember: (n: string | null) => void }) {
  const m = member ? d.members.find((x) => x.name === member) ?? null : null;
  return (
    <span className={styles.chipWrap} data-aff="1">
      <button type="button" className={styles.deptChip} data-on={on ? "true" : undefined} onClick={onToggle} title={d.ai ? "Added by AI" : "Added by " + author} aria-expanded={on}>
        {d.name}{d.ai && <Sparkle />}
      </button>
      {on && (
        <div className={`${styles.pop} ${styles.popList}`}>
          {!m ? (
            <>
              <div className={styles.popListHead}><span className={styles.popName}>{d.name}</span><span className={styles.small}>{d.members.length} {d.members.length === 1 ? "person" : "people"}</span></div>
              {d.why && <div className={styles.aiWhy}><Sparkle /><span>{d.why}</span></div>}
              <div className={styles.members}>
                {d.members.map((x) => (
                  <button key={x.name} type="button" className={styles.member} onClick={() => onMember(x.name)}>
                    <span className={styles.memberAvatar} data-avatar={avatarTone(x.name)}>{initialsOf(x.name)}</span>
                    <span className={styles.popWho}><span className={styles.memberName}>{x.name}</span><span className={styles.popRole}>{x.role}</span></span>
                    <span className={styles.memberGo}><Chevron /></span>
                  </button>
                ))}
                {d.members.length === 0 && <span className={styles.small}>Nobody on the org chart yet.</span>}
              </div>
            </>
          ) : (
            <div className={styles.drill}>
              <button type="button" className={styles.back} onClick={() => onMember(null)}><Chevron back />{d.name}</button>
              <PersonCard p={m} />
            </div>
          )}
        </div>
      )}
    </span>
  );
}

function PersonChip({ p, on, author, onToggle }: { p: AffectedPerson; on: boolean; author: string; onToggle: () => void }) {
  return (
    <span className={styles.chipWrap} data-aff="1">
      <button type="button" className={styles.personChip} data-on={on ? "true" : undefined} onClick={onToggle} title={p.ai ? "Added by AI" : "Added by " + author} aria-expanded={on}>
        <span className={styles.chipAvatar} data-avatar={avatarTone(p.name)}>{initialsOf(p.name)}</span>{p.name}{p.ai && <Sparkle />}
      </button>
      {on && <div className={styles.pop}><PersonCard p={p} why={p.why} /></div>}
    </span>
  );
}


function DecisionCard({ brief, status, onDecide }: { brief: IdeaBrief; status: IdeaProps["status"]; onDecide: (k: string) => void }) {
  return (
    <section className={styles.sideCard} aria-label="Your decision">
      <h2 className={styles.sideTitle}>Your decision</h2>
      <StatusBox status={status} />
      <DecisionList brief={brief} onDecide={onDecide} />
    </section>
  );
}

function Feed({ brief, feed, open, onPerson, onComment }: { brief: IdeaBrief; feed: FeedEntry[]; open: number | null; onPerson: (i: number) => void; onComment?: (text: string) => void }) {
  return (
    <section className={styles.sideCard} aria-label="From the feed">
      <h2 className={styles.sideTitle}>From the feed</h2>
      <FeedBody brief={brief} feed={feed} open={open} onPerson={onPerson} onComment={onComment} />
    </section>
  );
}
