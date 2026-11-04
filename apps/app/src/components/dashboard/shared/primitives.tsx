// Small presentational pieces every role view uses. Props in, JSX out.
import type { MessageKey, T } from "@/i18n";
import ui from "./ui.module.css";

export type Tone = "accent" | "ink" | "ok" | "grey" | "soft" | "ghost" | "none" | "purple";

// Status pill tone, as the legacy statusStyle() decided it.
// The words are the data's own (English) status values; statusText shows them in the reader's language.
const STATUS_TONE: Record<string, Tone> = {
  "Awaiting decision": "accent", Sent: "accent", "Question for you": "accent",
  Shipped: "ink", Approved: "ok", "In trial": "grey", Building: "grey",
};
export const statusTone = (s: string): Tone => STATUS_TONE[s] ?? "ghost";

/** The data's English status, trend and verdict words -> the catalog key that shows them. */
const WORD_KEY: Record<string, MessageKey> = {
  "Awaiting decision": "dashboard.statusAwaitingDecision", "In trial": "dashboard.statusInTrial", Building: "dashboard.statusBuilding",
  Shipped: "dashboard.statusShipped", Sent: "dashboard.statusSent", "In discussion": "dashboard.statusInDiscussion",
  "Question for you": "dashboard.statusQuestion", Decided: "dashboard.statusDecided", Approved: "dashboard.statusApproved",
  Proposed: "dashboard.wordProposed", Unfunded: "dashboard.wordUnfunded",
  Worsening: "dashboard.wordWorsening", Flat: "dashboard.wordFlat", Improving: "dashboard.wordImproving",
  "As promised": "dashboard.wordAsPromised", "Beat it": "dashboard.verdictBeatIt", Short: "dashboard.verdictShort", Running: "dashboard.wordRunning",
};
export const wordText = (t: T, word: string): string => (WORD_KEY[word] ? t(WORD_KEY[word]) : word);
export const trendTone = (t: string): Tone => (t === "Worsening" ? "accent" : t === "Improving" ? "ok" : "soft");
export const reasonTone = (r: string): Tone => (r === "wrong department" || r === "not responsible" ? "accent" : "soft");
export const ownerTone = (o: string): Tone => (o === "none" ? "ink" : "soft");
const VERDICT_TONE: Record<string, Tone> = { Short: "accent", "Beat it": "ok" };
export const verdictTone = (v: string): Tone => VERDICT_TONE[v] ?? "soft";

export function Pill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return <span className={[ui.pill, className].filter(Boolean).join(" ")} data-tone={tone}>{children}</span>;
}


export function Quote({ text, by, tone }: { text: string; by: string; tone?: "accent" }) {
  return (
    <div className={ui.quote} data-tone={tone}>
      <div className={ui.quoteText}>{text}</div>
      <div className={ui.quoteBy}>{by}</div>
    </div>
  );
}

export function Tile({ v, l, hot, onClick }: { v: React.ReactNode; l: string; hot?: boolean; onClick?: () => void }) {
  return (
    <div className={[ui.tile, onClick ? ui.tileClick : ""].join(" ")} onClick={onClick}>
      <div className={ui.tileV} data-hot={hot ? "true" : undefined}>{v}</div>
      <div className={ui.tileL}>{l}</div>
    </div>
  );
}

export function Btn({ kind, onClick, children, fixed }: { kind?: "primary" | "accent" | "disabled" | "muted"; onClick?: () => void; children: React.ReactNode; fixed?: boolean }) {
  return (
    <button type="button" className={ui.btn} data-kind={kind} data-fixed={fixed ? "true" : undefined} onClick={kind === "disabled" ? undefined : onClick} disabled={kind === "disabled"}>
      {children}
    </button>
  );
}

export function Empty({ title, sub, children }: { title: string; sub: string; children?: React.ReactNode }) {
  return (
    <div className={ui.empty}>
      <div className={ui.emptyTitle}>{title}</div>
      <div className={ui.emptySub}>{sub}</div>
      {children}
    </div>
  );
}
