// /admin/knowledge, last card: the raise-page assistant for this company - its switches, what it
// did in 30 days (counts only: no per-person view, BetrVG §87) and the documents it may search.
// Props in, JSX out.
import { LEVEL_LABEL, canUse, isLevel } from "@/features/assist/classify";
import type { AssistantView } from "@/server/admin-insight";
import { AssistSettingsForm } from "./AssistSettingsForm";
import { deleteDocumentAction } from "@/server/actions/assist-admin";
import styles from "@/app/admin/admin.module.css";

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) + "%" : "-");
const day = (d: Date) => d.toISOString().slice(0, 10);

export function AssistantAdmin({ slug, view }: { slug: string; view: NonNullable<AssistantView> }) {
  const { settings: s, provider: p, stats: st, documents } = view;
  const tiles: [string, string][] = [
    [String(st.answers), "answers, 30 days"],
    [pct(st.solved, st.answers), "solved it"],
    [pct(st.raised, st.answers), "raised anyway"],
    [pct(st.unsourced, st.answers), "no source cited"],
    [String(st.blocked), "blocked as too sensitive"],
  ];
  const readable = documents.filter((d) => canUse(d.classification, s.ceiling)).length;

  return (
    <section className={styles.card}>
      <h2>Assistant</h2>
      <p className="nh-hint">
        The raise page answers from this knowledge before a case is raised (docs/ASSISTANT.md). Only redacted text is sent and
        stored; turns are deleted after {s.retentionDays} days.
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <tbody>
            <tr><th>Answering</th><td>{s.enabled ? "On" : "Off"} <span className={styles.sub}>demo stage answers regardless</span></td></tr>
            <tr><th>Model</th><td>{p.id === "bedrock" ? <><code>{p.model}</code> <span className={styles.sub}>Amazon Bedrock, {p.region}</span></> : <>No model configured <span className={styles.sub}>answers are built from lookups only</span></>}</td></tr>
            <tr><th>Data-processing agreement</th><td>{s.dpaSignedAt ? "signed " + day(s.dpaSignedAt) : <span className={styles.warn}>not recorded - no model is called for real people until it is</span>}</td></tr>
            <tr><th>Classification ceiling</th><td>{LEVEL_LABEL[s.ceiling]} <span className={styles.sub}>nothing above it is searched or sent</span></td></tr>
          </tbody>
        </table>
      </div>
      <div className={styles.tiles}>
        {tiles.map(([v, l]) => (
          <div key={l} className={styles.tile}>
            <div className={styles.tileValue}>{v}</div>
            <div className={styles.tileLabel}>{l}</div>
          </div>
        ))}
      </div>
      <AssistSettingsForm slug={slug} enabled={s.enabled} ceiling={s.ceiling} retentionDays={s.retentionDays}
        dpaSignedAt={s.dpaSignedAt ? day(s.dpaSignedAt) : ""} rules={s.rules} patterns={s.patterns} />
      <h3>Documents <span className={styles.sub}>{readable} of {documents.length} readable under the ceiling</span></h3>
      {documents.length ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Title</th><th>Source</th><th>Class</th><th>Updated</th><th /></tr></thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id}>
                  <td>{d.title} <span className={styles.sub}>{d.externalId}</span></td>
                  <td>{d.source}</td>
                  <td>{isLevel(d.classification) ? LEVEL_LABEL[d.classification] : d.classification}{canUse(d.classification, s.ceiling) ? "" : <span className={styles.sub}> · not searched</span>}</td>
                  <td className={styles.nowrap}>{day(d.updatedAt)}</td>
                  <td>
                    <form action={deleteDocumentAction}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="id" value={d.id} />
                      <button type="submit" className="nh-btn" aria-label={"Remove " + d.title}>Remove</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="nh-hint">None yet. n8n pushes them to <code>POST /api/&lt;company&gt;/knowledge/documents</code> with a knowledge:write token (ops/n8n/erp-knowledge-sync.json).</p>
      )}
    </section>
  );
}
