// Console: Connectors (ITC-A1). Jira, Microsoft 365, the AI provider and the directory status of the
// stack's own company. The company comes from consoleCompany(), nowhere else.
import { notFound } from "next/navigation";
import { getT } from "@/i18n/server";
import { consoleCompany } from "@/server/console-guard";
import { JiraBlock } from "@/components/admin/connectors/JiraBlock";
import { M365Block } from "@/components/admin/connectors/M365Block";
import { AiBlock } from "@/components/admin/connectors/AiBlock";
import { DirectoryBlock } from "@/components/admin/connectors/DirectoryBlock";
import { STATUS_KEY, StatusBadge } from "@/components/admin/connectors/ConnectorCard";
import { aiStatus, directoryStatus, jiraStatus, m365Status } from "@/features/connectors/status";
import styles from "@/components/admin/connectors/Connectors.module.css";
import { loadConnectors } from "./load";

export default async function ConnectorsPage() {
  const c = await consoleCompany();
  if (!c) notFound();
  const t = await getT();
  const data = await loadConnectors(c);
  const readOnly = (c.via as string) === "support";
  const strip = [
    { id: "m365", name: t("adminConnectors.m365Title"), status: m365Status(data.m365) },
    { id: "jira", name: t("adminConnectors.jiraTitle"), status: jiraStatus(data.jira) },
    { id: "ai", name: t("adminConnectors.aiTitle"), status: aiStatus(data.ai) },
    { id: "directory", name: t("adminConnectors.dirTitle"), status: directoryStatus(data.directory) },
  ];
  return (
    <div className={styles.page}>
      <header className={styles.pageHead} data-testid="console-connectors-intro">
        <h1 className={styles.pageTitle}>{t("adminConnectors.title")}</h1>
        <p className={styles.pageLede}>{t("adminConnectors.lede")}</p>
        <p className={styles.pageLede}>{t("adminConnectors.intro")}</p>
        {readOnly ? <p className={styles.pageLede} role="status">{t("adminConnectors.readOnly")}</p> : null}
        <ul className={styles.strip}>
          {strip.map((x) => (
            <li key={x.id}><a href={`#${x.id}`}>{x.name} <StatusBadge status={x.status} label={t(STATUS_KEY[x.status])} /></a></li>
          ))}
        </ul>
      </header>
      <M365Block view={data.m365} readOnly={readOnly} />
      <JiraBlock view={data.jira} readOnly={readOnly} />
      <AiBlock view={data.ai} readOnly={readOnly} />
      <DirectoryBlock view={data.directory} />
    </div>
  );
}
