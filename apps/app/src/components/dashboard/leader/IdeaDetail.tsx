"use client";
// One item opened from the inbox (DESIGN_RULES §9): who raised it with one due chip, the title, the text (three lines,
// more on demand) and one line of advice. Everything else waits in a fold: Details (who it affects, the context, the
// files), What the AI found (the five scores and their reasoning, reviewers, pattern, sources), Comments and What
// happened. Beside it "Your move". Props in, JSX out - the brief comes from features/ideas/brief.ts and every move goes
// back up through onDecide, which opens the existing input sheets. Local state is view state only: which popover is open.
import { useEffect, useId, useRef, useState } from "react";
import type { AffectedDept, AffectedPerson } from "@/features/ideas/brief";
import { Fold } from "@/components/ui/elements";
import { YourMove } from "@/components/inbox/YourMove";
import { AiBrief, Chevron, deskMoves, FeedBody, FileRows, initialsOf, PanelRow, PersonCard, ScoreRows, Sparkle, type IdeaProps } from "./IdeaParts";
import styles from "./IdeaDetail.module.css";
import { avatarTone } from "@/lib/avatar";
import { deptTone } from "@/lib/dept-tone";
import { useT } from "@/i18n/client";

export type { FeedEntry, IdeaHeader } from "./IdeaParts";

export function IdeaDetail({ idea, brief, status, advice, feed, onDecide, onComment, onClose }: IdeaProps) {
  const t = useT();
  const uid = useId();
  const [aff, setAff] = useState<string | null>(null); // "author" | "d:<dept id>" | "p:<name>" | "f:<feed index>"
  const [member, setMember] = useState<string | null>(null);

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
  const hasAffects = brief.depts.length > 0 || brief.people.length > 0;
  const hasDetails = hasAffects || !!brief.context || brief.prompts.length > 0 || brief.files.length > 0;
  const moves = deskMoves(brief, onDecide);
  // With no move of their own (a view asked of them), commenting is what the viewer has to do now: that fold stands open.
  const commentIsTheMove = !moves.primary && moves.quiet.length === 0 && moves.more.length === 0 && !!onComment;
  const happened = status?.lines ?? [];

  return (
    <div className={styles.detail}>
      <article className={`${styles.card} ${styles.main}`}>
        <div className={styles.head}>
          <div className={styles.authorWrap} data-aff="1">
            <button type="button" className={styles.author} data-on={aff === "author" ? "true" : undefined} onClick={() => toggle("author")} title={t("leader.viewPerson", { name: brief.author.name })} aria-expanded={aff === "author"}>
              <span className={styles.authorAvatar} data-avatar={avatarTone(brief.author.name)}>{initialsOf(brief.author.name)}</span>
              <span className={styles.authorText}>
                <span className={styles.authorName}>{brief.author.name}</span>
                <span className={styles.authorLine}>{t("leader.authorLine", { role: brief.author.role, raised: idea.raised })}</span>
              </span>
            </button>
            {aff === "author" && <div className={styles.pop}><PersonCard p={brief.author} /></div>}
          </div>
          <span className={styles.badge} data-tone={idea.tone}>{idea.badge}</span>
          <button type="button" className={styles.close} onClick={onClose} title={t("leader.backToInbox")} aria-label={t("leader.backToInbox")}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <h1 className={styles.title}>{idea.title}</h1>
        <Clamped text={brief.description} />
        {advice ? <p className={styles.advice} data-testid="idea-advice"><Sparkle size={12} /><span>{advice}</span></p> : null}

        <div className={styles.folds}>
          {hasDetails && (
            <Fold summary={t("leader.details")} name="details">
              {hasAffects && (
                <div className={`${styles.section} ${styles.affects}`}>
                  <span className={styles.label}>{t("leader.affects")}</span>
                  <div className={styles.chips}>
                    {brief.depts.map((d) => <DeptChip key={d.id} d={d} on={aff === "d:" + d.id} member={aff === "d:" + d.id ? member : null} author={brief.author.name} onToggle={() => toggle("d:" + d.id)} onMember={setMember} />)}
                    {brief.people.map((p) => <PersonChip key={p.name} p={p} on={aff === "p:" + p.name} author={brief.author.name} onToggle={() => toggle("p:" + p.name)} />)}
                  </div>
                </div>
              )}
              {(brief.context || brief.prompts.length > 0) && (
                <div className={styles.section}>
                  <span className={styles.label}>{t("leader.context")}</span>
                  {brief.context && <p className={styles.para}>{brief.context}</p>}
                  {brief.prompts.length > 0 && <dl className={styles.panel}>{brief.prompts.map((p) => <PanelRow key={p.label} k={p.label}>{p.text}</PanelRow>)}</dl>}
                </div>
              )}
              {brief.files.length > 0 && (
                <div className={styles.section}>
                  <span className={styles.label}>{t("leader.attachments")}</span>
                  <FileRows files={brief.files} />
                </div>
              )}
            </Fold>
          )}
          <Fold summary={t("leader.whatAiFound")} name="ai">
            <AiBrief brief={brief} srcId={uid + "-ai"}><ScoreRows scores={brief.scores} srcId={uid + "-score"} /></AiBrief>
          </Fold>
          <Fold summary={t("leader.commentsFold")} meta={feed.length > 0 ? feed.length : undefined} name="comments" open={commentIsTheMove}>
            <FeedBody brief={brief} feed={feed} open={aff?.startsWith("f:") ? Number(aff.slice(2)) : null} onPerson={(i) => toggle("f:" + i)} onComment={onComment} />
          </Fold>
          {happened.length > 0 && (
            <Fold summary={t("leader.whatHappened")} name="happened">
              <ul className={styles.happened}>{happened.map((l, i) => <li key={i}>{l}</li>)}</ul>
            </Fold>
          )}
        </div>
      </article>

      <aside className={styles.side}>
        <YourMove status={status?.label} moves={moves} />
      </aside>
    </div>
  );
}

