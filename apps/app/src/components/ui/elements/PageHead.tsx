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
  /** The filter row of the page's tool. */
  children?: ReactNode;
};

export function PageHead({ title, source, open, primary, children }: PageHeadProps) {
  const pill = source && <>
    <span className={s.mark} data-system={source.system} aria-hidden="true">{source.label.slice(0, 1)}</span>
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
        {primary && <button type="button" className={s.primary} onClick={primary.onClick} disabled={primary.disabled} title={primary.hint}>{primary.icon}{primary.label}</button>}
      </div>
    </div>
    {children && <div className={s.row}>{children}</div>}
  </header>;
}
