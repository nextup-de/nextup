"use client";
// Console connectors: the directory sync, read-only. Source, switch, last run, last error.
import { directoryStatus } from "@/features/connectors/status";
import { useFormat, useT } from "@/i18n/client";
import { ConnectorCard, STATUS_KEY, type Note } from "./ConnectorCard";
import type { DirectoryBlockView } from "./views";
import c from "./Connectors.module.css";

const TreeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="5" rx="1" /><rect x="3" y="16" width="6" height="5" rx="1" /><rect x="15" y="16" width="6" height="5" rx="1" /><path d="M12 8v4M6 16v-2h12v2" /></svg>
);

export function DirectoryBlock({ view }: { view: DirectoryBlockView }) {
  const t = useT();
  const f = useFormat();
  const status = directoryStatus(view);
  const notes: Note[] = [];
  if (status === "off") notes.push({ tone: "plain", text: t("adminConnectors.dirOffLine") });
  if (view.lastError) notes.push({ tone: "error", text: `${t("adminConnectors.dirLastError")}: ${view.lastError}` }, { tone: "plain", text: t("adminConnectors.dirWaits") });
  return (
    <ConnectorCard
      id="directory" testId="console-connectors-directory" icon={<TreeIcon />} title={t("adminConnectors.dirTitle")}
      status={status} statusLabel={t(STATUS_KEY[status])} lede={t("adminConnectors.dirLede")} notes={notes}
      factsTitle={t("adminConnectors.readsTitle")}
      facts={[
        { label: t("adminConnectors.factReads"), value: t("adminConnectors.dirReads") },
        { label: t("adminConnectors.factNeverReads"), value: t("adminConnectors.dirNever") },
        { label: t("adminConnectors.dirSource"), value: t(view.source === "graph" ? "adminConnectors.dirSourceGraph" : "adminConnectors.dirSourceSuccessfactors") },
      ]}>
      <div className={c.sync}>
        <span data-testid="console-connectors-directory-on">
          <strong>{t("adminConnectors.syncTitle")}</strong> · {t(view.on ? "adminConnectors.on" : "adminConnectors.off")}
          {" · "}<span data-testid="console-connectors-directory-run">{t("adminConnectors.dirLastRun")}: {view.lastRunAt ? f.date(view.lastRunAt, "dateTime") : t("adminConnectors.never")}</span>
        </span>
        <span className={c.hint}>{t("adminConnectors.dirHint")}</span>
      </div>
    </ConnectorCard>
  );
}
