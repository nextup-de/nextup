// /admin/company-data, last card: the raise-page assistant for this company - its switches, what it
// did in 30 days (counts only: no per-person view, BetrVG §87) and the documents it may search.
// Props in, JSX out.
import { LEVEL_LABEL, canUse, isLevel } from "@/features/assist/classify";
import type { AssistantView } from "@/server/admin-insight";
import { AssistSettingsForm } from "./AssistSettingsForm";
import { deleteDocumentAction } from "@/server/actions/assist-admin";
import type { T } from "@/i18n";
import { adminBase } from "@/features/admin/nav";
import styles from "@/app/admin/admin.module.css";

const PROVIDER_LABEL = { bedrock: "Amazon Bedrock", "azure-openai": "Azure OpenAI", "openai-compatible": "OpenAI-compatible endpoint" } as const;
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) + "%" : "-");
const day = (d: Date) => d.toISOString().slice(0, 10);

export function AssistantAdmin({ view, t }: { view: NonNullable<AssistantView>; t: T }) {
  const { settings: s, provider: p, stats: st, documents } = view;
  const tiles: [string, string][] = [
    [String(st.answers), t("adminPrivacy.tileAnswers")],
    [pct(st.solved, st.answers), t("adminPrivacy.tileSolved")],
    [pct(st.raised, st.answers), t("adminPrivacy.tileRaised")],
    [pct(st.unsourced, st.answers), t("adminPrivacy.tileUnsourced")],
    [String(st.blocked), t("adminPrivacy.tileBlocked")],
  ];
  const readable = documents.filter((d) => canUse(d.classification, s.ceiling)).length;

  return (
    <section className={styles.card} data-testid="console-assistant">
      <h1>{t("adminPrivacy.assistantTitle")}</h1>
      <p className="nh-hint">{t("adminPrivacy.assistantLead", { days: s.retentionDays })}</p>
      <p className="nh-hint">
        {t("adminPrivacy.connectorsLink")} <a href={adminBase() + "/connectors"} data-testid="console-assistant-connectors-link">{t("adminPrivacy.connectorsOpen")}</a>
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <tbody>
            <tr><th>{t("adminPrivacy.rowAnswering")}</th><td>{s.enabled ? t("adminPrivacy.on") : t("adminPrivacy.off")} <span className={styles.sub}>{t("adminPrivacy.rowAnsweringNote")}</span></td></tr>
            <tr><th>{t("adminPrivacy.rowModel")}</th><td>{p.choice === "off" || p.choice === "mock" ? <>{t("adminPrivacy.rowNoModel")} <span className={styles.sub}>{p.choice === "off" ? t("adminPrivacy.rowAiOff") : t("adminPrivacy.rowLookupsOnly")}</span></> : <><code>{p.choice === "azure-openai" ? p.deployment || p.model : p.model}</code> <span className={styles.sub}>{PROVIDER_LABEL[p.choice]}{p.choice === "bedrock" ? ", " + p.region : ""}</span></>}</td></tr>
            <tr><th>{t("adminPrivacy.rowDpa")}</th><td>{s.dpaSignedAt ? t("adminPrivacy.rowDpaSigned", { date: day(s.dpaSignedAt) }) : <span className={styles.warn}>{t("adminPrivacy.rowDpaMissing")}</span>}</td></tr>
            <tr><th>{t("adminPrivacy.rowCeiling")}</th><td>{LEVEL_LABEL[s.ceiling]} <span className={styles.sub}>{t("adminPrivacy.rowCeilingNote")}</span></td></tr>
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
      <AssistSettingsForm enabled={s.enabled} ceiling={s.ceiling} retentionDays={s.retentionDays}
        dpaSignedAt={s.dpaSignedAt ? day(s.dpaSignedAt) : ""} rules={s.rules} patterns={s.patterns} />
      <h3>{t("adminPrivacy.documents")} <span className={styles.sub}>{t("adminPrivacy.documentsReadable", { readable, total: documents.length })}</span></h3>
      {documents.length ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>{t("adminPrivacy.colTitle")}</th><th>{t("adminPrivacy.colSource")}</th><th>{t("adminPrivacy.colClass")}</th><th>{t("adminPrivacy.colUpdated")}</th><th /></tr></thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id}>
                  <td>{d.title} <span className={styles.sub}>{d.externalId}</span></td>
                  <td>{d.source}</td>
                  <td>{isLevel(d.classification) ? LEVEL_LABEL[d.classification] : d.classification}{canUse(d.classification, s.ceiling) ? "" : <span className={styles.sub}> · {t("adminPrivacy.notSearched")}</span>}</td>
                  <td className={styles.nowrap}>{day(d.updatedAt)}</td>
                  <td>
                    <form action={deleteDocumentAction}>
                      <input type="hidden" name="id" value={d.id} />
                      <button type="submit" className="nh-btn" aria-label={t("adminPrivacy.removeNamed", { title: d.title })}>{t("adminPrivacy.remove")}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="nh-hint">{t("adminPrivacy.documentsNone")}</p>
      )}
    </section>
  );
}
