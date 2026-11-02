"use client";
// The chats about one opened case: the right half of the Claude Design handoff "Overview", its
// markup and classes 1:1 (Overview.module.css). The threads behind a switcher: whoever holds the
// case (their question, the decision, what the two sides wrote), the Nextup AI (coming soon), the
// feed, and anyone the viewer starts a chat with. Props in, JSX out. Messages to the desk and feed
// comments are real (onSend, onComment); answering a decision, colleague chats, attachments and
// replies are stand-ins (overviewPreview) until their events exist.
import { useEffect, useRef, useState } from "react";
import { initialsOf } from "@/components/dashboard/leader/IdeaParts";
import { useT } from "@/i18n/client";
import type { MessageKey, T } from "@/i18n";
import type { DayFmt, OverviewStatus } from "@/features/cases/rows";
import type { ThreadEntry } from "@/features/cases/thread";
import type { LocalMsg, RespondKey, Response } from "./overviewPreview";
import s from "./Overview.module.css";
import { avatarTone } from "@/lib/avatar";

type Opener = ((e: React.MouseEvent<HTMLElement>) => void) | null;
type Action = { label: string; hint?: string; done?: RespondKey; compose?: RespondKey; go?: "details" | "ai"; draft?: string; divider?: boolean };
export type FeedComment = { name: string; role: string; text: string; when: string; mine: boolean };

export type OverviewChatsProps = {
  mine: boolean; // the viewer raised it: the move and the actions are theirs
  me: string; // the viewer's own messages sit on the right
  day: number; // today, for what is sent now
  desk: { name: string; role: string }; // who the first thread is with
  status: OverviewStatus;
  yourMove: boolean; // the desk thread is waiting on the viewer
  open: boolean;
  entries: ThreadEntry[];
  f: DayFmt;
  canAnswer: boolean; // a question is out and it is the viewer's to answer: sending answers it
  onSend: (text: string) => void;
  deputy: string | null; // who a second opinion would come from
  supporters: number;
  sentiment: string;
  feed: FeedComment[];
  onComment: (text: string) => void;
  directory: { name: string; role: string }[]; // everyone, for the search
  onDetails: () => void; // "Add details": back to the idea, in edit mode
  profileOf: (name: string) => Opener;
  // stand-ins (overviewPreview)
  response: Response | null;
  onRespond: (r: Response | null) => void;
  chats: string[];
  onStartChat: (name: string) => void;
  msgs: (thread: string) => LocalMsg[];
  onLocal: (thread: string, m: LocalMsg) => void;
  replies: Record<number, { text: string; when: string }[]>;
  onReply: (i: number, text: string) => void;
};

const PILL: Partial<Record<OverviewStatus, { pill: MessageKey; tone?: "amber" | "green" }>> = {
  move: { pill: "team.chatsNeedsInfo", tone: "amber" }, asked: { pill: "team.chatsNeedsInfo", tone: "amber" }, replied: { pill: "team.chatsReplied", tone: "green" },
  approved: { pill: "team.chatsApproved", tone: "green" }, declined: { pill: "team.chatsNotNow" }, building: { pill: "team.chatsBuilding" }, shipped: { pill: "team.chatsShipped" },
};
const DONE: Record<RespondKey, MessageKey> = { accept: "team.chatsDoneAccept", "accept-start": "team.chatsDoneStart", owner: "team.chatsDoneOwner", second: "team.chatsDoneSecond" };

