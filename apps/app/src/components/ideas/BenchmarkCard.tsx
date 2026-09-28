// The four benchmark bars under the coach's latest reply: each in its own colour, the change since
// the last message next to it, and what is still missing as chips the author can answer. Props in.
import type { BenchmarkPart } from "@/features/ideas/benchmarks";
import type { Delta } from "@/lib/use-idea-studio";
import styles from "./IdeaStudio.module.css";

export function BenchmarkCard({ parts, delta, onAsk }: { parts: readonly BenchmarkPart[]; delta: Delta | null; onAsk?: (hint: string) => void }) {
  const missing = parts.flatMap((p) => p.missing.slice(0, 1).map((m) => ({ id: p.id, text: m }))).slice(0, 4);
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
