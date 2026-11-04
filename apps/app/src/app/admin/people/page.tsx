// People (company admin only): everyone in this company, whether they can sign in, a new personal
// login code when someone joins or loses theirs, and the "Continue with Microsoft" switch.
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/server/actions/admin";
import { consoleCompany } from "@/server/console-guard";
import { getDb } from "@/lib/db/client";
import { getT } from "@/i18n/server";
import { StackAdminSwitch } from "@/components/admin/StackAdminSwitch";
import { adminContext } from "@/server/admin-context";
import { adminBase } from "@/features/admin/nav";
import { CompanyAccess } from "@/components/admin/CompanyAccess";
import { CompanyMissing } from "@/components/admin/CompanyOverview";
import { DataTable, PageHeader, PersonFace, SectionCard } from "@/components/ui/elements";
import { TotpReset } from "./TotpReset";
import c from "./console.module.css";

export default async function PeoplePage() {
  if (!(await isAdmin())) redirect(adminBase() + "/login");
  const ctx = await adminContext();
  // The platform admin has this per company, under Companies.
  if (!(await consoleCompany())) notFound();
  if (!ctx.company) return <CompanyMissing />;

  const t = await getT();
  const slug = ctx.company.slug;
  const people = ctx.live
    ? await getDb().user.findMany({
        where: { company: { slug }, active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, isStackAdmin: true, totpEnabledAt: true },
      })
    : [];

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
      {people.length ? (
        <SectionCard title={t("adminAccess.stackAdminTitle")} name="stack-admins">
          <DataTable
            rows={people}
            rowKey={(p) => p.id}
            empty={t("adminConsole.none")}
            columns={[
              {
                key: "person",
                header: t("adminConsole.colPerson"),
                width: "minmax(0, 1fr)",
                render: (p) => (
                  <div className={c.who}>
                    <PersonFace name={p.name} />
                    <span className={c.strong}>{p.name}</span>
                  </div>
                ),
              },
              {
                key: "access",
                header: t("adminConsole.colStackAdmin"),
                width: "minmax(0, 1.8fr)",
                render: (p) => <StackAdminSwitch slug={slug} userId={p.id} name={p.name} isStackAdmin={p.isStackAdmin} hasTotp={Boolean(p.totpEnabledAt)} />,
              },
              {
                key: "factor",
                header: t("adminConsole.colSecondFactor"),
                width: "minmax(0, 1fr)",
                render: (p) => (p.totpEnabledAt ? <TotpReset slug={slug} userId={p.id} name={p.name} /> : <span className={c.sub}>{t("adminConsole.none")}</span>),
              },
            ]}
          />
        </SectionCard>
      ) : null}
    </div>
  );
}
