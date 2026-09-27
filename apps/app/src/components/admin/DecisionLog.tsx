// /admin/decisions: every raise, what the router proposed, and whether people agreed. The summary
// says how often the proposal holds; the table says where it did not. Props in, JSX out.
import type { DecisionRow, DecisionSummary } from "@/features/admin/decisions";
import styles from "@/app/admin/admin.module.css";

type Props = {
  rows: DecisionRow[];
  summary: DecisionSummary;
  /** company slug -> route id -> request type, so a row reads "r3 · Quality data", not just "r3". */
  routeNames: Record<string, Record<string, string>>;
  exportHref: string;
};

const pct = (x: number | null) => (x === null ? "-" : Math.round(x * 100) + "%");
const when = (iso: string) => new Date(iso).toISOString().slice(0, 16).replace("T", " ");

export function DecisionLog({ rows, summary: s, routeNames, exportHref }: Props) {
  const route = (company: string, id: string | null) =>
    id === null ? <span className={styles.sub}>none</span> : (
      <>
        <code>{id}</code>
        <span className={styles.sub}>{routeNames[company]?.[id] ?? "not in the map"}</span>
      </>
    );

  const tiles: [string, string][] = [
    [String(s.raised), "raised"],
    [pct(s.agreement), "proposal held (agreed ÷ settled)"],
    [String(s.overridden), "overridden"],
    [String(s.handedElsewhere), "handed elsewhere"],
    [String(s.noRoute), "no route found"],
    [String(s.open), "still open"],
    [s.meanConfidence === null ? "-" : s.meanConfidence + "%", "mean confidence"],
    [String(s.notified), "notified by n8n"],
  ];

  return (
    <>
      <section className={styles.card}>
        <h1>Decisions</h1>
        <p className="nh-hint">
          What the router proposed for each raised case, and what people did with it. Overridden or handed elsewhere means
          the proposal did not hold; that is the signal to fix a keyword, a row in the map, or the prompt. The label always
          comes from people, never from the model. n8n&rsquo;s side of each raise is on Connections.
        </p>
        <div className={styles.tiles}>
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
          <a href={exportHref} download>Download the eval set</a> (JSON lines, settled cases only: the text and the route people
          chose). It is the input for <code>tests/eval/routing/</code>: score a new matcher or prompt on it before it ships.
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
