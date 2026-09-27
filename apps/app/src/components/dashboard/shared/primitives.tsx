// Small presentational pieces every role view uses. Props in, JSX out.
import { ini } from "@/lib/utils/format";
import ui from "./ui.module.css";

export type Tone = "accent" | "ink" | "ok" | "grey" | "soft" | "ghost" | "none" | "purple";

// Status pill tone, as the legacy statusStyle() decided it.
export function statusTone(s: string): Tone {
  if (s === "Awaiting decision" || s === "Sent" || s === "Question for you") return "accent";
  if (s === "Shipped") return "ink";
  if (s === "Approved") return "ok";
  if (s === "In trial" || s === "Building") return "grey";
  return "ghost";
}
export const trendTone = (t: string): Tone => (t === "Worsening" ? "accent" : t === "Improving" ? "ok" : "soft");
export const reasonTone = (r: string): Tone => (r === "wrong department" || r === "not responsible" ? "accent" : "soft");
export const ownerTone = (o: string): Tone => (o === "none" ? "ink" : "soft");
export const verdictTone = (v: string): Tone => (v === "Short" ? "accent" : v === "Beat it" ? "ok" : "soft");

export function Pill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return <span className={[ui.pill, className].filter(Boolean).join(" ")} data-tone={tone}>{children}</span>;
}

// Seven-bar sparkline. Grey quarters = before the baseline, dark = since.
export function Bars({ spark, tone, size, flat }: { spark: readonly number[]; tone?: "light"; size?: "md" | "lg"; flat?: boolean }) {
  const vals = flat ? [0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15] : spark;
  return (
    <div className={ui.bars} data-size={size}>
      {vals.map((v, i) => (
        <div key={i} className={ui.bar} data-tone={flat ? "flat" : tone ?? (i < 3 ? "before" : undefined)} style={{ height: 4 + v * 20 }} />
      ))}
    </div>
  );
}

// One of eight hues, stable per name, so the same person is the same colour on every page.
export const hueOf = (name: string) => [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 8, 7);

export function Avatar({ name, size, tone }: { name: string; size?: "sm" | "lg"; tone?: "light" | "color" }) {
  return <span className={ui.avatar} data-size={size} data-tone={tone} data-hue={tone === "color" ? hueOf(name) : undefined} title={name}>{ini(name)}</span>;
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
