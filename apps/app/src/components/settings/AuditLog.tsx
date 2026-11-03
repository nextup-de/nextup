"use client";
// The audit log (GDP D13): filters in the address bar, a table of what happened, a read-only drawer per row.
// Nothing here ranks, sorts or counts by person (D2); the total shows only when the server sends one.
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ACTOR_KINDS, AUDIT_AREAS } from "@/features/audit";
import {
  AUDIT_PERIODS, actionLabelKey, actorLabelKey, auditSearch, changeEntries, personName, shortChanges, targetLabel, valueText,
  type AuditFilter, type AuditPeriod,
} from "@/features/audit/view";
import { useFormat, useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import type { AuditPageData, AuditRowData } from "@/server/actions/settings/audit";
import { Button } from "@/components/ui/Button";
import styles from "./AuditLog.module.css";

type Props = { slug: string; filter: AuditFilter; data: AuditPageData };

const key = (k: string) => `settingsAudit.${k}` as MessageKey;
const SECRET = ["set", "replaced", "removed"];

export function AuditLog({ slug, filter, data }: Props) {
  const t = useT();
  const f = useFormat();
  const router = useRouter();
  const [open, setOpen] = useState<AuditRowData | null>(null);
  const [copied, setCopied] = useState(false);
  const base = `/${slug}/settings/audit`;
  const go = (next: AuditFilter) => {
    const q = auditSearch(next).toString();
    router.push(q ? `${base}?${q}` : base);
  };
  const change = (patch: Partial<AuditFilter>) => go({ ...filter, ...patch, cursor: undefined });
  const toggle = <T extends string>(list: T[] | undefined, v: T, on: boolean): T[] | undefined => {
    const next = on ? [...(list ?? []), v] : (list ?? []).filter((x) => x !== v);
    return next.length ? next : undefined;
  };
  const show = (r: AuditRowData) => { setOpen(r); setCopied(false); };

  const actor = (r: AuditRowData): string => {
    const kind = t(key(actorLabelKey(r)));
    if (!r.actorUserId) return kind;
    return `${personName(r.actorUserId, data.names) ?? t(key("deletedPerson"))} · ${kind}`;
  };
  const action = (r: AuditRowData): string => {
    const k = actionLabelKey(r.action);
    return k ? t(key(k)) : r.action;
  };
  const target = (r: AuditRowData): string => {
    const l = targetLabel(r, data.names);
    if (l.kind === "none") return t(key("noTarget"));
    if (l.kind === "deletedPerson") return t(key("deletedPerson"));
    if (l.kind === "person") return l.name;
    return `${l.targetKind} ${l.id}`.trim();
  };
  // A secret field is written as set / replaced / removed (D5); show it in the reader's language.
  const value = (before: unknown, after: unknown, which: "before" | "after"): string => {
    const v = which === "before" ? before : after;
    if (which === "after" && before === null && typeof v === "string" && SECRET.includes(v)) return t(key(`secret_${v}`));
    return valueText(v);
  };
  const filtered = Boolean(filter.areas || filter.actorKinds || filter.actorUserId || filter.period !== "30d" || filter.cursor);

  const copy = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  let body: ReactNode;
  if (data.error) {
    body = (
      <div className={styles.state} role="alert">
        <p>{t(key("error"))}</p>
        <Button onClick={() => router.refresh()}>{t(key("tryAgain"))}</Button>
      </div>
    );
  } else if (data.rows.length === 0) {
    body = (
      <div className={styles.state} data-testid="settings-audit-empty">
        <p>{t(key(filtered ? "noMatch" : "empty"))}</p>
        {filtered && <Button variant="ghost" onClick={() => go({ period: "30d" })}>{t(key("clearFilters"))}</Button>}
      </div>
    );
  } else {
    body = (
      <>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t(key("colWhen"))}</th><th>{t(key("colBy"))}</th><th>{t(key("colAction"))}</th><th>{t(key("colTarget"))}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => {
              const short = shortChanges(r.changes);
              return (
                <tr key={r.id} className={styles.row} data-testid="settings-audit-row" onClick={() => show(r)}>
                  <td>
                    <button type="button" className={styles.rowButton} onClick={(e) => { e.stopPropagation(); show(r); }}>
                      {f.date(r.at, "dateTime")}
                    </button>
                  </td>
                  <td>{actor(r)}</td>
                  <td>
                    {action(r)}
                    {short && (
                      <span className={styles.sub}>
                        {short.map((c) => `${c.field}: ${value(c.before, c.after, "before") || "–"} → ${value(c.before, c.after, "after") || "–"}`).join(" · ")}
                      </span>
                    )}
                  </td>
                  <td>{target(r)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className={styles.pager}>
          <span>{data.total !== null ? t(key("total"), { count: data.total }) : ""}</span>
          <span className={styles.buttons}>
            <Button variant="ghost" size="sm" disabled={!filter.cursor} onClick={() => (window.history.length > 1 ? router.back() : change({}))}>
              {t(key("newer"))}
            </Button>
            <Button variant="ghost" size="sm" disabled={!data.next} onClick={() => go({ ...filter, cursor: data.next ?? undefined })}>
              {t(key("older"))}
            </Button>
          </span>
        </div>
        <p className="nh-hint">{t(key("olderDeleted"))}</p>
      </>
    );
  }

  const exportQuery = auditSearch({ ...filter, cursor: undefined }).toString();
  const openChanges = open ? changeEntries(open.changes) : [];

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <p className="nh-hint">{t(key("lead"), { company: data.companyName })}</p>
        <a className="nh-btn nh-btn-ghost" data-testid="settings-audit-export" href={`${base}/export${exportQuery ? `?${exportQuery}` : ""}`}>
          {t(key("exportCsv"))}
        </a>
      </div>

      <div className={styles.filters}>
        <label>
          {t(key("filterPeriod"))}
          <select data-testid="settings-audit-filter-period" value={filter.period} onChange={(e) => change({ period: e.target.value as AuditPeriod })}>
            {AUDIT_PERIODS.map((p) => <option key={p} value={p}>{t(key(`period_${p}`))}</option>)}
          </select>
        </label>
        <details className={styles.group} data-testid="settings-audit-filter-area">
          <summary>{t(key("filterArea"))}{filter.areas ? ` (${filter.areas.length})` : ""}</summary>
          <div className={styles.checks}>
            {AUDIT_AREAS.map((a) => (
              <label key={a}>
                <input type="checkbox" checked={filter.areas?.includes(a) ?? false} onChange={(e) => change({ areas: toggle(filter.areas, a, e.target.checked) })} />
                {t(key(`area_${a}`))}
              </label>
            ))}
          </div>
        </details>
        <details className={styles.group} data-testid="settings-audit-filter-actor">
          <summary>{t(key("filterActor"))}{filter.actorKinds ? ` (${filter.actorKinds.length})` : ""}</summary>
          <div className={styles.checks}>
            {ACTOR_KINDS.map((k) => (
              <label key={k}>
                <input type="checkbox" checked={filter.actorKinds?.includes(k) ?? false} onChange={(e) => change({ actorKinds: toggle(filter.actorKinds, k, e.target.checked) })} />
                {t(key(actorLabelKey({ actorKind: k })))}
              </label>
            ))}
          </div>
        </details>
        <label>
          {t(key("filterPerson"))}
          <select data-testid="settings-audit-filter-person" value={filter.actorUserId ?? ""} onChange={(e) => change({ actorUserId: e.target.value || undefined })}>
            <option value="">{t(key("personAny"))}</option>
            {data.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>

      {body}

      {open && (
        <aside className={styles.drawer} data-testid="settings-audit-drawer" role="dialog" aria-label={action(open)}>
          <h2>{action(open)}</h2>
          <dl className={styles.info}>
            <dt>{t(key("drawerWhen"))}</dt><dd>{f.date(open.at, "dateTime")}</dd>
            <dt>{t(key("drawerBy"))}</dt><dd>{actor(open)}</dd>
            <dt>{t(key("drawerWhere"))}</dt><dd>{t(key(`source_${open.source}`))}</dd>
            <dt>{t(key("drawerTarget"))}</dt><dd>{target(open)}</dd>
          </dl>
          <h3>{t(key("drawerChanges"))}</h3>
          {openChanges.length === 0 ? (
            <p className="nh-hint">{t(key("drawerNoChanges"))}</p>
          ) : (
            <table className={styles.changes}>
              <thead><tr><th>{t(key("fieldCol"))}</th><th>{t(key("beforeCol"))}</th><th>{t(key("afterCol"))}</th></tr></thead>
              <tbody>
                {openChanges.map((c) => (
                  <tr key={c.field}>
                    <td>{c.field}</td><td>{value(c.before, c.after, "before")}</td><td>{value(c.before, c.after, "after")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className={styles.footer}>
            <span>{t(key("entry"))} <span className={styles.mono}>{open.id}</span></span>
            <span className={styles.buttons}>
              <Button variant="ghost" size="sm" onClick={() => copy(open.id)}>{copied ? t(key("copied")) : t(key("copyId"))}</Button>
              <Button size="sm" onClick={() => setOpen(null)}>{t("common.close")}</Button>
            </span>
          </div>
        </aside>
      )}
    </div>
  );
}
