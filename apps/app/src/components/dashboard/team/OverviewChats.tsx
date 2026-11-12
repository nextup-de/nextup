"use client";
// The chats about one opened case: the right half of the Claude Design handoff "Overview", its
// markup and classes 1:1 (Overview.module.css). The threads behind a switcher: whoever holds the
// case (their question, the decision, what the two sides wrote), the Nextup AI (coming soon) and the
// feed with the case's real comments. Props in, JSX out. A message to the desk answers the open
// question when it is the viewer's to answer (onSend), and a feed comment is a comment (onComment).
import { useEffect, useRef, useState } from "react";
import { initialsOf } from "@/components/dashboard/leader/IdeaParts";
import { useT } from "@/i18n/client";
import type { MessageKey, T } from "@/i18n";
import type { Me } from "@/features/auth/identity";
import type { DayFmt, OverviewStatus } from "@/features/cases/rows";
import type { ThreadEntry } from "@/features/cases/thread";
import s from "./Overview.module.css";
import { avatarTone } from "@/lib/avatar";

type Opener = ((e: React.MouseEvent<HTMLElement>) => void) | null;
export type FeedComment = { name: string; userId: string | null; role: string; text: string; when: string; mine: boolean };

export type OverviewChatsProps = {
  me: Me; // the viewer's own messages sit on the right (by user id)
  talk: { name: string; sub: string }; // who the first thread is with: the desk's role and holders, or the raiser
  status: OverviewStatus;
  yourMove: boolean; // the desk thread is waiting on the viewer
  entries: ThreadEntry[];
  f: DayFmt;
  canAnswer: boolean; // a question is out and it is the viewer's to answer: sending answers it
  onSend: (text: string) => void;
  supporters: number;
  sentiment: string;
  feed: FeedComment[];
  onComment: (text: string) => void;
  profileOf: (userId: string | null, name: string) => Opener; // null: no card for this one (no user id)
};

const PILL: Partial<Record<OverviewStatus, { pill: MessageKey; tone?: "amber" | "green" }>> = {
  move: { pill: "team.chatsNeedsInfo", tone: "amber" }, asked: { pill: "team.chatsNeedsInfo", tone: "amber" }, replied: { pill: "team.chatsReplied", tone: "green" },
  approved: { pill: "team.chatsApproved", tone: "green" }, declined: { pill: "team.chatsNotNow" }, building: { pill: "team.chatsBuilding" }, shipped: { pill: "team.chatsShipped" },
};

const Doc = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--nh-ink-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>
);
const Send = () => (
  <svg className={s.svg} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
);
const FeedIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2" /><path d="M3 19c.6-3 3-4.8 6-4.8s5.4 1.8 6 4.8" /><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.4c1.7.6 2.8 2.2 3 4.6" /></svg>
);
// Nextup AI wears the NextUp mark (public/brand/nextup-mark-black.png), as a mask.
const AiMark = () => <span className={s.aiLogo} aria-hidden="true" />;