// The design's respOptions for the lead's answer (answering and asking are just typing), then the
// drafts that fill the composer.
function actionsFor(t: T, status: OverviewStatus, open: boolean, deputy: string | null): Action[] {
  const own: Action[] = status === "move" ? [{ label: t("team.chatsAddDetails"), hint: t("team.chatsToTheIdea"), go: "details" }, { label: t("team.chatsWorkAi"), hint: t("team.chatsThenAnswer"), go: "ai" }]
    : status === "approved" ? [{ label: t("team.chatsAcceptStart"), done: "accept-start" }, { label: t("team.chatsSuggestOwner"), hint: t("team.chatsNameSomeone"), compose: "owner" }]
    : status === "declined" ? [{ label: t("team.chatsAccept"), done: "accept" }, { label: t("team.chatsImprove"), hint: t("team.chatsWithAi"), go: "ai" }, ...(deputy ? [{ label: t("team.chatsSecondOpinion"), hint: t("team.chatsFromDeputy", { name: deputy }), done: "second" as const }] : [])]
    : [];
  const drafts: Action[] = [
    { label: t("team.chatsRequestMeeting"), hint: t("team.chatsMin15"), draft: t("team.chatsMeetingDraft") },
    ...(open ? [{ label: t("team.chatsAskDate"), draft: t("team.chatsDateDraft") }] : []),
    { label: t("team.chatsAddColleague"), draft: t("team.chatsColleagueDraft") },
    ...(open ? [{ label: t("team.chatsWithdraw"), draft: t("team.chatsWithdrawDraft") }] : []),
  ];
  return [...own, ...drafts.map((d, i) => ({ ...d, divider: i === 0 && own.length > 0 }))];
}

const Doc = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3a3a3c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>
);
const Send = () => (
  <svg className={s.svg} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
);
const FeedIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1c1c1e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2" /><path d="M3 19c.6-3 3-4.8 6-4.8s5.4 1.8 6 4.8" /><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.4c1.7.6 2.8 2.2 3 4.6" /></svg>
);
// Nextup AI wears the NextUp mark (public/brand/nextup-mark-black.png), as a mask.
const AiMark = () => <span className={s.aiLogo} aria-hidden="true" />;

