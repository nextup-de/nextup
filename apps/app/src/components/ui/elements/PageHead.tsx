// The page header of a project page (plan FIL, D10): the title as the page's h1, the system the page lives in as a pill
// (name, key, a dot, "Synced … ago"), an "Open in … ↗" text link, one primary button, and a slot for the tool's filter
// row. Props in, JSX out: every word comes in from the caller's catalog.
import type { ReactNode } from "react";
import s from "./PageHead.module.css";

export type PageHeadSource = {
  system: "jira" | "sharepoint" | (string & {});
  /** The system's name as shown: "Jira", "SharePoint". */
  label: string;
  key?: string;
  /** The finished sentence, "Synced 2 min ago". */
  syncedAt?: string;
  state: "ok" | "syncing" | "problem";
  /** Makes the pill a button (the popover of FIL-A3). */
  onOpen?: () => void;
};
export type PageHeadProps = {
  title: string;
  source?: PageHeadSource;
  open?: { label: string; href: string };
  primary?: { label: string; icon?: ReactNode; onClick: () => void; disabled?: boolean; hint?: string };
  /** What sits after the primary button: the Files page's settings gear (frame 7.1). */
  extra?: ReactNode;
  /** The filter row of the page's tool. */
  children?: ReactNode;
};

const CLOUD = <svg width="16" height="16" viewBox="0 0 16 16" focusable="false"><path d="M4.5 12.5H11.6C12.9 12.5 13.9 11.5 13.9 10.2C13.9 9 13 8 11.8 7.9C11.5 6 9.9 4.6 8 4.6C6.4 4.6 5 5.6 4.5 7C3.1 7.1 2.1 8.3 2.1 9.7C2.1 11.3 3.1 12.5 4.5 12.5Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>;

export function PageHead({ title, source, open, primary, extra, children }: PageHeadProps) {
  const pill = source && <>
    <span className={s.mark} data-system={source.system} aria-hidden="true">{source.system === "sharepoint" ? CLOUD : source.system === "jira" ? "⇄" : source.label.slice(0, 1)}</span>
    <span className={s.sourceName}>{source.label}</span>
    {source.key && <span className={s.key}>{source.key}</span>}
    <span className={s.dot} data-state={source.state} aria-hidden="true" />
    {source.syncedAt && <span className={s.synced}>{source.syncedAt}</span>}
  </>;
  return <header className={s.head} data-testid="page-head">
    <div className={s.top}>
      <div className={s.text}>
        <h1 className={s.title}>{title}</h1>
        {source && (source.onOpen
          ? <button type="button" className={s.source} data-state={source.state} aria-haspopup="dialog" onClick={source.onOpen}>{pill}</button>
          : <span className={s.source} data-state={source.state}>{pill}</span>)}
      </div>
      <div className={s.actions}>
        {open && <a className={s.open} href={open.href} target="_blank" rel="noreferrer noopener">{open.label} <span aria-hidden="true">↗</span></a>}
        {primary && <button type="button" className={s.primary} onClick={primary.onClick} disabled={primary.disabled} title={primary.hint}>{primary.icon && <span>{primary.icon}</span>}{primary.label}</button>}
        {extra}
      </div>
    </div>
    {children && <div className={s.row}>{children}</div>}
  </header>;
}
