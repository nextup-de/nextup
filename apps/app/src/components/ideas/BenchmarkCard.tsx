// The four benchmark bars under the coach's latest reply: each in its own colour, the change since
// the last message next to it, suggested answers the author can send as they are or edit first,
// and the gaps no sentence can close (evidence, who else is affected) as chips. Props in.
import type { BenchmarkPart } from "@/features/ideas/benchmarks";
import type { Reply } from "@/features/ideas/replies";
import type { Delta } from "@/lib/use-idea-studio";
import styles from "./IdeaStudio.module.css";

export function BenchmarkCard({ parts, delta, replies = [], onAsk, onUse, onSendNow }: {
  parts: readonly BenchmarkPart[];
  delta: Delta | null;
  replies?: readonly Reply[];
  onAsk?: (hint: string) => void;
  onUse?: (text: string) => void; // into the composer, to edit
  onSendNow?: (text: string) => void;
}) {
  const answered = new Set(replies.map((r) => r.id));
  const missing = parts.filter((p) => !answered.has(p.id)).flatMap((p) => p.missing.slice(0, 1).map((m) => ({ id: p.id, text: m }))).slice(0, 4 - replies.length);
  return (
    <section className={styles.bench} aria-label="Benchmarks">
      <ul className={styles.benchRows}>
        {parts.map((p) => {
          const d = delta?.[p.id] ?? 0;
          return (
            <li key={p.id} className={styles.benchRow} data-bench={p.id} title={p.found.join(" · ") || "Nothing yet"}>
              <span className={styles.benchLabel}>{p.label}</span>
              <span className={styles.benchTrack}><span className={styles.benchFill} style={{ transform: `scaleX(${p.value / 100})` }} /></span>
              <span className={styles.benchVal}>{p.value}</span>
              <span className={styles.benchDelta} data-dir={d > 0 ? "up" : d < 0 ? "down" : undefined}>{d > 0 ? "▲ " + d : d < 0 ? "▼ " + -d : ""}</span>
            </li>
          );
        })}
      </ul>
      {replies.length > 0 && (
        <div className={styles.replies}>
          <span className={styles.benchMissingL}>Suggested answers</span>
          <ul className={styles.replyList}>
            {replies.map((r) => (
              <li key={r.id} className={styles.reply} data-bench={r.id}>
                <button type="button" className={styles.replyUse} onClick={() => onUse?.(r.text)} disabled={!onUse} title="Put it in the message box to edit">
                  <span className={styles.benchDot} aria-hidden="true" />
                  <span className={styles.replyText}>{r.text}</span>
                  <span className={styles.replyGain}>+{r.gain}</span>
                </button>
                {onSendNow && <button type="button" className={styles.replySend} onClick={() => onSendNow(r.text)} aria-label={"Send: " + r.text} title="Send as it is">↑</button>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {missing.length > 0 && (
        <div className={styles.benchMissing}>
          <span className={styles.benchMissingL}>To strengthen</span>
          {missing.map((m) => (
            <button key={m.id} type="button" className={styles.benchChip} data-bench={m.id} onClick={() => onAsk?.(m.text)} disabled={!onAsk}>
              <span className={styles.benchDot} aria-hidden="true" />{m.text}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
