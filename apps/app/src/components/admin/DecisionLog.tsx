// /admin/decisions: every raise, what the router proposed, and whether people agreed. The summary
// says how often the proposal holds; the table says where it did not. Props in, JSX out.
import type { DecisionRow, DecisionSummary } from "@/features/admin/decisions";
import type { T } from "@/i18n";
import styles from "@/app/admin/admin.module.css";

type Props = {
  rows: DecisionRow[];
  summary: DecisionSummary;
  /** company slug -> route id -> request type, so a row reads "r3 · Quality data", not just "r3". */
  routeNames: Record<string, Record<string, string>>;
  exportHref: string;
  t: T;
};

const pct = (x: number | null) => (x === null ? "-" : Math.round(x * 100) + "%");
const when = (iso: string) => new Date(iso).toISOString().slice(0, 16).replace("T", " ");

export function DecisionLog({ rows, summary: s, routeNames, exportHref, t }: Props) {
  const route = (company: string, id: string | null) =>
    id === null ? <span className={styles.sub}>none</span> : (
      <>
        <code>{id}</code>
        <span className={styles.sub}>{routeNames[company]?.[id] ?? "not in the map"}</span>
      </>
    );

  const tiles: [string, string][] = [
    [String(s.raised), t("adminPrivacy.tileRaisedCases")],
    [pct(s.agreement), t("adminPrivacy.tileHeld")],
    [String(s.overridden), t("adminPrivacy.tileOverridden")],
    [String(s.handedElsewhere), t("adminPrivacy.tileHanded")],
    [String(s.noRoute), t("adminPrivacy.tileNoRoute")],
    [String(s.open), t("adminPrivacy.tileOpen")],
    [s.meanConfidence === null ? "-" : s.meanConfidence + "%", t("adminPrivacy.tileConfidence")],
    [String(s.notified), t("adminPrivacy.tileNotified")],
  ];

  return (
    <>
      <section className={styles.card}>
        <h1>{t("adminPrivacy.routingTitle")}</h1>
        <p className="nh-hint">{t("adminPrivacy.routingLead")}</p>
        <div className={styles.tiles} data-testid="console-routing-tiles">
          {tiles.map(([v, l]) => (
            <div key={l} className={styles.tile}>
              <div className={styles.tileValue}>{v}</div>
              <div className={styles.tileLabel}>{l}</div>
            </div>
          ))}
        </div>
        {s.byVersion.length > 1 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Router version</th><th>Raised</th><th>Agreed</th><th>Overridden</th><th>Handed elsewhere</th><th>No route</th></tr></thead>
              <tbody>
                {s.byVersion.map((v) => (
                  <tr key={v.version}><td><code>{v.version}</code></td><td>{v.raised}</td><td>{v.agreed}</td><td>{v.overridden}</td><td>{v.handedElsewhere}</td><td>{v.noRoute}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <p className="nh-hint">
          <a href={exportHref} download data-testid="console-routing-export">{t("adminPrivacy.routingExport")}</a>
        </p>
      </section>

      <section className={styles.card}>
        <h2>Raises <span className={styles.sub}>newest first · the last 200</span></h2>
        {rows.length === 0 ? (
          <p className="nh-hint">Nothing raised yet. Raise a case in any company and it shows up here.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>When</th><th>Case</th><th>Proposed</th><th>Confidence</th><th>Chosen</th><th>Verdict</th><th>Handed on</th><th>n8n</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.eventId}>
                    <td className={styles.nowrap}>{when(r.raisedAt)}<span className={styles.sub}>{r.company}</span></td>
                    <td>{r.title || <em>untitled</em>}<span className={styles.sub}>{r.answer ? "answered " + r.answer : "no answer yet"}</span></td>
                    <td>{route(r.company, r.proposed)}</td>
                    <td className={styles.nowrap}>
                      {r.confidence === null ? "-" : r.confidence + "%"}
                      <span className={styles.sub}>{r.source === "unrecorded" ? "not recorded" : r.version}</span>
                    </td>
                    <td>{route(r.company, r.chosen)}</td>
                    <td><span className={styles.verdictPill} data-v={r.verdict}>{r.verdict}</span></td>
                    <td>{r.handoffs ? r.handoffs + "×" : "-"}</td>
                    <td className={styles.nowrap}>{r.noticeAt ? "written back" : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
