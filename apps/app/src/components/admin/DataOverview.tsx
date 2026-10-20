// /admin/company-data: what NextUp holds for one company - a card per source, what the AI may read, and
// the map of where each kind of data comes from and who reads it. Props in, JSX out.
import type { ReactNode } from "react";
import type { SourceCard } from "@/features/admin/data";
import type { DataView } from "@/server/admin-insight";
import { LEVEL_LABEL } from "@/features/assist/classify";
import { DataMap } from "./DataMap";
import styles from "@/app/admin/admin.module.css";

const day = (d: Date) => d.toISOString().slice(0, 10);

function Source({ s }: { s: SourceCard }) {
  return (
    <li className={styles.dataCard} data-tone={s.tone ?? "off"}>
      <span className={styles.stripLabel}>
        <span className={styles.dot} aria-hidden="true" />
        {s.label}
        <span className={styles.rowMeta}>{s.state}</span>
      </span>
      <strong>{s.size}</strong>
      <span className={styles.sub}>from {s.origin}</span>
      <span className={styles.sub}>{s.updatedAt ? `changed ${day(s.updatedAt)}` : "no date recorded"}</span>
      {s.note ? <span className={styles.dataNote}>{s.note}</span> : null}
    </li>
  );
}

type Props = {
  view: NonNullable<DataView>;
  companyName: string;
  showMap: boolean;
  /** Drawn between the sources and the AI card: the picture of the organisation. */
  middle?: ReactNode;
  /** Drawn last: the raw rows. */
  last?: ReactNode;
};

export function DataOverview({ view, companyName, showMap, middle, last }: Props) {
  const { cards, classes, ceiling, ai } = view;
  return (
    <>
      <section className={styles.card}>
        <h2>Sources</h2>
        <p className="nh-hint">
          Everything NextUp reads for {companyName}. Sizes are rows and roles, never names: there is no per-person
          page and no export of people.
        </p>
        <ul className={styles.dataGrid} aria-label="Sources">
          {cards.map((s) => <Source key={s.id} s={s} />)}
        </ul>
      </section>

      {middle}

      <section className={styles.card}>
        <h2>What the AI may read</h2>
        <table className={styles.table}>
          <tbody>
            <tr><th>Classification ceiling</th><td>{LEVEL_LABEL[ceiling]} <span className={styles.sub}>nothing above it is searched or sent to a model</span></td></tr>
            {ai ? (
              <>
                <tr><th>Assistant</th><td>{ai.enabled ? "on" : "off"}</td></tr>
                <tr><th>Masked before a model sees it</th><td>{ai.patterns.length ? `${ai.patterns.length} company patterns, plus names and secrets` : "names and secrets"}</td></tr>
                <tr><th>Questions and answers kept</th><td>{ai.retentionDays} days, redacted text only</td></tr>
                <tr><th>Data-processing agreement</th><td>{ai.dpaSignedAt ? `signed ${day(ai.dpaSignedAt)}` : "not signed yet"}</td></tr>
              </>
            ) : null}
          </tbody>
        </table>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Document class</th><th>Documents</th><th>The AI</th></tr></thead>
            <tbody>
              {classes.map((c) => (
                <tr key={c.level}>
                  <td>{LEVEL_LABEL[c.level]}</td>
                  <td>{c.count}</td>
                  <td>{c.searched ? "may search" : "stored, never searched"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showMap ? (
        <section className={styles.card}>
          <h2>Data map</h2>
          <p className="nh-hint">Where each kind of data comes from, which table holds it, and which part of NextUp reads it.</p>
          <DataMap />
        </section>
      ) : null}
      {last}
    </>
  );
}
