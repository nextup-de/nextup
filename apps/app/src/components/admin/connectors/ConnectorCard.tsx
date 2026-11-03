// The frame every connector shares on the console's Connectors page (Paper: "Pilot 03 · Connectors"):
// icon, name, status badge, one line on what it does, an optional switch, then what NextUp reads.
// Props in, JSX out.
import type { ConnectorStatus } from "@/features/connectors/status";
import type { MessageKey } from "@/i18n";
import c from "./Connectors.module.css";

export const STATUS_KEY: Record<ConnectorStatus, MessageKey> = {
  on: "adminConnectors.on", off: "adminConnectors.off", needs: "adminConnectors.statusNeeds", error: "adminConnectors.statusError",
};

export type Fact = { label: string; value: React.ReactNode };
export type Note = { tone: "error" | "warn" | "plain"; text: React.ReactNode };

export function StatusBadge({ status, label }: { status: ConnectorStatus; label: string }) {
  return <span className={c.badge} data-status={status}>{status === "on" ? "✓ " : ""}{label}</span>;
}

export function ConnectorCard({ id, icon, title, status, statusLabel, lede, notes, toggle, facts, factsTitle, children, testId }: {
  id: string; icon: React.ReactNode; title: string; status: ConnectorStatus; statusLabel: string; lede: string;
  /** Lines under the lede: an error in red, a "needs you" in amber, plain context in grey. */
  notes?: Note[];
  toggle?: React.ReactNode; facts?: Fact[]; factsTitle?: string; children?: React.ReactNode; testId: string;
}) {
  return (
    <section id={id} className={c.card} data-testid={testId}>
      <div className={c.head}>
        <span className={c.icon} aria-hidden="true">{icon}</span>
        <div className={c.headText}>
          <h2 className={c.title}>{title} <StatusBadge status={status} label={statusLabel} /></h2>
          <p className={c.lede}>{lede}</p>
          {notes?.map((n, i) => <p key={i} className={c.note} data-tone={n.tone} role={n.tone === "error" ? "alert" : undefined}>{n.text}</p>)}
        </div>
        {toggle}
      </div>
      {facts?.length ? (
        <div className={c.factsBox}>
          {factsTitle ? <h3 className={c.sub}>{factsTitle}</h3> : null}
          <dl className={c.facts}>
            {facts.map((f) => <div key={f.label} className={c.fact}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}
          </dl>
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** The on/off switch in a card's corner. */
export function Switch({ on, label, disabled, onChange, testId }: { on: boolean; label: string; disabled?: boolean; onChange: (next: boolean) => void; testId: string }) {
  return (
    <label className={c.switch}>
      <input type="checkbox" role="switch" checked={on} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
    </label>
  );
}

/** A label column and a field column inside a card. */
export function Row({ id, label, hint, children }: { id?: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className={c.row}>
      {id ? <label className={c.label} htmlFor={id}>{label}</label> : <span className={c.label}>{label}</span>}
      <div className={c.field}>
        {children}
        {hint ? <span className={c.hint}>{hint}</span> : null}
      </div>
    </div>
  );
}