/** The text in three lines, with "Read more" when it runs longer. */
function Clamped({ text }: { text: string }) {
  const t = useT();
  const ref = useRef<HTMLParagraphElement>(null);
  const [long, setLong] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setLong(el.scrollHeight > el.clientHeight + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);
  return (
    <>
      <p ref={ref} className={styles.lede} data-clamped={open ? undefined : "true"}>{text}</p>
      {long || open ? <button type="button" className={styles.readMore} aria-expanded={open} onClick={() => setOpen((v) => !v)}>{t(open ? "leader.showLess" : "leader.readMore")}</button> : null}
    </>
  );
}

function DeptChip({ d, on, member, author, onToggle, onMember }: { d: AffectedDept; on: boolean; member: string | null; author: string; onToggle: () => void; onMember: (n: string | null) => void }) {
  const t = useT();
  const m = member ? d.members.find((x) => x.name === member) ?? null : null;
  return (
    <span className={styles.chipWrap} data-aff="1">
      <button type="button" className={styles.deptChip} data-dept-tone={deptTone(d.name)} data-on={on ? "true" : undefined} onClick={onToggle} title={d.ai ? t("leader.addedByAi") : t("leader.addedBy", { name: author })} aria-expanded={on}>
        {d.name}{d.ai && <Sparkle />}
      </button>
      {on && (
        <div className={`${styles.pop} ${styles.popList}`}>
          {!m ? (
            <>
              <div className={styles.popListHead}><span className={styles.popName}>{d.name}</span><span className={styles.small}>{t("leader.persons", { count: d.members.length })}</span></div>
              {d.why && <div className={styles.aiWhy}><Sparkle /><span>{d.why}</span></div>}
              <div className={styles.members}>
                {d.members.map((x) => (
                  <button key={x.name} type="button" className={styles.member} onClick={() => onMember(x.name)}>
                    <span className={styles.memberAvatar} data-avatar={avatarTone(x.name)}>{initialsOf(x.name)}</span>
                    <span className={styles.popWho}><span className={styles.memberName}>{x.name}</span><span className={styles.popRole}>{x.role}</span></span>
                    <span className={styles.memberGo}><Chevron /></span>
                  </button>
                ))}
                {d.members.length === 0 && <span className={styles.small}>{t("leader.nobodyOnChart")}</span>}
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
  const t = useT();
  return (
    <span className={styles.chipWrap} data-aff="1">
      <button type="button" className={styles.personChip} data-on={on ? "true" : undefined} onClick={onToggle} title={p.ai ? t("leader.addedByAi") : t("leader.addedBy", { name: author })} aria-expanded={on}>
        <span className={styles.chipAvatar} data-avatar={avatarTone(p.name)}>{initialsOf(p.name)}</span>{p.name}{p.ai && <Sparkle />}
      </button>
      {on && <div className={styles.pop}><PersonCard p={p} why={p.why} /></div>}
    </span>
  );
}