export function OverviewChats(p: OverviewChatsProps) {
  const t = useT();
  const [thread, setThread] = useState("desk"); // "desk" | "ai" | "feed"
  const [list, setList] = useState(false);
  const [draft, setDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeList = () => setList(false);

  // Escape closes the switcher before the page hears it (which would close the case).
  useEffect(() => {
    if (!list) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); setList(false); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [list]);

  useEffect(() => { const b = bodyRef.current; if (b) b.scrollTop = b.scrollHeight; }, [p.entries.length, thread]);

  const pick = (id: string) => { setThread(id); closeList(); setDraft(""); };
  const send = () => {
    const text = draft.trim(); if (!text) return;
    p.onSend(text);
    setDraft("");
  };
  const postComment = () => { const text = commentDraft.trim(); if (!text) return; p.onComment(text); setCommentDraft(""); };

  const last = p.entries[p.entries.length - 1];
  const pill = PILL[p.status];
  const counts = t("team.chatsSupporters", { count: p.supporters }) + " · " + t("team.chatsComments", { count: p.feed.length });
  const threads = [
    { id: "desk", kind: "person", name: p.talk.name, sub: p.talk.sub, preview: last ? lineOf(t, last) : t("team.chatsNoResponse"), when: last ? p.f(last.day) : "", unread: p.yourMove },
    { id: "ai", kind: "ai", name: t("team.chatsAiName"), sub: t("team.chatsAiSub"), preview: t("team.chatsAiSub"), when: "", unread: false },
    { id: "feed", kind: "feed", name: t("team.chatsFromFeed"), sub: counts, preview: counts, when: "", unread: false },
  ];
  const cur = threads.find((x) => x.id === thread) ?? threads[0];
  const mineBubble = (key: string, text: React.ReactNode, when: string) => (
    <div key={key} className={s.div83}><div className={s.text4}>{text}</div><span className={s.when3}>{when}</span></div>
  );
  const composer = (
    <div className={s.div88}>
      <div className={s.div91}>
        <div className={s.div92}>
          <textarea className={s.textarea4} value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
            placeholder={t(p.canAnswer ? "team.chatsAnswerPh" : "team.chatsMessagePh", { name: p.talk.name })} aria-label={t("team.chatsMessage", { name: p.talk.name })}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        </div>
        <div className={s.div2}>
          <span className={s.label} />
          <button type="button" className={s.sendDesk} data-live={draft.trim() ? "true" : undefined} onClick={send} title={t("team.chatsSend")} aria-label={t("team.chatsSend")}><Send /></button>
        </div>
      </div>
    </div>
  );

  return (
    <div className={s.div72}>
      <div className={s.div73}>
        <button type="button" className={s.toggleThreadList} onClick={() => setList(true)} title={t("team.chatsSwitch")} aria-label={t("team.chatsSwitch")} aria-expanded={list}>
          <svg className={s.svg5} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          {p.yourMove && thread !== "desk" && <span className={s.backCount}>1</span>}
        </button>
        <span className={s.threadProfile} data-kind={cur.kind} data-avatar={cur.kind === "person" ? avatarTone(cur.name) : undefined}>{cur.kind === "feed" ? <FeedIcon /> : cur.kind === "ai" ? <AiMark /> : initialsOf(cur.name)}</span>
        <div className={s.div74}>
          <span className={s.name3}>{cur.name}</span>
          <span className={s.role}>{cur.sub}</span>
        </div>
      </div>

      {list && (
        <>
          <div className={s.toggleThreadList2} onClick={closeList} aria-hidden="true" />
          <div className={s.div75} role="dialog" aria-label={t("team.chatsTitle")}>
            <div className={s.div76}>
              <div className={s.div77}>
                <button type="button" className={s.toggleThreadList3} onClick={closeList} title={t("common.close")} aria-label={t("team.chatsClose")}>
                  <svg className={s.svg} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 15l6-6 6 6" /></svg>
                </button>
                <span className={s.chats}>{t("team.chatsTitle")}</span>
              </div>
            </div>
            {threads.map((x) => (
              <button key={x.id} type="button" className={s.onClick} data-on={x.id === thread ? "true" : undefined} onClick={() => pick(x.id)}>
                <span className={s.initials3} data-kind={x.kind} data-avatar={x.kind === "person" ? avatarTone(x.name) : undefined}>{x.kind === "feed" ? <FeedIcon /> : x.kind === "ai" ? <AiMark /> : initialsOf(x.name)}</span>
                <span className={s.span8}>
                  <span className={s.span9}><span className={s.name4}>{x.name}</span><span className={s.when2}>{x.when}</span></span>
                  <span className={s.div10}><span className={s.preview}>{x.preview}</span>{x.unread && <span className={s.span10} />}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {thread === "desk" && (
        <div key="desk" className={s.div78}>
          <div className={s.div79} ref={bodyRef}>
            {pill && p.entries.length > 0 && (
              <div className={s.div10}><span className={s.label} /><span className={s.label9} data-tone={pill.tone}>{t(pill.pill)}</span></div>
            )}
            {p.entries.map((e) => {
              if (e.t === "handed") return <span key={e.id} className={s.system}>{lineOf(t, e)} · {p.f(e.day)}</span>;
              if (p.me.userId !== null && e.byUserId === p.me.userId) return mineBubble(e.id, lineOf(t, e), p.f(e.day));
              const open = p.profileOf(e.byUserId, e.by);
              return (
                <div key={e.id} className={s.div80}>
                  {open
                    ? <button type="button" className={s.deskProfile2} data-avatar={avatarTone(e.by)} onClick={open} title={t("team.chatsView", { name: e.by })}>{initialsOf(e.by)}</button>
                    : <div className={s.deskProfile2} data-avatar={avatarTone(e.by)}>{initialsOf(e.by)}</div>}
                  <div className={s.div81}>
                    <div className={s.text3}>{lineOf(t, e)}</div>
                    <span className={s.dept}>{p.f(e.day)}</span>
                  </div>
                </div>
              );
            })}
            {p.entries.length === 0 && (
              <div className={s.div84}>
                <span className={s.span13} />
                <span className={s.span14}>{p.canAnswer ? t("team.chatsNoReplyYet", { name: p.talk.name }) : t("team.chatsNothingSaid", { name: p.talk.name })}</span>
              </div>
            )}
          </div>
          {composer}
        </div>
      )}

      {thread === "feed" && (
        <div key="feed" className={s.div78}>
          <div className={s.div79}>
            <div className={s.div94}>
              {p.supporters > 0 && <div className={s.div95}><span className={s.supporters}>{p.supporters}</span><span className={s.dept}>{t("team.chatsSupporterWord")}</span></div>}
              {p.feed.length > 0 && <div className={s.div95}><span className={s.supporters}>{p.feed.length}</span><span className={s.dept}>{t("team.chatsCommentWord", { count: p.feed.length })}</span></div>}
            </div>
            <span className={s.sentiment}>{p.sentiment}</span>
            {p.feed.length === 0 && <span className={s.dept}>{t("team.chatsNoComments")}</span>}
            {p.feed.map((c, k) => {
              const open = c.mine ? null : p.profileOf(c.userId, c.name);
              return (
                <div key={k} className={s.div96}>
                  {open
                    ? <button type="button" className={s.onProfile2} data-feed="true" data-avatar={avatarTone(c.name)} onClick={open} title={t("team.chatsView", { name: c.name })}>{initialsOf(c.name)}</button>
                    : <div className={s.onProfile2} data-feed={c.mine ? undefined : "true"} data-avatar={c.mine ? undefined : avatarTone(c.name)}>{c.mine ? "ME" : initialsOf(c.name)}</div>}
                  <div className={s.div97}>
                    <div className={s.div98}>
                      {open ? <button type="button" className={s.onProfile3} onClick={open}>{c.name}</button> : <span className={s.onProfile3}>{c.name}</span>}
                      <span className={s.when}>{c.when}</span>
                    </div>
                    <span className={s.dept}>{c.role}</span>
                    <span className={s.text2}>{c.text}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className={s.div101}>
            <div className={s.div102}>
              <input className={s.input2} value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)} placeholder={t("team.chatsAddComment")} aria-label={t("team.chatsAddComment")}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); postComment(); } }} />
              <button type="button" className={s.sendReply} onClick={postComment} disabled={!commentDraft.trim()}>{t("team.chatsPost")}</button>
            </div>
          </div>
        </div>
      )}

      {thread === "ai" && (
        <div key="ai" className={s.div103}>
          <div className={s.div79} />
          <div className={s.div106}>
            <div className={s.div91} data-ai="true">
              <textarea className={s.textarea5} disabled tabIndex={-1} placeholder={t("team.chatsAiPh")} rows={2} aria-hidden="true" />
              <div className={s.div2}>
                <span className={s.attach}><Doc />{t("team.chatsAttach")}</span>
                <span className={s.label} />
                <span className={s.sendDesk}><Send /></span>
              </div>
            </div>
          </div>
          <div className={s.div107}>
            <span className={s.comingSoon}>{t("team.chatsComingSoon")}</span>
            <span className={s.span15}>{t("team.chatsAiSoon")}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// One line for a thread entry - also the switcher's preview.
function lineOf(t: T, e: ThreadEntry): string {
  if (e.t === "decided") return e.note || (e.answer === "yes" ? t("team.chatsYes") : t("team.chatsNo") + (e.reason ? " " + t("team.chatsReason", { reason: e.reason }) : ""));
  if (e.t === "handed") return e.auto ? t("team.chatsMissed", { by: e.by, to: e.to }) : e.why ? t("team.chatsHandedWhy", { by: e.by, to: e.to, why: e.why }) : t("team.chatsHanded", { by: e.by, to: e.to });
  return e.text;
}
