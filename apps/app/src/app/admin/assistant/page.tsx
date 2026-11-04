// Assistant and data protection (the console, ITC/D3): the raise-page assistant of the stack's own
// company - on/off, what it may read, how long it keeps anything, and what it did in the last 30 days
// (counts only). The Microsoft 365 block moved to Connectors.
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/server/actions/admin";
import { consoleCompany } from "@/server/console-guard";
import { assistantView } from "@/server/admin-insight";
import { adminBase } from "@/features/admin/nav";
import { companyPrefix } from "@/features/tenant/urls";
import { AssistantAdmin } from "@/components/admin/AssistantAdmin";
import { PageHeader, SectionCard } from "@/components/ui/elements";
import { getT } from "@/i18n/server";
import c from "../people/console.module.css";

export default async function AssistantPage() {
  if (!(await isAdmin())) redirect(adminBase() + "/login");
  const guard = await consoleCompany();
  if (!guard) notFound();
  const t = await getT();
  const assistant = await assistantView(guard.companyId);

  return assistant ? (
    <AssistantAdmin view={assistant} privacyHref={`${companyPrefix(guard.slug)}/settings/privacy`} connectorsHref={adminBase() + "/connectors"} />
  ) : (
    <div className={c.page} data-testid="console-assistant">
      <PageHeader title={t("adminPrivacy.assistantTitle")} />
      <SectionCard>
        <p className={c.note}>{t("adminPrivacy.assistantDbDown")}</p>
      </SectionCard>
    </div>
  );
}