export function OverviewChats(p: OverviewChatsProps) {
  const t = useT();
  const [thread, setThread] = useState("desk"); // "desk" | "ai" | "feed" | "p:<name>"
  const [list, setList] = useState(false);
  const [query, setQuery] = useState("");
  const [moreOpts, setMoreOpts] = useState(false);
  const [draft, setDraft] = useState("");
  const [composing, setComposing] = useState<RespondKey | null>(null);
  const [composeDraft, setComposeDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeList = () => { setList(false); setQuery(""); }; // closing the switcher forgets the search

  // Escape closes the switcher, the menu or a reply box before the page hears it (which would close the case).
  useEffect(() => {
    if (!list && !moreOpts && !composing && replyTo === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); setList(false); setQuery(""); setMoreOpts(false); setComposing(null); setReplyTo(null); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [list, moreOpts, composing, replyTo]);

  const local = p.msgs(thread);
  useEffect(() => { const b = bodyRef.current; if (b) b.scrollTop = b.scrollHeight; }, [p.entries.length, local.length, thread, p.response]);

  const pick = (t: string) => { setThread(t); closeList(); setDraft(""); setMoreOpts(false); };
  const send = () => {
    const t = draft.trim(); if (!t) return;
    if (thread === "desk") p.onSend(t); else p.onLocal(thread, { text: t, file: null, day: p.day });
    setDraft("");
  };
  const attach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (file) p.onLocal(thread, { text: "", file: file.name, day: p.day });
  };
  const run = (a: Action) => {
    setMoreOpts(false);
    if (a.go === "details") return p.onDetails();
    if (a.go === "ai") return pick("ai");
    if (a.done) return p.onRespond({ key: a.done, text: "" });
    if (a.compose) { setComposing(a.compose); setComposeDraft(""); return; }
    if (a.draft) { setDraft(a.draft); setTimeout(() => { const el = draftRef.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 30); }
  };
  const sendCompose = () => { const t = composeDraft.trim(); if (!t || !composing) return; p.onRespond({ key: composing, text: t }); setComposing(null); setComposeDraft(""); };
  const postComment = () => { const t = commentDraft.trim(); if (!t) return; p.onComment(t); setCommentDraft(""); };
  const sendReply = () => { const t = replyDraft.trim(); if (!t || replyTo === null) return; p.onReply(replyTo, t); setReplyDraft(""); setReplyTo(null); };

  const last = p.entries[p.entries.length - 1];
  const lastOf = (t: string) => p.msgs(t).slice(-1)[0];
  const pill = PILL[p.status];
  const canRespond = p.mine && !p.response && (p.status === "move" || p.status === "approved" || p.status === "declined");
  const counts = t("team.chatsSupporters", { count: p.supporters }) + " · " + t("team.chatsComments", { count: p.feed.length });
  const threads = [
    { id: "desk", kind: "person", name: p.desk.name, sub: p.desk.role, preview: lastOf("desk") ? msgLine(t, lastOf("desk")) : last ? lineOf(t, last) : t("team.chatsNoResponse"), when: last ? p.f(last.day) : "", unread: p.yourMove },
    { id: "ai", kind: "ai", name: t("team.chatsAiName"), sub: t("team.chatsAiSub"), preview: t("team.chatsAiSub"), when: "", unread: false },
    { id: "feed", kind: "feed", name: t("team.chatsFromFeed"), sub: counts, preview: counts, when: "", unread: false },
    ...p.chats.map((name) => {
      const m = lastOf("p:" + name), role = p.directory.find((x) => x.name === name)?.role ?? "";
      return { id: "p:" + name, kind: "person", name, sub: role, preview: m ? msgLine(t, m) : role, when: m ? p.f(m.day) : "", unread: false };
    }),
  ];
  const q = query.trim().toLowerCase();
  const shownThreads = threads.filter((t) => !q || (t.name + " " + t.preview).toLowerCase().includes(q));
  const peopleHits = q ? p.directory.filter((x) => x.name !== p.desk.name && !p.chats.includes(x.name) && (x.name + " " + x.role).toLowerCase().includes(q)).slice(0, 6) : [];
  const cur = threads.find((t) => t.id === thread) ?? threads[0];
  const person = thread === "desk" ? p.desk.name : thread.startsWith("p:") ? thread.slice(2) : null;
  const headOpen = person ? p.profileOf(person) : null;
  const mineBubble = (key: string, text: React.ReactNode, when: string) => (
    <div key={key} className={s.div83}><div className={s.text4}>{text}</div><span className={s.when3}>{when}</span></div>
  );
  const localBubbles = local.map((m, i) => mineBubble("l" + i, msgLine(t, m), p.f(m.day)));
  const composer = (name: string, withActions: boolean) => (
    <div className={s.div88}>
      {withActions && moreOpts && (
        <div className={s.div89} role="menu">
          {actionsFor(t, p.status, p.open, p.deputy).map((mo) => (
            <div key={mo.label} className={s.div62}>
              {mo.divider && <div className={s.div90} />}
              <button type="button" role="menuitem" className={s.onClick3} onClick={() => run(mo)}>
                <span className={s.label10}>{mo.label}</span><span className={s.hint}>{mo.hint}</span>
              </button>
            </div>
          ))}
        </div>
      )}
      <div className={s.div91}>
        <div className={s.div92}>
          {withActions && (
            <button type="button" className={s.toggleMoreOpts} data-on={moreOpts ? "true" : undefined} onClick={() => setMoreOpts((v) => !v)} title={t("team.chatsActions")} aria-label={t("team.chatsActions")} aria-expanded={moreOpts}>
              <svg className={s.svg} width="14" height="14" viewBox="0 0 24 24" fill="#1c1c1e" stroke="none"><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>
            </button>
          )}
          <textarea ref={draftRef} className={s.textarea4} value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
            placeholder={t(p.canAnswer && thread === "desk" ? "team.chatsAnswerPh" : "team.chatsMessagePh", { name })} aria-label={t("team.chatsMessage", { name })}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        </div>
        <div className={s.div2}>
          <label className={s.attach}><Doc />{t("team.chatsAttach")}<input className={s.input} type="file" onChange={attach} /></label>
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
          <svg className={s.svg5} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1c1c1e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          {p.yourMove && thread !== "desk" && <span className={s.backCount}>1</span>}
        </button>
        {headOpen ? (
          <button type="button" className={s.threadProfile} data-kind={cur.kind} data-avatar={cur.kind === "person" ? avatarTone(cur.name) : undefined} onClick={headOpen} title={t("team.chatsView", { name: cur.name })} aria-label={t("team.chatsView", { name: cur.name })}>{initialsOf(cur.name)}</button>
        ) : (
          <span className={s.threadProfile} data-kind={cur.kind} data-avatar={cur.kind === "person" ? avatarTone(cur.name) : undefined}>{cur.kind === "feed" ? <FeedIcon /> : cur.kind === "ai" ? <AiMark /> : initialsOf(cur.name)}</span>
        )}
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
                  <svg className={s.svg} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1c1c1e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 15l6-6 6 6" /></svg>
                </button>
                <span className={s.chats}>{t("team.chatsTitle")}</span>
              </div>
              <label className={s.label8}>
                <svg className={s.svg2} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8e8e93" strokeWidth="2.4" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                <input className={s.searchChatsOrPeople} autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("team.chatsSearch")} aria-label={t("team.chatsSearch")} />
              </label>
            </div>
            {shownThreads.map((t) => (
              <button key={t.id} type="button" className={s.onClick} data-on={t.id === thread ? "true" : undefined} onClick={() => pick(t.id)}>
                <span className={s.initials3} data-kind={t.kind} data-avatar={t.kind === "person" ? avatarTone(t.name) : undefined}>{t.kind === "feed" ? <FeedIcon /> : t.kind === "ai" ? <AiMark /> : initialsOf(t.name)}</span>
                <span className={s.span8}>
                  <span className={s.span9}><span className={s.name4}>{t.name}</span><span className={s.when2}>{t.when}</span></span>
                  <span className={s.div10}><span className={s.preview}>{t.preview}</span>{t.unread && <span className={s.span10} />}</span>
                </span>
              </button>
            ))}
            {peopleHits.length > 0 && (
              <>
                <span className={s.people}>{t("team.chatsPeople")}</span>
                {peopleHits.map((x) => (
                  <button key={x.name} type="button" className={s.onClick2} onClick={() => { p.onStartChat(x.name); pick("p:" + x.name); }}>
                    <span className={s.initials4} data-avatar={avatarTone(x.name)}>{initialsOf(x.name)}</span>
                    <span className={s.span8}><span className={s.name5}>{x.name}</span><span className={s.dept}>{x.role}</span></span>
                    <span className={s.message}>{t("team.chatsMessageBtn")}</span>
                  </button>
                ))}
              </>
            )}
            {q && shownThreads.length === 0 && peopleHits.length === 0 && <span className={s.span11}>{t("team.chatsNoMatch", { query: query.trim() })}</span>}
          </div>
        </>
      )}

      {thread === "desk" && (
        <div key="desk" className={s.div78}>
          <div className={s.div79} ref={bodyRef}>
            {pill && p.entries.length > 0 && (
              <div className={s.div10}><span className={s.label} /><span className={s.label9} data-tone={pill.tone}>{t(pill.pill)}</span></div>
            )}
            {p.entries.map((e) => e.t === "handed" ? (
              <span key={e.id} className={s.system}>{lineOf(t, e)} · {p.f(e.day)}</span>
            ) : e.by === p.me ? (
              mineBubble(e.id, lineOf(t, e), p.f(e.day))
            ) : (
              <div key={e.id} className={s.div80}>
                {p.profileOf(e.by)
                  ? <button type="button" className={s.deskProfile2} data-avatar={avatarTone(e.by)} onClick={p.profileOf(e.by) ?? undefined} title={t("team.chatsView", { name: e.by })}>{initialsOf(e.by)}</button>
                  : <div className={s.deskProfile2} data-avatar={avatarTone(e.by)}>{initialsOf(e.by)}</div>}
                <div className={s.div81}>
                  <div className={s.text3}>{lineOf(t, e)}</div>
                  <span className={s.dept}>{p.f(e.day)}</span>
                </div>
              </div>
            ))}
            {p.response && (
              <div className={s.div82}>
                <span className={s.respondedLabel}>{t(DONE[p.response.key])}</span>
                {p.response.text && <span className={s.respondedText}>“{p.response.text}”</span>}
                <div className={s.div77}>
                  <span className={s.span12}>{t("team.chatsNotified", { name: p.desk.name })}</span>
                  <button type="button" className={`${s.undoResponse} ${s.onProfile3}`} onClick={() => p.onRespond(null)}>{t("team.chatsUndo")}</button>
                </div>
              </div>
            )}
            {localBubbles}
            {p.entries.length === 0 && local.length === 0 && (
              <div className={s.div84}>
                <span className={s.span13} />
                <span className={s.span14}>{p.mine ? t("team.chatsNoReplyYet", { name: p.desk.name }) : t("team.chatsNothingSaid", { name: p.desk.name })}</span>
              </div>
            )}
          </div>
          {canRespond && composing && (
            <div className={s.div85}>
              <div className={s.div86}>
                <textarea className={s.textarea3} autoFocus value={composeDraft} onChange={(e) => setComposeDraft(e.target.value)} placeholder={t("team.chatsSuggestOwnerPh")} rows={3} aria-label={t("team.chatsSuggestOwner")}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendCompose(); }} />
                <div className={s.div87}>
                  <button type="button" className={s.cancelCompose} onClick={() => setComposing(null)}>{t("common.cancel")}</button>
                  <button type="button" className={s.sendCompose} onClick={sendCompose} disabled={!composeDraft.trim()}>{t("team.chatsSendTo", { name: p.desk.name })}</button>
                </div>
              </div>
            </div>
          )}
          {composer(p.desk.name, canRespond)}
        </div>
      )}

      {thread.startsWith("p:") && (
        <div key={thread} className={s.div78}>
          <div className={s.div79} ref={bodyRef}>
            {local.map((m, i) => (
              <div key={i} className={s.div93}><div className={s.text5}>{msgLine(t, m)}</div><span className={s.when3}>{p.f(m.day)}</span></div>
            ))}
            {local.length === 0 && <span className={s.name6}>{t("team.chatsStartConv", { name: cur.name })}</span>}
          </div>
          {composer(cur.name, false)}
        </div>
      )}

      {thread === "feed" && (
        <div key="feed" className={s.div78}>
          <div className={s.div79}>
            <div className={s.div94}>
              <div className={s.div95}><span className={s.supporters}>{p.supporters}</span><span className={s.dept}>{t("team.chatsSupporterWord")}</span></div>
              <div className={s.div95}><span className={s.supporters}>{p.feed.length}</span><span className={s.dept}>{t("team.chatsCommentWord", { count: p.feed.length })}</span></div>
            </div>
            <span className={s.sentiment}>{p.sentiment}</span>
            {p.feed.length === 0 && <span className={s.dept}>{t("team.chatsNoComments")}</span>}
            {p.feed.map((c, k) => {
              const open = c.mine ? null : p.profileOf(c.name);
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
                    <button type="button" className={s.reply} onClick={() => { setReplyTo(replyTo === k ? null : k); setReplyDraft(""); }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 6 6v4" /></svg>
                      {t("team.chatsReply")}
                    </button>
                    {(p.replies[k] ?? []).map((r, j) => (
                      <div key={j} className={s.div99}>
                        <div className={s.onProfile4}>{t("team.chatsMe")}</div>
                        <div className={s.span8}>
                          <div className={s.div98}><span className={s.onProfile5}>{t("team.chatsYou")}</span><span className={s.dept}>{r.when}</span></div>
                          <span className={s.text2}>{r.text}</span>
                        </div>
                      </div>
                    ))}
                    {replyTo === k && (
                      <div className={s.div100}>
                        <input className={s.input2} autoFocus value={replyDraft} onChange={(e) => setReplyDraft(e.target.value)} placeholder={t("team.chatsReplyTo", { name: c.name.split(" ")[0] })} aria-label={t("team.chatsReplyTo", { name: c.name })}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendReply(); } }} />
                        <button type="button" className={s.sendReply} onClick={sendReply} disabled={!replyDraft.trim()}>{t("team.chatsReply")}</button>
                      </div>
                    )}
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
const msgLine = (t: T, m: LocalMsg) => (m.file ? t("team.chatsAttached", { file: m.file }) : m.text);
