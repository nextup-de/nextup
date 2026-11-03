// Small shared pieces of the settings pages: the page head, a card, a label/field row, a card foot.
// Props in, JSX out.
import Link from "next/link";
import s from "./settings.module.css";

export function SettingsHead({ title, lede }: { title: string; lede?: string }) {
  return (
    <header className={s.head}>
      <h1 className={s.title}>{title}</h1>
      {lede ? <p className={s.lede}>{lede}</p> : null}
    </header>
  );
}

export function Card({ title, hint, action, children, testId }: { title: string; hint?: string; action?: React.ReactNode; children?: React.ReactNode; testId?: string }) {
  return (
    <section className={s.card} data-testid={testId}>
      <div className={s.cardHead}>
        <div className={s.cardTitleBox}>
          <h2 className={s.cardTitle}>{title}</h2>
          {hint ? <p className={s.cardHint}>{hint}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A label column and a field column. `top` aligns the label to the first line of a tall field. */
export function Row({ id, label, top, wide, help, error, children }: {
  id?: string; label: string; top?: boolean; wide?: boolean; help?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div className={s.row} data-top={top || help || error ? "" : undefined} data-wide={wide ? "" : undefined}>
      {id ? <label className={s.label} htmlFor={id}>{label}</label> : <div className={s.label}>{label}</div>}
      <div className={s.fieldCol}>
        {children}
        {error ? <p className={s.fieldError} role="alert" id={id ? `${id}-error` : undefined}>{error}</p> : null}
        {help ? <p className={s.help}>{help}</p> : null}
      </div>
    </div>
  );
}

/** The bottom of a card: a status line on the left, the buttons on the right. */
export function Foot({ status, tone, children, statusTestId }: { status?: string; tone?: "error"; children: React.ReactNode; statusTestId?: string }) {
  return (
    <div className={s.foot}>
      {status ? <p className={s.status} data-tone={tone} role={tone === "error" ? "alert" : "status"} data-testid={statusTestId}>{status}</p> : null}
      {children}
    </div>
  );
}

/** Shown on a page that renders demo data because this copy has no database. */
export function DemoNote({ text }: { text: string }) {
  return <p className={s.cardHint} data-testid="settings-demo-note">{text}</p>;
}

/** The stage card on Company: the stage, what it means, and the way into Setup (only while setup is open). */
export function StageCard({ title, stage, label, line, href, linkText }: { title: string; stage: string; label: string; line: string; href: string; linkText: string }) {
  return (
    <section className={`${s.card} ${s.stageCard}`} data-testid="settings-company-stage">
      <h2 className={s.cardTitle}>{title}</h2>
      <span className={s.stageBadge} data-stage={stage}>{label}</span>
      <p className={s.stageLine}>{line}</p>
      <Link href={href} className={s.stageLink} data-testid="settings-company-stage-setup">{linkText}</Link>
    </section>
  );
}
