// The raise page's lower card while the assistant answers: the question, the answer as it streams,
// the sources it cited (each with its information class), and the three ways on - solved, ask
// more, or raise it anyway. Props in, JSX out; the conversation lives in src/lib/use-assist.ts.
import { SITE } from "@/config/site";
import { LEVEL_LABEL, isLevel } from "@/features/assist/classify";
import type { AssistView } from "@/lib/use-assist";
import styles from "./AssistAnswer.module.css";

const KIND: Record<string, string> = { route: "Route", role: "Role", goal: "Goal", doc: "Document", profile: "Profile" };

/** "Owned by the lead [S4]." -> text with a small marker numbered by the source list below (1, 2...). */
function withMarks(text: string, n: Map<string, number>) {
  return text.split(/\[(S\d{1,3})\]/).map((part, i) => (i % 2 ? (n.has(part) ? <sup key={i} className={styles.mark}>{n.get(part)}</sup> : null) : part));
}

export function AssistAnswer({ view, onSolved, onAskMore, onRaise }: {
  view: AssistView;
  onSolved: () => void;
  onAskMore: () => void;
  onRaise: () => void;
}) {
  const { status, text, sources, question, note, unsourced, retentionDays } = view;
  const asking = status === "asking";
  const n = new Map(sources.map((s, i) => [s.tag, i + 1]));
  const head = status === "blocked" ? "Not sent" : status === "error" ? "No answer" : asking ? "Looking it up" : "What " + SITE.name + " found";

  return (
    <div className={styles.wrap} aria-busy={asking || undefined}>
      <div className={styles.head}>
        <h2 className={styles.title}>{head}</h2>
        <span className={styles.tag}>{asking ? "Company knowledge" : sources.length ? sources.length + (sources.length === 1 ? " source" : " sources") : ""}</span>
      </div>
      <div className={styles.body}>
        <p className={styles.q}>{question}</p>
        {status === "blocked" || status === "error" ? (
          <p className={styles.note} role="alert">{note}</p>
        ) : (
          <p className={styles.answer} aria-live="polite">
            {text ? withMarks(text, n) : <span className={styles.dots} aria-label="Answering"><span /><span /><span /></span>}
          </p>
        )}
        {sources.length > 0 && (
          <ul className={styles.sources} aria-label="Sources">
            {sources.map((s) => (
              <li key={s.tag} className={styles.source}>
                <span className={styles.srcN}>{n.get(s.tag)}</span>
                <span className={styles.srcKind}>{KIND[s.kind] ?? s.kind}</span>
                <span className={styles.srcLabel}>{s.label}</span>
                {isLevel(s.level) && <span className={styles.level} data-level={s.level}>{LEVEL_LABEL[s.level]}</span>}
              </li>
            ))}
          </ul>
        )}
        {status === "answered" && unsourced && <p className={styles.fine}>No company source backs this answer - treat it as a pointer, and raise it if it matters.</p>}
      </div>
      <div className={styles.foot}>
        <p className={styles.fine}>Answered from company knowledge only. {retentionDays ? `Kept ${retentionDays} days without names, never used to rate anyone.` : "Nothing is stored."}</p>
        {!asking && (
          <div className={styles.actions}>
            {status === "answered" && <button type="button" className={styles.solved} onClick={onSolved}>That solved it</button>}
            <button type="button" className={styles.more} onClick={onAskMore}>{status === "answered" ? "Ask more" : "Ask differently"}</button>
            <button type="button" className={styles.raise} onClick={onRaise}>Raise it anyway</button>
          </div>
        )}
      </div>
    </div>
  );
}
