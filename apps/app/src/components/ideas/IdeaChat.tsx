"use client";
// The middle of the idea studio: the conversation with the coach and the composer under it. The
// benchmark card follows the coach's latest reply; older replies keep only their score. Props in.
import { useEffect, useRef, useState } from "react";
import { stripTags } from "@/features/assist/check";
import { BENCHMARK_LABEL } from "@/features/ideas/benchmarks";
import type { DraftTurn } from "@/features/ideas/drafts";
import type { Live, Sending } from "@/lib/use-idea-studio";
import { BenchmarkCard } from "./BenchmarkCard";
import styles from "./IdeaStudio.module.css";

const STARTERS = [
  "Reserve the endurance rig one day a week for our own experiments - right now every slot goes to validation and our own tests wait weeks",
  "Let team leads approve spare-part orders up to €500 on night shift, so the line does not stand until the day shift comes in",
  "A shared changeover checklist on the line tablet instead of paper - every shift fills the same steps by hand and the sheet is never where you need it",
];
const LEGEND: { id: keyof typeof BENCHMARK_LABEL; text: string }[] = [
  { id: "fit", text: "Serves a company goal and says which number moves." },
  { id: "impact", text: "A figure on the upside, and who else it helps." },
  { id: "feasibility", text: "Who decides, what it costs, the first small step." },
  { id: "clarity", text: "Not raised before, and clear on what and why." },
];

export function IdeaChat({ who, turns, live, sending, error, locked, threshold, onSend, children }: {
  who: string;
  turns: readonly DraftTurn[];
  live: Live | null;
  sending: Sending;
  error: string;
  locked: boolean; // published: read-only
  threshold: number;
  onSend: (text: string) => void;
  children?: React.ReactNode; // the publish sequence, over the thread
}) {
  const [text, setText] = useState("");
  const [ask, setAsk] = useState(""); // a "to strengthen" chip the author clicked: it becomes the prompt
  const field = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const empty = turns.length === 0 && !sending;
  const lastCoach = [...turns].reverse().find((t) => t.role === "assistant")?.id ?? null;

  // Follow the conversation to its end - but an empty one starts at the top, on the greeting.
  useEffect(() => {
    if (turns.length || sending) end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns.length, sending, sending?.reply, live?.overall]);

  const submit = () => {
    const t = text.trim();
    if (t.length < 3 || sending || locked) return;
    onSend(t);
    setText(""); setAsk("");
  };
  const prompt = (hint: string) => { setAsk(hint); field.current?.focus(); };
  // A suggested answer: into the box after what is already typed, to edit before sending.
  const use = (reply: string) => {
    setText((t) => (t.trim() ? t.trim() + " " + reply : reply));
    setAsk("");
    requestAnimationFrame(() => { const f = field.current; if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } });
  };
  const sendNow = (reply: string) => { if (!sending && !locked) { onSend(reply); setAsk(""); } };

  return (
    <section className={styles.chat} aria-label="Idea chat">
      <div className={styles.thread} aria-live="polite">
        {empty ? (
          <div className={styles.hello}>
            <h1 className={styles.helloTitle}>What’s your idea, {who}?</h1>
            <p className={styles.helloText}>Start with one line. The coach asks what is missing, the score grows as the idea does, and at {threshold} it can be published to the person who decides.</p>
            <ul className={styles.legend}>
              {LEGEND.map((l) => (
                <li key={l.id} className={styles.legendItem} data-bench={l.id}>
                  <span className={styles.legendBar} aria-hidden="true" />
                  <span className={styles.legendName}>{BENCHMARK_LABEL[l.id]}</span>
                  <span className={styles.legendText}>{l.text}</span>
                </li>
              ))}
            </ul>
            {!locked && (
              <div className={styles.starters}>
                {STARTERS.map((s) => <button key={s} type="button" className={styles.starter} onClick={() => { setText(s); field.current?.focus(); }}>{s}</button>)}
              </div>
            )}
          </div>
        ) : (
          <ol className={styles.msgs}>
            {turns.map((t) => (
              <li key={t.id} className={styles.msg} data-role={t.role}>
                {t.role === "assistant" && <span className={styles.coachMark} aria-hidden="true" />}
                <div className={styles.bubbleCol}>
                  <p className={styles.bubble}>{t.role === "assistant" ? stripTags(t.text) : t.text}</p>
                  {t.role === "assistant" && t.overall !== null && t.id !== lastCoach && <span className={styles.msgScore}>Score {t.overall}</span>}
                  {t.id === lastCoach && !sending && live && <BenchmarkCard parts={live.parts} delta={live.delta} replies={locked ? [] : live.replies} onAsk={locked ? undefined : prompt} onUse={locked ? undefined : use} onSendNow={locked ? undefined : sendNow} />}
                </div>
              </li>
            ))}
            {sending && (
              <>
                <li className={styles.msg} data-role="user"><div className={styles.bubbleCol}><p className={styles.bubble}>{sending.text}</p></div></li>
                <li className={styles.msg} data-role="assistant">
                  <span className={styles.coachMark} data-busy="true" aria-hidden="true" />
                  <div className={styles.bubbleCol}>
                    <p className={styles.bubble}>{sending.reply || <span className={styles.typing} aria-label="Scoring"><i /><i /><i /></span>}</p>
                    {live && <BenchmarkCard parts={live.parts} delta={live.delta} />}
                  </div>
                </li>
              </>
            )}
          </ol>
        )}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div ref={end} />
        {children}
      </div>

      {!locked && (
        <div className={styles.composer}>
          {ask && <p className={styles.askLine}><span>Coach asks</span>{ask}</p>}
          <div className={styles.compBox}>
            <textarea ref={field} className={styles.compField} rows={1} value={text} onChange={(e) => setText(e.target.value)} aria-label="Your idea"
              placeholder={empty ? "Describe your idea in one line…" : "Answer the coach, or add what changed…"}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }} />
            <button type="button" className={styles.compSend} onClick={submit} disabled={text.trim().length < 3 || !!sending} aria-label="Send to the coach">↑</button>
          </div>
          <span className={styles.compHint}>Enter to send · Shift + Enter for a new line</span>
        </div>
      )}
    </section>
  );
}
