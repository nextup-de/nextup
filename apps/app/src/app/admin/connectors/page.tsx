// Console: Connectors (ITC-A1). Jira, Microsoft 365, the AI provider and the directory status of the
// stack's own company. The company comes from consoleCompany(), nowhere else.
import { notFound } from "next/navigation";
import { getT } from "@/i18n/server";
import { consoleCompany } from "@/server/console-guard";
import { JiraBlock } from "@/components/admin/connectors/JiraBlock";
import { M365Block } from "@/components/admin/connectors/M365Block";
import { AiBlock } from "@/components/admin/connectors/AiBlock";
import { DirectoryBlock } from "@/components/admin/connectors/DirectoryBlock";
import { loadConnectors } from "./load";
import styles from "../admin.module.css";

export default async function ConnectorsPage() {
  const c = await consoleCompany();
  if (!c) notFound();
  const t = await getT();
  const data = await loadConnectors(c);
  const readOnly = (c.via as string) === "support";
  return (
    <>
      <section className={styles.card} data-testid="console-connectors-intro">
        <h1>{t("adminConnectors.title")}</h1>
        <p className="nh-hint">{t("adminConnectors.intro")}</p>
        {readOnly ? <p className="nh-hint" role="status">{t("adminConnectors.readOnly")}</p> : null}
      </section>
      <JiraBlock view={data.jira} readOnly={readOnly} />
      <M365Block view={data.m365} readOnly={readOnly} />
      <AiBlock view={data.ai} readOnly={readOnly} />
      <DirectoryBlock view={data.directory} />
    </>
  );
}
