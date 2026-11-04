// Company data (the console, ITC/D3): what NextUp holds for the stack's own company - a card per source
// (counts, never names), what the AI may read, the structure, the routing table, the brief a model is
// given, and the idea studio's publish line. One company: the guard's, never a picker.
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/server/actions/admin";
import { adminContext } from "@/server/admin-context";
import { consoleCompany } from "@/server/console-guard";
import { dataView, ideasView, knowledgeView } from "@/server/admin-insight";
import { adminBase } from "@/features/admin/nav";
import { DataOverview } from "@/components/admin/DataOverview";
import { KnowledgeView } from "@/components/admin/KnowledgeView";
import { CompanyMissing } from "@/components/admin/CompanyOverview";
import { IdeaStudioAdmin } from "@/components/admin/IdeaStudioAdmin";
import { PageHeader } from "@/components/ui/elements";
import { getT } from "@/i18n/server";
import c from "../people/console.module.css";

export default async function DataPage() {
  if (!(await isAdmin())) redirect(adminBase() + "/login");
  const guard = await consoleCompany();
  if (!guard) notFound();
  const ctx = await adminContext();
  const current = ctx.company;
  if (!current || current.id !== guard.companyId) return <CompanyMissing />;

  const t = await getT();
  const [data, knowledge, ideas] = await Promise.all([
    dataView(current, ctx.live),
    knowledgeView(ctx.live ? guard.companyId : null),
    ctx.live ? ideasView(guard.companyId) : null,
  ]);
  const name = current.name;
  const lede =
    knowledge.source === "tables"
      ? t("adminPrivacy.dataLeadTables", { name })
      : knowledge.source === "demo"
        ? t("adminPrivacy.dataLeadDemo")
        : t("adminPrivacy.dataLeadNone", { name });

  return (
    <div className={c.page} data-wide data-testid="console-data">
      <PageHeader title={t("adminPrivacy.dataTitle")} lede={lede} />
      <p className={c.note} data-testid="console-data-loop-link">{t("adminPrivacy.loopLink")}</p>
      {data ? <DataOverview view={data} companyName={name} showMap={false} /> : null}
      {knowledge.source === "none" ? null : <KnowledgeView knowledge={knowledge.knowledge} profile={knowledge.profile} brief={knowledge.brief} />}
      {ideas ? <IdeaStudioAdmin {...ideas} /> : null}
    </div>
  );
}
