// The raise page's lower card while the assistant answers: the question, the answer as it streams,
// the sources it cited (each with its information class), and the three ways on - solved, ask
// more, or raise it anyway. Props in, JSX out; the conversation lives in src/lib/use-assist.ts.
import { SITE } from "@/config/site";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import { LEVEL_LABEL, isLevel } from "@/features/assist/classify";
import type { AssistView } from "@/lib/use-assist";
import styles from "./AssistAnswer.module.css";

const KIND: Record<string, MessageKey> = { route: "team.assistKindRoute", role: "team.assistKindRole", goal: "team.assistKindGoal", doc: "team.assistKindDoc", profile: "team.assistKindProfile" };

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
  const t = useT();
  const { status, text, sources, question, note, unsourced, retentionDays } = view;
  const asking = status === "asking";
  const n = new Map(sources.map((s, i) => [s.tag, i + 1]));
  const head = status === "blocked" ? t("team.assistNotSent") : status === "error" ? t("team.assistNoAnswer") : asking ? t("team.assistLookingItUp") : t("team.assistFound", { name: SITE.name });

  return (
    <div className={styles.wrap} aria-busy={asking || undefined}>
      <div className={styles.head}>
        <h2 className={styles.title}>{head}</h2>
        <span className={styles.tag}>{asking ? t("team.assistCompanyKnowledge") : sources.length ? t("team.assistSource", { count: sources.length }) : ""}</span>
      </div>
      <div className={styles.body}>
        <p className={styles.q}>{question}</p>
        {status === "blocked" || status === "error" ? (
          <p className={styles.note} role="alert">{note}</p>
        ) : (
          <p className={styles.answer} aria-live="polite">
            {text ? withMarks(text, n) : <span className={styles.dots} aria-label={t("team.assistAnswering")}><span /><span /><span /></span>}
          </p>
        )}
        {sources.length > 0 && (
          <ul className={styles.sources} aria-label={t("team.assistSources")}>
            {sources.map((s) => (
              <li key={s.tag} className={styles.source}>
                <span className={styles.srcN}>{n.get(s.tag)}</span>
                <span className={styles.srcKind}>{s.url ? "Microsoft 365" : (KIND[s.kind] ? t(KIND[s.kind]) : s.kind)}</span>
                <span className={styles.srcLabel}>
                  {s.url && /^https:\/\//i.test(s.url) ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a> : s.label}
                </span>
                {isLevel(s.level) && <span className={styles.level} data-level={s.level}>{LEVEL_LABEL[s.level]}</span>}
              </li>
            ))}
          </ul>
        )}
        {status === "answered" && unsourced && <p className={styles.fine}>{t("team.assistUnsourced")}</p>}
      </div>
      <div className={styles.foot}>
        <p className={styles.fine}>{retentionDays ? t("team.assistFootKept", { days: retentionDays }) : t("team.assistFootNone")}</p>
        {!asking && (
          <div className={styles.actions}>
            {status === "answered" && <button type="button" className={styles.solved} onClick={onSolved}>{t("team.assistSolved")}</button>}
            <button type="button" className={styles.more} onClick={onAskMore}>{status === "answered" ? t("team.assistAskMore") : t("team.assistAskDifferently")}</button>
            <button type="button" className={styles.raise} onClick={onRaise}>{t("team.assistRaiseAnyway")}</button>
          </div>
        )}
      </div>
    </div>
  );
}
