// People (company admin only): pick anyone in this company to see whether they can sign in, issue
// personal login codes, manage console access and second factors, and the "Continue with Microsoft" switch.
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/server/actions/admin";
import { consoleCompany } from "@/server/console-guard";
import { getT } from "@/i18n/server";
import { adminContext } from "@/server/admin-context";
import { adminBase } from "@/features/admin/nav";
import { CompanyAccess } from "@/components/admin/CompanyAccess";
import { CompanyMissing } from "@/components/admin/CompanyOverview";
import { PageHeader, SectionCard } from "@/components/ui/elements";
import c from "./console.module.css";

export default async function PeoplePage() {
  if (!(await isAdmin())) redirect(adminBase() + "/login");
  const ctx = await adminContext();
  // The platform admin has this per company, under Companies.
  if (!(await consoleCompany())) notFound();
  if (!ctx.company) return <CompanyMissing />;

  const t = await getT();

  return (
    <div className={c.page}>
      <PageHeader title={t("adminConsole.peopleTitle")} lede={t("adminConsole.peopleLede")} />
      {ctx.live ? (
        <CompanyAccess company={ctx.company} open />
      ) : (
        <SectionCard>
          <p className={c.note}>{t("adminConsole.peopleDbDown")}</p>
        </SectionCard>
      )}
    </div>
  );
}
